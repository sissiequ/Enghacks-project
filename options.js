// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
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

  // 1. Load existing data from storage
  chrome.storage.local.get(['apiKey', 'geminiApiKey', 'resumeText'], function(result) {
    const savedKey = result.apiKey || result.geminiApiKey || '';
    if (savedKey && apiKeyInput) {
      apiKeyInput.value = savedKey;
    }
    if (result.resumeText && resumeTextPreview) {
      resumeTextPreview.textContent = result.resumeText.length > 500 
        ? result.resumeText.substring(0, 500) + "\n\n... [Resume truncated for preview]" 
        : result.resumeText;
    }
  });

  // 2. Save API Key
  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        alert("Please enter a valid API Key.");
        return;
      }
      // Save both keys for backward compatibility
      chrome.storage.local.set({ apiKey: apiKey, geminiApiKey: apiKey }, function() {
        if (apiStatus) {
          apiStatus.textContent = 'Settings saved successfully!';
          apiStatus.style.display = 'block';
          apiStatus.style.color = '#0d652d';
          setTimeout(() => {
            apiStatus.style.display = 'none';
          }, 3000);
        }
      });
    });
  }

  // 3. Handle PDF Upload & Parsing
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePdfFile(file);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') handlePdfFile(file);
      else alert("Please upload a valid PDF file.");
    });
  }
  
  // 4. Export Jobs (整合后的逻辑)
  if (exportJobsBtn) {
    exportJobsBtn.addEventListener('click', triggerJobExport);
  }

  /**
   * 核心导出功能
   */
  async function triggerJobExport() {
    if (!exportStatus || !exportJobsBtn) return;

    const originalLabel = exportJobsBtn.textContent;
    exportJobsBtn.disabled = true;
    exportJobsBtn.textContent = 'Exporting...';
    exportStatus.style.display = 'block';
    exportStatus.style.color = '#555';
    exportStatus.textContent = 'Connecting to WaterlooWorks tab...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id || !tab.url || !tab.url.includes('waterlooworks.uwaterloo.ca')) {
        throw new Error('Please open WaterlooWorks jobs page first.');
      }

      exportStatus.textContent = 'Requesting filtered jobs from WaterlooWorks...';

      const response = await sendMessageToTab(tab.id, { action: 'EXPORT_FILTERED_JOBS' }, 180000);

      if (!response || !response.success) {
        throw new Error(response?.error || 'Export failed.');
      }

      const jobs = response.jobs || [];
      if (!jobs.length) {
        throw new Error('No jobs found in the current view.');
      }

      localStorage.setItem('coopsync_jobs', JSON.stringify(jobs));

      const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const filename = `coopsync_jobs_${ts}.json`;
      const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);

      exportStatus.style.color = '#0d652d';
      exportStatus.textContent = `Success! Exported ${jobs.length} jobs to JSON and Dashboard.`;
    } catch (error) {
      exportStatus.style.color = '#b00020';
      exportStatus.textContent = error.message;
    } finally {
      exportJobsBtn.disabled = false;
      exportJobsBtn.textContent = originalLabel;
    }
  }

  /**
   * PDF 解析函数
   */
  function handlePdfFile(file) {
    if (resumeTextPreview) resumeTextPreview.textContent = "Parsing PDF...";
    const fileReader = new FileReader();
    fileReader.onload = function() {
      const typedarray = new Uint8Array(this.result);
      pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        let textPromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          textPromises.push(pdf.getPage(i).then(page => page.getTextContent().then(c => c.items.map(item => item.str).join(' '))));
        }
        Promise.all(textPromises).then(pageTexts => {
          const fullText = pageTexts.join('\n\n');
          chrome.storage.local.set({ resumeText: fullText }, function() {
            if (resumeTextPreview) resumeTextPreview.textContent = fullText.substring(0, 500) + "...";
            if (pdfStatus) { pdfStatus.textContent = 'Saved!'; pdfStatus.style.display = 'block'; setTimeout(() => pdfStatus.style.display = 'none', 3000); }
          });
        });
      });
    };
    fileReader.readAsArrayBuffer(file);
  }
});

function sendMessageToTab(tabId, message, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Export timed out. Please keep the WaterlooWorks tab open and try again.'));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (chrome.runtime.lastError) {
        reject(new Error('Connection failed. Please refresh the WaterlooWorks page and try again.'));
        return;
      }

      resolve(response);
    });
  });
}
