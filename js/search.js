/* ============================================
   Plugin Search — Poggit + GitHub Code Search
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    let currentPage = 1;
    let totalPages = 1;
    let currentQuery = '';
    let currentSource = 'poggit';

    // Poggit cache (loaded once, filtered client-side)
    let poggitCache = null;
    let poggitLoading = false;

    const searchInput = $('#pluginSearchInput');
    const searchBtn = $('#pluginSearchBtn');
    const resultsContainer = $('#searchResults');
    const pagination = $('#searchPagination');
    const prevBtn = $('#prevPageBtn');
    const nextBtn = $('#nextPageBtn');
    const pageInfo = $('#paginationInfo');
    const searchStats = $('#searchStats');

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

    // Source filter chips
    $$('.filter-chip[data-source]').forEach(chip => {
        chip.addEventListener('click', () => {
            $$('.filter-chip[data-source]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentSource = chip.dataset.source;
            currentPage = 1;
            if (currentQuery || searchInput.value.trim()) {
                doSearch();
            }
        });
    });

    // Pagination
    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; doSearch(); }
    });
    nextBtn?.addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; doSearch(); }
    });

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) {
            showEmpty('Type a plugin name to search');
            return;
        }
        currentQuery = query;
        showLoading();

        try {
            switch (currentSource) {
                case 'poggit':
                    await searchPoggit(query);
                    break;
                case 'github-code':
                    await searchGitHubCode(query, 'plugin.yml');
                    break;
                case 'github-poggit':
                    await searchGitHubCode(query, '.poggit.yml');
                    break;
            }
        } catch (err) {
            showError(err.message);
        }
    }

    // ===== POGGIT API =====
    async function loadPoggitCache() {
        if (poggitCache) return poggitCache;
        if (poggitLoading) {
            // Wait for ongoing load
            while (poggitLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return poggitCache;
        }
        poggitLoading = true;
        try {
            // Poggit releases.json returns all released plugins
            const resp = await fetch('https://poggit.pmmp.io/releases.json?fields=name,version,api,shortDesc,html_url,icon_url,repo_name,downloads,score,state,categories,updated,artifact_url,tagline');
            if (!resp.ok) throw new Error('Poggit API error: ' + resp.status);
            const data = await resp.json();
            // Deduplicate: keep only latest version per plugin name
            const map = new Map();
            for (const plugin of data) {
                const existing = map.get(plugin.name);
                if (!existing || plugin.updated > existing.updated) {
                    map.set(plugin.name, plugin);
                }
            }
            poggitCache = [...map.values()];
            return poggitCache;
        } finally {
            poggitLoading = false;
        }
    }

    async function searchPoggit(query) {
        const plugins = await loadPoggitCache();
        const q = query.toLowerCase();

        // Score-based matching
        const results = plugins
            .map(p => {
                let score = 0;
                const name = (p.name || '').toLowerCase();
                const desc = (p.shortDesc || p.tagline || '').toLowerCase();
                const repo = (p.repo_name || '').toLowerCase();

                if (name === q) score += 100;
                else if (name.startsWith(q)) score += 50;
                else if (name.includes(q)) score += 30;
                if (desc.includes(q)) score += 15;
                if (repo.includes(q)) score += 10;

                // Boost by downloads
                score += Math.min((p.downloads || 0) / 1000, 10);

                return { ...p, _score: score };
            })
            .filter(p => p._score > 0)
            .sort((a, b) => b._score - a._score);

        renderPoggitResults(results, query);
    }

    function renderPoggitResults(results, query) {
        const perPage = 12;
        totalPages = Math.max(1, Math.ceil(results.length / perPage));
        currentPage = Math.min(currentPage, totalPages);

        const start = (currentPage - 1) * perPage;
        const page = results.slice(start, start + perPage);

        if (results.length === 0) {
            showEmpty(`No plugins found on Poggit for "${query}". Try GitHub search.`);
            return;
        }

        showStats(`Found ${results.length} plugin${results.length !== 1 ? 's' : ''} on Poggit`);

        resultsContainer.innerHTML = '';
        page.forEach(plugin => {
            const card = document.createElement('div');
            card.className = 'search-card';

            const iconUrl = plugin.icon_url || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>');
            const updated = plugin.updated ? timeAgo(new Date(plugin.updated * 1000)) : 'unknown';
            const apiVersions = Array.isArray(plugin.api) ? plugin.api.map(a => Array.isArray(a) ? a.join('-') : a).join(', ') : (plugin.api || '?');
            const downloads = (plugin.downloads || 0).toLocaleString();
            const pluginUrl = plugin.html_url || `https://poggit.pmmp.io/p/${encodeURIComponent(plugin.name)}`;
            const repoUrl = plugin.repo_name ? `https://github.com/${plugin.repo_name}` : null;

            card.innerHTML = `
                <img class="search-card__avatar" src="${iconUrl}" alt="${plugin.name}" loading="lazy" width="44" height="44" onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><rect width="24" height="24" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12">P</text></svg>')}'">
                <div class="search-card__body">
                    <h3 class="search-card__name">
                        <a href="${pluginUrl}" target="_blank" rel="noopener">${highlightMatch(plugin.name, currentQuery)}</a>
                        <span class="search-card__badge search-card__badge--poggit">Poggit</span>
                    </h3>
                    <p class="search-card__desc">${plugin.shortDesc || plugin.tagline || 'No description'}</p>
                    <div class="search-card__meta">
                        <span class="search-card__stat" title="Downloads">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            ${downloads}
                        </span>
                        <span class="search-card__stat" title="Version">v${plugin.version || '?'}</span>
                        <span class="search-card__stat" title="API">API: ${apiVersions}</span>
                        <span class="search-card__stat">Updated ${updated}</span>
                    </div>
                    <div class="search-card__links">
                        <a class="search-card__link" href="${pluginUrl}" target="_blank" rel="noopener">Poggit Page</a>
                        ${repoUrl ? `<a class="search-card__link" href="${repoUrl}" target="_blank" rel="noopener">GitHub Repo</a>` : ''}
                        ${plugin.artifact_url ? `<a class="search-card__link search-card__link--download" href="${plugin.artifact_url}" target="_blank" rel="noopener">Download .phar</a>` : ''}
                    </div>
                </div>
            `;
            resultsContainer.appendChild(card);
        });

        updatePagination(results.length);
    }

    // ===== GITHUB CODE SEARCH =====
    async function searchGitHubCode(query, filename) {
        const perPage = 10;
        // GitHub code search: find repos containing the specific file + query
        const searchTerm = `${query} filename:${filename}`;
        const url = `https://api.github.com/search/code?q=${encodeURIComponent(searchTerm)}&per_page=${perPage}&page=${currentPage}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('GitHub API rate limit. Wait a minute or use Poggit search.');
            }
            if (response.status === 422) {
                throw new Error('GitHub search validation error. Try a simpler query.');
            }
            throw new Error('GitHub API error: ' + response.status);
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            showEmpty(`No repos found with "${filename}" matching "${query}". Try Poggit search.`);
            return;
        }

        // Deduplicate by repo (code search can return multiple file matches in same repo)
        const repoMap = new Map();
        for (const item of data.items) {
            const repoFullName = item.repository.full_name;
            if (!repoMap.has(repoFullName)) {
                repoMap.set(repoFullName, item.repository);
            }
        }
        const repos = [...repoMap.values()];

        totalPages = Math.min(Math.ceil(data.total_count / perPage), 100);

        showStats(`Found ${data.total_count.toLocaleString()} results with <code>${filename}</code> — showing repos with real PocketMine plugins`);

        resultsContainer.innerHTML = '';

        // Fetch full repo details in parallel for richer cards
        const repoDetails = await Promise.allSettled(
            repos.map(r => fetch(`https://api.github.com/repos/${r.full_name}`, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }).then(resp => resp.ok ? resp.json() : r))
        );

        repoDetails.forEach((result, i) => {
            const repo = result.status === 'fulfilled' ? result.value : repos[i];
            const card = createGitHubCard(repo, filename);
            resultsContainer.appendChild(card);
        });

        updatePagination(data.total_count);
    }

    function createGitHubCard(repo, fileMarker) {
        const card = document.createElement('div');
        card.className = 'search-card';

        const updated = timeAgo(new Date(repo.updated_at || repo.pushed_at || Date.now()));
        const avatarUrl = repo.owner?.avatar_url || '';
        const badgeLabel = fileMarker === '.poggit.yml' ? 'Poggit CI' : 'plugin.yml';

        card.innerHTML = `
            <img class="search-card__avatar" src="${avatarUrl}&s=88" alt="${repo.owner?.login || ''}" loading="lazy" width="44" height="44">
            <div class="search-card__body">
                <h3 class="search-card__name">
                    <a href="${repo.html_url}" target="_blank" rel="noopener">${highlightMatch(repo.full_name || repo.name, currentQuery)}</a>
                    <span class="search-card__badge search-card__badge--github">${badgeLabel}</span>
                </h3>
                <p class="search-card__desc">${repo.description || 'No description provided'}</p>
                <div class="search-card__meta">
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z"/></svg>
                        ${(repo.stargazers_count || 0).toLocaleString()}
                    </span>
                    <span class="search-card__stat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        ${(repo.forks_count || 0).toLocaleString()} forks
                    </span>
                    ${repo.language ? `<span class="search-card__stat">${repo.language}</span>` : ''}
                    <span class="search-card__stat">Updated ${updated}</span>
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

    // ===== HELPERS =====

    function highlightMatch(text, query) {
        if (!query) return text;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }

    function showLoading() {
        resultsContainer.innerHTML = `
            <div style="text-align:center;padding:40px">
                <div class="spinner"></div>
                <p style="margin-top:12px;color:var(--text-secondary)">
                    ${currentSource === 'poggit' ? 'Searching Poggit plugin repository...' : 'Searching GitHub repositories...'}
                </p>
            </div>
        `;
        pagination.style.display = 'none';
        if (searchStats) searchStats.style.display = 'none';
    }

    function showEmpty(message) {
        resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p>${message}</p>
            </div>
        `;
        pagination.style.display = 'none';
        if (searchStats) searchStats.style.display = 'none';
    }

    function showError(message) {
        resultsContainer.innerHTML = `
            <div class="search-empty">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p>${message}</p>
            </div>
        `;
        pagination.style.display = 'none';
    }

    function showStats(html) {
        if (!searchStats) return;
        searchStats.innerHTML = html;
        searchStats.style.display = 'block';
    }

    function updatePagination(totalCount) {
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
        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count > 0) return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
        }
        return 'just now';
    }

})();
