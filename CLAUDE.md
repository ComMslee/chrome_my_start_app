# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spotify Controller — a Chrome Extension (Manifest V3) for controlling Spotify playback and managing favorites from the browser toolbar. Pure vanilla JavaScript, no build step, no npm dependencies. Uses ES Modules for service worker.

## Development

No build process. The extension loads directly as unpacked static files in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

Icon generation (only needed if modifying icons):
```bash
npm install sharp
node generate_icons.js
```

Debug panel available at `debug.html` for testing OAuth tokens and API endpoints.

## Architecture

### Core Files

- **config.js** — Shared constants (Client ID, API URLs, polling intervals)
- **spotify-auth.js** — OAuth 2.0 PKCE auth, token exchange/refresh/validation
- **spotify-api.js** — `spotifyFetch()` wrapper, all Spotify API calls, `favCacheMap` (per-track favorite cache)
- **background.js** — Main service worker: polling via `chrome.alarms` (~20s), toolbar icon management, message handler for popup communication
- **popup.js** — Popup UI logic: view switching, playback controls, progress bar (500ms timer), list rendering, state sync via `chrome.storage.onChanged`
- **popup.html/css** — Dark-themed UI with 5-column CSS Grid layout (logout | track info | controls | favorite | list buttons)

### State Management

All state lives in `chrome.storage.local`:
- `accessToken`, `refreshToken`, `expiresAt` — OAuth tokens (auto-refresh 60s before expiry)
- `playbackState` — Current track info and playback status
- `_favCache` — Favorite status cache with trackId (persists across service worker restarts)

In-memory (service worker lifetime):
- `favCacheMap` — Per-track favorite status, accumulates across track changes. Cache hit avoids API call.

### Spotify API Notes (2026-02 changes)

- Favorite check: `GET /me/library/contains?uris=spotify:track:{id}` (was `/me/tracks/contains`)
- Favorite toggle: `PUT/DELETE /me/library` with `{uris: [...]}` body (was `/me/tracks`)
- `spotifyFetch()` wrapper handles auto-retry on 401, rate limit (429), permission errors (403)

### Communication Pattern

Popup ↔ Background communication uses `chrome.runtime.sendMessage`. Background is the sole API caller; popup only renders state and sends user actions.

## Commit Conventions

Format: `<type>: <description in Korean>`
Types: `feat`, `fix`, `refactor`, `docs`, `revert`
