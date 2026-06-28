/* =============================================
   FF Tools Suite — app.js
   Full client-side logic (auth, URL checker, link maker)
   ============================================= */

// ─────────────────────────────────────────────
// AUTH — localStorage-based user store
// ─────────────────────────────────────────────
const AUTH_KEY    = 'fftool_users';
const SESSION_KEY = 'fftool_session';
let authMode      = 'signin'; // 'signin' | 'register'

function getUsers() {
  return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
}
function saveUsers(u) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(u));
}
function getSession() {
  return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
}
function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

// Bootstrap on page load
window.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (session && session.email) {
    loginSuccess(session.email);
  }
  renderHistory();
});

function showAuth(mode) {
  authMode = mode || 'signin';
  updateAuthUI();
  document.getElementById('authModal').classList.remove('hidden');
}
function closeAuth() {
  document.getElementById('authModal').classList.add('hidden');
  document.getElementById('authError').classList.add('hidden');
}
function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'register' : 'signin';
  updateAuthUI();
}
function updateAuthUI() {
  const isLogin = authMode === 'signin';
  document.getElementById('authTitle').innerHTML      = isLogin
    ? '<i class="fa-solid fa-lock"></i> Sign In'
    : '<i class="fa-solid fa-user-plus"></i> Register';
  document.getElementById('authSubtitle').textContent  = isLogin
    ? 'Access your FF Tools Suite'
    : 'Create a free account';
  document.getElementById('authBtnLabel').textContent  = isLogin ? 'Sign In' : 'Register';
  document.getElementById('authSwitchText').textContent = isLogin
    ? "Don't have an account?"
    : 'Already have an account?';
  document.getElementById('authSwitchLink').textContent = isLogin ? 'Register' : 'Sign In';
  document.getElementById('authError').classList.add('hidden');
}
function doAuth() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  errEl.classList.add('hidden');

  if (!email || !password) {
    errEl.textContent = 'Please enter email and password.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Enter a valid email address.';
    errEl.classList.remove('hidden');
    return;
  }
  const users = getUsers();
  if (authMode === 'register') {
    if (users[email]) {
      errEl.textContent = 'An account with this email already exists.';
      errEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.';
      errEl.classList.remove('hidden');
      return;
    }
    users[email] = { password };
    saveUsers(users);
    showToast('Account created! Welcome 🎉', 'success');
  } else {
    if (!users[email] || users[email].password !== password) {
      errEl.textContent = 'Invalid email or password.';
      errEl.classList.remove('hidden');
      return;
    }
  }
  saveSession({ email });
  loginSuccess(email);
  closeAuth();
}
function loginSuccess(email) {
  document.getElementById('gateOverlay').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('navUserEmail').textContent = email;
  document.getElementById('signOutBtn').classList.remove('hidden');
  document.getElementById('signInNavBtn').classList.add('hidden');
}
function signOut() {
  saveSession(null);
  document.getElementById('gateOverlay').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('navUserEmail').textContent = '';
  document.getElementById('signOutBtn').classList.add('hidden');
  document.getElementById('signInNavBtn').classList.remove('hidden');
  showToast('Signed out successfully.', 'info');
}
function togglePw() {
  const inp  = document.getElementById('authPassword');
  const icon = document.getElementById('pwEyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
}

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

// ─────────────────────────────────────────────
// TOOL 1 — URL CHECKER
// ─────────────────────────────────────────────
let loopIntervalMins = 0;
let loopTimer        = null;
let loopCountdownTimer = null;
let loopSecondsLeft  = 0;
let currentSessionId = null;

function setInterval_(mins, btn) {
  loopIntervalMins = mins;
  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function parseWords() {
  const raw = document.getElementById('wordsList').value;
  // split by comma or newline
  return raw.split(/[\n,]+/).map(w => w.trim()).filter(Boolean);
}

async function startCheck() {
  const template = document.getElementById('urlTemplate').value.trim();
  const words    = parseWords();

  if (!template) {
    showToast('Please enter a URL template.', 'error');
    return;
  }
  if (!template.includes('(Word)')) {
    showToast('Template must contain (Word) placeholder.', 'error');
    return;
  }
  if (words.length === 0) {
    showToast('Please enter at least one word.', 'error');
    return;
  }

  // Request browser notification permission if not granted
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  // Generate a session ID
  currentSessionId = randomSessionName();
  const sessionData = {
    id:       currentSessionId,
    template: template,
    words:    words,
    email:    document.getElementById('notifyEmail').value.trim(),
    results:  [],
    checkedAt: new Date().toISOString(),
    loopMins: loopIntervalMins
  };

  await runCheck(sessionData, true);

  // If loop enabled, start loop
  if (loopIntervalMins > 0) {
    startLoop(sessionData);
  }
}

async function runCheck(sessionData, isNew) {
  const { template, words } = sessionData;

  document.getElementById('resultsList').innerHTML = '';
  document.getElementById('resultsStats').textContent = '';

  const progressWrap = document.getElementById('resultsProgress');
  progressWrap.classList.remove('hidden');
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressText').textContent = `Checking 0 / ${words.length}…`;

  const startBtn = document.getElementById('startCheckBtn');
  startBtn.disabled = true;
  startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking…';

  let results = [];

  try {
    // Use the /api/check serverless function (Python backend)
    const response = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, words })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    results = data.results || [];

  } catch (err) {
    // Fallback: check directly in browser (CORS may block but we try)
    console.warn('API not available, falling back to browser-side check:', err.message);
    results = await browserFallbackCheck(template, words, (done) => {
      const pct = Math.round((done / words.length) * 100);
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('progressText').textContent = `Checking ${done} / ${words.length}…`;
    });
  }

  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('progressText').textContent = `Done! Checked ${words.length} words.`;

  const working = results.filter(r => r.working);
  renderResults(results);

  document.getElementById('resultsStats').innerHTML =
    `<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> ${working.length} working</span>
     &nbsp;/&nbsp;
     <span style="color:#ef4444"><i class="fa-solid fa-circle-xmark"></i> ${results.length - working.length} failed</span>`;

  // Save session to history
  sessionData.results  = results;
  sessionData.checkedAt = new Date().toISOString();
  saveSessionHistory(sessionData);

  // Send notifications if working links found
  if (working.length > 0) {
    sendNotifications(sessionData.email, working);
  }

  startBtn.disabled = false;
  startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Check Now';
}

