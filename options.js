// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  const WATERLOOWORKS_JOBS_URL = 'https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm';
  // Options page is the control plane for:
  // 1) API key persistence, 2) resume PDF parsing, 3) filtered job export trigger.
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
  const postingIdInput = document.getElementById('postingIdInput');
  const openPostingBtn = document.getElementById('openPostingBtn');
  const openApplyBtn = document.getElementById('openApplyBtn');
  const openPostingStatus = document.getElementById('openPostingStatus');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const openWebStatus = document.getElementById('openWebStatus');

  function isJobsPageUrl(url) {
    return typeof url === 'string' && url.includes('/myAccount/co-op/full/jobs.htm');
  }

  async function getWaterlooWorksTab() {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id && isJobsPageUrl(activeTab.url || '')) {
      return activeTab;
    }
    const candidates = await chrome.tabs.query({ url: '*://waterlooworks.uwaterloo.ca/*jobs.htm*' });
    if (candidates.length > 0) return candidates[0];
    return null;
  }

  async function waitForTabComplete(tabId, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.status === 'complete') return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  async function sendMessageWithRetry(tabId, message, retries = 12, delayMs = 350) {
    let lastError = null;
    for (let i = 0; i < retries; i += 1) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || '');
        if (msg.includes('Receiving end does not exist')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content.js']
            });
          } catch (_injectErr) {}
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw lastError || new Error('Failed to communicate with WaterlooWorks tab.');
  }

  async function sendMessageToWaterlooTab(message, options = {}) {
    let tab = await getWaterlooWorksTab();
    if (!tab || !tab.id) {
      tab = await chrome.tabs.create({ url: WATERLOOWORKS_JOBS_URL, active: true });
      await chrome.storage.local.set({
        pendingWwAction: {
          ...message,
          createdAt: Date.now()
        }
      });
      return { success: true, queued: true };
    }

    let response;
    try {
      response = await sendMessageWithRetry(tab.id, message);
    } catch (_err) {
      await chrome.storage.local.set({
        pendingWwAction: {
          ...message,
          createdAt: Date.now()
        }
      });
      response = { success: true, queued: true };
    }

    if (options.activateTab) {
      await chrome.tabs.update(tab.id, { active: true });
    }

    return response;
  }

  // Load existing data
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

  // Save API Key
  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        alert("Please enter a valid API Key.");
        return;
      }
      // Save both keys for backward compatibility with old/new background logic.
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

      // Export path:
      // options.js -> content.js message -> crawl current WW filters -> download JSON.
      const originalLabel = exportJobsBtn.textContent;
      exportJobsBtn.disabled = true;
      exportJobsBtn.textContent = 'Exporting...';
      exportStatus.style.display = 'block';
      exportStatus.style.color = '#555';
      exportStatus.textContent = 'Collecting jobs from current WaterlooWorks filter...';

      try {
        const response = await sendMessageToWaterlooTab({ action: 'EXPORT_FILTERED_JOBS' });
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

  if (openPostingBtn) {
    openPostingBtn.addEventListener('click', async () => {
      if (!openPostingStatus) return;
      const postingId = (postingIdInput?.value || '').trim();
      if (!postingId) {
        openPostingStatus.style.display = 'block';
        openPostingStatus.style.color = '#b00020';
        openPostingStatus.textContent = 'Please enter a posting ID.';
        return;
      }

      const originalLabel = openPostingBtn.textContent;
      openPostingBtn.disabled = true;
      openPostingBtn.textContent = 'Opening...';
      openPostingStatus.style.display = 'block';
      openPostingStatus.style.color = '#555';
      openPostingStatus.textContent = `Searching posting ${postingId}...`;

      try {
        const response = await sendMessageToWaterlooTab({
          action: 'OPEN_POSTING_BY_ID',
          postingId
        }, { activateTab: true });

        if (!response || !response.success) {
          throw new Error(response?.error || 'Could not open this posting.');
        }

        openPostingStatus.style.color = '#0d652d';
        openPostingStatus.textContent = response.queued
          ? `WaterlooWorks opened. Command queued for posting ${postingId}.`
          : `Opened posting ${postingId}.`;
      } catch (error) {
        openPostingStatus.style.color = '#b00020';
        openPostingStatus.textContent = error?.message || 'Open failed.';
      } finally {
        openPostingBtn.disabled = false;
        openPostingBtn.textContent = originalLabel;
      }
    });
  }

  if (openApplyBtn) {
    openApplyBtn.addEventListener('click', async () => {
      if (!openPostingStatus) return;
      const postingId = (postingIdInput?.value || '').trim();
      if (!postingId) {
        openPostingStatus.style.display = 'block';
        openPostingStatus.style.color = '#b00020';
        openPostingStatus.textContent = 'Please enter a posting ID.';
        return;
      }

      const originalLabel = openApplyBtn.textContent;
      openApplyBtn.disabled = true;
      openApplyBtn.textContent = 'Opening...';
      openPostingStatus.style.display = 'block';
      openPostingStatus.style.color = '#555';
      openPostingStatus.textContent = `Opening apply page for posting ${postingId}...`;

      try {
        const response = await sendMessageToWaterlooTab({
          action: 'OPEN_APPLY_BY_ID',
          postingId
        }, { activateTab: true });

        if (!response || !response.success) {
          throw new Error(response?.error || 'Could not open apply page for this posting.');
        }

        openPostingStatus.style.color = '#0d652d';
        openPostingStatus.textContent = response.queued
          ? `WaterlooWorks opened. Apply command queued for posting ${postingId}.`
          : `Opened apply page for posting ${postingId}.`;
      } catch (error) {
        openPostingStatus.style.color = '#b00020';
        openPostingStatus.textContent = error?.message || 'Open apply failed.';
      } finally {
        openApplyBtn.disabled = false;
        openApplyBtn.textContent = originalLabel;
      }
    });
  }

  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', async () => {
      if (!openWebStatus) return;

      const originalLabel = openDashboardBtn.textContent;
      openDashboardBtn.disabled = true;
      openDashboardBtn.textContent = 'Opening...';
      openWebStatus.style.display = 'block';
      openWebStatus.style.color = '#555';
      openWebStatus.textContent = 'Opening dashboard...';

      try {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('job-board-site/index.html'),
          active: true
        });
        openWebStatus.style.color = '#0d652d';
        openWebStatus.textContent = 'Dashboard opened successfully.';
      } catch (error) {
        openWebStatus.style.color = '#b00020';
        openWebStatus.textContent = error?.message || 'Could not open the dashboard.';
      } finally {
        openDashboardBtn.disabled = false;
        openDashboardBtn.textContent = originalLabel;
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

        // Extract text page-by-page so large PDFs still resolve incrementally.
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
          
          // Persist resume text for background.js prompt construction.
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
