// ---- Core Logic: Fixed trigger logic and refined UI for 1/3 screen width ----

let lastProcessedJDHash = '';
let isAnalyzing = false; // Add a lock to prevent concurrent analysis
let pendingWwActionInProgress = false;
let pendingWwActionWatcherStarted = false;
let isExportingJobs = false;

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
    const normalizeSuggestion = (s) => {
        if (!s) return null;
        if (typeof s === 'string') {
            return {
                section: 'Resume',
                target: 'General',
                issue: 'Generic suggestion',
                rewrite: s
            };
        }
        return {
            section: (s.section || 'Resume').toString(),
            target: (s.target || 'General').toString(),
            issue: (s.issue || '').toString(),
            rewrite: (s.rewrite || '').toString()
        };
    };
    const normalizedSuggestions = (Array.isArray(suggestions) ? suggestions : [])
        .map(normalizeSuggestion)
        .filter(Boolean);
    contentArea.innerHTML = `
    <div style="margin-bottom:40px; background: #fff; padding: 25px; border-radius: 12px; border: 1px solid #eee; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div style="font-size:22px; font-weight: 900; color: #111; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Match Score</div>
      <div style="font-size:72px; font-weight:900; color:#111; line-height: 1; text-shadow: 2px 2px 0px #FFD54F;">${score}%</div>
    </div>
    
    <div style="font-weight:900; font-size:24px; margin-bottom:20px; color:#111; border-left: 6px solid #FFD54F; padding-left: 15px;">Resume Optimization:</div>
    
    <div style="display: flex; flex-direction: column; gap: 15px;">
      ${normalizedSuggestions.map(s => `
        <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #111; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
          <div style="font-size:12px; font-weight:800; letter-spacing:0.4px; color:#666; margin-bottom:8px;">${s.section} - ${s.target}</div>
          <div style="font-size:15px; line-height:1.6; color:#333; margin-bottom:10px;"><b>Issue:</b> ${s.issue || 'Not specified'}</div>
          <div style="font-size:16px; line-height:1.7; color:#000; font-weight:700;"><b>Rewrite:</b> ${s.rewrite || 'No rewrite provided.'}</div>
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
    // Polling is used instead of MutationObserver only because WaterlooWorks
    // updates many views through internal UI state that is not always easy to diff.
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
    startPendingWwActionWatcher();
} else {
    window.addEventListener('load', () => {
        setupJobDetectionObserver();
        startPendingWwActionWatcher();
    });
}

function cleanExportText(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
}

// ------------------------
// Job table export helpers
// ------------------------
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

function clickFirstPage() {
    const firstBtn = document.querySelector(".pagination__link[aria-label*='Go to first page']");
    if (!firstBtn) return false;
    if (firstBtn.classList.contains('disabled') || firstBtn.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    firstBtn.click();
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

function extractActionToken(functionName) {
    try {
        const html = document.documentElement.innerHTML;
        const pattern = new RegExp(
            `function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?action\\s*:\\s*'([^']+)'`,
            'i'
        );
        const match = html.match(pattern);
        return match ? match[1] : '';
    } catch (_e) {
        return '';
    }
}

async function fetchPostingDataJson(postingId, dataToken) {
    if (!postingId || !dataToken) return null;
    const body = new URLSearchParams();
    body.set('action', dataToken);
    body.set('postingId', String(postingId));

    const resp = await fetch('/myAccount/co-op/full/jobs.htm', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: body.toString()
    });

    if (!resp.ok) return null;
    try {
        return await resp.json();
    } catch (_e) {
        return null;
    }
}

async function fetchPostingOverviewHtml(postingId, overviewToken) {
    if (!postingId || !overviewToken) return '';
    const body = new URLSearchParams();
    body.set('action', overviewToken);
    body.set('postingId', String(postingId));

    const resp = await fetch('/myAccount/co-op/full/jobs.htm', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: body.toString()
    });

    if (!resp.ok) return '';
    return await resp.text();
}

async function fetchWorkTermRatingReportJson(companyId, reportToken) {
    if (!companyId || !reportToken) return null;
    const body = new URLSearchParams();
    body.set('action', reportToken);
    body.set('reportHolder', 'com.orbis.web.content.crm.Company');
    body.set('reportHolderId', String(companyId));
    body.set('reportHolderField', 't100');

    const resp = await fetch('/myAccount/co-op/full/jobs.htm', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: body.toString()
    });

    if (!resp.ok) return null;
    try {
        return await resp.json();
    } catch (_e) {
        return null;
    }
}

