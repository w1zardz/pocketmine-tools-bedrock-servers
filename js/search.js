/* ============================================
   GitHub Plugin Search
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    let currentPage = 1;
    let totalPages = 1;
    let currentQuery = '';
    let currentTopic = 'pocketmine-mp';

    const searchInput = $('#pluginSearchInput');
    const searchBtn = $('#pluginSearchBtn');
    const resultsContainer = $('#searchResults');
    const pagination = $('#searchPagination');
    const prevBtn = $('#prevPageBtn');
    const nextBtn = $('#nextPageBtn');
    const pageInfo = $('#paginationInfo');

    // Search on button click
    searchBtn?.addEventListener('click', () => {
        currentPage = 1;
        doSearch();
    });

    // Search on Enter
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            doSearch();
        }
    });

    // Topic filter chips
    $$('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentTopic = chip.dataset.topic;
            if (currentQuery || searchInput.value.trim()) {
                currentPage = 1;
                doSearch();
            }
        });
    });

    // Pagination
    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            doSearch();
        }
    });

    nextBtn?.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            doSearch();
        }
    });

    async function doSearch() {
        const query = searchInput.value.trim();
        currentQuery = query;

        const searchTerm = query
            ? `${query}+topic:${currentTopic}+language:php`
            : `topic:${currentTopic}+language:php`;

        resultsContainer.innerHTML = `
            <div style="text-align:center;padding:40px">
                <div class="spinner"></div>
            </div>
        `;
        pagination.style.display = 'none';

        try {
            const perPage = 10;
            const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchTerm)}&sort=stars&order=desc&per_page=${perPage}&page=${currentPage}`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('GitHub API rate limit exceeded. Please wait a minute and try again.');
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="search-empty">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <p>No plugins found. Try a different search term.</p>
                    </div>
                `;
                return;
            }

            totalPages = Math.min(Math.ceil(data.total_count / perPage), 100);

            resultsContainer.innerHTML = '';
            data.items.forEach(repo => {
                const card = createRepoCard(repo);
                resultsContainer.appendChild(card);
            });

            // Update pagination
            pagination.style.display = 'flex';
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = currentPage >= totalPages;
            pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${data.total_count.toLocaleString()} results)`;

        } catch (err) {
            resultsContainer.innerHTML = `
                <div class="search-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <p>${err.message}</p>
                </div>
            `;
        }
    }

    function createRepoCard(repo) {
        const card = document.createElement('div');
        card.className = 'search-card';

        const updated = timeAgo(new Date(repo.updated_at));
        const created = new Date(repo.created_at).toLocaleDateString();

        card.innerHTML = `
            <img class="search-card__avatar" src="${repo.owner.avatar_url}&s=88" alt="${repo.owner.login}" loading="lazy" width="44" height="44">
            <div class="search-card__body">
                <h3 class="search-card__name">
                    <a href="${repo.html_url}" target="_blank" rel="noopener">${repo.full_name}</a>
                </h3>
                <p class="search-card__desc">${repo.description || 'No description provided'}</p>
                <div class="search-card__meta">
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z"/></svg>
                        ${repo.stargazers_count.toLocaleString()}
                    </span>
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 5C7 5 2.73 8.11 1 12.5 2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5z"/></svg>
                        ${repo.watchers_count.toLocaleString()}
                    </span>
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        ${repo.forks_count.toLocaleString()} forks
                    </span>
                    <span class="search-card__stat">Updated ${updated}</span>
                    ${repo.language ? `<span class="search-card__stat">${repo.language}</span>` : ''}
                </div>
                <div class="search-card__links">
                    <a class="search-card__link" href="${repo.html_url}" target="_blank" rel="noopener">Repository</a>
                    <a class="search-card__link" href="${repo.html_url}/releases" target="_blank" rel="noopener">Releases</a>
                    ${repo.homepage ? `<a class="search-card__link" href="${repo.homepage}" target="_blank" rel="noopener">Website</a>` : ''}
                </div>
            </div>
        `;

        return card;
    }

    function timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'week', seconds: 604800 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 },
        ];

        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count > 0) {
                return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
            }
        }
        return 'just now';
    }

})();
