# Local Architecture Scanner Chrome Extension

Version: 1.1.0

This extension captures architecture data from pages you are authorized to analyze. It stores everything locally in `chrome.storage.local` and exports a JSON report on demand.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `arch_scan_extension`.

After editing extension files, click the reload button on the extension card in `chrome://extensions`.

## Recommended Use

1. Open the target site and log in.
2. Click the extension icon.
3. Click `Start current origin`.
4. Refresh the target page.
5. Keep the page open as long as needed.
6. If third-party platform tabs are involved, open those tabs and either click `Start current origin` on each one or use `Start all sites` in a dedicated Chrome profile.
7. Click `Export JSON`.

## What It Captures

- `fetch` and `XMLHttpRequest` request/response metadata, headers, bodies, schemas, and call stacks.
- WebSocket create/open/close/error/send/receive events.
- Socket.IO message decoding, including event names and `chat message` channels where possible.
- `chrome.runtime.sendMessage`, `chrome.runtime.connect`, port messages, and responses visible in the page context.
- `window.postMessage` outgoing messages.
- Local/session storage snapshots and live storage changes.
- Resource timing snapshots.
- Export-time analysis:
  - top HTTP endpoints
  - top WebSocket URLs
  - Socket.IO channels/events
  - Chrome runtime message types
  - storage keys
  - host counters
  - error counters

## Data Policy

- No data is sent to any external server by this extension.
- Captured records stay in `chrome.storage.local` until you click `Clear` or uninstall the extension.
- Version 1.1 is configured for full local capture, so exported JSON can include request bodies, headers, storage values, plugin messages, and tokens/session-like values if the page uses them.
- Review exported JSON before sharing it outside your own analysis workflow.

## Notes

- Refresh the page after starting capture. This ensures the hook is installed before app startup code creates WebSocket connections.
- For sites that use a helper Chrome plugin, the most useful records are usually `chrome.runtime.sendMessage`, `fetch`, `xhr`, and `ws.message.*`.
- For Socket.IO traffic, check the exported `analysis.socketIoChannels` and `analysis.socketIoEvents` first.
- Long runs can create large reports. Use `Clear` before a new test run.

