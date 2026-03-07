// ---- Core Logic: Fixed trigger logic and refined UI for 1/3 screen width ----

let lastProcessedJDHash = '';
let isAnalyzing = false; // Add a lock to prevent concurrent analysis

/**
 * Extracts job description text from the page.
 */
function extractJD() {
    const postingDiv = document.querySelector('.panel-body') || document.body;
    return postingDiv.innerText.slice(0, 10000);
}

/**
 * Creates and injects the floating UI widget if it doesn't exist.
 */
function injectWidget() {
    let widget = document.getElementById('coopsync-widget');
    if (widget) return widget;

    widget = document.createElement('div');
    widget.id = 'coopsync-widget';
    
    // Styling the widget container to take 1/3 of the screen width
    Object.assign(widget.style, {
        position: 'fixed',
        top: '0',
        right: '0',
        width: '33vw', // Approximately 1/3 of the screen width
        height: '100vh',
        zIndex: '999999',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 15px rgba(0,0,0,0.2)',
        backgroundColor: '#ffffff',
        transition: 'transform 0.3s ease-in-out',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    });

    widget.innerHTML = `
    <div id="coopsync-header" style="background:#111111; color:#FFD54F; padding:20px 24px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom: 4px solid #FFD54F; user-select: none;">
      <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">✨ CoopSync AI Assistant</span>
      <span id="coopsync-toggle" style="font-size: 18px;">▼</span>
    </div>
    <div id="coopsync-content" style="padding:30px; flex: 1; overflow-y:auto; color: #111; display: block; background: #fafafa;">
      <div class="coopsync-loading" style="font-size: 18px; color: #666; text-align: center; margin-top: 50px;">Waiting for job details...</div>
    </div>
  `;

    document.body.appendChild(widget);

    const header = document.getElementById('coopsync-header');
    header.addEventListener('click', () => {
        const content = document.getElementById('coopsync-content');
        const toggle = document.getElementById('coopsync-toggle');
        if (!content || !toggle) return;

        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        widget.style.height = isHidden ? '100vh' : 'auto';
        toggle.innerText = isHidden ? '▼' : '▲';
    });

    return widget;
}

/**
 * Updates the widget UI with the analysis results.
 */
