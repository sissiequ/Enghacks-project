document.addEventListener('DOMContentLoaded', () => {
    const jobGrid = document.getElementById('jobGrid');
    const template = document.getElementById('jobCardTemplate');
    const jobStats = document.getElementById('jobStats');
    const loading = document.getElementById('loading');
    const noResults = document.getElementById('noResults');
    const scoreJobsBtn = document.getElementById('scoreJobsBtn');

    const AI_BATCH_SIZE = 12;//AI processes a maximum of 12 jobs per batch
    const WATERLOOWORKS_JOBS_URL = 'https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm';

    let allJobs = [];
    let isScoring = false;
    //Used to prevent repeated clicks on the AI button
    init();

    async function init() {
        await loadJobs();

        if (scoreJobsBtn) {
            scoreJobsBtn.addEventListener('click', handleScoreJobsClick);
        }//Attach a click event handler to the AI button
    }
    //loadJobs() → Fetch jobs.json → Parse JSON → 
    // Save to allJobs → Hide loading indicator → renderJobs()
    //If an error occurs:
    //Fetch fails → Catch → Show error message → Disable the AI button
    async function loadJobs() {
        try {
            //Read from the current webpage directory
            //fetch can get the date from the following addrass
            const response = await fetch('jobs.json');
            if (!response.ok) {
                throw new Error('Failed to load local jobs.json');
            }
            // Convert jobs.json from a string into a JavaScript object
            const data = await response.json();
            allJobs = Array.isArray(data) ? data : [];
            loading.classList.add('hidden');
            renderJobs();//Display jobs on the page
        } catch (error) {
            console.error('Error fetching jobs:', error);
            loading.innerHTML = '<p style="color:var(--accent-red)">Error loading jobs. Ensure jobs.json exists.</p>';
            if (scoreJobsBtn) {
                scoreJobsBtn.disabled = true;
            }
        }
    }

    async function handleScoreJobsClick() {
        if (isScoring || !allJobs.length) return;
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
            setStats('AI scoring is only available inside the extension.');
            return;
        }//Check if the code is running inside a browser extension

        isScoring = true;
        setScoreButtonState(true, 'Scoring...');//turn the buttom to "scoring"

        try {
            const scoreMap = new Map();
            const jobsToScore = allJobs.map(buildScorePayload);
            const totalBatches = Math.ceil(jobsToScore.length / AI_BATCH_SIZE);
             //Process 12 jobs each time
             for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
                const start = batchIndex * AI_BATCH_SIZE;
                const batch = jobsToScore.slice(start, start + AI_BATCH_SIZE);
                setStats(`Scoring jobs with AI... Batch ${batchIndex + 1} of ${totalBatches}`);

                const response = await sendRuntimeMessage({
                    action: 'scoreJobsForDashboard',
                    jobs: batch
                });

                if (!response?.success) {
                    throw new Error(response?.error || 'AI scoring failed.');
                }//check if the returned answer is successed

                const results = Array.isArray(response.results) ? response.results : [];
                //check response.results if a result; if not then use empty array
                results.forEach((result) => {
                    const postingId = String(result?.posting_id || '');
                    if (!postingId) return;

                    scoreMap.set(postingId, {//Save AI scores
                        score: clampScore(result?.score),
                        reason: String(result?.reason || 'AI match summary unavailable.')
                    });
                });
                //Find the corresponding AI score by posting_id and add it to the job object
                allJobs = allJobs.map((job) => {
                    const match = scoreMap.get(String(job.posting_id || ''));
                    return match
                        ? { ...job, aiMatchScore: match.score, aiMatchReason: match.reason }
                        : job;
                });

                renderJobs();
            }

            setStats(`${getScoredCount(allJobs)} jobs ranked by AI fit`);
        } catch (error) {
            console.error('AI scoring error:', error);
            setStats(error?.message || 'AI scoring failed.');
        } finally {
            isScoring = false;
            setScoreButtonState(false, 'Re-score with AI');
            renderJobs();
        }//AI scoring process finished → Clear scoring state → 
    }    // Restore the button → Refresh the page

    //used to lock the button when scoring starts and restore it when scoring finishes
    function setScoreButtonState(disabled, label) {
        if (!scoreJobsBtn) return;
        scoreJobsBtn.disabled = disabled;
        scoreJobsBtn.textContent = label;
    }
    // send a message to the Chrome extension background (background.js)
    // and return the result using a Promise
    function sendRuntimeMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response);
            });
        });
    }

    function isJobsPageUrl(url) {
        return typeof url === 'string' && url.includes('/myAccount/co-op/full/jobs.htm');
    }
    //find the already open WaterlooWorks jobs page tab in the browser and return it
    async function getWaterlooWorksTab() {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id && isJobsPageUrl(activeTab.url || '')) {
            return activeTab;
        }

        const candidates = await chrome.tabs.query({ url: '*://waterlooworks.uwaterloo.ca/*jobs.htm*' });
        return candidates[0] || null;
    }

    async function sendMessageWithRetry(tabId, message, retries = 12, delayMs = 350) {
        let lastError = null;

        for (let i = 0; i < retries; i += 1) {
            try {
                return await chrome.tabs.sendMessage(tabId, message);
            } catch (error) {
                lastError = error;
                const errorMessage = String(error?.message || '');

                if (errorMessage.includes('Receiving end does not exist')) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId },
                            files: ['content.js']
                        });
                    } catch (_injectError) {}
                }

                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw lastError || new Error('Failed to communicate with the WaterlooWorks tab.');
    }

    async function sendMessageToWaterlooTab(message, options = {}) {
        let tab = await getWaterlooWorksTab();
        if (!tab?.id) {
            await chrome.tabs.create({ url: WATERLOOWORKS_JOBS_URL, active: true });
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
        } catch (_error) {
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

    async function openPostingFromDashboard(postingId) {
        const normalizedPostingId = String(postingId || '').trim();
        if (!normalizedPostingId) {
            throw new Error('Missing posting ID.');
        }

        const response = await sendMessageToWaterlooTab({
            action: 'OPEN_POSTING_BY_ID',
            postingId: normalizedPostingId
        }, { activateTab: true });

        if (!response?.success) {
            throw new Error(response?.error || 'Could not open this posting.');
        }

        return response;
    }

    function buildScorePayload(job) {
        return {
            posting_id: job.posting_id,
            title: job.title,
            organization: job.organization,
            division: job.division,
            openings: job.openings,
            city: job.city,
            level: job.level,
            apps: job.apps,
            app_deadline: job.app_deadline,
            raw_text: job.raw_text,
            hiring_history: job.hiring_history
        };
    }

    function setStats(text) {
        if (jobStats) {
            jobStats.textContent = text;
        }
    }

    function clampScore(score) {
        const numericScore = Number.parseInt(score, 10);
        if (!Number.isFinite(numericScore)) return 0;
        return Math.max(0, Math.min(100, numericScore));
    }

    function getScoredCount(jobs) {
        return jobs.filter((job) => Number.isFinite(job.aiMatchScore)).length;
    }

    function getLevelTokens(levelStr) {
        if (!levelStr) return [];
        return levelStr.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    }

    function getSortedJobs() {//sorting rules
        return [...allJobs].sort((a, b) => {
            const scoreA = Number.isFinite(a.aiMatchScore) ? a.aiMatchScore : -1;
            const scoreB = Number.isFinite(b.aiMatchScore) ? b.aiMatchScore : -1;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return String(a.title || '').localeCompare(String(b.title || ''));
        });
    }

    function getMatchMeta(job) {
        if (!Number.isFinite(job.aiMatchScore)) {
            return {
                badgeText: 'Not scored',
                badgeClass: 'match-badge match-badge-pending',
                reason: 'Run AI scoring to rank these jobs against your resume.'
            };
        }

        return {
            badgeText: `${job.aiMatchScore}% Match`,
            badgeClass: `match-badge ${getScoreBadgeClass(job.aiMatchScore)}`,
            reason: job.aiMatchReason || 'AI match summary unavailable.'
        };
    }

    function renderJobs() {
        const jobsToRender = getSortedJobs();
        jobGrid.innerHTML = '';

        if (jobsToRender.length === 0) {
            noResults.classList.remove('hidden');
            setStats('0 jobs found');
            return;
        }

        noResults.classList.add('hidden');
        if (!isScoring) {
            const scoredCount = getScoredCount(jobsToRender);
            const statSuffix = scoredCount > 0 ? ` • ${scoredCount} AI-scored` : '';
            setStats(`${jobsToRender.length} jobs match your profile${statSuffix}`);
        }

        jobsToRender.forEach((job) => {
            const clone = template.content.cloneNode(true);
            const cleanTitle = String(job.title || 'Unknown Title').replace(/^check_circle\s*/i, '');
            const companyName = job.organization || 'Unknown Company';
            const levelTags = clone.querySelector('.level-tags');
            const matchMeta = getMatchMeta(job);
            const viewBtn = clone.querySelector('.view-btn');

            clone.querySelector('.job-title').textContent = cleanTitle;
            clone.querySelector('.company-name').textContent = companyName;
            clone.querySelector('.location').textContent = [job.city, job.division].filter(Boolean).join(' • ') || 'Location unavailable';
            clone.querySelector('.applicants').textContent = job.apps ? `${job.apps} applicants` : 'No applicant data';
            clone.querySelector('.deadline').textContent = job.app_deadline || 'No deadline specified';
            clone.querySelector('.posting-id').textContent = `#${job.posting_id}`;
            clone.querySelector('.match-badge').textContent = matchMeta.badgeText;
            clone.querySelector('.match-badge').className = matchMeta.badgeClass;
            clone.querySelector('.match-reason').textContent = matchMeta.reason;

            getLevelTokens(job.level).forEach((level) => {
                const span = document.createElement('span');
                span.className = `tag tag-${level}`;
                span.textContent = level.charAt(0).toUpperCase() + level.slice(1);
                levelTags.appendChild(span);
            });

            viewBtn.href = '#';
            viewBtn.addEventListener('click', async (event) => {
                event.preventDefault();

                if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
                    setStats('Opening on WaterlooWorks is only available inside the extension.');
                    return;
                }

                const originalLabel = viewBtn.textContent;
                viewBtn.textContent = 'Opening...';
                viewBtn.setAttribute('aria-disabled', 'true');
                viewBtn.style.pointerEvents = 'none';
                setStats(`Opening posting ${job.posting_id} on WaterlooWorks...`);

                try {
                    const response = await openPostingFromDashboard(job.posting_id);
                    setStats(
                        response?.queued
                            ? `WaterlooWorks opened. Command queued for posting ${job.posting_id}.`
                            : `Opened posting ${job.posting_id}.`
                    );
                } catch (error) {
                    setStats(error?.message || 'Open failed.');
                } finally {
                    viewBtn.textContent = originalLabel;
                    viewBtn.removeAttribute('aria-disabled');
                    viewBtn.style.pointerEvents = '';
                }
            });

            jobGrid.appendChild(clone);
        });
    }

    function getScoreBadgeClass(score) {
        if (score >= 80) return 'match-badge-strong';
        if (score >= 60) return 'match-badge-medium';
        return 'match-badge-low';
    }
});
