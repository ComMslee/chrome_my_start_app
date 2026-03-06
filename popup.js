// ============================================================
// Spotify Controller - Popup Logic
// ============================================================

const $ = (id) => document.getElementById(id);

const views = {
  loading: $('loading-view'),
  login: $('login-view'),
  player: $('player-view'),
  noPlayback: $('no-playback-view'),
};

const els = {
  loginBtn: $('login-btn'),
  albumArt: $('album-art'),
  trackName: $('track-name'),
  artistName: $('artist-name'),
  prevBtn: $('prev-btn'),
  playPauseBtn: $('play-pause-btn'),
  nextBtn: $('next-btn'),
  favoriteBtn: $('favorite-btn'),
  playIcon: $('play-icon'),
  pauseIcon: $('pause-icon'),
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

// ---- View Management ----

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

// ---- Formatting ----

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ---- UI Updates ----

function updateUI(state) {
  if (!state) {
    showView('noPlayback');
    stopProgressTimer();
    return;
  }

  showView('player');
  currentState = state;

  if (state.albumArt) els.albumArt.src = state.albumArt;
  els.trackName.textContent = state.trackName;
  els.artistName.textContent = state.artistName;

  // Play/Pause icon
  els.playIcon.classList.toggle('hidden', state.isPlaying);
  els.pauseIcon.classList.toggle('hidden', !state.isPlaying);

  // Favorite
  els.heartEmpty.classList.toggle('hidden', state.isFavorite);
  els.heartFilled.classList.toggle('hidden', !state.isFavorite);
  els.favoriteBtn.classList.toggle('active', state.isFavorite);

  // Progress
  updateProgress(state.progressMs, state.durationMs);
  els.totalTime.textContent = formatTime(state.durationMs);

  // Start/stop local progress timer
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

// ---- Local Progress Timer ----
// Smoothly update progress bar between polls

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

// ---- Message Helpers ----

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

// ---- Event Handlers ----

async function withProcessing(fn) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    await fn();
  } finally {
    isProcessing = false;
  }
}

async function doLogout() {
  try {
    await sendMessage({ type: 'logout' });
    showView('login');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

els.loginBtn.addEventListener('click', async () => {
  els.loginBtn.disabled = true;
  els.loginBtn.textContent = '연결 중...';
  try {
    await sendMessage({ type: 'login' });
    await loadPlaybackState();
  } catch (err) {
    console.error('Login failed:', err);
    els.loginBtn.textContent = '연결 실패 - 다시 시도';
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = 'Spotify 연결';
  }
});

els.logoutBtn.addEventListener('click', doLogout);
els.logoutBtnNop.addEventListener('click', doLogout);

els.playPauseBtn.addEventListener('click', () => withProcessing(async () => {
  if (!currentState) return;
  const action = currentState.isPlaying ? 'pause' : 'play';
  try {
    const response = await sendMessage({ type: 'control', action });
    updateUI(response.state);
  } catch (err) {
    console.error('Control error:', err);
  }
}));

els.prevBtn.addEventListener('click', () => withProcessing(async () => {
  try {
    const response = await sendMessage({ type: 'control', action: 'previous' });
    updateUI(response.state);
  } catch (err) {
    console.error('Control error:', err);
  }
}));

els.nextBtn.addEventListener('click', () => withProcessing(async () => {
  try {
    const response = await sendMessage({ type: 'control', action: 'next' });
    updateUI(response.state);
  } catch (err) {
    console.error('Control error:', err);
  }
}));

els.favoriteBtn.addEventListener('click', () => withProcessing(async () => {
  try {
    const response = await sendMessage({ type: 'toggleFavorite' });
    updateUI(response.state);
  } catch (err) {
    console.error('Favorite error:', err);
  }
}));

// ---- Progress Bar Seek ----

els.progressBar.addEventListener('click', async (e) => {
  if (!currentState) return;
  const rect = els.progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const positionMs = Math.round(ratio * currentState.durationMs);

  // Optimistic update
  updateProgress(positionMs, currentState.durationMs);
  currentState.progressMs = positionMs;
  currentState.timestamp = Date.now();

  try {
    await sendMessage({ type: 'seek', positionMs });
  } catch (err) {
    console.error('Seek error:', err);
  }
});

// ---- Initialization ----

async function loadPlaybackState() {
  try {
    const response = await sendMessage({ type: 'getPlaybackState' });
    updateUI(response.state);
  } catch (err) {
    console.error('Load state error:', err);
    showView('noPlayback');
  }
}

async function init() {
  showView('loading');
  try {
    const response = await sendMessage({ type: 'isLoggedIn' });
    if (response.loggedIn) {
      await loadPlaybackState();
    } else {
      showView('login');
    }
  } catch (err) {
    console.error('Init error:', err);
    showView('login');
  }
}

// Listen for storage changes to update UI in real-time
chrome.storage.onChanged.addListener((changes) => {
  if (changes.playbackState) {
    const newState = changes.playbackState.newValue;
    updateUI(newState);
  }
});

init();
