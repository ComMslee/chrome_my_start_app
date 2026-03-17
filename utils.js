// ============================================================
// Spotify Controller — Pure Utility Functions
// ============================================================

/**
 * ms → "m:ss" 형식 변환
 */
export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
