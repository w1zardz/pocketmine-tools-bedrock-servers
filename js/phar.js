/* ============================================
   PHAR Creator & Extractor
   ============================================ */

(function() {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    // ==========================================
    // PHAR CREATOR
    // ==========================================

    // Add file button
    $('#addFileBtn')?.addEventListener('click', () => {
        const container = $('#additionalFiles');
        const entry = document.createElement('div');
        entry.className = 'additional-file-entry';
        entry.innerHTML = `
            <input class="form-input form-input--small" type="text" placeholder="Path (e.g. resources/config.yml)">
            <textarea class="form-textarea form-textarea--small" rows="3" placeholder="File contents..."></textarea>
            <button class="btn btn--small btn--ghost remove-file-btn" type="button">Remove</button>
        `;
        container.appendChild(entry);
        entry.querySelector('.remove-file-btn').addEventListener('click', () => entry.remove());
    });

    // Remove initial file entries
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file-btn')) {
            e.target.closest('.additional-file-entry')?.remove();
        }
    });

    // Create PHAR
    $('#createPharBtn')?.addEventListener('click', async () => {
        const name = $('#pharName').value.trim();
        if (!name) {
            showToast('Plugin name is required!', 'error');
            return;
        }

        const version = $('#pharVersion').value.trim() || '1.0.0';
        const api = $('#pharApi').value.trim() || '5.0.0';
        const author = $('#pharAuthor').value.trim() || 'Unknown';
        const mainClass = $('#pharMain').value.trim() || `${author}\\${name}\\Main`;
        const description = $('#pharDescription').value.trim() || '';
        const code = $('#pharCode').value || getDefaultCode(name, author, mainClass);

        const btn = $('#createPharBtn');
        btn.classList.add('btn--loading');

        try {
            // Build plugin.yml
            let pluginYml = `name: ${name}\n`;
            pluginYml += `version: "${version}"\n`;
            pluginYml += `api: "${api}"\n`;
            pluginYml += `main: ${mainClass}\n`;
            pluginYml += `author: ${author}\n`;
            if (description) pluginYml += `description: "${description}"\n`;

            // Determine source path from main class
            const mainPath = mainClass.replace(/\\\\/g, '/').replace(/\//g, '/');
            const parts = mainPath.split('/');
            const className = parts.pop();
            const srcPath = 'src/' + parts.join('/') + '/' + className + '.php';

            // Create PHAR using JSZip (phar-compatible format)
            // Real PHAR files have a specific binary format. We'll create a valid PHAR stub.
            const zip = new JSZip();

            // PHAR stub
            const stub = `<?php __HALT_COMPILER(); ?>`;

            // Build the phar manifest and content
            const files = {};
            files['plugin.yml'] = pluginYml;
            files[srcPath] = code.trim() || getDefaultCode(name, author, mainClass);

            // Additional files
            $$('.additional-file-entry').forEach(entry => {
                const inputs = entry.querySelectorAll('input, textarea');
                const path = inputs[0]?.value?.trim();
                const content = inputs[1]?.value || '';
                if (path) {
                    files[path] = content;
                }
            });

            // Build PHAR binary format
            const pharData = buildPharBinary(name, files, stub);

            // Download
            const blob = new Blob([pharData], { type: 'application/octet-stream' });
            downloadBlob(blob, `${name}.phar`);

            showToast(`${name}.phar created successfully!`);
        } catch (err) {
            showToast('Error creating PHAR: ' + err.message, 'error');
            console.error(err);
        } finally {
            btn.classList.remove('btn--loading');
        }
    });

    function getDefaultCode(name, author, mainClass) {
        const ns = mainClass.split('\\');
        ns.pop();
        const namespace = ns.join('\\');
        return `<?php

declare(strict_types=1);

namespace ${namespace};

use pocketmine\\plugin\\PluginBase;

class Main extends PluginBase {

    public function onEnable(): void {
        $this->getLogger()->info("${name} has been enabled!");
    }

    public function onDisable(): void {
        $this->getLogger()->info("${name} has been disabled!");
    }
}
`;
    }

    /**
     * Build a valid PHP PHAR binary
     * PHAR format: stub + manifest + file contents + signature
     */
    function buildPharBinary(alias, files, stub) {
        const encoder = new TextEncoder();

        // Prepare stub
        const stubBytes = encoder.encode(stub + '\r\n');

        // Prepare file entries
        const fileEntries = [];
        const fileContents = [];
        let contentOffset = 0;

        for (const [path, content] of Object.entries(files)) {
            const pathBytes = encoder.encode(path);
            const contentBytes = encoder.encode(content);

            fileEntries.push({
                path: pathBytes,
                contentSize: contentBytes.length,
                compressedSize: contentBytes.length,
                timestamp: Math.floor(Date.now() / 1000),
                crc32: crc32(contentBytes),
                flags: 0x00000000, // no compression
            });

            fileContents.push(contentBytes);
        }

        // Build manifest
        const aliasBytes = encoder.encode(alias);
        const metadataBytes = encoder.encode('');

        // Calculate manifest size
        let manifestDataSize = 4 + 4 + 2 + 4 + 4 + metadataBytes.length;
        for (const entry of fileEntries) {
            manifestDataSize += 4 + entry.path.length + 4 + 4 + 4 + 4 + 4;
        }

        const manifestSize = manifestDataSize;
        const numFiles = fileEntries.length;

        // Build manifest buffer
        const manifest = [];

        // Manifest length (4 bytes LE)
        pushUint32LE(manifest, manifestSize);
        // Number of files (4 bytes LE)
        pushUint32LE(manifest, numFiles);
        // API version (2 bytes) - 0x11 = Phar API 1.1
        manifest.push(0x11, 0x00);
        // Global flags (4 bytes LE) - 0x00010000 = has signature
        pushUint32LE(manifest, 0x00010000);
        // Alias length + alias
        pushUint32LE(manifest, aliasBytes.length);
        for (const b of aliasBytes) manifest.push(b);
        // Metadata length
        pushUint32LE(manifest, metadataBytes.length);
        for (const b of metadataBytes) manifest.push(b);

        // File entries
        for (const entry of fileEntries) {
            pushUint32LE(manifest, entry.path.length);
            for (const b of entry.path) manifest.push(b);
            pushUint32LE(manifest, entry.contentSize);
            pushUint32LE(manifest, entry.timestamp);
            pushUint32LE(manifest, entry.compressedSize);
            pushUint32LE(manifest, entry.crc32);
            pushUint32LE(manifest, entry.flags);
            // Per-file metadata length = 0
            pushUint32LE(manifest, 0);
        }

        // Combine everything
        const totalSize = stubBytes.length + manifest.length +
            fileContents.reduce((sum, f) => sum + f.length, 0) + 4 + 20 + 8;

        const result = new Uint8Array(totalSize);
        let offset = 0;

        // Write stub
        result.set(stubBytes, offset);
        offset += stubBytes.length;

        // Write manifest
        result.set(new Uint8Array(manifest), offset);
        offset += manifest.length;

        // Write file contents
        for (const content of fileContents) {
            result.set(content, offset);
            offset += content.length;
        }

        // SHA1 signature
        // For simplicity, write a basic signature structure
        const dataToSign = result.slice(0, offset);
        const signatureBytes = sha1Bytes(dataToSign);

        result.set(signatureBytes, offset);
        offset += 20;

        // Signature flags (4 bytes LE) - 0x0002 = SHA1
        pushUint32LEInto(result, offset, 0x0002);
        offset += 4;

        // GBMB magic bytes
        result[offset++] = 0x47; // G
        result[offset++] = 0x42; // B
        result[offset++] = 0x4D; // M
        result[offset++] = 0x42; // B

        return result.slice(0, offset);
    }

    function pushUint32LE(arr, value) {
        arr.push(value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF);
    }

    function pushUint32LEInto(arr, offset, value) {
        arr[offset] = value & 0xFF;
        arr[offset + 1] = (value >> 8) & 0xFF;
        arr[offset + 2] = (value >> 16) & 0xFF;
        arr[offset + 3] = (value >> 24) & 0xFF;
    }

    // Simple CRC32 implementation
    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc ^= bytes[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // Simple SHA1 (for signature)
    function sha1Bytes(data) {
        // Minimal SHA1 for PHAR signature
        function sha1(msg) {
            function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
            let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
            const msgLen = msg.length;
            const bitLen = msgLen * 8;

            // Padding
            const padded = [];
            for (let i = 0; i < msgLen; i++) padded.push(msg[i]);
            padded.push(0x80);
            while ((padded.length % 64) !== 56) padded.push(0);
            // Append bit length as 64-bit BE
            for (let i = 56; i >= 0; i -= 8) {
                padded.push((bitLen / Math.pow(2, i)) & 0xFF);
            }

            for (let offset = 0; offset < padded.length; offset += 64) {
                const W = new Array(80);
                for (let t = 0; t < 16; t++) {
                    W[t] = (padded[offset + t*4] << 24) | (padded[offset + t*4+1] << 16) |
                            (padded[offset + t*4+2] << 8) | padded[offset + t*4+3];
                }
                for (let t = 16; t < 80; t++) {
                    W[t] = rotl(W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16], 1);
                }

                let a = H0, b = H1, c = H2, d = H3, e = H4;
                for (let t = 0; t < 80; t++) {
                    let f, k;
                    if (t < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
                    else if (t < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
                    else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
                    else { f = b ^ c ^ d; k = 0xCA62C1D6; }

                    const temp = (rotl(a, 5) + f + e + k + W[t]) >>> 0;
                    e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = temp;
                }
                H0 = (H0 + a) >>> 0;
                H1 = (H1 + b) >>> 0;
                H2 = (H2 + c) >>> 0;
                H3 = (H3 + d) >>> 0;
                H4 = (H4 + e) >>> 0;
            }

            const result = new Uint8Array(20);
            [H0, H1, H2, H3, H4].forEach((h, i) => {
                result[i*4] = (h >> 24) & 0xFF;
                result[i*4+1] = (h >> 16) & 0xFF;
                result[i*4+2] = (h >> 8) & 0xFF;
                result[i*4+3] = h & 0xFF;
            });
            return result;
        }

        return sha1(data);
    }

    // ==========================================
    // PHAR EXTRACTOR
    // ==========================================

    const dropzone = $('#pharDropzone');
    const fileInput = $('#pharFileInput');
    let extractedFiles = {};

    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) processPharFile(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) processPharFile(file);
        });
    }

    async function processPharFile(file) {
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);

            extractedFiles = {};

            // Find __HALT_COMPILER marker
            const text = new TextDecoder('latin1').decode(data);
            const haltIdx = text.indexOf('__HALT_COMPILER()');
            if (haltIdx === -1) {
                showToast('Invalid PHAR file: no __HALT_COMPILER found', 'error');
                return;
            }

            // Find the end of the stub (after __HALT_COMPILER(); ?>)
            let stubEnd = text.indexOf('?>', haltIdx);
            if (stubEnd === -1) {
                stubEnd = text.indexOf(';', haltIdx) + 1;
            } else {
                stubEnd += 2;
            }

            // Skip whitespace
            while (stubEnd < data.length && (data[stubEnd] === 0x0D || data[stubEnd] === 0x0A || data[stubEnd] === 0x20)) {
                stubEnd++;
            }

            let offset = stubEnd;

            // Read manifest
            const manifestLen = readUint32LE(data, offset); offset += 4;
            const numFiles = readUint32LE(data, offset); offset += 4;
            const apiVersion = (data[offset] | (data[offset+1] << 8)); offset += 2;
            const globalFlags = readUint32LE(data, offset); offset += 4;

            // Alias
            const aliasLen = readUint32LE(data, offset); offset += 4;
            const alias = new TextDecoder().decode(data.slice(offset, offset + aliasLen));
            offset += aliasLen;

            // Metadata
            const metaLen = readUint32LE(data, offset); offset += 4;
            offset += metaLen;

            // Read file entries
            const entries = [];
            for (let i = 0; i < numFiles; i++) {
                const pathLen = readUint32LE(data, offset); offset += 4;
                const path = new TextDecoder().decode(data.slice(offset, offset + pathLen));
                offset += pathLen;

                const fileSize = readUint32LE(data, offset); offset += 4;
                const timestamp = readUint32LE(data, offset); offset += 4;
                const compressedSize = readUint32LE(data, offset); offset += 4;
                const fileCrc = readUint32LE(data, offset); offset += 4;
                const flags = readUint32LE(data, offset); offset += 4;

                const fileMetaLen = readUint32LE(data, offset); offset += 4;
                offset += fileMetaLen;

                entries.push({ path, fileSize, compressedSize, timestamp, flags });
            }

            // Content start = stubEnd + 4 (manifestLen field) + manifestLen
            let contentStart = stubEnd + 4 + manifestLen;

            // Read file contents
            let contentOffset = contentStart;
            for (const entry of entries) {
                const raw = data.slice(contentOffset, contentOffset + entry.compressedSize);
                let content;
                if ((entry.flags & 0x00001000) || (entry.flags & 0x00002000)) {
                    // Compressed (gzip/bzip2) - try to decode as text anyway
                    content = new TextDecoder('utf-8', { fatal: false }).decode(raw);
                } else {
                    content = new TextDecoder('utf-8', { fatal: false }).decode(raw);
                }
                extractedFiles[entry.path] = { content, raw, size: entry.fileSize };
                contentOffset += entry.compressedSize;
            }

            // Display results
            displayExtractorResult(file.name, alias, numFiles);

        } catch (err) {
            showToast('Error reading PHAR: ' + err.message, 'error');
            console.error(err);
        }
    }

    function readUint32LE(data, offset) {
        return (data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16) | (data[offset+3] << 24)) >>> 0;
    }

    function displayExtractorResult(fileName, alias, numFiles) {
        const result = $('#extractorResult');
        const info = $('#extractorInfo');
        const tree = $('#fileTree');
        const preview = $('#filePreview');

        result.style.display = 'block';

        // Info chips
        const totalSize = Object.values(extractedFiles).reduce((s, f) => s + f.size, 0);
        info.innerHTML = `
            <span class="info-chip"><strong>File:</strong> ${fileName}</span>
            <span class="info-chip"><strong>Alias:</strong> ${alias}</span>
            <span class="info-chip"><strong>Files:</strong> ${numFiles}</span>
            <span class="info-chip"><strong>Total Size:</strong> ${formatBytes(totalSize)}</span>
        `;

        // Build file tree
        tree.innerHTML = '';
        const paths = Object.keys(extractedFiles).sort();
        const dirs = new Set();

        paths.forEach(path => {
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
                dirs.add(parts.slice(0, i).join('/'));
            }
        });

        const allEntries = [...dirs].sort().map(d => ({ path: d, isDir: true }));
        paths.forEach(p => {
            allEntries.push({ path: p, isDir: false });
        });

        // Simple flat display sorted
        allEntries.sort((a, b) => a.path.localeCompare(b.path));

        const shown = new Set();
        paths.forEach(path => {
            const depth = (path.match(/\//g) || []).length;
            const fileName = path.split('/').pop();
            const item = document.createElement('div');
            item.className = 'file-tree__item';
            item.style.paddingLeft = (8 + depth * 16) + 'px';
            const icon = getFileIcon(fileName);
            item.innerHTML = `${icon} ${fileName}`;
            item.addEventListener('click', () => {
                $$('.file-tree__item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                showFilePreview(path);
            });
            tree.appendChild(item);
        });

        // Reset preview
        preview.innerHTML = '<p class="file-preview__placeholder">Select a file to preview its contents</p>';
    }

    function showFilePreview(path) {
        const preview = $('#filePreview');
        const file = extractedFiles[path];
        if (!file) return;

        const ext = path.split('.').pop().toLowerCase();
        const isText = ['php', 'yml', 'yaml', 'json', 'txt', 'md', 'xml', 'html', 'css', 'js', 'ini', 'properties', 'nbt'].includes(ext);

        if (isText) {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = file.content;
            if (['php'].includes(ext)) code.className = 'language-php';
            if (['yml', 'yaml'].includes(ext)) code.className = 'language-yaml';
            pre.appendChild(code);
            preview.innerHTML = '';
            preview.appendChild(pre);

            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(code);
            }
        } else {
            preview.innerHTML = `<p class="file-preview__placeholder">Binary file (${formatBytes(file.size)})</p>`;
        }
    }

    function getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        const icons = {
            php: '<span style="color:#a78bfa">PHP</span>',
            yml: '<span style="color:#facc15">YML</span>',
            yaml: '<span style="color:#facc15">YML</span>',
            json: '<span style="color:#fb923c">{ }</span>',
            txt: '<span style="color:#94a3b8">TXT</span>',
        };
        return icons[ext] || '<span style="color:#64748b">---</span>';
    }

    // Download as ZIP
    $('#downloadZipBtn')?.addEventListener('click', async () => {
        if (!Object.keys(extractedFiles).length) {
            showToast('No files to download', 'error');
            return;
        }

        const btn = $('#downloadZipBtn');
        btn.classList.add('btn--loading');

        try {
            const zip = new JSZip();
            for (const [path, file] of Object.entries(extractedFiles)) {
                zip.file(path, file.raw || file.content);
            }
            const blob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(blob, 'extracted.zip');
            showToast('ZIP downloaded!');
        } catch (err) {
            showToast('Error creating ZIP: ' + err.message, 'error');
        } finally {
            btn.classList.remove('btn--loading');
        }
    });

    // --- Helpers ---
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Expose downloadBlob globally
    window.downloadBlob = downloadBlob;
    window.formatBytes = formatBytes;

})();
