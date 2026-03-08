document.addEventListener('DOMContentLoaded', () => {
    const jobGrid = document.getElementById('jobGrid');
    const template = document.getElementById('jobCardTemplate');
    const searchInput = document.getElementById('searchInput');
    const jobStats = document.getElementById('jobStats');
    const loading = document.getElementById('loading');
    const noResults = document.getElementById('noResults');
    const scoreJobsBtn = document.getElementById('scoreJobsBtn');

    const AI_BATCH_SIZE = 12;
    const WATERLOOWORKS_JOBS_URL = 'https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm';

    let allJobs = [];
    let currentSearchTerm = '';
    let isScoring = false;

    fetch('jobs.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load local jobs.json');
            }
            return response.json();
        })
        .then(data => {
            allJobs = Array.isArray(data) ? data : [];
            loading.classList.add('hidden');
            renderCurrentJobs();
        })
        .catch(error => {
            console.error('Error fetching jobs:', error);
            loading.innerHTML = '<p style="color:var(--accent-red)">Error loading jobs. Ensure jobs.json exists.</p>';
            if (scoreJobsBtn) {
                scoreJobsBtn.disabled = true;
            }
        });

    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.toLowerCase().trim();
        renderCurrentJobs();
    });

    if (scoreJobsBtn) {
        scoreJobsBtn.addEventListener('click', async () => {
            if (isScoring || !allJobs.length) return;
            if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
                setStats('AI scoring is only available inside the extension.');
                return;
            }

            isScoring = true;
            scoreJobsBtn.disabled = true;
            scoreJobsBtn.textContent = 'Scoring...';

            try {
                const scoreMap = new Map();
                const jobsToScore = allJobs.map(job => buildScorePayload(job));
                const totalBatches = Math.ceil(jobsToScore.length / AI_BATCH_SIZE);

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
                    }

                    const results = Array.isArray(response.results) ? response.results : [];
                    results.forEach(result => {
                        const postingId = String(result?.posting_id || '');
                        if (!postingId) return;
                        scoreMap.set(postingId, {
                            score: clampScore(result?.score),
                            reason: String(result?.reason || 'AI match summary unavailable.')
                        });
                    });

                    allJobs = allJobs.map(job => {
                        const match = scoreMap.get(String(job.posting_id || ''));
                        if (!match) return job;
                        return {
                            ...job,
                            aiMatchScore: match.score,
                            aiMatchReason: match.reason
                        };
                    });

                    renderCurrentJobs();
                }

                const scoredCount = allJobs.filter(job => Number.isFinite(job.aiMatchScore)).length;
                setStats(`${scoredCount} jobs ranked by AI fit`);
            } catch (error) {
                console.error('AI scoring error:', error);
                setStats(error?.message || 'AI scoring failed.');
            } finally {
                isScoring = false;
                scoreJobsBtn.disabled = false;
                scoreJobsBtn.textContent = 'Re-score with AI';
                renderCurrentJobs();
            }
        });
    }

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

    async function getWaterlooWorksTab() {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id && isJobsPageUrl(activeTab.url || '')) {
            return activeTab;
        }

        const candidates = await chrome.tabs.query({ url: '*://waterlooworks.uwaterloo.ca/*jobs.htm*' });
        if (candidates.length > 0) {
            return candidates[0];
        }

        return null;
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

                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        throw lastError || new Error('Failed to communicate with the WaterlooWorks tab.');
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

    function getLevelTokens(levelStr) {
        if (!levelStr) return [];
        return levelStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }

    function getFilteredJobs() {
        const filtered = !currentSearchTerm
            ? [...allJobs]
            : allJobs.filter(job => {
                const title = String(job.title || '').toLowerCase();
                const company = String(job.organization || '').toLowerCase();
                const city = String(job.city || '').toLowerCase();
                const division = String(job.division || '').toLowerCase();

                return title.includes(currentSearchTerm) ||
                    company.includes(currentSearchTerm) ||
                    city.includes(currentSearchTerm) ||
                    division.includes(currentSearchTerm);
            });

        filtered.sort((a, b) => {
            const scoreA = Number.isFinite(a.aiMatchScore) ? a.aiMatchScore : -1;
            const scoreB = Number.isFinite(b.aiMatchScore) ? b.aiMatchScore : -1;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return String(a.title || '').localeCompare(String(b.title || ''));
        });

        return filtered;
    }

    function renderCurrentJobs() {
        renderJobs(getFilteredJobs());
    }

    function renderJobs(jobsToRender) {
        jobGrid.innerHTML = '';

        if (jobsToRender.length === 0) {
            noResults.classList.remove('hidden');
            setStats('0 jobs found');
            return;
        }

        noResults.classList.add('hidden');
        const scoredCount = jobsToRender.filter(job => Number.isFinite(job.aiMatchScore)).length;
        const statSuffix = scoredCount > 0 ? ` • ${scoredCount} AI-scored` : '';
        if (!isScoring) {
            setStats(`${jobsToRender.length} jobs match your profile${statSuffix}`);
        }

        jobsToRender.forEach(job => {
            const clone = template.content.cloneNode(true);

            let cleanTitle = job.title || 'Unknown Title';
            cleanTitle = cleanTitle.replace(/^check_circle\s*/i, '');

            clone.querySelector('.job-title').textContent = cleanTitle;

            const org = job.organization || 'Unknown Company';
            clone.querySelector('.company-name').textContent = org;
            clone.querySelector('.company-logo-placeholder').textContent = org.charAt(0).toUpperCase();

            const locStr = [job.city, job.division].filter(Boolean).join(' • ');
            clone.querySelector('.location').textContent = locStr || 'Location unavailable';
            clone.querySelector('.applicants').textContent = job.apps ? `${job.apps} applicants` : 'No applicant data';
            clone.querySelector('.deadline').textContent = job.app_deadline || 'No deadline specified';
            clone.querySelector('.posting-id').textContent = `#${job.posting_id}`;

            const tagsContainer = clone.querySelector('.level-tags');
            const levels = getLevelTokens(job.level);
            levels.forEach(level => {
                const span = document.createElement('span');
                span.className = `tag tag-${level}`;
                span.textContent = level.charAt(0).toUpperCase() + level.slice(1);
                tagsContainer.appendChild(span);
            });

            const badge = clone.querySelector('.match-badge');
            const reason = clone.querySelector('.match-reason');
            const score = Number.isFinite(job.aiMatchScore) ? job.aiMatchScore : null;

            if (score === null) {
                badge.textContent = 'Not scored';
                badge.className = 'match-badge match-badge-pending';
                reason.textContent = 'Run AI scoring to rank these jobs against your resume.';
            } else {
                badge.textContent = `${score}% Match`;
                badge.className = `match-badge ${getScoreBadgeClass(score)}`;
                reason.textContent = job.aiMatchReason || 'AI match summary unavailable.';
            }

            const viewBtn = clone.querySelector('.view-btn');
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