function extractFieldsFromOverviewHtml(html) {
    const out = {
        work_term_duration: '',
        special_job_requirements: '',
        required_skills: ''
    };
    if (!html) return out;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const pageText = cleanExportText(doc.body?.innerText || '');

    function extractByRegex(patterns) {
        for (const p of patterns) {
            const m = pageText.match(p);
            if (m && m[1]) {
                const v = cleanExportText(m[1]);
                if (v) return v;
            }
        }
        return '';
    }

    // Try direct "Label: value" or "Label value" extraction from overview text.
    out.work_term_duration = extractByRegex([
        /work\s*term\s*duration\s*[:\-]?\s*([^\n|]{1,120})/i,
        /duration\s*[:\-]?\s*([^\n|]{1,120})/i
    ]);
    out.special_job_requirements = extractByRegex([
        /special\s*job\s*requirements?\s*[:\-]?\s*([^\n]{1,400})/i,
        /special\s*requirements?\s*[:\-]?\s*([^\n]{1,400})/i
    ]);
    out.required_skills = extractByRegex([
        /required\s*skills?\s*[:\-]?\s*([^\n]{1,400})/i,
        /skills?\s*required\s*[:\-]?\s*([^\n]{1,400})/i
    ]);

    return out;
}

function normalizeWtrSection(section) {
    if (!section || typeof section !== 'object') return null;
    const out = {
        type: cleanExportText(section.type || ''),
        title: cleanExportText(section.title || ''),
        description: cleanExportText(section.description || '')
    };

    if (Array.isArray(section.columns)) out.columns = section.columns.map(c => cleanExportText(c));
    if (Array.isArray(section.rows)) out.rows = section.rows;
    if ('series' in section) out.series = section.series;
    if ('categories' in section) out.categories = section.categories;
    if ('value' in section) out.value = section.value;
    if ('data' in section) out.data = section.data;

    return out;
}

function extractHiringHistoryFromWtrReport(report) {
    const empty = {
        hires_by_faculty: null,
        hires_by_student_work_term_number: null,
        most_frequently_hired_programs: null
    };
    if (!report || typeof report !== 'object' || !Array.isArray(report.sections)) return empty;

    function findSection(matchers) {
        return report.sections.find(sec => {
            const t = cleanExportText(`${sec?.title || ''} ${sec?.description || ''}`).toLowerCase();
            return matchers.every(m => t.includes(m));
        }) || null;
    }

    return {
        hires_by_faculty: normalizeWtrSection(findSection(['hires by', 'faculty'])),
        hires_by_student_work_term_number: normalizeWtrSection(findSection(['hires by', 'work term'])),
        most_frequently_hired_programs: normalizeWtrSection(findSection(['most frequently', 'program']))
    };
}

async function enrichJobsWithHiringHistory(jobs) {
    // Fast mode: use only Work Term Rating report as the hiring history source.
    const overviewToken = extractActionToken('getPostingOverview');
    const postingDataToken = extractActionToken('getPostingData');
    const wtrReportToken = extractActionToken('getWorkTermRatingReportJson');
    const emptyHistory = {
        hires_by_faculty: null,
        hires_by_student_work_term_number: null,
        most_frequently_hired_programs: null
    };
    const emptyExtra = {
        work_term_duration: '',
        special_job_requirements: '',
        required_skills: ''
    };
    if (!postingDataToken || !wtrReportToken || !overviewToken) {
        return jobs.map(job => ({
            ...job,
            hiring_history: emptyHistory,
            ...emptyExtra
        }));
    }

    const postingIds = jobs
        .map(j => cleanExportText(j.posting_id))
        .filter(Boolean);

    const uniqPostingIds = Array.from(new Set(postingIds));
    const historyMap = {};
    const extraMap = {};
    const concurrency = 6;
    let index = 0;

    async function worker() {
        while (index < uniqPostingIds.length) {
            const i = index++;
            const pid = uniqPostingIds[i];
            try {
                const [postingData, overviewHtml] = await Promise.all([
                    fetchPostingDataJson(pid, postingDataToken),
                    fetchPostingOverviewHtml(pid, overviewToken)
                ]);
                extraMap[pid] = extractFieldsFromOverviewHtml(overviewHtml);
                const companyId = cleanExportText(
                    postingData?.divId?.value ?? postingData?.divId ?? ''
                );
                const wtrReport = companyId
                    ? await fetchWorkTermRatingReportJson(companyId, wtrReportToken)
                    : null;
                historyMap[pid] = extractHiringHistoryFromWtrReport(wtrReport);
            } catch (_e) {
                historyMap[pid] = emptyHistory;
                extraMap[pid] = emptyExtra;
            }
            await sleep(50);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, uniqPostingIds.length); i += 1) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return jobs.map(job => ({
        ...job,
        hiring_history: historyMap[job.posting_id] || emptyHistory,
        ...(extraMap[job.posting_id] || emptyExtra)
    }));
}

