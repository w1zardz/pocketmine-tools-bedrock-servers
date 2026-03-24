/* ============================================
   Crash Dump Parser
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);

    const parseBtn = $('#parseCrashBtn');
    const sampleBtn = $('#loadSampleCrash');
    const crashInput = $('#crashInput');
    const crashResult = $('#crashResult');

    parseBtn?.addEventListener('click', parseCrash);

    sampleBtn?.addEventListener('click', () => {
        crashInput.value = getSampleCrash();
        parseCrash();
    });

    function parseCrash() {
        const text = crashInput.value.trim();
        if (!text) {
            showToast('Please paste a crash dump first', 'error');
            return;
        }

        const parsed = analyzeCrashDump(text);
        renderCrashResult(parsed);
    }

    function analyzeCrashDump(text) {
        const lines = text.split('\n');
        const result = {
            errorType: '',
            errorMessage: '',
            errorFile: '',
            errorLine: '',
            serverInfo: {},
            plugins: [],
            stackTrace: [],
            rawSections: {},
            osInfo: '',
            phpVersion: '',
            pmmpVersion: '',
            apiVersion: '',
        };

        let currentSection = 'unknown';
        let sectionLines = {};

        for (const line of lines) {
            const trimmed = line.trim();

            // Detect section headers
            if (trimmed.startsWith('--- Begin')) {
                const match = trimmed.match(/--- Begin (.+?) ---/i);
                if (match) currentSection = match[1].trim().toLowerCase();
                sectionLines[currentSection] = [];
                continue;
            }
            if (trimmed.startsWith('--- End')) {
                currentSection = 'unknown';
                continue;
            }

            if (sectionLines[currentSection]) {
                sectionLines[currentSection].push(line);
            }

            // Parse error type and message
            if (trimmed.startsWith('Error:') || trimmed.startsWith('Type:')) {
                const val = trimmed.split(':').slice(1).join(':').trim();
                if (trimmed.startsWith('Error:')) result.errorType = val;
                if (trimmed.startsWith('Type:')) result.errorType = val;
            }
            if (trimmed.startsWith('Message:')) {
                result.errorMessage = trimmed.split(':').slice(1).join(':').trim();
            }
            if (trimmed.startsWith('File:')) {
                result.errorFile = trimmed.split(':').slice(1).join(':').trim();
            }
            if (trimmed.startsWith('Line:')) {
                result.errorLine = trimmed.split(':').slice(1).join(':').trim();
            }

            // Parse error from "Crashed" line
            if (trimmed.includes('Crashed') || trimmed.match(/^[A-Z][a-z]+Error:/)) {
                if (!result.errorMessage && trimmed.includes(':')) {
                    result.errorMessage = trimmed;
                }
            }

            // Server info
            if (trimmed.startsWith('PocketMine-MP') && trimmed.includes('version')) {
                result.pmmpVersion = trimmed;
            }
            if (trimmed.startsWith('PHP')) {
                result.phpVersion = trimmed;
            }
            if (trimmed.startsWith('OS:') || trimmed.startsWith('Operating System:')) {
                result.osInfo = trimmed.split(':').slice(1).join(':').trim();
            }
            if (trimmed.startsWith('API:') || trimmed.startsWith('API Version:')) {
                result.apiVersion = trimmed.split(':').slice(1).join(':').trim();
            }

            // Stack trace lines
            if (trimmed.match(/^#\d+/)) {
                result.stackTrace.push(trimmed);
            }

            // Plugins list
            if (trimmed.match(/^[A-Za-z].*v?\d+\.\d+/) && currentSection.includes('plugin')) {
                result.plugins.push(trimmed);
            }
        }

        result.rawSections = sectionLines;

        // Try to extract plugins from a "Plugins:" line
        for (const line of lines) {
            if (line.trim().startsWith('Plugins:')) {
                const pluginsStr = line.trim().replace('Plugins:', '').trim();
                if (pluginsStr) {
                    result.plugins = pluginsStr.split(',').map(p => p.trim()).filter(Boolean);
                }
            }
        }

        // If no error found, try first non-empty content
        if (!result.errorMessage) {
            for (const line of lines) {
                const t = line.trim();
                if (t && !t.startsWith('---') && !t.startsWith('#') && t.length > 10) {
                    result.errorMessage = t;
                    break;
                }
            }
        }

        return result;
    }

    function renderCrashResult(parsed) {
        crashResult.style.display = 'block';
        crashResult.innerHTML = '';

        // Error section
        if (parsed.errorMessage || parsed.errorType) {
            const section = createSection('error', 'Error', `
${parsed.errorType ? `Type: ${parsed.errorType}\n` : ''}${parsed.errorMessage ? `Message: ${parsed.errorMessage}\n` : ''}${parsed.errorFile ? `File: ${parsed.errorFile}\n` : ''}${parsed.errorLine ? `Line: ${parsed.errorLine}` : ''}
            `.trim());
            crashResult.appendChild(section);
        }

        // Server info section
        const serverInfo = [
            parsed.pmmpVersion,
            parsed.phpVersion,
            parsed.osInfo ? `OS: ${parsed.osInfo}` : '',
            parsed.apiVersion ? `API: ${parsed.apiVersion}` : '',
        ].filter(Boolean).join('\n');

        if (serverInfo) {
            const section = createSection('server', 'Server Information', serverInfo);
            crashResult.appendChild(section);
        }

        // Stack trace
        if (parsed.stackTrace.length > 0) {
            const traceText = parsed.stackTrace.join('\n');
            const section = createSection('trace', 'Stack Trace', traceText);
            crashResult.appendChild(section);
        }

        // Plugins
        if (parsed.plugins.length > 0) {
            const pluginText = parsed.plugins.map(p => `  - ${p}`).join('\n');
            const section = createSection('plugins', `Plugins (${parsed.plugins.length})`, pluginText);
            crashResult.appendChild(section);
        }

        // Raw sections
        for (const [name, lines] of Object.entries(parsed.rawSections)) {
            if (lines.length > 0 && name !== 'unknown') {
                const existing = crashResult.querySelector(`[data-section-name="${name}"]`);
                if (!existing) {
                    const section = createSection('info', name.charAt(0).toUpperCase() + name.slice(1), lines.join('\n'));
                    section.dataset.sectionName = name;
                    crashResult.appendChild(section);
                }
            }
        }

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn--outline crash-copy-btn';
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy Formatted Output
        `;
        copyBtn.addEventListener('click', () => {
            const text = crashResult.innerText;
            copyToClipboard(text);
        });
        crashResult.appendChild(copyBtn);

        crashResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function createSection(type, title, content) {
        const section = document.createElement('div');
        section.className = 'crash-section';
        section.innerHTML = `
            <div class="crash-section__header crash-section__header--${type}">${title}</div>
            <div class="crash-section__body">${escapeHtml(content)}</div>
        `;

        // Toggle collapse
        const header = section.querySelector('.crash-section__header');
        const body = section.querySelector('.crash-section__body');
        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'none' ? '' : 'none';
        });

        return section;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getSampleCrash() {
        return `--- Begin Crash Dump ---
PocketMine-MP version: 5.15.0
PHP version: 8.2.13
OS: Linux 5.15.0 x86_64
API: 5.0.0

--- Begin Error ---
Type: RuntimeException
Message: Cannot access world "lobby" because it has been unloaded
File: src/pocketmine/world/WorldManager.php
Line: 187
--- End Error ---

--- Begin Stack Trace ---
#0 src/pocketmine/world/WorldManager.php(187): pocketmine\\world\\WorldManager->getWorldByName()
#1 plugins/LobbySystem/src/lobby/Main.php(42): pocketmine\\world\\WorldManager->getWorldByName()
#2 src/pocketmine/plugin/PluginManager.php(423): lobby\\Main->onEnable()
#3 src/pocketmine/Server.php(891): pocketmine\\plugin\\PluginManager->enablePlugin()
#4 src/pocketmine/Server.php(756): pocketmine\\Server->enablePlugins()
--- End Stack Trace ---

Plugins: LobbySystem v2.1.0, EconomyAPI v5.7.2, ScoreHud v6.5.0, MultiWorld v3.0.0

--- End Crash Dump ---`;
    }

})();
