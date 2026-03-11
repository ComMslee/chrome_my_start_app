const $ = (id) => document.getElementById(id);

const views = {
  loading: $('loading-view'),
  login: $('login-view'),
  player: $('player-view'),
  noPlayback: $('no-playback-view'),
};

const els = {
  loginBtn: $('login-btn'),
  trackName: $('track-name'),
  artistName: $('artist-name'),
  prevBtn: $('prev-btn'),
  playPauseBtn: $('play-pause-btn'),
  nextBtn: $('next-btn'),
  playIcon: $('play-icon'),
  pauseIcon: $('pause-icon'),
  favoriteBtn: $('favorite-btn'),
  heartEmpty: $('heart-empty'),
  heartFilled: $('heart-filled'),
  currentTime: $('current-time'),
  totalTime: $('total-time'),
  progressBar: $('progress-bar'),
  progressFilled: $('progress-filled'),
  progressHandle: $('progress-handle'),
  logoutBtn: $('logout-btn'),
  logoutBtnNop: $('logout-btn-nop'),
};

let currentState = null;
let progressTimer = null;
let isProcessing = false;

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateUI(state) {
  if (!state) {
    showView('noPlayback');
    stopProgressTimer();
    return;
  }

  showView('player');
  currentState = state;

  els.trackName.textContent = state.trackName;
  els.artistName.textContent = state.artistName;

  els.playIcon.classList.toggle('hidden', state.isPlaying);
  els.pauseIcon.classList.toggle('hidden', !state.isPlaying);

  els.heartEmpty.classList.toggle('hidden', state.isFavorite);
  els.heartFilled.classList.toggle('hidden', !state.isFavorite);
  els.favoriteBtn.classList.toggle('active', state.isFavorite);

  updateProgress(state.progressMs, state.durationMs);
  els.totalTime.textContent = formatTime(state.durationMs);

  if (state.isPlaying) {
    startProgressTimer();
  } else {
    stopProgressTimer();
  }
}

function updateProgress(progressMs, durationMs) {
  if (!durationMs) return;
  const pct = Math.min((progressMs / durationMs) * 100, 100);
  els.progressFilled.style.width = `${pct}%`;
  els.progressHandle.style.left = `${pct}%`;
  els.currentTime.textContent = formatTime(progressMs);
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!currentState || !currentState.isPlaying) return;
    const elapsed = Date.now() - currentState.timestamp;
    const currentProgress = currentState.progressMs + elapsed;
    updateProgress(
      Math.min(currentProgress, currentState.durationMs),
      currentState.durationMs
    );
  }, 500);
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

async function withProcessing(fn) {
  if (isProcessing) return;
  isProcessing = true;
  try { await fn(); } finally { isProcessing = false; }
}

async function doLogout() {
  try {
    await sendMessage({ type: 'logout' });
    showView('login');
  } catch (err) { console.error('Logout error:', err); }
}

els.loginBtn.addEventListener('click', async () => {
  els.loginBtn.disabled = true;
  try {
    await sendMessage({ type: 'login' });
    await loadPlaybackState();
  } catch (err) { console.error('Login failed:', err); }
  finally { els.loginBtn.disabled = false; }
});

els.logoutBtn.addEventListener('click', doLogout);
els.logoutBtnNop.addEventListener('click', doLogout);

els.playPauseBtn.addEventListener('click', () => withProcessing(async () => {
  if (!currentState) return;
  const action = currentState.isPlaying ? 'pause' : 'play';
  const response = await sendMessage({ type: 'control', action });
  updateUI(response.state);
}));

els.prevBtn.addEventListener('click', () => withProcessing(async () => {
  const response = await sendMessage({ type: 'control', action: 'previous' });
  updateUI(response.state);
}));

els.nextBtn.addEventListener('click', () => withProcessing(async () => {
  const response = await sendMessage({ type: 'control', action: 'next' });
  updateUI(response.state);
}));

els.favoriteBtn.addEventListener('click', () => withProcessing(async () => {
  console.log('[popup] toggleFavorite clicked, currentState:', currentState?.trackId, 'isFav:', currentState?.isFavorite);
  try {
    const response = await sendMessage({ type: 'toggleFavorite' });
    console.log('[popup] toggleFavorite response:', JSON.stringify(response));
    updateUI(response.state);
  } catch (err) {
    console.error('[popup] toggleFavorite error:', err.message);
  }
}));

els.progressBar.addEventListener('click', async (e) => {
  if (!currentState) return;
  const rect = els.progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const positionMs = Math.round(ratio * currentState.durationMs);
  updateProgress(positionMs, currentState.durationMs);
  currentState.progressMs = positionMs;
  currentState.timestamp = Date.now();
  await sendMessage({ type: 'seek', positionMs });
});

async function loadPlaybackState() {
  try {
    const response = await sendMessage({ type: 'getPlaybackState' });
    updateUI(response.state);
  } catch (err) { showView('noPlayback'); }
}

async function init() {
  showView('loading');
  try {
    const response = await sendMessage({ type: 'isLoggedIn' });
    if (response.loggedIn) await loadPlaybackState();
    else showView('login');
  } catch (err) { showView('login'); }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.playbackState) updateUI(changes.playbackState.newValue);
});

init();
