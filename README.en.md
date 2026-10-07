# OpenResearch

[简体中文](README.md) | **English**

[Download](https://github.com/Gm-sunsky/openresearch/releases/latest) · [Report an issue](https://github.com/Gm-sunsky/openresearch/issues)

OpenResearch is a local-first AI research workspace for Windows and macOS. Describe a topic, discover sources, and organize evidence on a persistent research board. Current version: **1.5.5**.

Version 1.5.5 adds caption-based core-image selection, independent overviews, a full-material reader, and fixes for draft resets and stale pointer listeners. See [release notes](docs/RELEASE_NOTES_V1_5_5.md).

## Features

- Research projects with independent update selection, scheduling, pause/resume, and source management.
- RSS/Atom feeds, web snapshots, source discovery, and search-based social account monitoring.
- AI summaries, relevance checks, classifications, evidence coverage, confidence, and changes across updates.
- A built-in research skill defines the object-by-focus search matrix, evidence tiers, cross-checks, and output requirements.
- Draggable and resizable cards, image previews, page-based card bundles, filtering, search, locked cards, and update history.
- Local SQLite storage, schema migrations, manual backups, and up to ten daily backups.
- Chinese, English, Russian, French, German, Japanese, and Korean interface languages.
- OpenAI Responses and compatible APIs; local fallback rules when AI is unavailable.

## Installation

Download packages from this repository's **Releases** page once published.

| Platform | Package | Installation |
| --- | --- | --- |
| Windows 10/11 x64 | `OpenResearch Setup 1.5.5.exe` | Run the installer and choose a directory. |
| Windows x64 portable | `OpenResearch Portable 1.5.5.zip` | Extract the entire archive and run `OpenResearch.exe`. |
| macOS Apple Silicon | `OpenResearch macOS arm64 1.5.5.zip` | Extract and move `OpenResearch.app` to Applications. |
| macOS Intel | `OpenResearch macOS x64 1.5.5.zip` | Extract and move `OpenResearch.app` to Applications. |
| macOS native installer | `.dmg` for arm64 or x64 | Produced by the macOS GitHub Actions job; open and drag to Applications. |

macOS requires macOS 11 or newer. These builds are unsigned and not notarized. Windows may show an unknown publisher notice. On macOS, follow the system's Privacy & Security instructions to open an unsigned app you trust. Do not disable system-wide security protections. Native macOS launch testing must be performed on a Mac; archive verification on Windows does not establish runtime compatibility.

## Getting started

1. Create a project and name the concrete objects and questions you want to monitor.
2. Review discovered sources before adding them, or add RSS feeds and webpages manually.
3. Select projects in the sidebar and run an update. Clicking a project name changes the view; selection determines which projects update.
4. Optionally configure an HTTPS API endpoint, model, protocol, and API key in Settings.
5. Review citations and uncertainty before relying on a research card. AI conclusions can be wrong; missing evidence is shown explicitly.

AI credentials are optional for basic local operation. Search-based social sources require a compatible web-search service. API costs and availability depend on the provider.

## Data and privacy

Data remains in the existing Electron profile directory: `%APPDATA%/AI Research Board` on Windows and `~/Library/Application Support/AI Research Board` on macOS. The legacy directory name and application identifier are retained to preserve upgrades. The database is `research-board.sqlite`; Settings can open the directory and create backups. If the existing database uses the legacy `ai-research-board` profile directory, that directory is retained instead. The existing language preference is also retained.

API keys are encrypted using Electron safeStorage (Windows protection or macOS Keychain); plaintext keys are not exposed to the renderer. AI requests and source retrieval send the necessary project queries and evidence to configured services. Local-first storage does not mean all processing is offline. Keep databases, keys, private project data, and local build caches out of Git.

## Development

Requirements: Node.js 22, npm, and Windows or macOS. Install the pinned dependency versions:

```sh
npm ci
npm run dev
```

Validate and build:

```sh
npm run lint
npm run build
```

`build` performs TypeScript checks, all regression tests, and both renderer and Electron builds.

```sh
npm run dist:win           # Windows: NSIS installer and portable ZIP
npm run dist:mac           # macOS: DMG and ZIP, arm64 and x64
npm run dist:mac:portable  # Windows + Python 3: macOS portable ZIPs
```

Windows and cross-built Mac portable packages are placed in `release/V1.5.5/`. Native macOS builds are placed in `release/`. Windows packaging also requires access to electron-builder's tooling downloads; macOS portable packaging downloads the matching Electron runtimes when absent from the cache.

## GitHub builds and releases

`.github/workflows/release.yml` runs lint, type checks, tests, and platform builds on Windows and macOS. Run it manually to obtain build artifacts, or push a version tag matching `package.json` (for example, `v1.5.5`) to publish a Release after both builds succeed. GitHub Actions must be enabled; account usage limits apply. Signing/notarization credentials are not configured.

## Architecture

| Directory | Responsibility |
| --- | --- |
| `src/` | React UI, research board, shared contracts |
| `electron/main/` | Database, collectors, AI, scheduler, IPC |
| `electron/preload/` | Whitelisted desktop API |
| `research-skills/` | Built-in research instructions |
| `tests/` | Regression tests |
| `scripts/` | Packaging and verification |
| `docs/` | Product specifications and release notes |

## Limitations and contributions

Complex JavaScript-heavy pages may provide limited extractable text. Public search depends on network access. Social monitoring uses search results rather than dedicated platform crawlers. Cloud sync, accounts, and collaboration are not included. Existing detailed design documents are primarily Chinese.

For issues, include OS, architecture, app version, reproduction steps, and sanitized task diagnostics. Never attach API keys or private databases. Before contributing, run `npm run lint` and `npm run build`.

No open-source license has been granted in this repository. Publication alone does not grant permission to redistribute or modify the software.

## Reading full material

Double-click a card or use its full-reader button. Scroll with the wheel or Up/Down, turn pack pages with Left/Right or toolbar buttons, and close with Escape. Cards show independent concise overviews and core images supported by actual captions; unknown images and full saved research text remain in the reader. Older text discarded before storage requires a new research update. See the release notes for the input diagnosis and verification limits.