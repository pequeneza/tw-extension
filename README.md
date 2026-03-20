# TW Extension :>

> Chrome extension — repository: `pequeneza/tw-extension`.

## Overview
This repo contains a Chrome MV3 extension for TribalWars PT helpers.

- Source code (TypeScript + React): `src/`
- Legacy scripts (injected as-is): `tw-suite-extension/modules/`
- Build output (load this in Chrome): `dist/`

## Development

### Prerequisites
- Node.js (LTS recommended)

### Install
```bash
npm install
```

### Build
```bash
npm run build
```

This creates the unpackable extension in `dist/`.

### Dev (watch build)
```bash
npm run dev
```

This runs `vite build --watch` so changes rebuild into `dist/`. You still need to reload the extension in Chrome after changes.

## Install (Load unpacked in Chrome)
1. Build the extension:
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `dist/` folder

## Notes
- Module toggles are stored in `chrome.storage.sync` under key `tw_suite_settings_v1`.
- The extension injects scripts into the page context by adding `<script src="...">` tags.