// ============================================================
// Spotify API — fetch wrapper + all API calls
// ============================================================

import { SPOTIFY_API } from './config.js';
import { getValidToken, refreshAccessToken } from './spotify-auth.js';

// ---- Fetch Wrapper ----

export async function spotifyFetch(endpoint, options = {}) {
  const token = await getValidToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${SPOTIFY_API}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (response.status === 401) {
    const newToken = (await refreshAccessToken()).accessToken;
    const retryHeaders = { Authorization: `Bearer ${newToken}` };
    if (options.body) retryHeaders['Content-Type'] = 'application/json';
    return fetch(`${SPOTIFY_API}${endpoint}`, {
      ...options,
      headers: { ...retryHeaders, ...options.headers },
    });
  }

  return response;
}

// ---- Playback ----

export async function getCurrentPlayback() {
  const response = await spotifyFetch('/me/player/currently-playing');
  if (response.status === 204) return null;
  if (!response.ok) return null;
  return response.json();
}

export async function controlPlayback(action) {
  const map = {
    play:     { endpoint: '/me/player/play',     method: 'PUT'  },
    pause:    { endpoint: '/me/player/pause',    method: 'PUT'  },
    next:     { endpoint: '/me/player/next',     method: 'POST' },
    previous: { endpoint: '/me/player/previous', method: 'POST' },
  };
  const config = map[action];
  if (!config) return false;
  const response = await spotifyFetch(config.endpoint, { method: config.method });
  return response.ok || response.status === 204;
}

export async function seekToPosition(positionMs) {
  const response = await spotifyFetch(
    `/me/player/seek?position_ms=${Math.round(positionMs)}`,
    { method: 'PUT' }
  );
  return response.ok || response.status === 204;
}

// ---- Favorites ----

// 트랙별 즐겨찾기 누적 캐시
export const favCacheMap = {};

export async function checkIsFavorite(trackId, fallback) {
  const uri = `spotify:track:${trackId}`;
  const response = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
  if (!response.ok) {
    if (response.status === 403) console.warn('[Spotify] checkIsFavorite 403 — skipping');
    else if (response.status === 429) console.warn('[Spotify] checkIsFavorite rate limited (429)');
    else console.error('checkIsFavorite failed:', response.status, await response.text().catch(() => ''));
    return fallback;
  }
  const data = await response.json();
  return data[0] === true;
}

export async function toggleFavorite(trackId, currentlyFavorite) {
  const method = currentlyFavorite ? 'DELETE' : 'PUT';
  const uri = `spotify:track:${trackId}`;
  const response = await spotifyFetch(`/me/library?uris=${encodeURIComponent(uri)}`, { method });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[Spotify] toggleFavorite FAILED: ${response.status} body:`, body);
    return { ok: false, status: response.status, body };
  }
  return { ok: true };
}

// ---- Queue / Recent ----

export async function getQueue() {
  const response = await spotifyFetch('/me/player/queue');
  if (!response.ok) return { queue: [] };
  const data = await response.json();
  return {
    queue: (data.queue || []).map(t => ({
      uri: t.uri,
      name: t.name,
      artist: t.artists.map(a => a.name).join(', '),
    })),
  };
}

export async function playTrack(uri) {
  const response = await spotifyFetch('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
  });
  return response.ok || response.status === 204;
}

export async function getRecentlyPlayed() {
  const response = await spotifyFetch('/me/player/recently-played?limit=5');
  if (!response.ok) return { items: [] };
  const data = await response.json();
  const tracks = (data.items || []).map(i => ({
    trackId: i.track.id,
    name: i.track.name,
    artist: i.track.artists.map(a => a.name).join(', '),
  }));

  // 즐겨찾기 확인 (캐시에 없는 것만 API 호출)
  const uncached = tracks.filter(t => !(t.trackId in favCacheMap));
  if (uncached.length > 0) {
    const uris = uncached.map(t => `spotify:track:${t.trackId}`).join(',');
    const favResp = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uris)}`);
    if (favResp.ok) {
      const favData = await favResp.json();
      uncached.forEach((t, i) => { favCacheMap[t.trackId] = favData[i] === true; });
    }
  }

  const items = tracks.map(t => ({
    ...t,
    isFavorite: favCacheMap[t.trackId] ?? false,
  }));
  return { items };
}
