/* ============================================
   MOTD Generator + Nickname Generator
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    // ==========================================
    // Minecraft Color Definitions
    // ==========================================
    const mcColors = {
        '0': { hex: '#000000', name: 'Black' },
        '1': { hex: '#0000AA', name: 'Dark Blue' },
        '2': { hex: '#00AA00', name: 'Dark Green' },
        '3': { hex: '#00AAAA', name: 'Dark Aqua' },
        '4': { hex: '#AA0000', name: 'Dark Red' },
        '5': { hex: '#AA00AA', name: 'Dark Purple' },
        '6': { hex: '#FFAA00', name: 'Gold' },
        '7': { hex: '#AAAAAA', name: 'Gray' },
        '8': { hex: '#555555', name: 'Dark Gray' },
        '9': { hex: '#5555FF', name: 'Blue' },
        'a': { hex: '#55FF55', name: 'Green' },
        'b': { hex: '#55FFFF', name: 'Aqua' },
        'c': { hex: '#FF5555', name: 'Red' },
        'd': { hex: '#FF55FF', name: 'Light Purple' },
        'e': { hex: '#FFFF55', name: 'Yellow' },
        'f': { hex: '#FFFFFF', name: 'White' },
    };

    const mcFormats = {
        'l': { name: 'Bold', style: 'font-weight:bold' },
        'o': { name: 'Italic', style: 'font-style:italic' },
        'n': { name: 'Underline', style: 'text-decoration:underline' },
        'm': { name: 'Strike', style: 'text-decoration:line-through' },
        'k': { name: 'Magic', style: '' },
        'r': { name: 'Reset', style: '' },
    };

    // ==========================================
    // MOTD GENERATOR
    // ==========================================

    // Build color buttons
    const colorGrid = $('#motdColorGrid');
    if (colorGrid) {
        for (const [code, info] of Object.entries(mcColors)) {
            const btn = document.createElement('button');
            btn.className = 'motd-color-btn';
            btn.style.background = info.hex;
            btn.style.color = isLight(info.hex) ? '#000' : '#fff';
            btn.textContent = `\u00A7${code}`;
            btn.title = `${info.name} (\u00A7${code})`;
            btn.addEventListener('click', () => insertMotdCode(`\u00A7${code}`));
            colorGrid.appendChild(btn);
        }
    }

    // Build format buttons
    const formatGrid = $('#motdFormatGrid');
    if (formatGrid) {
        for (const [code, info] of Object.entries(mcFormats)) {
            const btn = document.createElement('button');
            btn.className = 'motd-format-btn';
            btn.textContent = `\u00A7${code} ${info.name}`;
            btn.title = info.name;
            btn.addEventListener('click', () => insertMotdCode(`\u00A7${code}`));
            formatGrid.appendChild(btn);
        }
    }

    // Track which input is active
    let activeMotdInput = '#motdInput';

    $('#motdInput')?.addEventListener('focus', () => { activeMotdInput = '#motdInput'; });
    $('#motdInput2')?.addEventListener('focus', () => { activeMotdInput = '#motdInput2'; });

    function insertMotdCode(code) {
        const input = $(activeMotdInput);
        if (!input) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + code + text.substring(end);
        input.selectionStart = input.selectionEnd = start + code.length;
        input.focus();
        updateMotdPreview();
    }

    // Live preview
    $('#motdInput')?.addEventListener('input', updateMotdPreview);
    $('#motdInput2')?.addEventListener('input', updateMotdPreview);

    function updateMotdPreview() {
        const line1 = $('#motdInput')?.value || '';
        const line2 = $('#motdInput2')?.value || '';

        const preview1 = $('#motdPreviewLine1');
        const preview2 = $('#motdPreviewLine2');

        if (preview1) preview1.innerHTML = renderMinecraftColors(line1) || '&nbsp;';
        if (preview2) preview2.innerHTML = renderMinecraftColors(line2) || '&nbsp;';
    }

    // Copy MOTD
    $('#copyMotdBtn')?.addEventListener('click', () => {
        const line1 = $('#motdInput')?.value || '';
        const line2 = $('#motdInput2')?.value || '';
        const result = line2 ? `${line1}\n${line2}` : line1;
        copyToClipboard(result);
    });

    // Clear MOTD
    $('#clearMotdBtn')?.addEventListener('click', () => {
        if ($('#motdInput')) $('#motdInput').value = '';
        if ($('#motdInput2')) $('#motdInput2').value = '';
        updateMotdPreview();
    });

    // ==========================================
    // NICKNAME GENERATOR
    // ==========================================

    const nickInput = $('#nickInput');
    const nickPreview = $('#nickPreview');
    const nickOutputCode = $('#nickOutputCode');
    let currentNickColors = [];

    // Gradient presets
    const gradientPresets = [
        { name: 'Sunset', colors: ['#FF5555', '#FFAA00', '#FFFF55'] },
        { name: 'Ocean', colors: ['#0000AA', '#5555FF', '#55FFFF'] },
        { name: 'Forest', colors: ['#00AA00', '#55FF55', '#FFFF55'] },
        { name: 'Fire', colors: ['#AA0000', '#FF5555', '#FFAA00'] },
        { name: 'Galaxy', colors: ['#AA00AA', '#5555FF', '#55FFFF'] },
        { name: 'Candy', colors: ['#FF55FF', '#FF5555', '#FFFF55'] },
        { name: 'Mint', colors: ['#55FFFF', '#55FF55', '#FFFFFF'] },
        { name: 'Blood', colors: ['#AA0000', '#FF5555', '#AA0000'] },
        { name: 'Gold', colors: ['#FFAA00', '#FFFF55', '#FFFFFF'] },
        { name: 'Ice', colors: ['#FFFFFF', '#55FFFF', '#5555FF'] },
        { name: 'Neon', colors: ['#55FF55', '#55FFFF', '#FF55FF'] },
        { name: 'Lava', colors: ['#AA0000', '#FFAA00', '#FFFF55', '#FFFFFF'] },
    ];

    const presetsContainer = $('#gradientPresets');
    if (presetsContainer) {
        gradientPresets.forEach((preset, idx) => {
            const btn = document.createElement('button');
            btn.className = 'gradient-preset';
            btn.title = preset.name;
            const gradStops = preset.colors.map((c, i) => `${c} ${(i / (preset.colors.length - 1) * 100)}%`).join(', ');
            btn.style.background = `linear-gradient(90deg, ${gradStops})`;
            btn.addEventListener('click', () => {
                $$('.gradient-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyGradient(preset.colors);
            });
            presetsContainer.appendChild(btn);
        });
    }

    // Custom gradient
    $('#applyGradientBtn')?.addEventListener('click', () => {
        const start = $('#gradStart')?.value || '#ff5555';
        const end = $('#gradEnd')?.value || '#55ff55';
        $$('.gradient-preset').forEach(b => b.classList.remove('active'));
        applyGradient([start, end]);
    });

    // Random gradient
    $('#randomNickBtn')?.addEventListener('click', () => {
        const preset = gradientPresets[Math.floor(Math.random() * gradientPresets.length)];
        $$('.gradient-preset').forEach(b => b.classList.remove('active'));
        applyGradient(preset.colors);
    });

    // Nick input
    nickInput?.addEventListener('input', () => {
        if (currentNickColors.length > 0) {
            applyGradient(currentNickColors);
        } else {
            updateNickPreview();
        }
    });

    function applyGradient(colors) {
        const text = nickInput?.value || '';
        if (!text) {
            nickPreview.innerHTML = '<span class="nick-preview__placeholder">Type a nickname above</span>';
            if (nickOutputCode) nickOutputCode.textContent = '';
            return;
        }

        currentNickColors = colors;
        const chars = [...text];
        let html = '';
        let code = '';

        for (let i = 0; i < chars.length; i++) {
            const t = i / Math.max(chars.length - 1, 1);
            const color = interpolateColors(colors, t);
            const mcCode = nearestMcColor(color);
            html += `<span style="color:${color}">${escapeHtml(chars[i])}</span>`;
            code += `\u00A7${mcCode}${chars[i]}`;
        }

        if (nickPreview) nickPreview.innerHTML = html;
        if (nickOutputCode) nickOutputCode.textContent = code;
    }

    function updateNickPreview() {
        const text = nickInput?.value || '';
        if (!text) {
            nickPreview.innerHTML = '<span class="nick-preview__placeholder">Type a nickname above</span>';
            if (nickOutputCode) nickOutputCode.textContent = '';
            return;
        }
        nickPreview.innerHTML = escapeHtml(text);
        if (nickOutputCode) nickOutputCode.textContent = text;
    }

    // Copy nick
    $('#copyNickBtn')?.addEventListener('click', () => {
        const code = nickOutputCode?.textContent || '';
        if (code) copyToClipboard(code);
        else showToast('Nothing to copy', 'error');
    });

    // ==========================================
    // Color Utilities
    // ==========================================

    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16),
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
    }

    function interpolateColors(colors, t) {
        if (colors.length === 1) return colors[0];
        const segment = t * (colors.length - 1);
        const idx = Math.min(Math.floor(segment), colors.length - 2);
        const localT = segment - idx;

        const c1 = hexToRgb(colors[idx]);
        const c2 = hexToRgb(colors[idx + 1]);

        return rgbToHex(
            c1.r + (c2.r - c1.r) * localT,
            c1.g + (c2.g - c1.g) * localT,
            c1.b + (c2.b - c1.b) * localT
        );
    }

    function nearestMcColor(hex) {
        const rgb = hexToRgb(hex);
        let nearest = '0';
        let minDist = Infinity;

        for (const [code, info] of Object.entries(mcColors)) {
            const mc = hexToRgb(info.hex);
            const dist = Math.pow(rgb.r - mc.r, 2) + Math.pow(rgb.g - mc.g, 2) + Math.pow(rgb.b - mc.b, 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = code;
            }
        }
        return nearest;
    }

    function isLight(hex) {
        const rgb = hexToRgb(hex);
        return (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 128;
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Initialize
    updateMotdPreview();

})();
