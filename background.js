// ============================================================
// Spotify Controller - Background Service Worker
// OAuth 2.0 PKCE + Spotify API + Status Polling
// ============================================================

const CLIENT_ID = '475ce99ecd134997b1098c655b602964';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
].join(' ');
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const POLL_INTERVAL_NAME = 'spotify-poll';
const POLL_INTERVAL_MINUTES = 1/3; // ~20 seconds (재생 중)
const POLL_SLOW_MINUTES = 1; // 1분 (재생 없음)

// 서비스 워커 재시작 시 storage에서 복원
let lastCheckedTrackId = null;
let lastFavoriteResult = false;
let isSlowPolling = false; // 현재 느린 폴링 상태

(async () => {
  const cached = await chrome.storage.local.get(['_favCache']);
  if (cached._favCache) {
    lastCheckedTrackId = cached._favCache.trackId;
    lastFavoriteResult = cached._favCache.result;
  }
})();

// ---- PKCE Helpers ----

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, v => chars[v % chars.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64urlEncode(hashed);
}

// ---- OAuth Flow ----

async function startAuthFlow() {
  const redirectUrl = chrome.identity.getRedirectURL('callback');
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUrl,
    scope: SCOPES,
    state: state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    show_dialog: 'true', // 항상 권한 화면 표시 → 새 스코프 강제 승인
  });

  const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  console.log('[Spotify] authUrl:', authUrl);
  console.log('[Spotify] redirectUrl:', redirectUrl);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        try {
          const url = new URL(callbackUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          if (returnedState !== state) {
            reject(new Error('State mismatch'));
            return;
          }

          const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUrl);
          await saveTokens(tokens);
          lastCheckedTrackId = null; // 좋아요 캐시 리셋
          startPolling();
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken() {
  const stored = await chrome.storage.local.get(['refreshToken']);
  if (!stored.refreshToken) throw new Error('No refresh token');

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    }),
  });

  if (!response.ok) {
    // If refresh fails, clear tokens and stop polling
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'expiresAt']);
    stopPolling();
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || stored.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function getValidToken() {
  const stored = await chrome.storage.local.get(['accessToken', 'expiresAt']);
  if (stored.accessToken && stored.expiresAt > Date.now() + 60000) {
    return stored.accessToken;
  }
  const tokens = await refreshAccessToken();
  return tokens.accessToken;
}

async function saveTokens({ accessToken, refreshToken, expiresAt }) {
  await chrome.storage.local.set({ accessToken, refreshToken, expiresAt });
}

async function logout() {
  await chrome.storage.local.remove([
    'accessToken', 'refreshToken', 'expiresAt', 'playbackState',
  ]);
  stopPolling();
  resetIcon();
}

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

// ---- Spotify API Calls ----

async function spotifyFetch(endpoint, options = {}) {
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

async function getCurrentPlayback() {
  const response = await spotifyFetch('/me/player/currently-playing');
  if (response.status === 204) return null; // Nothing playing
  if (!response.ok) return null;
  return response.json();
}

async function checkIsFavorite(trackId) {
  // 2026-02 Spotify API 변경: /me/tracks/contains → /me/library/contains (URI 사용)
  const uri = `spotify:track:${trackId}`;
  const response = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
  if (!response.ok) {
    if (response.status === 403) {
      console.warn('[Spotify] checkIsFavorite 403 — skipping this check');
    } else if (response.status === 429) {
      console.warn('[Spotify] checkIsFavorite rate limited (429)');
    } else {
      console.error('checkIsFavorite failed:', response.status, await response.text().catch(() => ''));
    }
    return lastFavoriteResult; // 실패 시 마지막 알려진 상태 유지
  }
  const data = await response.json();
  return data[0] === true;
}

async function toggleFavorite(trackId, currentlyFavorite) {
  const method = currentlyFavorite ? 'DELETE' : 'PUT';
  // 2026-02 Spotify API 변경: /me/tracks → /me/library (URI 사용)
  const uri = `spotify:track:${trackId}`;
  const response = await spotifyFetch(`/me/library`, {
    method,
    body: JSON.stringify({ uris: [uri] }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(`[Spotify] toggleFavorite ${response.status} body:`, body);
  }
  return response.ok;
}

async function controlPlayback(action) {
  switch (action) {
    case 'play': {
      const response = await spotifyFetch('/me/player/play', { method: 'PUT' });
      return response.ok || response.status === 204;
    }
    case 'pause': {
      const response = await spotifyFetch('/me/player/pause', { method: 'PUT' });
      return response.ok || response.status === 204;
    }
    case 'next': {
      const response = await spotifyFetch('/me/player/next', { method: 'POST' });
      return response.ok || response.status === 204;
    }
    case 'previous': {
      const response = await spotifyFetch('/me/player/previous', { method: 'POST' });
      return response.ok || response.status === 204;
    }
    default:
      return false;
  }
}

async function seekToPosition(positionMs) {
  const response = await spotifyFetch(
    `/me/player/seek?position_ms=${Math.round(positionMs)}`,
    { method: 'PUT' }
  );
  return response.ok || response.status === 204;
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

      // 재생 없음 → 즉시 느린 폴링으로 전환
      if (!isSlowPolling) {
        isSlowPolling = true;
        chrome.alarms.create(POLL_INTERVAL_NAME, {
          periodInMinutes: POLL_SLOW_MINUTES,
        });
      }
      return;
    }

    // 재생 감지 → 느린 폴링이었으면 복귀
    if (isSlowPolling) {
      isSlowPolling = false;
      chrome.alarms.create(POLL_INTERVAL_NAME, {
        periodInMinutes: POLL_INTERVAL_MINUTES,
      });
    }

    const trackId = playback.item.id;
    // 곡 변경 시에만 좋아요 상태 API 호출
    let isFavorite = lastFavoriteResult;
    if (trackId !== lastCheckedTrackId) {
      isFavorite = await checkIsFavorite(trackId);
      lastCheckedTrackId = trackId;
      lastFavoriteResult = isFavorite;
      chrome.storage.local.set({ _favCache: { trackId, result: isFavorite } });
    }

    const state = {
      trackId: trackId,
      trackName: playback.item.name,
      artistName: playback.item.artists.map(a => a.name).join(', '),
      albumArt: playback.item.album.images[0]?.url || '',
      albumArtSmall: playback.item.album.images[playback.item.album.images.length - 1]?.url || '',
      isPlaying: playback.is_playing,
      isFavorite: isFavorite,
      progressMs: playback.progress_ms,
      durationMs: playback.item.duration_ms,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({ playbackState: state });

    // Update icon based on favorite status
    updateIcon(isFavorite);
  } catch (err) {
    // 토큰 없음 / 갱신 실패는 정상적인 로그아웃 상태 — 조용히 종료
    if (err.message === 'No refresh token' || err.message === 'Token refresh failed') return;
    console.error('Poll error:', err);
  }
}

function startPolling() {
  chrome.alarms.create(POLL_INTERVAL_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
  });
  // Immediate first poll
  pollPlaybackState();
}

function stopPolling() {
  chrome.alarms.clear(POLL_INTERVAL_NAME);
}

// ---- Event Listeners ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_INTERVAL_NAME) {
    pollPlaybackState();
  }
});

