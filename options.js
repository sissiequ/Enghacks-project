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
