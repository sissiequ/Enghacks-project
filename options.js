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
    exportJobsBtn.addEventListener('click', () => {
      // Stub for export functionality if the user added it
      if (exportStatus) {
        exportStatus.textContent = "Export functionality to be implemented in background script.";
        exportStatus.style.display = 'block';
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