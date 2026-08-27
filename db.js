const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

let blobModule = null;
try {
  blobModule = require('@vercel/blob');
} catch (_) {
  blobModule = null;
}

const DATA_FILE = path.join(__dirname, 'data.json');
const BLOB_KEY = 'nutri-delight-state.json';
const usesBlobStorage = Boolean(process.env.VERCEL) && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN) && blobModule;

let state = {
  admins: [],
  rewards: [],
  settings: {},
  initialized: false
};

async function loadFromBlob() {
  if (!usesBlobStorage) return null;
  try {
    const result = await blobModule.get(BLOB_KEY);
    if (!result || !result.url) return null;
    const res = await fetch(result.url);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

async function load() {
  try {
    const fromBlob = await loadFromBlob();
    if (fromBlob && typeof fromBlob === 'object') {
      state = {
        admins: Array.isArray(fromBlob.admins) ? fromBlob.admins : state.admins,
        rewards: Array.isArray(fromBlob.rewards) ? fromBlob.rewards : state.rewards,
        settings: fromBlob.settings || state.settings,
        initialized: fromBlob.initialized !== undefined ? Boolean(fromBlob.initialized) : state.initialized
      };
      return;
    }
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object') {
      state = {
        admins: Array.isArray(parsed.admins) ? parsed.admins : state.admins,
        rewards: Array.isArray(parsed.rewards) ? parsed.rewards : state.rewards,
        settings: parsed.settings || state.settings,
        initialized: parsed.initialized !== undefined ? Boolean(parsed.initialized) : state.initialized
      };
    }
  } catch (_) {
    if (!state.rewards) state.rewards = [];
    if (!state.admins) state.admins = [];
    if (!state.settings) state.settings = {};
  }
}

async function save() {
  if (usesBlobStorage) {
    try {
      await blobModule.put(BLOB_KEY, JSON.stringify(state, null, 2), {
        access: 'public',
        contentType: 'application/json'
      });
      return;
    } catch (e) {
      console.error('Blob storage save failed:', e);
    }
  }
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Local JSON file save failed:', e);
  }
}

function nextId(collection) {
  const max = collection.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  return max + 1;
}

async function init() {
  await load();

  let modified = false;

  if (!state.admins || state.admins.length === 0) {
    state.admins = [{ id: 1, username: 'admin', password_hash: await bcrypt.hash('adminpass', 10) }];
    modified = true;
  } else {
    const admin = state.admins.find(a => a.username === 'admin');
    if (!admin) {
      state.admins.unshift({ id: 1, username: 'admin', password_hash: await bcrypt.hash('adminpass', 10) });
      modified = true;
    } else if (!(await bcrypt.compare('adminpass', admin.password_hash))) {
      admin.password_hash = await bcrypt.hash('adminpass', 10);
      modified = true;
    }
  }

  if (!state.initialized && (!state.rewards || state.rewards.length === 0)) {
    state.rewards = [
      { id: 1, name: '🥤 FREE JUICE', probability: 10, active: 1 },
      { id: 2, name: '🎁 10% OFF', probability: 15, active: 1 },
      { id: 3, name: '🥗 FREE SALAD', probability: 10, active: 1 },
      { id: 4, name: '🍱 FREE TIFFIN', probability: 10, active: 1 },
      { id: 5, name: '🎉 20% OFF', probability: 5, active: 1 },
      { id: 6, name: '⭐ BETTER LUCK NEXT TIME', probability: 50, active: 1 }
    ];
    state.initialized = true;
    modified = true;
  } else {
    state.initialized = true;
  }

  if (!state.settings) {
    state.settings = {};
    modified = true;
  }
  if (!state.settings.logo) {
    state.settings.logo = '/assets/logo.svg';
    modified = true;
  }

  if (modified) {
    await save();
  }
}

module.exports = {
  init,
  findAdminAsync: async function (username) {
    await load();
    return state.admins.find(a => a.username === username) || null;
  },
  getActiveRewards: async function () {
    await load();
    return state.rewards.filter(r => Number(r.active) === 1);
  },
  getAllRewards: async function () {
    await load();
    return state.rewards;
  },
  addReward: async function (name, probability, active) {
    await load();
    const id = nextId(state.rewards);
    state.rewards.push({
      id,
      name: String(name),
      probability: Number(probability) || 0,
      active: active ? 1 : 0
    });
    await save();
    return id;
  },
  updateReward: async function (id, name, probability, active) {
    await load();
    const targetId = Number(id);
    const r = state.rewards.find(x => Number(x.id) === targetId);
    if (!r) return false;
    if (name !== undefined) r.name = String(name);
    if (probability !== undefined) r.probability = Number(probability) || 0;
    if (active !== undefined) r.active = active ? 1 : 0;
    await save();
    return true;
  },
  deleteReward: async function (id) {
    await load();
    const targetId = Number(id);
    state.rewards = state.rewards.filter(x => Number(x.id) !== targetId);
    await save();
    return true;
  },
  getSetting: async function (key) {
    await load();
    return state.settings ? state.settings[key] || null : null;
  },
  setSetting: async function (key, value) {
    await load();
    if (!state.settings) state.settings = {};
    state.settings[key] = value;
    await save();
    return true;
  }
};

// initialize immediately
init().catch(console.error);
