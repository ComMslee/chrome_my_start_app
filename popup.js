import { formatTime, formatRelativeTime } from './utils.js';

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
  refreshBtn: $('refresh-btn'),
  nextPollCountdown: $('next-poll-countdown'),
  recentBtn: $('recent-btn'),
  recentBtnNop: $('recent-btn-nop'),
  queueBtn: $('queue-btn'),
  searchBtn: $('search-btn'),
  listContainer: $('list-container'),
};

let currentState = null;
let countdownTimer = null;
let progressTimer = null;
let isProcessing = false;
let activeList = null; // 'queue' | 'recent' | 'search' | null
let prevTrackId = null;
let searchDebounceTimer = null;
let searchSeq = 0; // 오래된 검색 응답이 최신 결과를 덮어쓰지 않도록

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
  if (name === 'noPlayback') {
    startCountdown();
  } else {
    stopCountdown();
  }
}

function startCountdown() {
  stopCountdown();
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (els.nextPollCountdown) els.nextPollCountdown.textContent = '';
}

function updateCountdown() {
  chrome.alarms.get('spotify-poll', (alarm) => {
    if (!alarm || !els.nextPollCountdown) return;
    const remaining = Math.max(0, Math.ceil((alarm.scheduledTime - Date.now()) / 1000));
    els.nextPollCountdown.textContent = `${remaining}s`;
  });
}

