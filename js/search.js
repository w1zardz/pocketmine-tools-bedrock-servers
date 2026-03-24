/* ============================================
   Plugin Search — Poggit API + GitHub Repo Search
   (no auth required, no Code Search API)
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    let currentPage = 1;
    let totalPages = 1;
    let currentQuery = '';
    let currentSource = 'poggit';

    const searchInput = $('#pluginSearchInput');
    const searchBtn = $('#pluginSearchBtn');
    const resultsContainer = $('#searchResults');
    const pagination = $('#searchPagination');
    const prevBtn = $('#prevPageBtn');
    const nextBtn = $('#nextPageBtn');
    const pageInfo = $('#paginationInfo');
    const searchStats = $('#searchStats');

    searchBtn?.addEventListener('click', () => { currentPage = 1; doSearch(); });
    searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { currentPage = 1; doSearch(); } });

    $$('.filter-chip[data-source]').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('.filter-chip[data-source]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentSource = chip.dataset.source;
            currentPage = 1;
            if (currentQuery || searchInput.value.trim()) doSearch();
        });
    });

    prevBtn?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; doSearch(); } });
    nextBtn?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; doSearch(); } });

    // Load recent plugins when section becomes visible
    let recentLoaded = false;

    // Watch for navigation to plugin-search section
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#plugin-search' && !recentLoaded) {
            recentLoaded = true;
            loadRecent();
        }
    });
    // If already on plugin-search on page load
    if (window.location.hash === '#plugin-search') {
        recentLoaded = true;
        loadRecent();
    }
    // Also hook into tool card clicks (they set hash before hashchange fires)
    document.querySelectorAll('[data-tool="plugin-search"]').forEach(el => {
        el.addEventListener('click', () => {
            if (!recentLoaded) {
                recentLoaded = true;
                setTimeout(loadRecent, 50);
            }
        });
    });

    async function loadRecent() {
        showLoading();
        try {
            // Fetch recent from GitHub (recently updated pocketmine PHP repos)
            const resp = await fetch(
                'https://api.github.com/search/repositories?q=pocketmine+language:php&sort=updated&order=desc&per_page=15',
                { headers: { 'Accept': 'application/vnd.github.v3+json' } }
            );
            if (!resp.ok) throw new Error('GitHub API error');
            const data = await resp.json();

            showStats('Recently updated PocketMine plugins');
            resultsContainer.innerHTML = '';
            for (const repo of (data.items || [])) {
                resultsContainer.appendChild(createGitHubCard(repo));
            }
            pagination.style.display = 'none';
        } catch (e) {
            showEmpty('Search for PocketMine plugins to get started');
        }
    }

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) {
            // If empty query, show recent plugins
            recentLoaded = false;
            loadRecent();
            return;
        }
        currentQuery = query;
        showLoading();

        try {
            switch (currentSource) {
                case 'poggit': await searchPoggit(query); break;
                case 'github-code': await searchGitHubRepos(query, 'pocketmine'); break;
                case 'github-poggit': await searchGitHubRepos(query, 'pmmp'); break;
            }
        } catch (err) {
            showError(err.message);
        }
    }

    // ===== POGGIT SEARCH =====
    // Poggit ?name= supports CORS and finds exact match.
    // We also fire a GitHub repo search in parallel to find more results.
    async function searchPoggit(query) {
        // Fire both requests in parallel
        const [poggitResult, githubResult] = await Promise.allSettled([
            fetchPoggit(query),
            fetchGitHubRepos(query, 'pocketmine', 1, 15)
        ]);

        const poggitPlugins = poggitResult.status === 'fulfilled' ? poggitResult.value : [];
        const githubData = githubResult.status === 'fulfilled' ? githubResult.value : null;
        const githubRepos = githubData?.items || [];

        if (poggitPlugins.length === 0 && githubRepos.length === 0) {
            showEmpty(`No plugins found for "${query}". Try a different name.`);
            return;
        }

        resultsContainer.innerHTML = '';

        // Stats
        let statsText = '';
        if (poggitPlugins.length > 0) statsText += `${poggitPlugins.length} from Poggit`;
        if (githubRepos.length > 0) {
            if (statsText) statsText += ' + ';
            statsText += `${githubRepos.length} from GitHub`;
        }
        const total = poggitPlugins.length + githubRepos.length;
        showStats(`Found ${total} result${total !== 1 ? 's' : ''} (${statsText})`);

        // Render Poggit results first
        for (const plugin of poggitPlugins) {
            resultsContainer.appendChild(createPoggitCard(plugin));
        }

        // Render GitHub results, skip duplicates
        const poggitRepoNames = new Set(poggitPlugins.map(p => (p.repo_name || '').toLowerCase()));
        for (const repo of githubRepos) {
            if (!poggitRepoNames.has((repo.full_name || '').toLowerCase())) {
                resultsContainer.appendChild(createGitHubCard(repo));
            }
        }

        // Pagination based on GitHub results
        if (githubData && githubData.total_count > 15) {
            totalPages = Math.min(Math.ceil(githubData.total_count / 15), 50);
            updatePagination();
        } else {
            pagination.style.display = 'none';
        }
    }

    async function fetchPoggit(query) {
        const resp = await fetch(`https://poggit.pmmp.io/releases.json?name=${encodeURIComponent(query)}`);
        if (!resp.ok) return [];
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) return [];

        // Deduplicate: keep latest version per plugin name
        const map = new Map();
        for (const p of data) {
            const existing = map.get(p.name);
            if (!existing || (p.submission_date || 0) > (existing.submission_date || 0)) {
                map.set(p.name, p);
            }
        }
        return [...map.values()];
    }

    // ===== GITHUB REPOSITORY SEARCH =====
    // Uses /search/repositories (no auth needed, 10 req/min for unauthenticated)
    async function searchGitHubRepos(query, extraKeyword) {
        const data = await fetchGitHubRepos(query, extraKeyword, currentPage, 15);
        if (!data || !data.items || data.items.length === 0) {
            showEmpty(`No GitHub repositories found for "${query}".`);
            return;
        }

        totalPages = Math.min(Math.ceil(data.total_count / 15), 50);
        showStats(`Found ${data.total_count.toLocaleString()} repositories on GitHub`);

        resultsContainer.innerHTML = '';
        for (const repo of data.items) {
            resultsContainer.appendChild(createGitHubCard(repo));
        }
        updatePagination();
    }

    async function fetchGitHubRepos(query, extraKeyword, page, perPage) {
        // Search: query + pocketmine/pmmp keyword + PHP language
        const searchTerm = `${query} ${extraKeyword} language:php`;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchTerm)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;

        const resp = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (!resp.ok) {
            if (resp.status === 403) throw new Error('GitHub API rate limit (10 req/min without auth). Wait a minute.');
            throw new Error('GitHub API error: ' + resp.status);
        }
        return resp.json();
    }

    // ===== CARD RENDERERS =====

    function createPoggitCard(plugin) {
        const card = document.createElement('div');
        card.className = 'search-card';

        const iconUrl = plugin.icon_url || defaultIcon();
        const updated = plugin.submission_date ? timeAgo(new Date(plugin.submission_date * 1000)) : '';
        const downloads = (plugin.downloads || 0).toLocaleString();
        const pluginUrl = plugin.html_url || `https://poggit.pmmp.io/p/${encodeURIComponent(plugin.name)}`;
        const repoUrl = plugin.repo_name ? `https://github.com/${plugin.repo_name}` : null;
        const apiStr = formatApi(plugin.api);

        card.innerHTML = `
            <img class="search-card__avatar" src="${iconUrl}" alt="${escAttr(plugin.name)}" loading="lazy" width="44" height="44" onerror="this.src='${defaultIcon()}'">
            <div class="search-card__body">
                <h3 class="search-card__name">
                    <a href="${pluginUrl}" target="_blank" rel="noopener">${highlightMatch(plugin.name, currentQuery)}</a>
                    <span class="search-card__badge search-card__badge--poggit">Poggit</span>
                </h3>
                <p class="search-card__desc">${escHtml(plugin.tagline || plugin.shortDesc || 'No description')}</p>
                <div class="search-card__meta">
                    <span class="search-card__stat" title="Downloads">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        ${downloads}
                    </span>
                    <span class="search-card__stat" title="Version">v${escHtml(plugin.version || '?')}</span>
                    ${apiStr ? `<span class="search-card__stat" title="API">API: ${escHtml(apiStr)}</span>` : ''}
                    ${updated ? `<span class="search-card__stat">Released ${updated}</span>` : ''}
                </div>
                <div class="search-card__links">
                    <a class="search-card__link" href="${pluginUrl}" target="_blank" rel="noopener">Poggit Page</a>
                    ${repoUrl ? `<a class="search-card__link" href="${repoUrl}" target="_blank" rel="noopener">GitHub Repo</a>` : ''}
                    ${plugin.artifact_url ? `<a class="search-card__link search-card__link--download" href="${plugin.artifact_url}" target="_blank" rel="noopener">Download .phar</a>` : ''}
                </div>
            </div>
        `;
        return card;
    }

    function createGitHubCard(repo) {
        const card = document.createElement('div');
        card.className = 'search-card';

        const updated = timeAgo(new Date(repo.updated_at || repo.pushed_at || Date.now()));
        const avatarUrl = repo.owner?.avatar_url || '';

        card.innerHTML = `
            <img class="search-card__avatar" src="${avatarUrl}&s=88" alt="${escAttr(repo.owner?.login || '')}" loading="lazy" width="44" height="44">
            <div class="search-card__body">
                <h3 class="search-card__name">
                    <a href="${repo.html_url}" target="_blank" rel="noopener">${highlightMatch(repo.full_name || repo.name, currentQuery)}</a>
                    <span class="search-card__badge search-card__badge--github">GitHub</span>
                </h3>
                <p class="search-card__desc">${escHtml(repo.description || 'No description provided')}</p>
                <div class="search-card__meta">
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z"/></svg>
                        ${(repo.stargazers_count || 0).toLocaleString()}
                    </span>
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        ${(repo.forks_count || 0).toLocaleString()} forks
                    </span>
                    ${repo.language ? `<span class="search-card__stat">${escHtml(repo.language)}</span>` : ''}
                    <span class="search-card__stat">Updated ${updated}</span>
                </div>
                <div class="search-card__links">
                    <a class="search-card__link" href="${repo.html_url}" target="_blank" rel="noopener">Repository</a>
                    <a class="search-card__link" href="${repo.html_url}/releases" target="_blank" rel="noopener">Releases</a>
                    ${repo.homepage ? `<a class="search-card__link" href="${escAttr(repo.homepage)}" target="_blank" rel="noopener">Website</a>` : ''}
                </div>
            </div>
        `;
        return card;
    }

    // ===== HELPERS =====

    function formatApi(api) {
        if (!api) return '';
        if (Array.isArray(api)) return api.map(a => Array.isArray(a) ? a.join('-') : String(a)).join(', ');
        return String(api);
    }

    function defaultIcon() {
        return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><rect width="24" height="24" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-family="sans-serif">P</text></svg>');
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function escAttr(str) {
        return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function highlightMatch(text, query) {
        if (!query) return escHtml(text);
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }

    function showLoading() {
        resultsContainer.innerHTML = `
            <div style="text-align:center;padding:40px">
                <div class="spinner"></div>
                <p style="margin-top:12px;color:var(--text-secondary)">
                    ${currentSource === 'poggit' ? 'Searching Poggit + GitHub...' : 'Searching GitHub repositories...'}
                </p>
            </div>`;
        pagination.style.display = 'none';
        if (searchStats) searchStats.style.display = 'none';
    }

    function showEmpty(msg) {
        resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p>${msg}</p>
            </div>`;
        pagination.style.display = 'none';
        if (searchStats) searchStats.style.display = 'none';
    }

    function showError(msg) {
        resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p>${msg}</p>
            </div>`;
        pagination.style.display = 'none';
    }

    function showStats(html) {
        if (!searchStats) return;
        searchStats.innerHTML = html;
        searchStats.style.display = 'block';
    }

    function updatePagination() {
        pagination.style.display = 'flex';
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    function timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 0) return 'just now';
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'week', seconds: 604800 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 },
        ];
        for (const i of intervals) {
            const c = Math.floor(seconds / i.seconds);
            if (c > 0) return `${c} ${i.label}${c > 1 ? 's' : ''} ago`;
        }
        return 'just now';
    }

})();
