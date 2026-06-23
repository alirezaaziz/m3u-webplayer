# M3U WebPlayer

A fully client-side IPTV / M3U playlist player built with vanilla HTML, CSS, and JavaScript. No server required — open it in a browser and start watching.

![M3U WebPlayer](https://img.shields.io/badge/PWA-ready-7c6fff?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-4ecb71?style=flat-square) ![Zero deps](https://img.shields.io/badge/dependencies-HLS.js_only-00d4aa?style=flat-square)

---

## Features

### Playlist Loading
- **File upload** — drag & drop or browse for `.m3u` / `.m3u8` files
- **Remote URL** — paste any public M3U URL; automatic CORS proxy fallback if needed
- **Xtream Codes** — connect with server, username, and password; optionally include VOD and Series
- Playlist is cached in localStorage so it survives page reloads

### Channel Management
- **Favorites** — star any channel, filter by favorites, keyboard shortcut `S`
- **History** — recently watched channels tracked automatically
- **Hide** — hide channels from the list without deleting them (recoverable from Settings)
- **Delete** — permanently remove a channel from the current playlist
- **Drag-to-reorder** — rearrange channels in custom order, saved to cache
- **Move to Top** — pin any channel to the top of the list via right-click

### Search & Browse
- Instant full-text search across channel names and groups
- Category tabs auto-generated from `group-title` M3U metadata
- **Sort modes**: Custom order · A→Z · Z→A · By Group · Favorites first
- **List view** and **Grid view** toggle
- Channel count displayed live

### Video Player
- HLS streams via [HLS.js](https://github.com/video-dev/hls.js) with automatic quality detection
- **Quality selector** — manual ABR level lock (1080p / 720p / Auto…)
- **Playback speed** — 0.25× to 2× for VOD content
- **Subtitles / CC** — auto-enabled when available, toggled with `C` or the CC button
- **Buffered progress bar** — shows buffered range on the seek bar
- **Seek tooltip** — hover the seek bar to preview time at cursor
- **Double-click** to toggle fullscreen (desktop)
- Picture-in-Picture (`ctrl-pip`)
- Screenshot capture
- Volume control with keyboard `←` / `→`

### Video Filters
Adjustable per-session in Settings:
- Brightness (50–150%)
- Contrast (50–150%)
- Saturation (0–200%)
- One-click reset to defaults

### Stream Health Indicator
A small colour-coded dot in the info bar shows live buffering quality:
- 🟢 **Good** — < 3% buffering ratio
- 🟡 **Fair** — 3–10%
- 🔴 **Poor** — > 10%

### Sharing
- **Share URL** button (appears when a remote playlist is loaded) copies a deep link containing the playlist URL and currently playing channel
- Anyone opening the link gets the playlist loaded and the channel auto-played

### Export
- **Export current view as M3U** — downloads whatever channels are currently visible (respects active category, search, and hidden filter)

### Settings
- Auto-play on startup
- Remember volume across sessions
- Auto-retry broken streams (configurable delay: 5 / 10 / 20 / 30 s)
- Sleep timer: 15 min · 30 min · 1 h
- Stream info overlay (resolution, bitrate, FPS)
- Accent colour picker (6 themes)
- Hidden channels management — unhide all in one click

### PWA
- Installable on desktop and mobile (Add to Home Screen)
- Offline-ready app shell via service worker (streams themselves still require internet)
- Offline / online toast notifications

### Mobile
- Drawer sidebar with backdrop, triggered by hamburger button
- Single-tap channel selection (no 300ms delay)
- Search opens the sidebar automatically on mobile
- Portrait-mode controls adapted for narrow screens (PiP and Screenshot hidden, volume uses hardware keys)
- LIVE badge, prev/next channel buttons in the bottom info bar

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `M` | Mute / Unmute |
| `F` | Toggle fullscreen |
| `S` | Toggle favorite |
| `C` | Toggle subtitles / CC |
| `↑` / `↓` | Previous / Next channel |
| `←` / `→` | Volume down / up |
| `J` / `L` | Seek −10 s / +10 s |
| `Escape` | Close menus |
| Double-click | Fullscreen (desktop) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styles | Vanilla CSS (custom properties, grid, flexbox) |
| Logic | Vanilla JavaScript (ES2020+, no framework) |
| HLS playback | [HLS.js](https://github.com/video-dev/hls.js) v1.5.8 via CDN |
| PWA | Web App Manifest + Service Worker |
| Storage | `localStorage` (playlist cache, settings, favorites, history) |

No build step. No Node.js. No bundler. Just files.

---

## Getting Started

### Option 1 — Open directly
Because the app uses `localStorage` and CDN resources, you can open `index.html` directly in Chrome or Edge with no server needed for basic usage. For the CORS proxy fallback and service worker to work, serve it over HTTP(S).

### Option 2 — Local HTTP server
Any static file server works:

```bash
# Python 3
python -m http.server 8080

# Node (npx)
npx serve .

# VS Code — Live Server extension
```

Then open `http://localhost:8080`.

### Option 3 — Deploy to GitHub Pages / Netlify / Vercel / Cloudflare Pages
Drop the four files (`index.html`, `style.css`, `app.js`, `sw.js`, `manifest.json`, icons) into the repo root and enable static hosting. No configuration required.

---

## File Structure

```
.
├── index.html        # App shell & all HTML
├── style.css         # All styles
├── app.js            # All application logic
├── sw.js             # Service worker (PWA offline cache)
├── manifest.json     # PWA manifest
├── icon.svg          # App icon
└── icon-maskable.svg # Maskable icon for Android
```

---

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome / Edge 90+ | ✅ Full |
| Firefox 90+ | ✅ Full |
| Safari 15+ (iOS & macOS) | ✅ Full (native HLS fallback) |
| Samsung Internet | ✅ Full |

HLS streams use native `<video>` playback on Safari (which supports HLS natively) and HLS.js on all other browsers.

---

## Privacy

Everything runs in your browser. No data is sent to any server except:
- The playlist URL you provide (fetched directly or via a public CORS proxy if needed)
- Stream URLs (connected directly to the stream origin)

---

## License

MIT — do whatever you want with it.
