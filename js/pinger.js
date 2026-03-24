/* ============================================
   Server Pinger
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    const hostInput = $('#pingerHost');
    const portInput = $('#pingerPort');
    const pingBtn = $('#pingServerBtn');
    const resultContainer = $('#pingerResult');

    pingBtn?.addEventListener('click', doPing);

    // Enter key in host input
    hostInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doPing();
    });

    // Popular server buttons
    $$('.popular-server').forEach(btn => {
        btn.addEventListener('click', () => {
            hostInput.value = btn.dataset.host;
            portInput.value = btn.dataset.port || '19132';
            doPing();
        });
    });

    async function doPing() {
        const host = hostInput.value.trim();
        const port = portInput.value.trim() || '19132';

        if (!host) {
            showToast('Please enter a server address', 'error');
            return;
        }

        pingBtn.classList.add('btn--loading');
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <div class="pinger-card" style="text-align:center;padding:40px">
                <div class="spinner"></div>
                <p style="margin-top:12px;color:var(--text-muted)">Pinging ${host}:${port}...</p>
            </div>
        `;

        try {
            const startTime = performance.now();
            const response = await fetch(`https://api.mcsrvstat.us/bedrock/3/${host}:${port}`);
            const latency = Math.round(performance.now() - startTime);

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.online) {
                resultContainer.innerHTML = `
                    <div class="pinger-card">
                        <div class="pinger-card__motd" style="color:var(--red)">
                            Server is offline or unreachable
                        </div>
                        <div class="pinger-card__stats">
                            <div class="pinger-stat">
                                <div class="pinger-stat__label">Status</div>
                                <div class="pinger-stat__value pinger-stat__value--offline">Offline</div>
                            </div>
                            <div class="pinger-stat">
                                <div class="pinger-stat__label">Address</div>
                                <div class="pinger-stat__value">${host}:${port}</div>
                            </div>
                            <div class="pinger-stat">
                                <div class="pinger-stat__label">Response Time</div>
                                <div class="pinger-stat__value">${latency}ms</div>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // Render MOTD with Minecraft colors
            let motdHtml = '';
            if (data.motd && data.motd.html) {
                motdHtml = data.motd.html.join('<br>');
            } else if (data.motd && data.motd.raw) {
                motdHtml = data.motd.raw.map(line => renderMinecraftColors(line)).join('<br>');
            } else if (data.motd && data.motd.clean) {
                motdHtml = data.motd.clean.join('<br>');
            }

            const playersOnline = data.players?.online ?? '?';
            const playersMax = data.players?.max ?? '?';
            const version = data.version || '?';
            const gamemode = data.gamemode || '?';
            const hostname = data.hostname || host;

            resultContainer.innerHTML = `
                <div class="pinger-card">
                    <div class="pinger-card__motd">${motdHtml || 'No MOTD'}</div>
                    <div class="pinger-card__stats">
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Status</div>
                            <div class="pinger-stat__value pinger-stat__value--online">Online</div>
                        </div>
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Players</div>
                            <div class="pinger-stat__value">${playersOnline} / ${playersMax}</div>
                        </div>
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Version</div>
                            <div class="pinger-stat__value">${version}</div>
                        </div>
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Gamemode</div>
                            <div class="pinger-stat__value">${gamemode}</div>
                        </div>
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Response</div>
                            <div class="pinger-stat__value">${latency}ms</div>
                        </div>
                        <div class="pinger-stat">
                            <div class="pinger-stat__label">Address</div>
                            <div class="pinger-stat__value" style="font-size:0.85rem">${hostname}:${port}</div>
                        </div>
                    </div>
                    ${data.players?.list ? renderPlayerList(data.players.list) : ''}
                </div>
            `;

        } catch (err) {
            resultContainer.innerHTML = `
                <div class="pinger-card">
                    <div class="pinger-card__motd" style="color:var(--red)">
                        Error: ${err.message}
                    </div>
                </div>
            `;
        } finally {
            pingBtn.classList.remove('btn--loading');
        }
    }

    function renderPlayerList(players) {
        if (!players || players.length === 0) return '';
        const items = players.map(p => {
            const name = typeof p === 'string' ? p : (p.name || p.uuid || 'Unknown');
            return `<span style="background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;font-size:0.8rem">${escapeHtml(name)}</span>`;
        }).join(' ');
        return `
            <div style="margin-top:16px">
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Online Players</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">${items}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();
