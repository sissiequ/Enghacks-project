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

  // Load existing data
  chrome.storage.local.get(['geminiApiKey', 'resumeText'], function(result) {
    if (result.geminiApiKey && apiKeyInput) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.resumeText && resumeTextPreview) {
      resumeTextPreview.textContent = result.resumeText.length > 500 
        ? result.resumeText.substring(0, 500) + "\n\n... [Resume truncated for preview]" 
        : result.resumeText;
    }
  });

  // Save API Key
  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        alert("Please enter a valid API Key.");
        return;
      }
      chrome.storage.local.set({ geminiApiKey: apiKey }, function() {
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

  // Handle PDF Upload via Click
  if (dropZone && fileInput) {
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
  }
  
  if (exportJobsBtn) {
    exportJobsBtn.addEventListener('click', async () => {
      if (!exportStatus) return;

      const originalLabel = exportJobsBtn.textContent;
      exportJobsBtn.disabled = true;
      exportJobsBtn.textContent = 'Exporting...';
      exportStatus.style.display = 'block';
      exportStatus.style.color = '#555';
      exportStatus.textContent = 'Collecting jobs from current WaterlooWorks filter...';

      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id) {
          throw new Error('No active tab found.');
        }

        const tabUrl = tab.url || '';
        if (!tabUrl.includes('waterlooworks.uwaterloo.ca')) {
          throw new Error('Please open WaterlooWorks jobs page first, then click export.');
        }

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'EXPORT_FILTERED_JOBS' });
        if (!response || !response.success) {
          throw new Error(response?.error || 'Export failed.');
        }

        const jobs = Array.isArray(response.jobs) ? response.jobs : [];
        if (!jobs.length) {
          throw new Error('No jobs found under current filter.');
        }

        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
        const filename = `waterlooworks_jobs_${ts}.json`;
        const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);

        await chrome.downloads.download({
          url: objectUrl,
          filename,
          saveAs: true
        });
        URL.revokeObjectURL(objectUrl);

        exportStatus.style.color = '#0d652d';
        exportStatus.textContent = `Exported ${jobs.length} jobs.`;
      } catch (error) {
        exportStatus.style.color = '#b00020';
        exportStatus.textContent = error?.message || 'Export failed.';
      } finally {
        exportJobsBtn.disabled = false;
        exportJobsBtn.textContent = originalLabel;
      }
    });
  }

  function handlePdfFile(file) {
    if (resumeTextPreview) {
      resumeTextPreview.textContent = "Parsing PDF...";
    }
    
    const fileReader = new FileReader();
    
    fileReader.onload = function() {
      const typedarray = new Uint8Array(this.result);

      if (typeof pdfjsLib === 'undefined') {
        if (resumeTextPreview) {
            resumeTextPreview.textContent = "Error: PDF.js library not loaded.";
        }
        return;
      }

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
            if (resumeTextPreview) {
                resumeTextPreview.textContent = fullText.length > 500 
                  ? fullText.substring(0, 500) + "\n\n... [Resume truncated for preview]" 
                  : fullText;
            }
            if (pdfStatus) {
              pdfStatus.textContent = 'Resume parsed and saved successfully.';
              pdfStatus.style.display = 'block';
              setTimeout(() => {
                pdfStatus.style.display = 'none';
              }, 3000);
            }
          });
        });
      }).catch(error => {
        console.error("Error parsing PDF:", error);
        if (resumeTextPreview) {
            resumeTextPreview.textContent = "Error parsing PDF. See console for details.";
        }
      });
    };
    
    fileReader.readAsArrayBuffer(file);
  }
});
