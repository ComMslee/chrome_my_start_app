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
    try {
      const newToken = (await refreshAccessToken()).accessToken;
      const retryHeaders = { Authorization: `Bearer ${newToken}` };
      if (options.body) retryHeaders['Content-Type'] = 'application/json';
      return fetch(`${SPOTIFY_API}${endpoint}`, {
        ...options,
        headers: { ...retryHeaders, ...options.headers },
      });
    } catch (err) {
      console.error('[spotifyFetch] Token refresh failed:', err.message);
      return response;
    }
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

export async function checkIsFavorite(trackId) {
  const uri = `spotify:track:${trackId}`;
  const response = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
  if (!response.ok) {
    if (response.status === 403) console.warn('[Spotify] checkIsFavorite 403 — skipping');
    else if (response.status === 429) console.warn('[Spotify] checkIsFavorite rate limited (429)');
    else console.error('checkIsFavorite failed:', response.status, await response.text().catch(() => ''));
    return null;
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
    queue: (data.queue || []).filter(t => t.type === 'track').map(t => ({
      uri: t.uri,
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
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

export async function addToQueue(uri) {
  const response = await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
  });
  return response.ok || response.status === 204;
}

// 즐겨찾기 확인 (캐시에 없는 것만 API 호출, favCacheMap에 채워넣음)
const CONTAINS_CHUNK_SIZE = 5;
async function batchCheckFavorites(trackIds) {
  const uncachedTrackIds = [...new Set(
    trackIds.filter(id => !(id in favCacheMap))
  )];
  for (let i = 0; i < uncachedTrackIds.length; i += CONTAINS_CHUNK_SIZE) {
    const chunk = uncachedTrackIds.slice(i, i + CONTAINS_CHUNK_SIZE);
    const uris = chunk.map(id => `spotify:track:${id}`).join(',');
    const favResp = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uris)}`);
    if (favResp.ok) {
      const favData = await favResp.json();
      chunk.forEach((trackId, j) => {
        favCacheMap[trackId] = favData[j] === true;
      });
    } else {
      console.error('[Spotify] batch contains chunk FAILED', favResp.status, await favResp.text().catch(() => ''));
    }
  }
}

// ---- Search ----

export async function searchTracks(query, limit = 10) {
  const q = (query || '').trim();
  if (!q) return { items: [] };
  const params = new URLSearchParams({ q, type: 'track', limit: String(limit) });
  const response = await spotifyFetch(`/search?${params.toString()}`);
  if (!response.ok) return { items: [] };
  const data = await response.json();
  const tracks = (data.tracks?.items || []).filter(t => t && t.id);

  await batchCheckFavorites(tracks.map(t => t.id));

  return {
    items: tracks.map(t => ({
      trackId: t.id,
      uri: t.uri,
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '),
      isFavorite: favCacheMap[t.id] ?? false,
    })),
  };
}

const RECENT_TARGET = 50;
const RECENT_MAX_PAGES = 5;

export async function getRecentlyPlayed() {
  // recently-played는 곡 목록이 아니라 재생 이벤트 목록이라 같은 곡이 중복으로 내려온다.
  // 중복을 제거한 뒤 목표 개수를 채울 때까지 before 커서로 이전 페이지를 더 받아온다.
  const seen = new Set();
  const tracks = [];
  let before = null;

  for (let page = 0; page < RECENT_MAX_PAGES && tracks.length < RECENT_TARGET; page++) {
    const query = before ? `?limit=50&before=${before}` : '?limit=50';
    const response = await spotifyFetch(`/me/player/recently-played${query}`);
    if (!response.ok) break;
    const data = await response.json();
    const events = data.items || [];
    if (events.length === 0) break;

    for (const i of events) {
      if (i.track?.type !== 'track' || seen.has(i.track.id)) continue;
      seen.add(i.track.id);
      tracks.push({
        trackId: i.track.id,
        name: i.track.name,
        artist: (i.track.artists || []).map(a => a.name).join(', '),
        playedAt: i.played_at,
      });
      if (tracks.length >= RECENT_TARGET) break;
    }

    // 응답은 최신순이므로 마지막(가장 오래된) 항목 시각을 다음 페이지 커서로 사용
    const oldestPlayedAt = events[events.length - 1]?.played_at;
    const next = oldestPlayedAt ? Date.parse(oldestPlayedAt) : NaN;
    if (!Number.isFinite(next) || next === before) break;
    before = next;
  }

  await batchCheckFavorites(tracks.map(t => t.trackId));

  const items = tracks.map(t => ({
    ...t,
    isFavorite: favCacheMap[t.trackId] ?? false,
  }));
  return { items };
}