// Browser-side fallback (image ping method — no CORS issues for images)
function browserFallbackCheck(template, words, onProgress) {
  return new Promise(resolve => {
    const results = [];
    let done = 0;

    if (words.length === 0) {
      resolve([]);
      return;
    }

    const BATCH = 20; // concurrent checks

    function checkWord(word) {
      return new Promise(res => {
        const url = template.replace('(Word)', encodeURIComponent(word.trim()));
        const img = new Image();
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            res({ word, url, status: 0, working: false });
          }
        }, 5000);
        img.onload = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            res({ word, url, status: 200, working: true });
          }
        };
        img.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            res({ word, url, status: 404, working: false });
          }
        };
        img.src = url;
      });
    }

    // Process in batches
    async function processBatch(batchWords) {
      const batchResults = await Promise.all(batchWords.map(w => checkWord(w)));
      results.push(...batchResults);
      done += batchWords.length;
      onProgress(done);
    }

    async function runAll() {
      for (let i = 0; i < words.length; i += BATCH) {
        await processBatch(words.slice(i, i + BATCH));
      }
      resolve(results);
    }

    runAll();
  });
}

function renderResults(results) {
  const list = document.getElementById('resultsList');
  if (!results || results.length === 0) {
    list.innerHTML = `<div class="results-empty"><i class="fa-solid fa-search"></i><p>No results.</p></div>`;
    return;
  }

  // Sort: working first
  const sorted = [...results].sort((a, b) => (b.working ? 1 : 0) - (a.working ? 1 : 0));

  list.innerHTML = sorted.map(r => `
    <div class="result-item">
      <div class="result-url">
        ${r.working
          ? `<a href="${escHtml(r.url)}" target="_blank" rel="noopener" style="color:var(--success);text-decoration:none;">${escHtml(r.url)}</a>`
          : `<span style="opacity:0.6">${escHtml(r.url)}</span>`}
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem">Word: <b>${escHtml(r.word)}</b></div>
      </div>
      <div class="result-status ${r.working ? 'status-working' : 'status-failed'}">
        <i class="fa-solid ${r.working ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
        ${r.working ? 'Working' : `${r.status || 'Timeout'}`}
      </div>
    </div>
  `).join('');
}

