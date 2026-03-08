/**
 * Input:
 * - none (reads current WaterlooWorks DOM and extension runtime/chrome APIs)
 * Output:
 * - none (boots content logic: widget UI, page scan, export/open handlers)
 */
function bootstrapContentScript() {
// ---- Core Logic: Fixed trigger logic and refined UI for 1/3 screen width ----

let lastProcessedJDHash = '';
let isAnalyzing = false; // Add a lock to prevent concurrent analysis
let isWidgetOpen = false;
let waitForNewJobAfterClose = false;
let lastClosedJDHash = '';
let pendingWwActionInProgress = false;
let pendingWwActionWatcherStarted = false;
let isExportingJobs = false;

/**
 * Extracts job description text from the page.
 */
function getJobText() {
    // Prefer explicit job containers first.
    const postingDiv = document.querySelector('.panel-body')
        || document.querySelector('[data-testid="job-description"]')
        || document.querySelector('[id*="job"][id*="detail"]');
    if (postingDiv) {
        return cleanText(postingDiv.innerText).slice(0, 10000);
    }

    // Fallback: use whole page text but exclude our own widget text to avoid re-scan loops.
    const bodyText = document.body?.innerText || '';
    const widgetText = document.getElementById('coopsync-widget')?.innerText || '';
    const pageText = widgetText ? bodyText.replace(widgetText, ' ') : bodyText;
    return cleanText(pageText).slice(0, 10000);
}

/**
 * Creates and injects the floating UI widget if it doesn't exist.
 */
function ensureWidget() {
    let widget = document.getElementById('coopsync-widget');
    if (widget) return widget;

    const panelWidth = Math.max(360, Math.min(520, Math.floor(window.innerWidth * 0.32)));
    widget = document.createElement('div');
    widget.id = 'coopsync-widget';
    
    // Styling the widget container to take 1/3 of the screen width
    Object.assign(widget.style, {
        position: 'fixed',
        top: '0',
        right: '0',
        width: `${panelWidth}px`,
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
    <div id="coopsync-content" style="padding:30px; flex: 1; overflow-y:auto; color: #111; display: block; background: #fafafa;">
      <div class="coopsync-loading" style="font-size: 18px; color: #666; text-align: center; margin-top: 50px;">Waiting for job details...</div>
    </div>
  `;

    document.body.appendChild(widget);
    return widget;
}

/**
 * Updates the widget UI with the analysis results.
 */
function renderAnalysis(response) {
    const contentArea = document.getElementById('coopsync-content');
    if (!contentArea) return;

    isAnalyzing = false; // Release the lock

    if (!response || !response.success) {
        const errorMsg = (response && response.error) ? response.error : 'Connection error';
        contentArea.innerHTML = `<div style="color:red; font-size: 18px; font-weight: bold;">Analysis Failed: ${errorMsg}</div>`;
        return;
    }

    const { suggestions } = response.data;
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
function startAnalysis(jdText) {
    if (isAnalyzing) return;
    isAnalyzing = true;

    const widget = ensureWidget();
    widget.style.display = 'flex';
    isWidgetOpen = true;
    
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
                renderAnalysis({ success: false, error: "Service unavailable. Please refresh." });
                return;
            }
            renderAnalysis(response);
        });
    } else {
        isAnalyzing = false;
    }
}

/**
 * Observer to detect job changes on dynamic platforms like WaterlooWorks.
 */
function watchJobChanges() {
    // Polling is used instead of MutationObserver only because WaterlooWorks
    // updates many views through internal UI state that is not always easy to diff.
    const checkAndTrigger = () => {
        if (isAnalyzing || isWidgetOpen) return;

        const fullText = document.body.innerText;
        if (!fullText) return;

        const lowerText = fullText.toLowerCase();

        const isJobPage = lowerText.includes('job responsibilities') || 
                         lowerText.includes('required skills') ||
                         lowerText.includes('job summary');

        if (isJobPage) {
            const jdContent = getJobText();
            const currentHash = jdContent.slice(0, 3000); 

            if (waitForNewJobAfterClose) {
                if (currentHash === lastClosedJDHash) return;
                waitForNewJobAfterClose = false;
                lastClosedJDHash = '';
            }

            if (currentHash !== lastProcessedJDHash) {
                lastProcessedJDHash = currentHash;
                console.log("CoopSync: New job detected. Starting 1/3 screen analysis...");
                startAnalysis(jdContent);
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
            isAnalyzing = false;
            isWidgetOpen = false;
            lastClosedJDHash = getJobText().slice(0, 3000);
            waitForNewJobAfterClose = true;
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
        startAnalysis(selectedText);
    }
});

// Initialization
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    watchJobChanges();
    startPendingActionWatcher();
} else {
    window.addEventListener('load', () => {
        watchJobChanges();
        startPendingActionWatcher();
    });
}

function cleanText(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
}

// ------------------------
// Job table export helpers
// ------------------------
function findJobsTable() {
    return document.querySelector('#dataViewerPlaceholder table.data-viewer-table')
        || document.querySelector('table.data-viewer-table');
}

function readHeaders(table) {
    return Array.from(table.querySelectorAll('thead th')).map(th => cleanText(th.innerText).toLowerCase());
}

function findHeaderIdx(headers, keys) {
    for (let i = 0; i < headers.length; i += 1) {
        const h = headers[i];
        if (keys.some(k => h.includes(k))) return i;
    }
    return -1;
}

function getPageRows() {
    const table = findJobsTable();
    if (!table) return [];

    const headers = readHeaders(table);
    const idxId = findHeaderIdx(headers, ['id']);
    const idxTitle = findHeaderIdx(headers, ['job title', 'title', 'position']);
    const idxOrg = findHeaderIdx(headers, ['organization', 'employer']);
    const idxDivision = findHeaderIdx(headers, ['division']);
    const idxOpenings = findHeaderIdx(headers, ['openings']);
    const idxCity = findHeaderIdx(headers, ['city', 'location']);
    const idxLevel = findHeaderIdx(headers, ['level']);
    const idxApps = findHeaderIdx(headers, ['apps']);
    const idxDeadline = findHeaderIdx(headers, ['app deadline', 'deadline']);

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    return rows.map(row => {
        const checkboxId = cleanText(row.querySelector("input[name='dataViewerSelection']")?.value || '');
        const thId = cleanText(row.querySelector("th[scope='row'] .overflow--ellipsis")?.innerText || '');
        const idCell = checkboxId || thId;
        const tdCells = Array.from(row.querySelectorAll('td')).map(td => cleanText(td.innerText));
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
            raw_text: cleanText(cells.join(' | '))
        };
    });
}

function findPagerBtn(labelPart) {
    return document.querySelector(`.pagination__link[aria-label*='${labelPart}']`);
}

function clickIfEnabled(el) {
    if (!el) return false;
    if (el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    el.click();
    return true;
}

function hasNextPage() {
    const nextBtn = findPagerBtn('Go to next page');
    return !!nextBtn
        && !nextBtn.classList.contains('disabled')
        && nextBtn.getAttribute('aria-disabled') !== 'true';
}

function goNextPage() {
    return clickIfEnabled(findPagerBtn('Go to next page'));
}

function goFirstPage() {
    return clickIfEnabled(findPagerBtn('Go to first page'));
}

function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitPageChange(prevFirstId, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await waitMs(300);
        const currentRows = getPageRows();
        const firstId = currentRows[0]?.posting_id || '';
        if (!prevFirstId && currentRows.length > 0) return true;
        if (firstId && firstId !== prevFirstId) return true;
        if (!hasNextPage()) return true;
    }
    return false;
}

// -----------------------------------------
// Hiring history extraction (3 data sources)
// -----------------------------------------
function findSectionByHeading(matchers) {
    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,strong,b,label,span,p,div'));
    for (const node of nodes) {
        const txt = cleanText(node.innerText).toLowerCase();
        if (!txt) continue;
        if (matchers.every(m => txt.includes(m))) {
            return node.closest('section,article,div,ui-tab-section,.doc-viewer,.table__container--fullscreen') || node.parentElement;
        }
    }
    return null;
}

function readSectionData(container) {
    if (!container) return null;

    const tables = [];
    container.querySelectorAll('table').forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
            Array.from(tr.querySelectorAll('th,td')).map(cell => cleanText(cell.innerText)).filter(Boolean)
        ).filter(r => r.length > 0);
        if (rows.length > 0) tables.push(rows);
    });

    const lists = Array.from(container.querySelectorAll('li'))
        .map(li => cleanText(li.innerText))
        .filter(Boolean);

    const svgText = Array.from(container.querySelectorAll('svg text'))
        .map(t => cleanText(t.textContent))
        .filter(Boolean);

    const ariaChart = Array.from(container.querySelectorAll('[aria-label]'))
        .map(el => cleanText(el.getAttribute('aria-label')))
        .filter(Boolean)
        .filter(t => /chart|hire|faculty|program|work term/i.test(t));

    const lines = cleanText(container.innerText)
        .split(/\n+/)
        .map(s => cleanText(s))
        .filter(Boolean)
        .slice(0, 200);

    return {
        tables,
        lists,
        svg_text: svgText,
        chart_labels: ariaChart,
        text_lines: lines
    };
}

function getHiringHistoryFromDom() {
    return {
        hires_by_faculty: readSectionData(findSectionByHeading(['hires by', 'faculty'])),
        hires_by_student_work_term_number: readSectionData(findSectionByHeading(['hires by', 'work term'])),
        most_frequently_hired_programs: readSectionData(findSectionByHeading(['most frequently', 'program']))
    };
}

function getActionToken(functionName) {
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

function getHiringHistoryFromHtml(html) {
    if (!html) {
        return {
            hires_by_faculty: null,
            hires_by_student_work_term_number: null,
            most_frequently_hired_programs: null
        };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    function sectionByHeadingFromDoc(matchers) {
        const nodes = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,strong,b,label,span,p,div'));
        for (const node of nodes) {
            const txt = cleanText(node.textContent || '').toLowerCase();
            if (!txt) continue;
            if (matchers.every(m => txt.includes(m))) {
                return node.closest('section,article,div,.doc-viewer') || node.parentElement;
            }
        }
        return null;
    }

    function extractSection(container) {
        if (!container) return null;

        const tables = [];
        container.querySelectorAll('table').forEach(table => {
            const rows = Array.from(table.querySelectorAll('tr'))
                .map(tr => Array.from(tr.querySelectorAll('th,td')).map(cell => cleanText(cell.textContent)).filter(Boolean))
                .filter(r => r.length > 0);
            if (rows.length) tables.push(rows);
        });

        const lists = Array.from(container.querySelectorAll('li'))
            .map(li => cleanText(li.textContent))
            .filter(Boolean);

        const textLines = cleanText(container.textContent || '')
            .split(/\n+/)
            .map(s => cleanText(s))
            .filter(Boolean)
            .slice(0, 200);

        return {
            tables,
            lists,
            text_lines: textLines
        };
    }

    return {
        hires_by_faculty: extractSection(sectionByHeadingFromDoc(['hires by', 'faculty'])),
        hires_by_student_work_term_number: extractSection(sectionByHeadingFromDoc(['hires by', 'work term'])),
        most_frequently_hired_programs: extractSection(sectionByHeadingFromDoc(['most frequently', 'program']))
    };
}

async function fetchOverviewHtml(postingId, overviewToken) {
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

async function fetchPostingJson(postingId, dataToken) {
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

async function fetchWtrJson(companyId, reportToken) {
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

function isSectionEmpty(section) {
    if (!section) return true;
    const hasTable = Array.isArray(section.tables) && section.tables.length > 0;
    const hasList = Array.isArray(section.lists) && section.lists.length > 0;
    const hasLines = Array.isArray(section.text_lines) && section.text_lines.length > 0;
    return !(hasTable || hasList || hasLines);
}

function toSectionData(value) {
    if (value == null) return null;

    if (Array.isArray(value)) {
        const lines = value.map(v => cleanText(typeof v === 'object' ? JSON.stringify(v) : String(v))).filter(Boolean);
        return {
            tables: [],
            lists: lines,
            text_lines: lines
        };
    }

    if (typeof value === 'object') {
        const lines = Object.entries(value)
            .map(([k, v]) => `${cleanText(k)}: ${cleanText(typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
            .filter(Boolean);
        return {
            tables: [],
            lists: [],
            text_lines: lines
        };
    }

    const line = cleanText(String(value));
    return {
        tables: [],
        lists: line ? [line] : [],
        text_lines: line ? [line] : []
    };
}

function getHiringHistoryFromPosting(postingData) {
    const empty = {
        hires_by_faculty: null,
        hires_by_student_work_term_number: null,
        most_frequently_hired_programs: null
    };
    if (!postingData || typeof postingData !== 'object') return empty;

    const patterns = {
        hires_by_faculty: [/faculty/i, /hire/i],
        hires_by_student_work_term_number: [/work\s*term/i, /hire/i],
        most_frequently_hired_programs: [/program/i, /(most|frequent|top)/i]
    };

    const found = {
        hires_by_faculty: null,
        hires_by_student_work_term_number: null,
        most_frequently_hired_programs: null
    };

    const visited = new Set();
    function walk(obj, path = []) {
        if (!obj || typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);

        if (Array.isArray(obj)) {
            obj.forEach((item, i) => walk(item, path.concat(String(i))));
            return;
        }

        for (const [key, val] of Object.entries(obj)) {
            const keyText = cleanText(key).toLowerCase();
            const pathText = cleanText(path.concat(key).join(' ')).toLowerCase();
            const targetText = `${keyText} ${pathText}`;

            for (const [target, regs] of Object.entries(patterns)) {
                if (found[target]) continue;
                if (regs.every(r => r.test(targetText))) {
                    found[target] = toSectionData(val);
                }
            }

            walk(val, path.concat(key));
        }
    }

    walk(postingData, []);
    return found;
}

function normalizeWtrData(section) {
    if (!section || typeof section !== 'object') return null;
    const out = {
        type: cleanText(section.type || ''),
        title: cleanText(section.title || ''),
        description: cleanText(section.description || '')
    };

    if (Array.isArray(section.columns)) out.columns = section.columns.map(c => cleanText(c));
    if (Array.isArray(section.rows)) out.rows = section.rows;
    if ('series' in section) out.series = section.series;
    if ('categories' in section) out.categories = section.categories;
    if ('value' in section) out.value = section.value;
    if ('data' in section) out.data = section.data;

    return out;
}

function getHiringHistoryFromWtr(report) {
    const empty = {
        hires_by_faculty: null,
        hires_by_student_work_term_number: null,
        most_frequently_hired_programs: null
    };
    if (!report || typeof report !== 'object' || !Array.isArray(report.sections)) return empty;

    function findSection(matchers) {
        return report.sections.find(sec => {
            const t = cleanText(`${sec?.title || ''} ${sec?.description || ''}`).toLowerCase();
            return matchers.every(m => t.includes(m));
        }) || null;
    }

    return {
        hires_by_faculty: normalizeWtrData(findSection(['hires by', 'faculty'])),
        hires_by_student_work_term_number: normalizeWtrData(findSection(['hires by', 'work term'])),
        most_frequently_hired_programs: normalizeWtrData(findSection(['most frequently', 'program']))
    };
}

function getExtraFieldsFromOverviewHtml(html) {
    const out = {
        work_term_duration: '',
        special_job_requirements: '',
        required_skills: ''
    };
    if (!html) return out;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const pageText = doc.body?.innerText || '';

    function extractByLabel(labelRegex, stopRegex) {
        const m = pageText.match(labelRegex);
        if (!m || !m[1]) return '';
        let v = m[1];
        if (stopRegex) v = v.split(stopRegex)[0] || v;
        return cleanText(v);
    }

    out.work_term_duration = extractByLabel(
        /work\s*term\s*duration\s*[:\-]?\s*([^\n]{1,150})/i
    );

    out.special_job_requirements = extractByLabel(
        /special\s*job\s*requirements?\s*[:\-]?\s*([\s\S]{1,1200})/i,
        /\n\s*(required\s*skills?|job\s*responsibilities?|compensation|documents?\s*required|additional\s*information)\b/i
    );

    out.required_skills = extractByLabel(
        /required\s*skills?\s*[:\-]?\s*([\s\S]{1,1200})/i,
        /\n\s*(job\s*responsibilities?|special\s*job\s*requirements?|compensation|documents?\s*required|additional\s*information)\b/i
    );

    return out;
}

async function attachHiringHistory(jobs) {
    // Tokens are embedded in page scripts by WaterlooWorks and reused here
    // to call internal POST endpoints for richer export data.
    const overviewToken = getActionToken('getPostingOverview');
    const postingDataToken = getActionToken('getPostingData');
    const wtrReportToken = getActionToken('getWorkTermRatingReportJson');
    if (!overviewToken) return jobs;

    const postingIds = jobs
        .map(j => cleanText(j.posting_id))
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
                const [html, postingData] = await Promise.all([
                    fetchOverviewHtml(pid, overviewToken),
                    postingDataToken ? fetchPostingJson(pid, postingDataToken) : Promise.resolve(null)
                ]);
                extraMap[pid] = getExtraFieldsFromOverviewHtml(html);

                const fromOverview = getHiringHistoryFromHtml(html);
                const fromPostingData = getHiringHistoryFromPosting(postingData);
                const companyId = cleanText(
                    postingData?.divId?.value ?? postingData?.divId ?? ''
                );
                const wtrReport = (wtrReportToken && companyId)
                    ? await fetchWtrJson(companyId, wtrReportToken)
                    : null;
                const fromWtrReport = getHiringHistoryFromWtr(wtrReport);

                historyMap[pid] = {
                    // Priority order: explicit WTR report > structured postingData > HTML overview fallback.
                    hires_by_faculty: fromWtrReport.hires_by_faculty
                        || (!isSectionEmpty(fromPostingData.hires_by_faculty)
                        ? fromPostingData.hires_by_faculty
                        : fromOverview.hires_by_faculty),
                    hires_by_student_work_term_number: fromWtrReport.hires_by_student_work_term_number
                        || (!isSectionEmpty(fromPostingData.hires_by_student_work_term_number)
                        ? fromPostingData.hires_by_student_work_term_number
                        : fromOverview.hires_by_student_work_term_number),
                    most_frequently_hired_programs: fromWtrReport.most_frequently_hired_programs
                        || (!isSectionEmpty(fromPostingData.most_frequently_hired_programs)
                        ? fromPostingData.most_frequently_hired_programs
                        : fromOverview.most_frequently_hired_programs)
                };
            } catch (_e) {
                historyMap[pid] = {
                    hires_by_faculty: null,
                    hires_by_student_work_term_number: null,
                    most_frequently_hired_programs: null
                };
                extraMap[pid] = {
                    work_term_duration: '',
                    special_job_requirements: '',
                    required_skills: ''
                };
            }
            await waitMs(50);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, uniqPostingIds.length); i += 1) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return jobs.map(job => ({
        ...job,
        hiring_history: historyMap[job.posting_id] || {
            hires_by_faculty: null,
            hires_by_student_work_term_number: null,
            most_frequently_hired_programs: null
        },
        ...(extraMap[job.posting_id] || {
            work_term_duration: '',
            special_job_requirements: '',
            required_skills: ''
        })
    }));
}

// --------------------------------------
// UI navigation helpers for WW job pages
// --------------------------------------
function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

async function waitUntil(fn, timeoutMs = 12000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (fn()) return true;
        await waitMs(intervalMs);
    }
    return false;
}

