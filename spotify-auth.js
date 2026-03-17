// ============================================================
// Spotify Auth — OAuth 2.0 PKCE + Token Management
// ============================================================

import { CLIENT_ID, SCOPES, SPOTIFY_AUTH_URL, SPOTIFY_TOKEN_URL } from './config.js';

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

// ---- Token Management ----

export async function saveTokens({ accessToken, refreshToken, expiresAt }) {
  await chrome.storage.local.set({ accessToken, refreshToken, expiresAt });
}

export async function refreshAccessToken(onFail) {
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
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'expiresAt']);
    if (onFail) onFail();
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

export async function getValidToken(onRefreshFail) {
  const stored = await chrome.storage.local.get(['accessToken', 'expiresAt']);
  if (stored.accessToken && stored.expiresAt > Date.now() + 60000) {
    return stored.accessToken;
  }
  const tokens = await refreshAccessToken(onRefreshFail);
  return tokens.accessToken;
}

// ---- OAuth Flow ----

export async function startAuthFlow(onSuccess) {
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
    show_dialog: 'true',
  });

  const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

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

          // Exchange code for tokens
          const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              grant_type: 'authorization_code',
              code: code,
              redirect_uri: redirectUrl,
              code_verifier: codeVerifier,
            }),
          });

          if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);

          const data = await response.json();
          const tokens = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
          };
          await saveTokens(tokens);
          if (onSuccess) onSuccess();
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function logout(onLogout) {
  await chrome.storage.local.remove([
    'accessToken', 'refreshToken', 'expiresAt', 'playbackState',
  ]);
  if (onLogout) onLogout();
}
