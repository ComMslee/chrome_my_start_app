// ============================================================
// Spotify Controller — Shared Constants
// ============================================================

export const CLIENT_ID = '475ce99ecd134997b1098c655b602964';
export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
].join(' ');
export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API = 'https://api.spotify.com/v1';
export const POLL_INTERVAL_NAME = 'spotify-poll';
export const POLL_INTERVAL_MINUTES = 1/3;  // ~20초 (재생 중)
export const POLL_SLOW_MINUTES = 1;        // 1분 (재생 없음)
