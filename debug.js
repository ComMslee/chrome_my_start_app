const output = document.getElementById('output');

function log(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

function send(msg) {
  chrome.runtime.sendMessage(msg, (response) => {
    if (chrome.runtime.lastError) {
      log({ error: chrome.runtime.lastError.message });
    } else {
      log(response);
    }
  });
}

document.getElementById('btn-debug').onclick = () => send({ type: 'debugInfo' });
document.getElementById('btn-reset').onclick = () => send({ type: 'resetFavoriteDisabled' });
document.getElementById('btn-state').onclick = () => send({ type: 'getPlaybackState' });
document.getElementById('btn-toggle').onclick = () => send({ type: 'toggleFavorite' });
document.getElementById('btn-logout').onclick = () => send({ type: 'logout' });
document.getElementById('btn-login').onclick = () => send({ type: 'login' });
document.getElementById('btn-test-contains').onclick = () => send({ type: 'testContains' });