function updateWidgetWithResults(response) {
    const contentArea = document.getElementById('coopsync-content');
    if (!contentArea) return;

    isAnalyzing = false; // Release the lock

    if (!response || !response.success) {
        const errorMsg = (response && response.error) ? response.error : 'Connection error';
        contentArea.innerHTML = `<div style="color:red; font-size: 18px; font-weight: bold;">Analysis Failed: ${errorMsg}</div>`;
        return;
    }

    const { score, suggestions } = response.data;
    contentArea.innerHTML = `
    <div style="margin-bottom:40px; background: #fff; padding: 25px; border-radius: 12px; border: 1px solid #eee; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:22px; font-weight: 900; color: #111; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Match Score</div>
      <div style="font-size:72px; font-weight:900; color:#111; line-height: 1; text-shadow: 2px 2px 0px #FFD54F;">${score}%</div>
    </div>
    
    <div style="font-weight:900; font-size:24px; margin-bottom:20px; color:#111; border-left: 6px solid #FFD54F; padding-left: 15px;">Resume Optimization:</div>
    
    <div style="display: flex; flex-direction: column; gap: 15px;">
      ${suggestions.map(s => `
        <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #111; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
          <span style="font-size:18px; line-height: 1.6; color: #000; font-weight: 700;">${s}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Triggers the AI analysis by sending a message to the background script.
 */
function triggerAnalysis(jdText) {
    if (isAnalyzing) return;
    isAnalyzing = true;

    const widget = injectWidget();
    widget.style.display = 'flex';
    
    const contentArea = document.getElementById('coopsync-content');
    if (contentArea) {
        contentArea.style.display = 'block';
        contentArea.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; margin-top: 100px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🔍</div>
                <div style="font-size: 20px; font-weight: 800; color: #111;">Analyzing Job compatibility...</div>
                <div style="font-size: 16px; color: #666; margin-top: 10px;">Tailoring suggestions for your resume</div>
            </div>
        `;
    }

    if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({ action: "analyzeJob", jobDescription: jdText }, (response) => {
            if (chrome.runtime.lastError) {
                isAnalyzing = false;
                updateWidgetWithResults({ success: false, error: "Service unavailable. Please refresh." });
                return;
            }
            updateWidgetWithResults(response);
        });
    } else {
        isAnalyzing = false;
    }
}

/**
 * Observer to detect job changes on dynamic platforms like WaterlooWorks.
 */
function setupJobDetectionObserver() {
    const checkAndTrigger = () => {
        if (isAnalyzing) return;

        const fullText = document.body.innerText;
        if (!fullText) return;

        const lowerText = fullText.toLowerCase();

        const isJobPage = lowerText.includes('job responsibilities') || 
                         lowerText.includes('required skills') ||
                         lowerText.includes('job summary');

        if (isJobPage) {
            const jdContent = extractJD();
            const currentHash = jdContent.slice(0, 3000); 

            if (currentHash !== lastProcessedJDHash) {
                lastProcessedJDHash = currentHash;
                console.log("CoopSync: New job detected. Starting 1/3 screen analysis...");
                triggerAnalysis(jdContent);
            }
        }
    };

    checkAndTrigger();
    setInterval(checkAndTrigger, 2000);

    document.addEventListener('click', (e) => {
        const targetText = e.target.innerText?.toLowerCase() || '';
        const isClosing = targetText.includes('close') || 
                          targetText.includes('back to') || 
                          e.target.closest('.close') || 
                          e.target.closest('.modal-close');
                          
        if (isClosing) {
            lastProcessedJDHash = ''; 
            isAnalyzing = false;
            const widget = document.getElementById('coopsync-widget');
            if (widget) widget.style.display = 'none';
        }
    });
}

/**
 * Manual analysis for highlighted text.
 */
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 500) {
        console.log("CoopSync: Manual large block selection detected.");
        triggerAnalysis(selectedText);
    }
});

// Initialization
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setupJobDetectionObserver();
} else {
    window.addEventListener('load', setupJobDetectionObserver);
}

function cleanExportText(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
}

function getDataTable() {
    return document.querySelector('#dataViewerPlaceholder table.data-viewer-table')
        || document.querySelector('table.data-viewer-table');
}

function getHeaders(table) {
    return Array.from(table.querySelectorAll('thead th')).map(th => cleanExportText(th.innerText).toLowerCase());
}

function headerIndex(headers, keys) {
    for (let i = 0; i < headers.length; i += 1) {
        const h = headers[i];
        if (keys.some(k => h.includes(k))) return i;
    }
    return -1;
}

function extractRowsFromCurrentPage() {
    const table = getDataTable();
    if (!table) return [];

    const headers = getHeaders(table);
    const idxId = headerIndex(headers, ['id']);
    const idxTitle = headerIndex(headers, ['job title', 'title', 'position']);
    const idxOrg = headerIndex(headers, ['organization', 'employer']);
    const idxDivision = headerIndex(headers, ['division']);
    const idxOpenings = headerIndex(headers, ['openings']);
    const idxCity = headerIndex(headers, ['city', 'location']);
    const idxLevel = headerIndex(headers, ['level']);
    const idxApps = headerIndex(headers, ['apps']);
    const idxDeadline = headerIndex(headers, ['app deadline', 'deadline']);

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    return rows.map(row => {
        const checkboxId = cleanExportText(row.querySelector("input[name='dataViewerSelection']")?.value || '');
        const thId = cleanExportText(row.querySelector("th[scope='row'] .overflow--ellipsis")?.innerText || '');
        const idCell = checkboxId || thId;
        const tdCells = Array.from(row.querySelectorAll('td')).map(td => cleanExportText(td.innerText));
        const cells = [idCell, ...tdCells];
        const at = i => (i >= 0 && i < cells.length ? cells[i] : '');

        return {
            posting_id: at(idxId) || idCell,
            title: at(idxTitle),
            organization: at(idxOrg),
            division: at(idxDivision),
            openings: at(idxOpenings),
            city: at(idxCity),
            level: at(idxLevel),
            apps: at(idxApps),
            app_deadline: at(idxDeadline),
            raw_text: cleanExportText(cells.join(' | '))
        };
    });
}

function canGoNextPage() {
    const nextBtn = document.querySelector(".pagination__link[aria-label*='Go to next page']");
    if (!nextBtn) return false;
    return !nextBtn.classList.contains('disabled') && nextBtn.getAttribute('aria-disabled') !== 'true';
}

function clickNextPage() {
    const nextBtn = document.querySelector(".pagination__link[aria-label*='Go to next page']");
    if (!nextBtn) return false;
    if (nextBtn.classList.contains('disabled') || nextBtn.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    nextBtn.click();
    return true;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPageTransition(prevFirstId, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await sleep(300);
        const currentRows = extractRowsFromCurrentPage();
        const firstId = currentRows[0]?.posting_id || '';
        if (!prevFirstId && currentRows.length > 0) return true;
        if (firstId && firstId !== prevFirstId) return true;
        if (!canGoNextPage()) return true;
    }
    return false;
}

async function exportAllFilteredJobs(maxPages = 100) {
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= maxPages; page += 1) {
        const rows = extractRowsFromCurrentPage();
        if (!rows.length) break;

        rows.forEach(row => {
            const key = `${row.posting_id}::${row.title}`;
            if (seen.has(key)) return;
            seen.add(key);
            all.push(row);
        });

        const firstId = rows[0]?.posting_id || '';
        if (!clickNextPage()) break;
        await waitForPageTransition(firstId);
    }

    return all;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'EXPORT_FILTERED_JOBS') return;

    (async () => {
        try {
            const jobs = await exportAllFilteredJobs(120);
            sendResponse({ success: true, jobs });
        } catch (error) {
            sendResponse({ success: false, error: error.message || 'Export failed in content script.' });
        }
    })();

    return true;
});