// --------------------------------------
// UI navigation helpers for WW job pages
// --------------------------------------
function isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

async function waitForCondition(fn, timeoutMs = 12000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (fn()) return true;
        await sleep(intervalMs);
    }
    return false;
}

function findJobRowByPostingId(postingId) {
    if (!postingId) return null;
    const escaped = (window.CSS && CSS.escape) ? CSS.escape(String(postingId)) : String(postingId);
    const input = document.querySelector(`input[name='dataViewerSelection'][value='${escaped}']`);
    return input ? input.closest('tr') : null;
}

function clickJobTitleInRow(row) {
    if (!row) return false;
    const link = row.querySelector("td a.overflow--ellipsis, td a[href='javascript:void(0)'], td a");
    if (!link || !isVisibleElement(link)) return false;
    link.click();
    return true;
}

async function ensureJobTableVisible() {
    if (getDataTable()) return true;

    try {
        if (typeof dataViewerApp !== 'undefined' && dataViewerApp) {
            if (typeof dataViewerApp.initSearch === 'function') {
                dataViewerApp.initSearch();
            }
            if (dataViewerApp.$dataViewer && typeof dataViewerApp.$dataViewer.refresh === 'function') {
                dataViewerApp.$dataViewer.refresh();
            }
        }
    } catch (_e) {}

    await waitForCondition(() => getDataTable() !== null, 6000);
    if (getDataTable()) return true;

    const allJobsBtn = Array.from(document.querySelectorAll('button, a, [role=\"button\"]')).find(el => {
        const t = cleanExportText(el.innerText).toLowerCase();
        const a = cleanExportText(el.getAttribute('aria-label') || '').toLowerCase();
        return isVisibleElement(el) && (t.includes('all jobs') || a.includes('all jobs'));
    });
    if (allJobsBtn) {
        allJobsBtn.click();
        await waitForCondition(() => getDataTable() !== null, 6000);
    }

    return getDataTable() !== null;
}

async function enterAllJobsListFirst() {
    const allJobsBtn = Array.from(document.querySelectorAll('button, a, [role=\"button\"]')).find(el => {
        const t = cleanExportText(el.innerText).toLowerCase();
        const a = cleanExportText(el.getAttribute('aria-label') || '').toLowerCase();
        return isVisibleElement(el) && (t.includes('all jobs') || a.includes('all jobs'));
    });
    if (!allJobsBtn) return;

    allJobsBtn.click();
    await waitForCondition(() => getDataTable() !== null, 6000);
}