function findRowByPostingId(postingId) {
    if (!postingId) return null;
    const escaped = (window.CSS && CSS.escape) ? CSS.escape(String(postingId)) : String(postingId);
    const input = document.querySelector(`input[name='dataViewerSelection'][value='${escaped}']`);
    return input ? input.closest('tr') : null;
}

function openRowPosting(row) {
    if (!row) return false;
    const link = row.querySelector("td a.overflow--ellipsis, td a[href='javascript:void(0)'], td a");
    if (!link || !isVisible(link)) return false;
    link.click();
    return true;
}

function openWtrTab() {
    const candidates = Array.from(document.querySelectorAll('button, a, [role=\"tab\"], li, span'));
    const target = candidates.find(el => {
        const t = cleanText(el.innerText).toLowerCase();
        return t.includes('work term rating') && isVisible(el);
    });
    if (!target) return false;
    target.click();
    return true;
}

function closeJobView() {
    const selectors = [
        "button[aria-label*='Return to Job Search Overview']",
        "a[aria-label*='Return to Job Search Overview']"
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
            el.click();
            return true;
        }
    }
    return false;
}

function findAllJobsBtn() {
    return Array.from(document.querySelectorAll('button, a, [role="button"]')).find(el => {
        const t = cleanText(el.innerText).toLowerCase();
        const a = cleanText(el.getAttribute('aria-label') || '').toLowerCase();
        return isVisible(el) && (t.includes('all jobs') || a.includes('all jobs'));
    }) || null;
}

