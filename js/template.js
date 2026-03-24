/* ============================================
   Plugin Template Generator
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    // Add command button
    $('#addCmdBtn')?.addEventListener('click', () => {
        const container = $('#tplCommands');
        const entry = document.createElement('div');
        entry.className = 'command-entry';
        entry.innerHTML = `
            <input class="form-input form-input--small" type="text" placeholder="Command name" data-field="name">
            <input class="form-input form-input--small" type="text" placeholder="Description" data-field="desc">
            <input class="form-input form-input--small" type="text" placeholder="Permission" data-field="perm">
            <button class="btn btn--small btn--ghost remove-cmd-btn" type="button">Remove</button>
        `;
        container.appendChild(entry);
        entry.querySelector('.remove-cmd-btn').addEventListener('click', () => entry.remove());
        updatePreview();
    });

    // Remove command
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-cmd-btn')) {
            e.target.closest('.command-entry')?.remove();
            updatePreview();
        }
    });

    // Live preview on input change
    const formFields = ['#tplName', '#tplNamespace', '#tplAuthor', '#tplApi', '#tplDescription', '#tplVersion',
                        '#tplListener', '#tplConfig', '#tplScheduler', '#tplForms'];
    formFields.forEach(sel => {
        const el = $(sel);
        if (el) {
            el.addEventListener('input', updatePreview);
            el.addEventListener('change', updatePreview);
        }
    });

    // Also listen for command field changes
    document.addEventListener('input', (e) => {
        if (e.target.closest('.command-entry')) {
            updatePreview();
        }
    });

    // Auto-fill namespace from plugin name
    $('#tplName')?.addEventListener('input', () => {
        const name = $('#tplName').value.trim();
        const author = $('#tplAuthor').value.trim() || 'Author';
        if (name && !$('#tplNamespace').dataset.manual) {
            $('#tplNamespace').value = `${author}\\${name}`;
        }
        updatePreview();
    });

    $('#tplNamespace')?.addEventListener('input', () => {
        $('#tplNamespace').dataset.manual = 'true';
    });

    function getCommands() {
        const commands = [];
        $$('.command-entry').forEach(entry => {
            const name = entry.querySelector('[data-field="name"]')?.value?.trim();
            const desc = entry.querySelector('[data-field="desc"]')?.value?.trim() || '';
            const perm = entry.querySelector('[data-field="perm"]')?.value?.trim() || '';
            if (name) commands.push({ name, desc, perm });
        });
        return commands;
    }

    function generatePluginYml() {
        const name = $('#tplName').value.trim() || 'MyPlugin';
        const version = $('#tplVersion').value.trim() || '1.0.0';
        const api = $('#tplApi').value.trim() || '5.0.0';
        const namespace = ($('#tplNamespace').value.trim() || 'Author\\MyPlugin').replace(/\//g, '\\');
        const author = $('#tplAuthor').value.trim() || 'Author';
        const description = $('#tplDescription').value.trim();
        const commands = getCommands();

        let yml = `name: ${name}\n`;
        yml += `version: "${version}"\n`;
        yml += `api: "${api}"\n`;
        yml += `main: ${namespace}\\Main\n`;
        yml += `author: ${author}\n`;
        if (description) yml += `description: "${description}"\n`;
        yml += `\n`;

        if (commands.length > 0) {
            yml += `commands:\n`;
            commands.forEach(cmd => {
                yml += `  ${cmd.name}:\n`;
                if (cmd.desc) yml += `    description: "${cmd.desc}"\n`;
                if (cmd.perm) yml += `    permission: ${cmd.perm}\n`;
            });
            yml += `\n`;
        }

        // Permissions
        if (commands.some(c => c.perm)) {
            yml += `permissions:\n`;
            commands.forEach(cmd => {
                if (cmd.perm) {
                    yml += `  ${cmd.perm}:\n`;
                    yml += `    description: "Allows use of /${cmd.name}"\n`;
                    yml += `    default: op\n`;
                }
            });
        }

        return yml;
    }

    function generateMainPhp() {
        const name = $('#tplName').value.trim() || 'MyPlugin';
        const namespace = ($('#tplNamespace').value.trim() || 'Author\\MyPlugin').replace(/\//g, '\\');
        const hasListener = $('#tplListener')?.checked;
        const hasConfig = $('#tplConfig')?.checked;
        const hasScheduler = $('#tplScheduler')?.checked;
        const hasForms = $('#tplForms')?.checked;
        const commands = getCommands();

        const imports = new Set();
        imports.add('use pocketmine\\plugin\\PluginBase;');

        if (hasListener) {
            imports.add('use pocketmine\\event\\Listener;');
            imports.add('use pocketmine\\event\\player\\PlayerJoinEvent;');
        }
        if (commands.length > 0) {
            imports.add('use pocketmine\\command\\Command;');
            imports.add('use pocketmine\\command\\CommandSender;');
        }
        if (hasScheduler) {
            imports.add('use pocketmine\\scheduler\\ClosureTask;');
        }
        if (hasForms) {
            imports.add('use pocketmine\\player\\Player;');
        }

        const implements_ = [];
        if (hasListener) implements_.push('Listener');
        const implementsStr = implements_.length > 0 ? ` implements ${implements_.join(', ')}` : '';

        let code = `<?php\n\ndeclare(strict_types=1);\n\nnamespace ${namespace};\n\n`;
        code += [...imports].sort().join('\n') + '\n\n';
        code += `class Main extends PluginBase${implementsStr} {\n\n`;

        // onEnable
        code += `    public function onEnable(): void {\n`;
        if (hasConfig) {
            code += `        $this->saveDefaultConfig();\n`;
        }
        if (hasListener) {
            code += `        $this->getServer()->getPluginManager()->registerEvents($this, $this);\n`;
        }
        if (hasScheduler) {
            code += `        $this->getScheduler()->scheduleRepeatingTask(new ClosureTask(\n`;
            code += `            function(): void {\n`;
            code += `                // Repeating task logic here\n`;
            code += `            }\n`;
            code += `        ), 20 * 60); // Every 60 seconds\n`;
        }
        code += `        $this->getLogger()->info("${name} enabled!");\n`;
        code += `    }\n\n`;

        // onDisable
        code += `    public function onDisable(): void {\n`;
        code += `        $this->getLogger()->info("${name} disabled!");\n`;
        code += `    }\n`;

        // Commands
        if (commands.length > 0) {
            code += `\n    public function onCommand(CommandSender $sender, Command $command, string $label, array $args): bool {\n`;
            code += `        switch ($command->getName()) {\n`;
            commands.forEach(cmd => {
                code += `            case "${cmd.name}":\n`;
                if (hasForms) {
                    code += `                if ($sender instanceof Player) {\n`;
                    code += `                    // Send form to player\n`;
                    code += `                    $sender->sendMessage("/${cmd.name} executed!");\n`;
                    code += `                }\n`;
                } else {
                    code += `                $sender->sendMessage("/${cmd.name} executed!");\n`;
                }
                code += `                return true;\n`;
            });
            code += `        }\n`;
            code += `        return false;\n`;
            code += `    }\n`;
        }

        // Event listener
        if (hasListener) {
            code += `\n    public function onPlayerJoin(PlayerJoinEvent $event): void {\n`;
            code += `        $player = $event->getPlayer();\n`;
            code += `        $player->sendMessage("Welcome, " . $player->getName() . "!");\n`;
            code += `    }\n`;
        }

        code += `}\n`;

        return code;
    }

    function generateConfigYml() {
        return `# ${$('#tplName').value.trim() || 'MyPlugin'} Configuration\n\n# Example settings\nenabled: true\nmessage: "Hello, World!"\nmax-players: 100\n`;
    }

    function updatePreview() {
        const preview = $('#tplPreview');
        if (!preview) return;

        const pluginYml = generatePluginYml();
        const mainPhp = generateMainPhp();

        let previewHtml = `<pre><code class="language-yaml"># plugin.yml\n${escapeHtml(pluginYml)}</code></pre>`;
        previewHtml += `<pre><code class="language-php"># Main.php\n${escapeHtml(mainPhp)}</code></pre>`;

        preview.innerHTML = previewHtml;

        // Highlight
        if (typeof hljs !== 'undefined') {
            preview.querySelectorAll('code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Generate & Download
    $('#generateTemplateBtn')?.addEventListener('click', async () => {
        const name = $('#tplName').value.trim();
        if (!name) {
            showToast('Plugin name is required!', 'error');
            return;
        }

        const btn = $('#generateTemplateBtn');
        btn.classList.add('btn--loading');

        try {
            const namespace = ($('#tplNamespace').value.trim() || 'Author\\' + name).replace(/\//g, '\\');
            const hasConfig = $('#tplConfig')?.checked;

            const pluginYml = generatePluginYml();
            const mainPhp = generateMainPhp();

            // Build source path
            const nsParts = namespace.split('\\');
            const srcPath = 'src/' + nsParts.join('/') + '/Main.php';

            const zip = new JSZip();
            const folder = zip.folder(name);

            folder.file('plugin.yml', pluginYml);
            folder.file(srcPath, mainPhp);

            if (hasConfig) {
                folder.file('resources/config.yml', generateConfigYml());
            }

            // README
            folder.file('README.md', `# ${name}\n\nA PocketMine-MP plugin.\n\n## Installation\n\n1. Download the latest release\n2. Place the .phar file in your server's \`plugins/\` directory\n3. Restart the server\n\n## Usage\n\nConfigure the plugin in \`plugin_data/${name}/config.yml\`\n`);

            const blob = await zip.generateAsync({ type: 'blob' });
            window.downloadBlob(blob, `${name}.zip`);

            showToast(`${name} template downloaded!`);
        } catch (err) {
            showToast('Error generating template: ' + err.message, 'error');
        } finally {
            btn.classList.remove('btn--loading');
        }
    });

    // Initial preview
    setTimeout(updatePreview, 100);

})();