function updateUI(state) {
  if (!state) {
    currentState = null;
    if (activeList === 'queue') closeList();
    showView('noPlayback');
    stopProgressTimer();
    return;
  }

  showView('player');
  currentState = state;

  els.trackName.innerHTML = `<span class="track-name-inner">${state.trackName}</span>`;
  els.artistName.textContent = state.artistName;

  // 트랙명이 넘치면 마퀴 애니메이션
  els.trackName.classList.remove('marquee');
  setTimeout(() => {
    const inner = els.trackName.querySelector('.track-name-inner');
    if (!inner) return;
    const overflow = inner.scrollWidth - els.trackName.clientWidth;
    if (overflow > 0) {
      els.trackName.style.setProperty('--marquee-offset', `-${overflow}px`);
      els.trackName.classList.add('marquee');
    }
  }, 100);

  els.playIcon.classList.toggle('hidden', state.isPlaying);
  els.pauseIcon.classList.toggle('hidden', !state.isPlaying);

  els.heartEmpty.classList.toggle('hidden', state.isFavorite);
  els.heartFilled.classList.toggle('hidden', !state.isFavorite);
  els.favoriteBtn.classList.toggle('active', state.isFavorite);

  updateProgress(state.progressMs, state.durationMs);
  els.totalTime.textContent = formatTime(state.durationMs);

  // 곡이 바뀌면 열려있는 큐/최근재생 리스트 갱신 (검색 결과는 곡 변경과 무관하므로 제외)
  if (prevTrackId && state.trackId !== prevTrackId) {
    if (activeList === 'queue' || activeList === 'recent') fetchList(activeList);
  }
  prevTrackId = state.trackId;

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

    // 곡 끝 감지 → 즉시 새 상태 요청
    if (currentProgress >= currentState.durationMs) {
      stopProgressTimer();
      loadPlaybackState();
      return;
    }

    updateProgress(currentProgress, currentState.durationMs);
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
    closeList();
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

els.refreshBtn.addEventListener('click', async () => {
  els.refreshBtn.classList.add('spinning');
  els.refreshBtn.disabled = true;
  try {
    await loadPlaybackState();
  } finally {
    els.refreshBtn.classList.remove('spinning');
    els.refreshBtn.disabled = false;
  }
});

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
  try {
    const response = await sendMessage({ type: 'toggleFavorite' });
    updateUI(response.state);
    // 열려있는 이전 리스트/검색 결과에서 같은 트랙의 ♥ DOM 직접 갱신
    if (activeList === 'recent' || activeList === 'search') {
      const btn = els.listContainer.querySelector(`.list-fav[data-track-id="${response.state.trackId}"]`);
      if (btn) {
        btn.dataset.fav = String(response.state.isFavorite);
        btn.classList.toggle('active', response.state.isFavorite);
      }
    }
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

// ---- List (Queue / Recent) ----

function closeList() {
  activeList = null;
  clearTimeout(searchDebounceTimer);
  searchSeq++; // 진행 중이던 검색 응답 무효화
  els.listContainer.classList.add('hidden');
  els.listContainer.innerHTML = '';
  els.recentBtn.classList.remove('active');
  els.recentBtnNop.classList.remove('active');
  els.queueBtn.classList.remove('active');
  els.searchBtn.classList.remove('active');
}

function renderList(items, emptyText, type) {
  els.listContainer.innerHTML = '';
  if (!items || items.length === 0) {
    els.listContainer.innerHTML = `<div class="list-empty">${emptyText}</div>`;
  } else {
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      const index = `<span class="list-index">${idx + 1}</span>`;

      if (type === 'recent' && item.trackId) {
        const favClass = item.isFavorite ? 'list-fav active' : 'list-fav';
        const playedAt = formatRelativeTime(item.playedAt);
        div.innerHTML = `${index}<button class="${favClass}" data-track-id="${item.trackId}" data-fav="${item.isFavorite}" title="즐겨찾기">♥</button><span class="list-track">${item.name}</span><span class="list-artist">${item.artist}</span><span class="list-played-at">${playedAt}</span>`;
      } else {
        div.innerHTML = `${index}<span class="list-track">${item.name}</span><span class="list-artist">${item.artist}</span>`;
      }

      // 대기열 곡 클릭 → 바로 재생
      if (type === 'queue' && item.uri) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', async () => {
          div.style.opacity = '0.5';
          div.style.pointerEvents = 'none';
          try {
            const res = await sendMessage({ type: 'playTrack', uri: item.uri });
            if (res.state) updateUI(res.state);
            closeList();
          } catch (err) {
            console.error('[popup] playTrack error:', err);
            div.style.opacity = '1';
            div.style.pointerEvents = '';
          }
        });
      }

      els.listContainer.appendChild(div);
    });

    // 즐겨찾기 토글 이벤트
    if (type === 'recent') {
      els.listContainer.querySelectorAll('.list-fav').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const trackId = btn.dataset.trackId;
          const isFav = btn.dataset.fav === 'true';
          btn.disabled = true;
          try {
            const res = await sendMessage({ type: 'toggleRecentFavorite', trackId, isFavorite: isFav });
            if (res.success) {
              btn.dataset.fav = String(res.newState);
              btn.classList.toggle('active', res.newState);
            }
          } catch (err) {
            console.error('[popup] toggleRecentFavorite error:', err);
          } finally {
            btn.disabled = false;
          }
        });
      });
    }
  }
  els.listContainer.classList.remove('hidden');
}

async function fetchList(type) {
  try {
    if (type === 'queue') {
      const res = await sendMessage({ type: 'getQueue' });
      if (activeList === 'queue') renderList(res.queue, '다음 리스트가 비어있습니다', 'queue');
    } else {
      const res = await sendMessage({ type: 'getRecentlyPlayed' });
      if (activeList === 'recent') renderList(res.items, '이전 리스트가 없습니다', 'recent');
    }
  } catch (err) {
    console.error('[popup] fetchList error:', err);
    if (activeList === type) {
      els.listContainer.innerHTML = `<div class="list-empty">불러오기 실패</div>`;
    }
  }
}

async function toggleList(type) {
  if (activeList === type) {
    closeList();
    return;
  }
  activeList = type;
  els.recentBtn.classList.toggle('active', type === 'recent');
  els.recentBtnNop.classList.toggle('active', type === 'recent');
  els.queueBtn.classList.toggle('active', type === 'queue');
  els.searchBtn.classList.toggle('active', type === 'search');
  els.listContainer.classList.remove('hidden');

  if (type === 'search') {
    openSearch();
    return;
  }
  els.listContainer.innerHTML = '<div class="list-empty">...</div>';
  await fetchList(type);
}

