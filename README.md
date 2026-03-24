# PocketMine Tools

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?style=for-the-badge&logo=github)](https://w1zardz.github.io/pocketmine-tools-bedrock-servers/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Stars](https://img.shields.io/github/stars/w1zardz/pocketmine-tools-bedrock-servers?style=for-the-badge&color=yellow)](https://github.com/w1zardz/pocketmine-tools-bedrock-servers/stargazers)

**Free online developer tools for PocketMine-MP (PMMP) / Minecraft Bedrock Edition servers.**

All tools run entirely in your browser -- no server uploads, no sign-up, completely free.

---

## Features

| Tool | Description |
|------|-------------|
| **PHAR Creator** | Build `.phar` plugin files from source code directly in the browser |
| **PHAR Extractor** | Upload and extract `.phar` files, browse file tree, download as ZIP |
| **Plugin Search** | Search GitHub for PocketMine-MP plugins with live results |
| **Crash Dump Parser** | Parse and format PocketMine crash dumps with color-coded sections |
| **Template Generator** | Generate plugin boilerplate with namespace, commands, permissions |
| **Server Pinger** | Ping Bedrock/MCPE servers and view MOTD, players, version |
| **MOTD Generator** | Create colorful server MOTD with Minecraft formatting codes |
| **Nickname Generator** | Generate gradient-colored Minecraft nicknames |

## Tech Stack

- Pure HTML / CSS / JavaScript (no frameworks, no build step)
- Dark theme with glassmorphism effects
- Mobile-first responsive design
- JSZip for archive operations
- highlight.js for code syntax highlighting
- GitHub API for plugin search
- mcsrvstat.us API for server pinging

## Screenshots

> Screenshots coming soon

## Getting Started

### Use Online

Visit the live site: **[PocketMine Tools](https://w1zardz.github.io/pocketmine-tools-bedrock-servers/)**

### Run Locally

```bash
git clone https://github.com/w1zardz/pocketmine-tools-bedrock-servers.git
cd pocketmine-tools-bedrock-servers
# Open index.html in your browser, or use any static server:
npx serve .
```

No build step required. Just open `index.html`.

## Project Structure

```
pocketmine-tools-bedrock-servers/
  index.html          Main SPA page
  css/style.css       All styles (dark theme, responsive)
  js/app.js           Core navigation and utilities
  js/phar.js          PHAR creator and extractor
  js/search.js        GitHub plugin search
  js/crashdump.js     Crash dump parser
  js/template.js      Plugin template generator
  js/pinger.js        Bedrock server pinger
  js/motd.js          MOTD and nickname generators
  manifest.json       PWA manifest
  sitemap.xml         Sitemap for SEO
  robots.txt          Robots configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Built with care for the PocketMine-MP community.
