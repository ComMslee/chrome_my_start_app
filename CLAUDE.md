# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spotify Controller — a Chrome Extension (Manifest V3) for controlling Spotify playback and managing favorites from the browser toolbar. Pure vanilla JavaScript, no build step, no npm dependencies.

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

- **background.js** — Service worker: OAuth 2.0 PKCE auth, Spotify API calls, polling via `chrome.alarms` (~15s interval), toolbar icon management, favorite state caching
- **popup.js** — Popup UI logic: view switching (loading/login/player/no-playback), playback controls, progress bar with client-side timer updates (500ms), state sync via `chrome.storage.onChanged`
- **popup.html/css** — Dark-themed UI with 4-column CSS Grid layout (logout | track info | controls | favorite)

### State Management

All state lives in `chrome.storage.local`:
- `accessToken`, `refreshToken`, `expiresAt` — OAuth tokens (auto-refresh 60s before expiry)
- `playbackState` — Current track info and playback status
- `_favCache` — Favorite status cache with trackId (persists across service worker restarts)

### Spotify API Notes (2026-02 changes)

- Favorite check: `GET /me/library/contains?uris=spotify:track:{id}` (was `/me/tracks/contains`)
- Favorite toggle: `PUT/DELETE /me/library` with `{uris: [...]}` body (was `/me/tracks`)
- `spotifyFetch()` wrapper handles auto-retry on 401, rate limit (429), permission errors (403)

### Communication Pattern

Popup ↔ Background communication uses `chrome.runtime.sendMessage`. Background is the sole API caller; popup only renders state and sends user actions.

## Commit Conventions

Format: `<type>: <description in Korean>`
Types: `feat`, `fix`, `refactor`, `docs`, `revert`
