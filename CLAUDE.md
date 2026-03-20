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

Syntax check:
```bash
node --check <file.js>
```

Unit tests:
```bash
node tests/test-utils.mjs
```

## Architecture

### File Structure

```
config.js          — Shared constants (Client ID, API URLs, polling intervals, scopes)
spotify-auth.js    — OAuth 2.0 PKCE auth, token exchange/refresh/validation
spotify-api.js     — spotifyFetch() wrapper, all Spotify API calls, favCacheMap
background.js      — Service worker: polling, icon management, message router
popup.js           — Popup UI: view switching, controls, list rendering
popup.html/css     — Dark-themed UI with 5-column CSS Grid
utils.js           — Shared utilities (formatTime)
tests/             — Unit tests (test-utils.mjs)
```

### Spotify API Layer (`spotify-api.js`)

All Spotify API calls are centralized here. No other file calls `fetch()` to Spotify directly (except `background.js` debug handlers).

- `spotifyFetch(endpoint, options)` — Base wrapper: token injection, 401 auto-retry
- `getCurrentPlayback()` — GET /me/player/currently-playing
- `controlPlayback(action)` — play/pause/next/previous
- `seekToPosition(positionMs)` — PUT /me/player/seek
- `checkIsFavorite(trackId, fallback)` — GET /me/library/contains
- `toggleFavorite(trackId, currentlyFavorite)` — PUT/DELETE /me/library
- `getQueue()` — GET /me/player/queue
- `getRecentlyPlayed()` — GET /me/player/recently-played (+ batch favorite check)

### Favorite Caching (`favCacheMap`)

- `favCacheMap` is a per-track in-memory cache (`{ [trackId]: boolean }`)
- Populated by: `checkIsFavorite`, `getRecentlyPlayed` (batch), `toggleFavorite`, `toggleRecentFavorite`
- Accumulates across track changes — cache hit skips API call
- Persisted partially via `chrome.storage.local._favCache` (current track only, for service worker restart)

### State Management

`chrome.storage.local`:
- `accessToken`, `refreshToken`, `expiresAt` — OAuth tokens (auto-refresh 60s before expiry)
- `playbackState` — Current track info and playback status
- `_favCache` — Last checked track favorite status (persists across service worker restarts)

In-memory (service worker lifetime):
- `favCacheMap` — Per-track favorite status, grows over session
- `lastCheckedTrackId` / `lastFavoriteResult` — Dedup favorite checks in polling

### Communication Pattern

Popup ↔ Background via `chrome.runtime.sendMessage`. Background is the sole API caller; popup only renders state and sends user actions.

Message types: `login`, `logout`, `isLoggedIn`, `getPlaybackState`, `control`, `toggleFavorite`, `toggleRecentFavorite`, `getQueue`, `getRecentlyPlayed`, `seek`, `debugInfo`, `testContains`

### UI Layout

5-column CSS Grid: `logout | track info | controls | favorite | list buttons`

List buttons (2 stacked): recent (이전) / queue (다음)

- Recent/Queue: vertical list in `list-container`

### OAuth Scopes

```
user-read-playback-state, user-modify-playback-state, user-read-currently-playing,
user-library-read, user-library-modify, user-read-recently-played
```

Adding a new scope requires user re-login (logout → login).

### Spotify API Notes (2026-02 changes)

- Favorite check: `GET /me/library/contains?uris=spotify:track:{id}` (was `/me/tracks/contains`)
- Favorite toggle: `PUT/DELETE /me/library` with `{uris: [...]}` body (was `/me/tracks`)
- `spotifyFetch()` wrapper handles auto-retry on 401, rate limit (429), permission errors (403)

## CI/CD

- `.github/workflows/ci.yml` — Push/PR: syntax check + unit tests
- `.github/workflows/release.yml` — Tag push (`v*`): build zip + GitHub Release

## Commit Conventions

Format: `<type>: <description in Korean>`
Types: `feat`, `fix`, `refactor`, `docs`, `revert`
