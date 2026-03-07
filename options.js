// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const saveApiBtn = document.getElementById('saveApiBtn');
const apiStatus = document.getElementById('apiStatus');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resumeTextPreview = document.getElementById('resumeTextPreview');
const pdfStatus = document.getElementById('pdfStatus');

const exportJobsBtn = document.getElementById('exportJobsBtn');
const exportStatus = document.getElementById('exportStatus');

// Load existing data
chrome.storage.local.get(['geminiApiKey', 'resumeText'], function(result) {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
  }
  if (result.resumeText) {
    resumeTextPreview.textContent = result.resumeText;
  }
});

// Save API Key
saveApiBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  chrome.storage.local.set({ geminiApiKey: apiKey }, function() {
    apiStatus.style.display = 'block';
    setTimeout(() => {
      apiStatus.style.display = 'none';
    }, 2000);
  });
});

// Handle PDF Upload via Click
dropZone.addEventListener('click', () => fileInput.click());

// Handle File Selection
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handlePdfFile(file);
  }
});

// Drag and Drop functionality
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    handlePdfFile(file);
  } else {
    alert("Please upload a valid PDF file.");
  }
});

function handlePdfFile(file) {
  resumeTextPreview.textContent = "Parsing PDF...";
  
  const fileReader = new FileReader();
  
  fileReader.onload = function() {
    const typedarray = new Uint8Array(this.result);

    pdfjsLib.getDocument(typedarray).promise.then(pdf => {
      let numPages = pdf.numPages;
      let textPromises = [];

      for (let i = 1; i <= numPages; i++) {
        textPromises.push(
          pdf.getPage(i).then(page => {
            return page.getTextContent().then(textContent => {
              return textContent.items.map(item => item.str).join(' ');
            });
          })
        );
      }

      Promise.all(textPromises).then(pageTexts => {
        const fullText = pageTexts.join('\n\n');
        
        // Save to storage
        chrome.storage.local.set({ resumeText: fullText }, function() {
          resumeTextPreview.textContent = fullText;
          pdfStatus.style.display = 'block';
          setTimeout(() => {
            pdfStatus.style.display = 'none';
          }, 3000);
        });
      });
    }).catch(error => {
      console.error("Error parsing PDF:", error);
      resumeTextPreview.textContent = "Error parsing PDF. See console for details.";
    });
  };
  
  fileReader.readAsArrayBuffer(file);
}

function setExportStatus(message, isError = false) {
  if (!exportStatus) return;
  exportStatus.style.display = 'block';
  exportStatus.style.color = isError ? '#b00020' : '#0d652d';
  exportStatus.textContent = message;
}

function formatTimestampForFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

if (exportJobsBtn) {
  exportJobsBtn.addEventListener('click', async () => {
    exportJobsBtn.disabled = true;
    setExportStatus('Exporting jobs from current WaterlooWorks filter...');

    try {
      const activeTab = await queryActiveTab();
      if (!activeTab || !activeTab.id) {
        throw new Error('No active tab found.');
      }

      const tabUrl = activeTab.url || '';
      if (!tabUrl.includes('waterlooworks.uwaterloo.ca')) {
        throw new Error('Please switch to a WaterlooWorks tab first.');
      }

      const result = await sendMessageToTab(activeTab.id, { action: 'EXPORT_FILTERED_JOBS' });
      if (!result || !result.success) {
        throw new Error((result && result.error) ? result.error : 'Failed to export jobs.');
      }

      const payload = {
        exported_at: new Date().toISOString(),
        source_url: tabUrl,
        total_jobs: Array.isArray(result.jobs) ? result.jobs.length : 0,
        jobs: Array.isArray(result.jobs) ? result.jobs : []
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);
      const filename = `waterlooworks_jobs_${formatTimestampForFilename()}.json`;

      chrome.downloads.download({ url: blobUrl, filename, saveAs: true }, () => {
        if (chrome.runtime.lastError) {
          setExportStatus(`Export failed: ${chrome.runtime.lastError.message}`, true);
        } else {
          setExportStatus(`Export complete: ${payload.total_jobs} jobs.`);
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      });
    } catch (error) {
      setExportStatus(`Export failed: ${error.message}`, true);
    } finally {
      exportJobsBtn.disabled = false;
    }
  });
}