els.queueBtn.addEventListener('click', () => toggleList('queue'));
els.recentBtn.addEventListener('click', () => toggleList('recent'));
els.recentBtnNop.addEventListener('click', () => toggleList('recent'));
els.searchBtn.addEventListener('click', () => toggleList('search'));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.playbackState) updateUI(changes.playbackState.newValue);
});

// ---- Search ----

function openSearch() {
  els.listContainer.innerHTML = `
    <input type="text" id="search-input" class="search-input" placeholder="곡, 아티스트 검색" autocomplete="off">
    <div id="search-results"></div>
  `;
  const input = els.listContainer.querySelector('#search-input');
  input.focus();
  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = input.value;
    if (!query.trim()) {
      renderSearchResults([]);
      return;
    }
    searchDebounceTimer = setTimeout(() => performSearch(query), 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      performSearch(input.value);
    }
  });
  renderSearchResults([]);
}

async function performSearch(query) {
  const seq = ++searchSeq;
  const results = els.listContainer.querySelector('#search-results');
  if (results) results.innerHTML = `<div class="list-empty">검색 중...</div>`;
  try {
    const res = await sendMessage({ type: 'search', query });
    if (activeList !== 'search' || seq !== searchSeq) return; // 검색창이 닫혔거나 최신 요청이 아니면 무시
    renderSearchResults(res.items);
  } catch (err) {
    console.error('[popup] search error:', err);
    if (activeList === 'search' && seq === searchSeq) {
      const el = els.listContainer.querySelector('#search-results');
      if (el) el.innerHTML = `<div class="list-empty">검색 실패</div>`;
    }
  }
}

function renderSearchResults(items) {
  const results = els.listContainer.querySelector('#search-results');
  if (!results) return;
  results.innerHTML = '';
  if (!items || items.length === 0) {
    results.innerHTML = `<div class="list-empty">검색어를 입력하세요</div>`;
    return;
  }
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    const favClass = item.isFavorite ? 'list-fav active' : 'list-fav';
    div.innerHTML = `<span class="list-index">${idx + 1}</span><button class="${favClass}" data-track-id="${item.trackId}" data-fav="${item.isFavorite}" title="즐겨찾기">♥</button><span class="list-track">${item.name}</span><span class="list-artist">${item.artist}</span><div class="search-item-actions"><button class="search-action-btn play" title="바로 재생">재생</button><button class="search-action-btn queue" title="다음 재생에 추가">+대기열</button></div>`;

    const favBtn = div.querySelector('.list-fav');
    const playBtn = div.querySelector('.play');
    const queueBtn = div.querySelector('.queue');

    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const trackId = favBtn.dataset.trackId;
      const isFav = favBtn.dataset.fav === 'true';
      favBtn.disabled = true;
      try {
        const res = await sendMessage({ type: 'toggleRecentFavorite', trackId, isFavorite: isFav });
        if (res.success) {
          favBtn.dataset.fav = String(res.newState);
          favBtn.classList.toggle('active', res.newState);
        }
      } catch (err) {
        console.error('[popup] toggleFavorite(search) error:', err);
      } finally {
        favBtn.disabled = false;
      }
    });

    playBtn.addEventListener('click', async () => {
      playBtn.disabled = true;
      queueBtn.disabled = true;
      try {
        const res = await sendMessage({ type: 'playTrack', uri: item.uri });
        if (res.state) updateUI(res.state);
        closeList();
      } catch (err) {
        console.error('[popup] playTrack error:', err);
        playBtn.disabled = false;
        queueBtn.disabled = false;
      }
    });

    queueBtn.addEventListener('click', async () => {
      playBtn.disabled = true;
      queueBtn.disabled = true;
      const originalText = queueBtn.textContent;
      try {
        const res = await sendMessage({ type: 'addToQueue', uri: item.uri });
        queueBtn.textContent = res.success ? '추가됨' : '실패';
      } catch (err) {
        console.error('[popup] addToQueue error:', err);
        queueBtn.textContent = '실패';
      } finally {
        playBtn.disabled = false;
        setTimeout(() => {
          queueBtn.textContent = originalText;
          queueBtn.disabled = false;
        }, 1200);
      }
    });

    results.appendChild(div);
  });
}

init();
