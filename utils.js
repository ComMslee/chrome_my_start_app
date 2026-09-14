// ============================================================
// Spotify Controller — Pure Utility Functions
// ============================================================

/**
 * ms → "m:ss" 형식 변환
 */
export function formatTime(ms) {
  if (ms == null || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * ISO 타임스탬프 → "방금 전" / "N분 전" 등 상대 시간 문자열
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs)) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