// Start polling on install/startup if already authenticated
chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(['accessToken']);
  if (stored.accessToken) startPolling();
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['accessToken']);
  if (stored.accessToken) startPolling();
});

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'login':
      await startAuthFlow();
      return { success: true };

    case 'logout':
      await logout();
      return { success: true };

    case 'getPlaybackState': {
      // Force a fresh poll
      await pollPlaybackState();
      const data = await chrome.storage.local.get(['playbackState']);
      return { state: data.playbackState };
    }

    case 'control':
      await controlPlayback(message.action);
      // Wait briefly then refresh state
      await new Promise(r => setTimeout(r, 300));
      await pollPlaybackState();
      const afterControl = await chrome.storage.local.get(['playbackState']);
      return { state: afterControl.playbackState };

    case 'toggleFavorite': {
      const stateData = await chrome.storage.local.get(['playbackState']);
      const ps = stateData.playbackState;
      if (!ps) return { error: 'No track playing' };
      const ok = await toggleFavorite(ps.trackId, ps.isFavorite);
      if (!ok) return { state: ps }; // 실패 시 상태 그대로 반환
      ps.isFavorite = !ps.isFavorite;
      lastFavoriteResult = ps.isFavorite;
      await chrome.storage.local.set({
        playbackState: ps,
        _favCache: { trackId: ps.trackId, result: ps.isFavorite },
      });
      updateIcon(ps.isFavorite);
      return { state: ps };
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
        // 실제 로그인된 Spotify 계정 확인
        try {
          const meResp = await spotifyFetch('/me');
          if (meResp.ok) {
            const me = await meResp.json();
            info.spotifyUser = { id: me.id, email: me.email, display_name: me.display_name, product: me.product };
          } else {
            info.spotifyUser = { error: `${meResp.status}` };
          }
        } catch (e) { info.spotifyUser = { error: e.message }; }

        // library-read 스코프 직접 테스트
        try {
          const libResp = await spotifyFetch('/me/tracks?limit=1');
          info.libraryTest = { status: libResp.status, ok: libResp.ok };
          if (!libResp.ok) {
            info.libraryTest.body = await libResp.text().catch(() => '');
          }
        } catch (e) { info.libraryTest = { error: e.message }; }
      }
      console.log('[Spotify] debugInfo:', JSON.stringify(info, null, 2));
      return info;
    }

    case 'testContains': {
      // /me/library/contains 직접 테스트 (favoriteDisabled 무시)
      const ps2 = await chrome.storage.local.get(['playbackState']);
      const trackId = ps2.playbackState?.trackId;
      if (!trackId) return { error: 'No track playing' };
      try {
        const token = await getValidToken();
        const uri = `spotify:track:${trackId}`;
        const url = `${SPOTIFY_API}/me/library/contains?uris=${encodeURIComponent(uri)}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await resp.text();
        return {
          trackId,
          endpoint: `/me/library/contains?uris=${uri}`,
          status: resp.status,
          ok: resp.ok,
          body,
        };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}