async function ensureJobsTable() {
    if (findJobsTable()) return true;

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

    await waitUntil(() => findJobsTable() !== null, 6000);
    if (findJobsTable()) return true;

    const allJobsBtn = findAllJobsBtn();
    if (allJobsBtn) {
        allJobsBtn.click();
        await waitUntil(() => findJobsTable() !== null, 6000);
    }

    return findJobsTable() !== null;
}

async function openAllJobs() {
    const allJobsBtn = findAllJobsBtn();
    if (!allJobsBtn) return;

    allJobsBtn.click();
    await waitUntil(() => findJobsTable() !== null, 6000);
}

async function getPostingHiringHistory(postingId) {
    if (!(await ensureJobsTable())) return null;

    const row = findRowByPostingId(postingId);
    if (!row) return null;

    if (!openRowPosting(row)) return null;

    await waitUntil(() => {
        const t = document.body.innerText.toLowerCase();
        return t.includes('work term rating') || t.includes('return to job search overview');
    }, 12000);

    openWtrTab();

    await waitUntil(() => {
        const t = document.body.innerText.toLowerCase();
        return t.includes('hires by faculty')
            || t.includes('hires by student work term number')
            || t.includes('most frequently hired programs');
    }, 10000);

    await waitMs(800);
    const hiringHistory = getHiringHistoryFromDom();

    const closed = closeJobView();
    if (!closed) {
        try { window.history.back(); } catch (_e) {}
    }
    await ensureJobsTable();
    await waitMs(500);

    return hiringHistory;
}

