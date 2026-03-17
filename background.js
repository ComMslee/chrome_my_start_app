// ============================================================
// Spotify Controller — Background Service Worker (Main)
// Polling, Icon, Message Handler
// ============================================================

import { SPOTIFY_API, POLL_INTERVAL_NAME, POLL_INTERVAL_MINUTES, POLL_SLOW_MINUTES } from './config.js';
import { startAuthFlow, logout, getValidToken } from './spotify-auth.js';
import {
  spotifyFetch, getCurrentPlayback, controlPlayback, seekToPosition,
  checkIsFavorite, toggleFavorite, favCacheMap,
  getQueue, getRecentlyPlayed,
} from './spotify-api.js';

// 서비스 워커 재시작 시 storage에서 복원
let lastCheckedTrackId = null;
let lastFavoriteResult = false;
let isSlowPolling = false;

(async () => {
  const cached = await chrome.storage.local.get(['_favCache']);
  if (cached._favCache) {
    lastCheckedTrackId = cached._favCache.trackId;
    lastFavoriteResult = cached._favCache.result;
  }
})();

// ---- Icon Management ----

function updateIcon(isFavorite) {
  const prefix = isFavorite ? 'added_green' : 'add_gray';
  chrome.action.setIcon({
    path: {
      16: `icons/${prefix}_16.png`,
      32: `icons/${prefix}_32.png`,
      48: `icons/${prefix}_48.png`,
      128: `icons/${prefix}_128.png`,
    },
  });
}

function resetIcon() {
  chrome.action.setIcon({
    path: {
      16: 'icons/icon_stop_16.png',
      32: 'icons/icon_stop_32.png',
      48: 'icons/icon_stop_48.png',
      128: 'icons/icon_stop_128.png',
    },
  });
}

// ---- Status Polling ----

async function pollPlaybackState() {
  try {
    const stored = await chrome.storage.local.get(['accessToken']);
    if (!stored.accessToken) return;

    const playback = await getCurrentPlayback();
    if (!playback || !playback.item) {
      await chrome.storage.local.set({ playbackState: null });
      resetIcon();

      if (!isSlowPolling) {
        isSlowPolling = true;
        chrome.alarms.create(POLL_INTERVAL_NAME, { periodInMinutes: POLL_SLOW_MINUTES });
      }
      return;
    }

    if (isSlowPolling) {
      isSlowPolling = false;
      chrome.alarms.create(POLL_INTERVAL_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
    }

    const trackId = playback.item.id;
    let isFavorite = lastFavoriteResult;
    if (trackId !== lastCheckedTrackId) {
      isFavorite = await checkIsFavorite(trackId, lastFavoriteResult);
      lastCheckedTrackId = trackId;
      lastFavoriteResult = isFavorite;
      favCacheMap[trackId] = isFavorite;
      chrome.storage.local.set({ _favCache: { trackId, result: isFavorite } });
    }

    const state = {
      trackId,
      trackName: playback.item.name,
      artistName: playback.item.artists.map(a => a.name).join(', '),
      albumArt: playback.item.album.images[0]?.url || '',
      albumArtSmall: playback.item.album.images[playback.item.album.images.length - 1]?.url || '',
      isPlaying: playback.is_playing,
      isFavorite,
      progressMs: playback.progress_ms,
      durationMs: playback.item.duration_ms,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({ playbackState: state });
    updateIcon(isFavorite);
  } catch (err) {
    if (err.message === 'No refresh token' || err.message === 'Token refresh failed') return;
    if (err instanceof TypeError && err.message === 'Failed to fetch') return;
    console.error('Poll error:', err);
  }
}

function startPolling() {
  chrome.alarms.create(POLL_INTERVAL_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  pollPlaybackState();
}

function stopPolling() {
  chrome.alarms.clear(POLL_INTERVAL_NAME);
}

// ---- Event Listeners ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_INTERVAL_NAME) pollPlaybackState();
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(['accessToken']);
  if (stored.accessToken) startPolling();
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['accessToken']);
  if (stored.accessToken) startPolling();
});

// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'login':
      await startAuthFlow(() => { lastCheckedTrackId = null; startPolling(); });
      return { success: true };

    case 'logout':
      await logout(() => { stopPolling(); resetIcon(); });
      return { success: true };

    case 'getPlaybackState': {
      await pollPlaybackState();
      const data = await chrome.storage.local.get(['playbackState']);
      return { state: data.playbackState };
    }

    case 'control':
      await controlPlayback(message.action);
      await new Promise(r => setTimeout(r, 300));
      await pollPlaybackState();
      const afterControl = await chrome.storage.local.get(['playbackState']);
      return { state: afterControl.playbackState };

    case 'toggleFavorite': {
      const stateData = await chrome.storage.local.get(['playbackState']);
      const ps = stateData.playbackState;
      if (!ps) return { error: 'No track playing' };
      const result = await toggleFavorite(ps.trackId, ps.isFavorite);
      if (!result.ok) return { error: `즐겨찾기 실패 (${result.status}): ${result.body}` };
      ps.isFavorite = !ps.isFavorite;
      lastFavoriteResult = ps.isFavorite;
      favCacheMap[ps.trackId] = ps.isFavorite;
      await chrome.storage.local.set({
        playbackState: ps,
        _favCache: { trackId: ps.trackId, result: ps.isFavorite },
      });
      updateIcon(ps.isFavorite);
      return { state: ps };
    }

    case 'getQueue':
      return await getQueue();

    case 'getRecentlyPlayed':
      return await getRecentlyPlayed();

    case 'toggleRecentFavorite': {
      const { trackId: tId, isFavorite: isFav } = message;
      const result = await toggleFavorite(tId, isFav);
      if (!result.ok) return { error: `즐겨찾기 실패 (${result.status})` };
      const newFav = !isFav;
      favCacheMap[tId] = newFav;
      // 현재 재생 곡이면 메인 UI + 트레이 아이콘도 동기화
      const cur = await chrome.storage.local.get(['playbackState']);
      if (cur.playbackState?.trackId === tId) {
        cur.playbackState.isFavorite = newFav;
        lastFavoriteResult = newFav;
        await chrome.storage.local.set({
          playbackState: cur.playbackState,
          _favCache: { trackId: tId, result: newFav },
        });
        updateIcon(newFav);
      }
      return { success: true, newState: newFav };
    }

    case 'seek':
      await seekToPosition(message.positionMs);
      return { success: true };

    case 'isLoggedIn': {
      const stored = await chrome.storage.local.get(['accessToken']);
      return { loggedIn: !!stored.accessToken };
    }

    case 'debugInfo': {
      const stored = await chrome.storage.local.get(['accessToken', 'expiresAt']);
      const info = {
        hasToken: !!stored.accessToken,
        expiresAt: stored.expiresAt ? new Date(stored.expiresAt).toISOString() : null,
        spotifyUser: null,
        libraryTest: null,
      };
      if (stored.accessToken) {
        try {
          const meResp = await spotifyFetch('/me');
          if (meResp.ok) {
            const me = await meResp.json();
            info.spotifyUser = { id: me.id, email: me.email, display_name: me.display_name, product: me.product };
          } else {
            info.spotifyUser = { error: `${meResp.status}` };
          }
        } catch (e) { info.spotifyUser = { error: e.message }; }

        try {
          const libResp = await spotifyFetch('/me/tracks?limit=1');
          info.libraryTest = { status: libResp.status, ok: libResp.ok };
          if (!libResp.ok) info.libraryTest.body = await libResp.text().catch(() => '');
        } catch (e) { info.libraryTest = { error: e.message }; }
      }
      console.log('[Spotify] debugInfo:', JSON.stringify(info, null, 2));
      return info;
    }

    case 'testContains': {
      const ps2 = await chrome.storage.local.get(['playbackState']);
      const trackId = ps2.playbackState?.trackId;
      if (!trackId) return { error: 'No track playing' };
      try {
        const token = await getValidToken();
        const uri = `spotify:track:${trackId}`;
        const url = `${SPOTIFY_API}/me/library/contains?uris=${encodeURIComponent(uri)}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const body = await resp.text();
        return { trackId, endpoint: `/me/library/contains?uris=${uri}`, status: resp.status, ok: resp.ok, body };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}
