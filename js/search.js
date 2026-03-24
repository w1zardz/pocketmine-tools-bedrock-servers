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

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) { showEmpty('Type a plugin name to search'); return; }
        currentQuery = query;
        showLoading();

        try {
            switch (currentSource) {
                case 'poggit': await searchPoggit(query); break;
                case 'github-code': await searchGitHubCode(query, 'plugin.yml'); break;
                case 'github-poggit': await searchGitHubCode(query, '.poggit.yml'); break;
            }
        } catch (err) {
            showError(err.message);
        }
    }

    // ===== POGGIT SEARCH =====
    // Strategy: search by exact name first, then try repo search on GitHub for poggit plugins
    async function searchPoggit(query) {
        // 1) Try exact name match from Poggit API (has CORS)
        const poggitResults = [];

        try {
            const resp = await fetch(`https://poggit.pmmp.io/releases.json?name=${encodeURIComponent(query)}`);
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    // Deduplicate: keep latest version per plugin name
                    const map = new Map();
                    for (const p of data) {
                        const existing = map.get(p.name);
                        if (!existing || (p.submission_date || 0) > (existing.submission_date || 0)) {
                            map.set(p.name, p);
                        }
                    }
                    poggitResults.push(...map.values());
                }
            }
        } catch (e) { /* Poggit down, continue to GitHub fallback */ }

        // 2) Also search GitHub for repos with .poggit.yml containing the query
        //    This finds plugins that may have different names
        let githubPoggitResults = [];
        try {
            const ghResp = await fetch(
                `https://api.github.com/search/code?q=${encodeURIComponent(query)}+filename:plugin.yml+path:/&per_page=20&page=${currentPage}`,
                { headers: { 'Accept': 'application/vnd.github.v3+json' } }
            );
            if (ghResp.ok) {
                const ghData = await ghResp.json();
                totalPages = Math.min(Math.ceil((ghData.total_count || 0) / 20), 50);

                // Deduplicate repos
                const repoMap = new Map();
                for (const item of (ghData.items || [])) {
                    const name = item.repository.full_name;
                    if (!repoMap.has(name)) repoMap.set(name, item.repository);
                }
                githubPoggitResults = [...repoMap.values()];
            }
        } catch (e) { /* GitHub down */ }

        // 3) Merge: Poggit results first (exact match), then GitHub repos
        if (poggitResults.length === 0 && githubPoggitResults.length === 0) {
            showEmpty(`No plugins found for "${query}". Try a different name.`);
            return;
        }

        resultsContainer.innerHTML = '';

        const totalCount = poggitResults.length + githubPoggitResults.length;
        let statsText = '';
        if (poggitResults.length > 0) statsText += `${poggitResults.length} from Poggit`;
        if (githubPoggitResults.length > 0) {
            if (statsText) statsText += ' + ';
            statsText += `${githubPoggitResults.length} from GitHub`;
        }
        showStats(`Found ${totalCount} result${totalCount !== 1 ? 's' : ''} (${statsText})`);

        // Render Poggit results
        for (const plugin of poggitResults) {
            resultsContainer.appendChild(createPoggitCard(plugin));
        }

        // Render GitHub results (fetch details in parallel)
        if (githubPoggitResults.length > 0) {
            const details = await Promise.allSettled(
                githubPoggitResults.map(r =>
                    fetch(`https://api.github.com/repos/${r.full_name}`, {
                        headers: { 'Accept': 'application/vnd.github.v3+json' }
                    }).then(resp => resp.ok ? resp.json() : r).catch(() => r)
                )
            );
            details.forEach((result, i) => {
                const repo = result.status === 'fulfilled' ? result.value : githubPoggitResults[i];
                // Skip if already shown as Poggit result
                const repoName = repo.full_name || '';
                const isDuplicate = poggitResults.some(p => p.repo_name === repoName);
                if (!isDuplicate) {
                    resultsContainer.appendChild(createGitHubCard(repo, 'plugin.yml'));
                }
            });
        }

        if (poggitResults.length > 0 || totalPages <= 1) {
            // For Poggit exact matches + small result set, hide pagination
            if (githubPoggitResults.length <= 0) {
                pagination.style.display = 'none';
            } else {
                updatePagination();
            }
        } else {
            updatePagination();
        }
    }

    // ===== GITHUB CODE SEARCH =====
    async function searchGitHubCode(query, filename) {
        const perPage = 15;
        const searchTerm = `${query} filename:${filename} path:/`;
        const url = `https://api.github.com/search/code?q=${encodeURIComponent(searchTerm)}&per_page=${perPage}&page=${currentPage}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (!response.ok) {
            if (response.status === 403) throw new Error('GitHub API rate limit. Wait a minute or try Poggit search.');
            if (response.status === 422) throw new Error('Search query too broad. Try a more specific name.');
            throw new Error('GitHub API error: ' + response.status);
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            showEmpty(`No repos with "${filename}" found for "${query}".`);
            return;
        }

        // Deduplicate repos
        const repoMap = new Map();
        for (const item of data.items) {
            const name = item.repository.full_name;
            if (!repoMap.has(name)) repoMap.set(name, item.repository);
        }
        const repos = [...repoMap.values()];

        totalPages = Math.min(Math.ceil(data.total_count / perPage), 50);
        showStats(`Found ${data.total_count.toLocaleString()} repos with <code>${filename}</code> matching "${query}"`);

        resultsContainer.innerHTML = '';

        // Fetch full details in parallel
        const details = await Promise.allSettled(
            repos.map(r =>
                fetch(`https://api.github.com/repos/${r.full_name}`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                }).then(resp => resp.ok ? resp.json() : r).catch(() => r)
            )
        );

        details.forEach((result, i) => {
            const repo = result.status === 'fulfilled' ? result.value : repos[i];
            resultsContainer.appendChild(createGitHubCard(repo, filename));
        });

        updatePagination();
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
            <img class="search-card__avatar" src="${iconUrl}" alt="${plugin.name}" loading="lazy" width="44" height="44" onerror="this.src='${defaultIcon()}'">
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
                    <span class="search-card__stat" title="Version">v${plugin.version || '?'}</span>
                    ${apiStr ? `<span class="search-card__stat" title="API">API: ${apiStr}</span>` : ''}
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

    function createGitHubCard(repo, fileMarker) {
        const card = document.createElement('div');
        card.className = 'search-card';

        const updated = timeAgo(new Date(repo.updated_at || repo.pushed_at || Date.now()));
        const avatarUrl = repo.owner?.avatar_url || '';
        const badgeLabel = fileMarker === '.poggit.yml' ? '.poggit.yml' : 'plugin.yml';

        card.innerHTML = `
            <img class="search-card__avatar" src="${avatarUrl}&s=88" alt="${repo.owner?.login || ''}" loading="lazy" width="44" height="44">
            <div class="search-card__body">
                <h3 class="search-card__name">
                    <a href="${repo.html_url}" target="_blank" rel="noopener">${highlightMatch(repo.full_name || repo.name, currentQuery)}</a>
                    <span class="search-card__badge search-card__badge--github">${badgeLabel}</span>
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