async function exportFilteredJobs(maxPages = 100) {
    await openAllJobs();
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= maxPages; page += 1) {
        const ok = await ensureJobsTable();
        if (!ok) break;

        const rows = getPageRows();
        if (!rows.length) break;

        for (const row of rows) {
            const key = `${row.posting_id}::${row.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(row);
        }

        const firstId = rows[0]?.posting_id || '';
        if (!goNextPage()) break;
        await waitPageChange(firstId);
    }

    // Final payload augments each exported row with hiring_history.
    const enriched = await attachHiringHistory(all);
    return { jobs: enriched };
}

async function openPosting(postingId, maxPages = 120) {
    const targetId = cleanText(postingId);
    if (!targetId) {
        return { success: false, error: 'Posting ID is empty.' };
    }

    await openAllJobs();

    const ok = await ensureJobsTable();
    if (!ok) {
        return { success: false, error: 'Jobs table not visible.', error_code: 'jobs_table_not_visible' };
    }

    const firstRows = getPageRows();
    const currentFirstId = firstRows[0]?.posting_id || '';
    if (currentFirstId) {
        const moved = goFirstPage();
        if (moved) {
            await waitPageChange(currentFirstId);
        }
    }

    for (let page = 1; page <= maxPages; page += 1) {
        await ensureJobsTable();
        const row = findRowByPostingId(targetId);
        if (row && openRowPosting(row)) {
            await waitUntil(() => {
                const t = document.body.innerText.toLowerCase();
                return t.includes('return to job search overview') || t.includes('work term rating');
            }, 10000);
            return { success: true };
        }

        const pageRows = getPageRows();
        const firstId = pageRows[0]?.posting_id || '';
        if (!goNextPage()) {
            break;
        }
        await waitPageChange(firstId);
    }

    return {
        success: false,
        error: `Posting ${targetId} not found in current filtered results.`,
        error_code: 'posting_not_found'
    };
}

function findApplyBtn() {
    const strictSelectors = [
        "button[aria-label*='Apply']",
        "a[aria-label*='Apply']",
        "button[title*='Apply']",
        "a[title*='Apply']"
    ];
    for (const sel of strictSelectors) {
        const node = document.querySelector(sel);
        if (node && isVisible(node)) return node;
    }

    const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
    return candidates.find(el => {
        const text = cleanText(
            el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || ''
        ).toLowerCase();
        if (!text) return false;
        if (!text.includes('apply')) return false;
        if (text.includes('filter') || text.includes('deadline') || text.includes('applied')) return false;
        return isVisible(el);
    }) || null;
}

async function openApply(postingId, maxPages = 120) {
    const opened = await openPosting(postingId, maxPages);
    if (!opened?.success) return opened;

    await waitUntil(() => findApplyBtn() !== null, 10000);
    const applyEl = findApplyBtn();
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

function onJobsPage() {
    return window.location.pathname.includes('/myAccount/co-op/full/jobs.htm');
}

async function runPendingAction() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    if (!onJobsPage()) return;

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
            result = await openPosting(pending.postingId, 60);
        } else if (pending.action === 'OPEN_APPLY_BY_ID') {
            result = await openApply(pending.postingId, 60);
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

function startPendingActionWatcher() {
    if (pendingWwActionWatcherStarted) return;
    if (!onJobsPage()) return;
    pendingWwActionWatcherStarted = true;

    const tick = async () => {
        if (pendingWwActionInProgress) return;
        pendingWwActionInProgress = true;
        try {
            await runPendingAction();
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
                const result = await exportFilteredJobs(120);
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
                const result = await openPosting(request.postingId, 120);
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
                const result = await openApply(request.postingId, 120);
                sendResponse(result);
            } catch (error) {
                sendResponse({ success: false, error: error.message || 'Open apply failed in content script.' });
            }
        })();
        return true;
    }
});

}

globalThis.bootstrapContentScript = bootstrapContentScript;