async function exportAllFilteredJobs(maxPages = 100) {
    await enterAllJobsListFirst();
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= maxPages; page += 1) {
        const ok = await ensureJobTableVisible();
        if (!ok) break;

        const rows = extractRowsFromCurrentPage();
        if (!rows.length) break;

        for (const row of rows) {
            const key = `${row.posting_id}::${row.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(row);
        }

        const firstId = rows[0]?.posting_id || '';
        if (!clickNextPage()) break;
        await waitForPageTransition(firstId);
    }

    // Final payload augments each exported row with hiring_history.
    const enriched = await enrichJobsWithHiringHistory(all);
    return { jobs: enriched };
}

async function openPostingById(postingId, maxPages = 120) {
    const targetId = cleanExportText(postingId);
    if (!targetId) {
        return { success: false, error: 'Posting ID is empty.' };
    }

    await enterAllJobsListFirst();

    const ok = await ensureJobTableVisible();
    if (!ok) {
        return { success: false, error: 'Jobs table not visible.', error_code: 'jobs_table_not_visible' };
    }

    const firstRows = extractRowsFromCurrentPage();
    const currentFirstId = firstRows[0]?.posting_id || '';
    if (currentFirstId) {
        const moved = clickFirstPage();
        if (moved) {
            await waitForPageTransition(currentFirstId);
        }
    }

    for (let page = 1; page <= maxPages; page += 1) {
        await ensureJobTableVisible();
        const row = findJobRowByPostingId(targetId);
        if (row && clickJobTitleInRow(row)) {
            await waitForCondition(() => {
                const t = document.body.innerText.toLowerCase();
                return t.includes('return to job search overview') || t.includes('work term rating');
            }, 10000);
            return { success: true };
        }

        const pageRows = extractRowsFromCurrentPage();
        const firstId = pageRows[0]?.posting_id || '';
        if (!clickNextPage()) {
            break;
        }
        await waitForPageTransition(firstId);
    }

    return {
        success: false,
        error: `Posting ${targetId} not found in current filtered results.`,
        error_code: 'posting_not_found'
    };
}

function findApplyElement() {
    const strictSelectors = [
        "button[aria-label*='Apply']",
        "a[aria-label*='Apply']",
        "button[title*='Apply']",
        "a[title*='Apply']"
    ];
    for (const sel of strictSelectors) {
        const node = document.querySelector(sel);
        if (node && isVisibleElement(node)) return node;
    }

    const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
    return candidates.find(el => {
        const text = cleanExportText(
            el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || ''
        ).toLowerCase();
        if (!text) return false;
        if (!text.includes('apply')) return false;
        if (text.includes('filter') || text.includes('deadline') || text.includes('applied')) return false;
        return isVisibleElement(el);
    }) || null;
}

async function openApplyByPostingId(postingId, maxPages = 120) {
    const opened = await openPostingById(postingId, maxPages);
    if (!opened?.success) return opened;

    await waitForCondition(() => findApplyElement() !== null, 10000);
    const applyEl = findApplyElement();
    if (!applyEl) {
        return {
            success: false,
            error: `Posting ${postingId} opened, but Apply button was not found.`,
            error_code: 'apply_button_not_found'
        };
    }

    applyEl.click();
    return { success: true };
}

function isJobsPage() {
    return window.location.pathname.includes('/myAccount/co-op/full/jobs.htm');
}

async function runPendingWwActionIfAny() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    if (!isJobsPage()) return;

    let pending = null;
    try {
        const data = await chrome.storage.local.get('pendingWwAction');
        pending = data?.pendingWwAction || null;
    } catch (_e) {
        return;
    }

    if (!pending || !pending.action) return;

    const ageMs = Date.now() - Number(pending.createdAt || 0);
    if (ageMs > 5 * 60 * 1000) {
        await chrome.storage.local.remove('pendingWwAction');
        return;
    }

    try {
        let result = null;
        if (pending.action === 'OPEN_POSTING_BY_ID') {
            result = await openPostingById(pending.postingId, 60);
        } else if (pending.action === 'OPEN_APPLY_BY_ID') {
            result = await openApplyByPostingId(pending.postingId, 60);
        } else {
            await chrome.storage.local.remove('pendingWwAction');
            return;
        }

        if (result && result.success) {
            await chrome.storage.local.remove('pendingWwAction');
            return;
        }

        const attempts = Number(pending.attempts || 0) + 1;
        const terminalError = result?.error_code === 'posting_not_found' || result?.error_code === 'apply_button_not_found';
        if (terminalError || attempts >= 4) {
            await chrome.storage.local.remove('pendingWwAction');
            return;
        }

        await chrome.storage.local.set({
            pendingWwAction: {
                ...pending,
                attempts
            }
        });
    } catch (_e) {}
}

function startPendingWwActionWatcher() {
    if (pendingWwActionWatcherStarted) return;
    if (!isJobsPage()) return;
    pendingWwActionWatcherStarted = true;

    const tick = async () => {
        if (pendingWwActionInProgress) return;
        pendingWwActionInProgress = true;
        try {
            await runPendingWwActionIfAny();
        } finally {
            pendingWwActionInProgress = false;
        }
    };

    setTimeout(tick, 1200);
    setInterval(tick, 2500);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXPORT_FILTERED_JOBS') {
        (async () => {
            if (isExportingJobs) {
                sendResponse({ success: false, error: 'Export already in progress. Please wait for it to finish.' });
                return;
            }

            isExportingJobs = true;
            try {
                const result = await exportAllFilteredJobs(120);
                sendResponse({ success: true, jobs: result.jobs });
            } catch (error) {
                sendResponse({ success: false, error: error.message || 'Export failed in content script.' });
            } finally {
                isExportingJobs = false;
            }
        })();
        return true;
    }

    if (request.action === 'OPEN_POSTING_BY_ID') {
        (async () => {
            try {
                const result = await openPostingById(request.postingId, 120);
                sendResponse(result);
            } catch (error) {
                sendResponse({ success: false, error: error.message || 'Open posting failed in content script.' });
            }
        })();
        return true;
    }

    if (request.action === 'OPEN_APPLY_BY_ID') {
        (async () => {
            try {
                const result = await openApplyByPostingId(request.postingId, 120);
                sendResponse(result);
            } catch (error) {
                sendResponse({ success: false, error: error.message || 'Open apply failed in content script.' });
            }
        })();
        return true;
    }
});
