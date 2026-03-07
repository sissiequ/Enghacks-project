document.addEventListener('DOMContentLoaded', () => {
    const jobGrid = document.getElementById('jobGrid');
    const template = document.getElementById('jobCardTemplate');
    const searchInput = document.getElementById('searchInput');
    const jobStats = document.getElementById('jobStats');
    const loading = document.getElementById('loading');
    const noResults = document.getElementById('noResults');

    let allJobs = [];

    // Fetch jobs from local JSON
    fetch('jobs.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load local jobs.json');
            }
            return response.json();
        })
        .then(data => {
            allJobs = data;
            loading.classList.add('hidden');
            renderJobs(allJobs);
        })
        .catch(error => {
            console.error('Error fetching jobs:', error);
            loading.innerHTML = `<p style="color:var(--accent-red)">Error loading jobs. Ensure jobs.json exists.</p>`;
        });

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        
        if (!term) {
            renderJobs(allJobs);
            return;
        }

        const filtered = allJobs.filter(job => {
            const title = (job.title || '').toLowerCase();
            const company = (job.organization || '').toLowerCase();
            const city = (job.city || '').toLowerCase();
            const division = (job.division || '').toLowerCase();
            
            return title.includes(term) || 
                   company.includes(term) || 
                   city.includes(term) || 
                   division.includes(term);
        });

        renderJobs(filtered);
    });

    function getLevelTokens(levelStr) {
        if (!levelStr) return [];
        return levelStr.split(',').map(s => s.trim().toLowerCase());
    }

    function renderJobs(jobsToRender) {
        jobGrid.innerHTML = ''; // clear current

        if (jobsToRender.length === 0) {
            noResults.classList.remove('hidden');
            jobStats.textContent = `0 jobs found`;
        } else {
            noResults.classList.add('hidden');
            jobStats.textContent = `${jobsToRender.length} jobs match your profile`;

            jobsToRender.forEach(job => {
                const clone = template.content.cloneNode(true);
                
                // Clean title slightly if it starts with "check_circle"
                let cleanTitle = job.title || 'Unknown Title';
                cleanTitle = cleanTitle.replace(/^check_circle\s*/i, '');
                
                clone.querySelector('.job-title').textContent = cleanTitle;
                
                const org = job.organization || 'Unknown Company';
                clone.querySelector('.company-name').textContent = org;
                
                // Generate a faux logo by taking the first letter of the company
                clone.querySelector('.company-logo-placeholder').textContent = org.charAt(0).toUpperCase();

                // Details
                const locStr = [job.city, job.division].filter(Boolean).join(' • ');
                clone.querySelector('.location').textContent = locStr || 'Location unavailable';

                clone.querySelector('.applicants').textContent = job.apps ? `${job.apps} applicants` : 'No applicant data';
                
                const deadlineEl = clone.querySelector('.deadline');
                deadlineEl.textContent = job.app_deadline || 'No deadline specified';
                
                // Make deadline orange if it's coming up soon (basic string check usually "Mar 10, 2026")
                // For a real app, parse the date properly.
                
                // Tags
                const tagsContainer = clone.querySelector('.level-tags');
                const levels = getLevelTokens(job.level);
                
                levels.forEach(lvl => {
                    const span = document.createElement('span');
                    span.className = `tag tag-${lvl}`;
                    // Capitalize first letter
                    span.textContent = lvl.charAt(0).toUpperCase() + lvl.slice(1);
                    tagsContainer.appendChild(span);
                });

                clone.querySelector('.posting-id').textContent = `#${job.posting_id}`;
                
                // Construct WW link (this is an approximation, likely leads to search page)
                const viewBtn = clone.querySelector('.view-btn');
                viewBtn.href = `https://waterlooworks.uwaterloo.ca/myAccount/co-op/coop-postings.htm`;

                jobGrid.appendChild(clone);
            });
        }
    }
});
