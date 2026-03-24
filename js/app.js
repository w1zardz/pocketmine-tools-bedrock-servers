/* ============================================
   PocketMine Tools - Core Application Logic
   ============================================ */

(function() {
    'use strict';

    // --- State ---
    let currentSection = 'home';

    // --- DOM Cache ---
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
    const loader = $('#loader');
    const main = $('#main');
    const menuBtn = $('#menuBtn');
    const mobileMenu = $('#mobileMenu');
    const toastEl = $('#toast');

    // --- Init ---
    window.addEventListener('load', () => {
        setTimeout(() => loader.classList.add('hidden'), 300);
        initNavigation();
        initParticles();
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
    });

    // --- Navigation ---
    function initNavigation() {
        // Desktop nav links
        $$('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.dataset.section);
            });
        });

        // Mobile menu links
        $$('.mobile-menu__link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.dataset.section);
                closeMobileMenu();
            });
        });

        // Bottom nav links
        $$('.bottom-nav__item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(link.dataset.section);
            });
        });

        // Menu button
        menuBtn.addEventListener('click', toggleMobileMenu);

        // Tool cards
        $$('.tool-card').forEach(card => {
            card.addEventListener('click', () => navigateTo(card.dataset.tool));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateTo(card.dataset.tool);
                }
            });
        });

        // Back buttons
        $$('[data-back]').forEach(btn => {
            btn.addEventListener('click', () => navigateTo('home'));
        });
    }

    function navigateTo(section) {
        if (currentSection === section) return;
        currentSection = section;
        window.location.hash = section;

        // Hide all sections
        $$('.section').forEach(s => s.classList.remove('section--active'));

        // Show target
        const target = $(`#${section}`);
        if (target) {
            target.classList.add('section--active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        updateActiveLinks(section);
        savePref('lastSection', section);
    }

    function handleHashChange() {
        const hash = window.location.hash.replace('#', '') || loadPref('lastSection') || 'home';
        const validSections = $$('.section').map(s => s.dataset.section || s.id);
        const section = validSections.includes(hash) ? hash : 'home';

        currentSection = section;
        $$('.section').forEach(s => s.classList.remove('section--active'));
        const target = $(`#${section}`);
        if (target) target.classList.add('section--active');
        updateActiveLinks(section);
    }

    function updateActiveLinks(section) {
        $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.section === section));
        $$('.mobile-menu__link').forEach(l => l.classList.toggle('active', l.dataset.section === section));
        $$('.bottom-nav__item').forEach(l => l.classList.toggle('active', l.dataset.section === section));
    }

    function toggleMobileMenu() {
        menuBtn.classList.toggle('active');
        mobileMenu.classList.toggle('open');
    }

    function closeMobileMenu() {
        menuBtn.classList.remove('active');
        mobileMenu.classList.remove('open');
    }

    // --- Particles (Hero) ---
    function initParticles() {
        const canvas = document.createElement('canvas');
        const container = $('#particles');
        if (!container) return;
        container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let particles = [];
        let animId;

        function resize() {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        function createParticles() {
            particles = [];
            const count = Math.min(40, Math.floor(canvas.width / 25));
            for (let i = 0; i < count; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 2.5 + 0.5,
                    speedX: (Math.random() - 0.5) * 0.3,
                    speedY: (Math.random() - 0.5) * 0.3,
                    opacity: Math.random() * 0.4 + 0.1
                });
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(16, 185, 129, ${p.opacity})`;
                ctx.fill();
            });
            animId = requestAnimationFrame(animate);
        }

        resize();
        createParticles();
        animate();

        window.addEventListener('resize', () => {
            resize();
            createParticles();
        });
    }

    // --- Toast ---
    window.showToast = function(message, type = 'success') {
        toastEl.textContent = message;
        toastEl.className = 'toast show toast--' + type;
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3000);
    };

    // --- LocalStorage helpers ---
    window.savePref = function(key, value) {
        try { localStorage.setItem('pmtools_' + key, JSON.stringify(value)); } catch(e) {}
    };
    window.loadPref = function(key) {
        try { return JSON.parse(localStorage.getItem('pmtools_' + key)); } catch(e) { return null; }
    };

    // --- Clipboard helper ---
    window.copyToClipboard = async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        } catch(e) {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Copied to clipboard!');
        }
    };

    // --- Minecraft color code renderer ---
    window.renderMinecraftColors = function(text) {
        const colorMap = {
            '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
            '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
            '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
            'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
            'g': '#DDD605'
        };
        const formatMap = {
            'l': 'font-weight:bold;',
            'o': 'font-style:italic;',
            'n': 'text-decoration:underline;',
            'm': 'text-decoration:line-through;',
        };

        let html = '';
        let currentStyle = '';
        let i = 0;

        while (i < text.length) {
            if (text[i] === '\u00A7' && i + 1 < text.length) {
                const code = text[i + 1].toLowerCase();
                if (colorMap[code]) {
                    currentStyle = `color:${colorMap[code]};`;
                } else if (formatMap[code]) {
                    currentStyle += formatMap[code];
                } else if (code === 'r') {
                    currentStyle = '';
                } else if (code === 'k') {
                    currentStyle += 'animation:obfuscate 0.1s infinite;';
                }
                i += 2;
            } else {
                const escaped = text[i].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                if (currentStyle) {
                    html += `<span style="${currentStyle}">${escaped}</span>`;
                } else {
                    html += escaped;
                }
                i++;
            }
        }

        return html;
    };

    // --- Expose navigateTo globally ---
    window.pmNavigateTo = navigateTo;

})();