function sendNotifications(email, working) {
  // Browser notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🔥 FF Tools — Working Link Found!', {
      body: `Working! Working! New Working Link Found Check Out!\n${working[0].url}`,
      icon: 'https://cdn-icons-png.flaticon.com/512/5229/5229419.png'
    });
  }

  // Email notification (mailto fallback — real email requires a backend service like SendGrid)
  if (email) {
    const subject = encodeURIComponent('Working! Working! New Working Link Found Check Out!');
    const body    = encodeURIComponent(
      `Working links found:\n\n${working.map(r => r.url).join('\n')}\n\nMessage: Working! Working! New Working Link Found Check Out!`
    );
    // Open mailto silently (opens mail client)
    const a = document.createElement('a');
    a.href  = `mailto:${email}?subject=${subject}&body=${body}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  showToast(`✅ ${working.length} working link(s) found! Notification sent.`, 'success');
}

// ─────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────
function startLoop(sessionData) {
  stopLoop();
  const secs = loopIntervalMins * 60;
  loopSecondsLeft = secs;

  const statusEl    = document.getElementById('loopStatus');
  const countdownEl = document.getElementById('loopCountdown');
  statusEl.classList.remove('hidden');
  updateCountdownDisplay(countdownEl, loopSecondsLeft);

  loopCountdownTimer = setInterval(() => {
    loopSecondsLeft--;
    if (loopSecondsLeft <= 0) {
      loopSecondsLeft = secs;
      runCheck(sessionData, false);
    }
    updateCountdownDisplay(countdownEl, loopSecondsLeft);
  }, 1000);
}
function updateCountdownDisplay(el, secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}
function stopLoop() {
  if (loopCountdownTimer) {
    clearInterval(loopCountdownTimer);
    loopCountdownTimer = null;
  }
  document.getElementById('loopStatus').classList.add('hidden');
}

function clearChecker() {
  stopLoop();
  document.getElementById('urlTemplate').value = '';
  document.getElementById('wordsList').value    = '';
  document.getElementById('notifyEmail').value  = '';
  document.getElementById('resultsList').innerHTML =
    `<div class="results-empty"><i class="fa-solid fa-search"></i><p>No results yet. Start a check above.</p></div>`;
  document.getElementById('resultsStats').textContent = '';
  document.getElementById('resultsProgress').classList.add('hidden');
  document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.interval-btn[data-mins="0"]').classList.add('active');
  loopIntervalMins = 0;
}

// ─────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────
const HISTORY_KEY = 'fftool_history';

function getHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}
function saveSessionHistory(session) {
  const history = getHistory();
  // Update existing or push new
  const idx = history.findIndex(s => s.id === session.id);
  if (idx !== -1) history[idx] = session;
  else history.unshift(session); // newest first
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  renderHistory();
}
function clearHistory() {
  if (!confirm('Clear all saved sessions?')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}
function renderHistory() {
  const history = getHistory();
  const el      = document.getElementById('historyList');
  if (!history.length) {
    el.innerHTML = `<div class="results-empty"><i class="fa-solid fa-history"></i><p>No saved sessions yet.</p></div>`;
    return;
  }
  el.innerHTML = history.map(s => {
    const working  = (s.results || []).filter(r => r.working).length;
    const total    = (s.results || []).length;
    const date     = new Date(s.checkedAt).toLocaleString();
    return `
      <div class="history-item">
        <div class="history-info">
          <h4><i class="fa-solid fa-folder"></i> ${escHtml(s.id)}</h4>
          <div class="history-meta">
            <span><i class="fa-solid fa-calendar"></i> ${escHtml(date)}</span>
            <span><i class="fa-solid fa-circle-check" style="color:var(--success)"></i> ${working}/${total} working</span>
            <span><i class="fa-solid fa-repeat"></i> Loop: ${s.loopMins ? s.loopMins + ' min' : 'None'}</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn btn-sm btn-outline" onclick="rerunSession('${escHtml(s.id)}')">
            <i class="fa-solid fa-rotate-right"></i> Re-check
          </button>
          <button class="btn btn-sm btn-outline" onclick="loadSession('${escHtml(s.id)}')">
            <i class="fa-solid fa-eye"></i> View
          </button>
          <button class="btn btn-sm" style="background:#ef444422;color:#ef4444;border:1px solid #ef4444" onclick="deleteSession('${escHtml(s.id)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}
function loadSession(id) {
  const s = getHistory().find(s => s.id === id);
  if (!s) return;
  document.getElementById('urlTemplate').value = s.template || '';
  document.getElementById('wordsList').value    = (s.words || []).join('\n');
  renderResults(s.results || []);
  const working = (s.results || []).filter(r => r.working).length;
  document.getElementById('resultsStats').innerHTML =
    `<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> ${working} working</span>
     &nbsp;/&nbsp;
     <span style="color:#ef4444"><i class="fa-solid fa-circle-xmark"></i> ${(s.results || []).length - working} failed</span>`;
  showToast(`Loaded session: ${id}`, 'info');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function rerunSession(id) {
  const s = getHistory().find(s => s.id === id);
  if (!s) return;
  document.getElementById('urlTemplate').value = s.template || '';
  document.getElementById('wordsList').value    = (s.words || []).join('\n');
  currentSessionId = s.id;
  await runCheck(s, false);
}
function deleteSession(id) {
  const history = getHistory().filter(s => s.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

// ─────────────────────────────────────────────
// TOOL 2 — LINK MAKER
// ─────────────────────────────────────────────
let sourceMode  = 'upload';
let fileExt     = 'jpg';
let currentFile = null;

function setSource(mode, btn) {
  sourceMode = mode;
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('uploadMode').classList.toggle('hidden', mode !== 'upload');
  document.getElementById('linkMode').classList.toggle('hidden',   mode !== 'link');
  updateLinkPreview();
}
function setFormat(fmt, btn) {
  fileExt = fmt;
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateLinkPreview();
}
function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) handleFile(file);
}
function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Only image files (PNG/JPG) are supported.', 'error');
    return;
  }
  currentFile = file;

  // Auto-fill filename
  const nameParts = file.name.split('.');
  nameParts.pop();
  const baseName = nameParts.join('.').replace(/\s+/g, '_');
  document.getElementById('fileNameInput').value = baseName;

  // Detect extension
  if (file.type === 'image/png') {
    setFormat('png', document.querySelector('.fmt-btn[data-fmt="png"]'));
  } else {
    setFormat('jpg', document.querySelector('.fmt-btn[data-fmt="jpg"]'));
  }

  // Show preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    const previewEl = document.getElementById('filePreview');
    previewEl.classList.remove('hidden');
    const sizeKb = (file.size / 1024).toFixed(1);
    previewEl.innerHTML = `
      <img src="${ev.target.result}" class="preview-img" alt="preview" />
      <div class="preview-details">
        <div class="preview-name">${escHtml(file.name)}</div>
        <div class="preview-size">${sizeKb} KB</div>
      </div>
      <button class="preview-remove" onclick="removeFile()"><i class="fa-solid fa-xmark"></i></button>`;
    updateLinkPreview();
  };
  reader.readAsDataURL(file);
}
function removeFile() {
  currentFile = null;
  document.getElementById('filePreview').classList.add('hidden');
  document.getElementById('filePreview').innerHTML = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('fileNameInput').value = '';
  updateLinkPreview();
}
function handleLinkInput() {
  const url = document.getElementById('linkInput').value.trim();
  if (url) {
    // Try to extract filename from URL
    try {
      const parts = new URL(url).pathname.split('/');
      const lastPart = parts[parts.length - 1].split('.')[0];
      if (lastPart) document.getElementById('fileNameInput').value = lastPart;
    } catch {}
  }
  updateLinkPreview();
}
function buildLink() {
  const baseDomain = document.getElementById('baseDomainInput').value.trim().replace(/\/$/, '');
  const fileName   = document.getElementById('fileNameInput').value.trim();
  const pathType   = document.querySelector('input[name="pathType"]:checked')?.value || '1';
  if (!fileName) return '';
  const pathMap = {
    '1': 'common/Local/IND/config',
    '2': 'common/OB54/CSH'
  };
  const path = pathMap[pathType] || pathMap['1'];
  return `${baseDomain}/${path}/${fileName}.${fileExt}`;
}
function updateLinkPreview() {
  const url     = buildLink();
  const previewEl = document.getElementById('linkPreviewText');
  previewEl.textContent = url || '— enter details to preview —';
}
function generateLink() {
  const url = buildLink();
  if (!url) {
    showToast('Please enter a file name.', 'error');
    return;
  }
  const wrap = document.getElementById('generatedLinksWrap');
  // Remove empty state
  wrap.querySelectorAll('.results-empty').forEach(el => el.remove());

  const id  = 'gl_' + Date.now();
  const div = document.createElement('div');
  div.className = 'gen-link-item';
  div.id        = id;

  const pathType  = document.querySelector('input[name="pathType"]:checked')?.value || '1';
  const pathLabel = pathType === '1' ? 'Path 1 — common/Local/IND/config' : 'Path 2 — common/OB54/CSH';

  div.innerHTML = `
    <div class="gen-link-header">
      <span class="gen-link-title"><i class="fa-solid fa-link"></i> ${escHtml(pathLabel)}</span>
      <div class="gen-link-actions">
        <button title="Copy" onclick="copyLink('${escHtml(url)}', this)"><i class="fa-solid fa-copy"></i></button>
        <a href="${escHtml(url)}" target="_blank" rel="noopener" title="Open"><i class="fa-solid fa-external-link-alt"></i></a>
        <button title="Delete" onclick="document.getElementById('${id}').remove()"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
    <div class="gen-link-url">${escHtml(url)}</div>`;
  wrap.prepend(div);
  showToast('Link generated! 🔗', 'success');
}
function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    }, 1500);
  });
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
const ADJECTIVES = ['swift','blazing','silent','golden','hidden','cosmic','electric','frozen','phantom','crimson','savage','elite','ghost','turbo','hyper'];
const NOUNS      = ['falcon','tiger','storm','volt','blaze','reaper','shadow','viper','nova','knight','pulse','zenith','orbit','spike','flash'];
function randomSessionName() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const icons  = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const colors = { success: 'var(--success)', error: '#ef4444', info: 'var(--secondary)' };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" style="color:${colors[type]||colors.info}"></i> ${escHtml(msg)}`;
  toast.style.borderLeftColor = colors[type] || colors.info;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 350);
  }, 3500);
}
