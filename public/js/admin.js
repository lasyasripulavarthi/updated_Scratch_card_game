(async function () {
  const loginForm    = document.getElementById('loginForm');
  const usernameEl   = document.getElementById('username');
  const passwordEl   = document.getElementById('password');
  const loginSection = document.getElementById('loginSection');
  const dashboard    = document.getElementById('dashboard');
  const addForm      = document.getElementById('addForm');
  const rname        = document.getElementById('rname');
  const rprob        = document.getElementById('rprob');
  const ractive      = document.getElementById('ractive');
  const rewardsList  = document.getElementById('rewardsList');
  const logoutBtn    = document.getElementById('logoutBtn');
  const logoFile     = document.getElementById('logoFile');
  const uploadLogoBtn = document.getElementById('uploadLogoBtn');
  const logoPreview  = document.getElementById('logoPreview');
  const currentLogo  = document.getElementById('currentLogo');

  let token = localStorage.getItem('nd_token');

  // On page load, verify existing token before showing dashboard
  if (token) {
    const ok = await verifyToken();
    if (ok) showDashboard();
    else    showLogin();
  }

  /* ── Token verification: hit a protected endpoint lightly ── */
  async function verifyToken() {
    try {
      const res = await fetch('/api/admin/rewards', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.status === 401 || res.status === 403) {
        clearToken();
        return false;
      }
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  function clearToken() {
    localStorage.removeItem('nd_token');
    token = null;
  }

  /* ── Login ── */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameEl.value, password: passwordEl.value })
      });
      if (!res.ok) {
        alert('Login failed. Please check your credentials.');
        return;
      }
      const j = await res.json();
      token = j.token;
      localStorage.setItem('nd_token', token);
      showDashboard();
    } catch (err) {
      alert('Network error. Please try again.');
    }
  });

  /* ── Logout ── */
  logoutBtn.addEventListener('click', () => {
    clearToken();
    showLogin();
  });

  /* ── Add reward ── */
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: rname.value,
      probability: Number(rprob.value) || 0,
      active: ractive.checked ? 1 : 0
    };
    const res = await authFetch('/api/admin/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res) return;
    if (!res.ok) { alert('Failed to add reward.'); return; }
    rname.value = ''; rprob.value = ''; ractive.checked = true;
    loadRewards();
  });

  /* ── Load rewards ── */
  async function loadRewards() {
    const res = await authFetch('/api/admin/rewards');
    if (!res) return; // authFetch already redirected to login on 401
    if (!res.ok) { alert('Failed to load rewards.'); return; }
    const rows = await res.json();
    rewardsList.innerHTML = '';
    rows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'reward-row';
      div.innerHTML = `
        <input class="rname" value="${escHtml(r.name)}" />
        <input class="rprob" type="number" value="${r.probability}" />
        <label>Active <input class="ractive" type="checkbox" ${r.active ? 'checked' : ''} /></label>
        <button class="save">Save</button>
        <button class="del">Delete</button>`;
      rewardsList.appendChild(div);

      div.querySelector('.save').addEventListener('click', async () => {
        const body = {
          name:        div.querySelector('.rname').value,
          probability: Number(div.querySelector('.rprob').value) || 0,
          active:      div.querySelector('.ractive').checked ? 1 : 0
        };
        const r2 = await authFetch('/api/admin/rewards/' + r.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (r2 && r2.ok) loadRewards();
        else if (r2) alert('Save failed.');
      });

      div.querySelector('.del').addEventListener('click', async () => {
        if (!confirm('Delete this reward?')) return;
        const r2 = await authFetch('/api/admin/rewards/' + r.id, { method: 'DELETE' });
        if (r2 && r2.ok) loadRewards();
        else if (r2) alert('Delete failed.');
      });
    });
  }

  /* ── Logo upload ── */
  logoFile.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) { logoPreview.style.display = 'none'; return; }
    logoPreview.src = URL.createObjectURL(f);
    logoPreview.style.display = 'inline-block';
  });

  uploadLogoBtn.addEventListener('click', async () => {
    const f = logoFile.files[0];
    if (!f) { alert('Please select a file first.'); return; }
    const fd = new FormData();
    fd.append('logo', f);
    const res = await authFetch('/api/admin/logo', { method: 'POST', body: fd });
    if (!res) return;
    if (!res.ok) { alert('Upload failed.'); return; }
    currentLogo.src = '/api/logo?t=' + Date.now();
    logoPreview.style.display = 'none';
    logoFile.value = '';
    alert('Logo updated successfully.');
  });

  /* ── Helper: authenticated fetch, auto-logout on 401 ── */
  async function authFetch(url, opts = {}) {
    if (!token) { showLogin(); return null; }
    const headers = { ...(opts.headers || {}), 'Authorization': 'Bearer ' + token };
    try {
      const res = await fetch(url, { ...opts, headers });
      if (res.status === 401 || res.status === 403) {
        clearToken();
        showLogin();
        return null;
      }
      return res;
    } catch (_) {
      return null;
    }
  }

  /* ── HTML escape helper ── */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── UI switches ── */
  function showDashboard() {
    loginSection.style.display = 'none';
    dashboard.style.display    = 'block';
    loadRewards();
  }

  function showLogin() {
    dashboard.style.display    = 'none';
    loginSection.style.display = 'block';
    passwordEl.value           = '';
  }

})();
