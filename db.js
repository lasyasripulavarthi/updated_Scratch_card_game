const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, 'data.json');

let state = {
  admins: [],
  rewards: [],
  settings: {}
};

async function load() {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    state = JSON.parse(txt);
  } catch (e) {
    // initialize defaults
    state = { admins: [], rewards: [], settings: {} };
  }
}

async function save() {
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function nextId(collection) {
  const max = collection.reduce((m, r) => Math.max(m, r.id || 0), 0);
  return max + 1;
}

async function init() {
  await load();
  if (!state.admins || state.admins.length === 0) {
    const hash = await bcrypt.hash('adminpass', 10);
    state.admins = [{ id: 1, username: 'admin', password_hash: hash }];
  }
  if (!state.rewards || state.rewards.length === 0) {
    state.rewards = [
      { id: 1, name: '🥤 FREE JUICE', probability: 10, active: 1 },
      { id: 2, name: '🎁 10% OFF', probability: 15, active: 1 },
      { id: 3, name: '🥗 FREE SALAD', probability: 10, active: 1 },
      { id: 4, name: '🍱 FREE TIFFIN', probability: 10, active: 1 },
      { id: 5, name: '🎉 20% OFF', probability: 5, active: 1 },
      { id: 6, name: '⭐ BETTER LUCK NEXT TIME', probability: 50, active: 1 }
    ];
  }
  if (!state.settings) state.settings = {};
  if (!state.settings.logo) state.settings.logo = '/assets/logo.png';
  await save();
}

// API
module.exports = {
  init,
  findAdminAsync: async function (username) {
    await load();
    return state.admins.find(a => a.username === username) || null;
  },
  getActiveRewards: async function () {
    await load();
    return state.rewards.filter(r => r.active === 1);
  },
  getAllRewards: async function () {
    await load();
    return state.rewards;
  },
  addReward: async function (name, probability, active) {
    await load();
    const id = nextId(state.rewards);
    state.rewards.push({ id, name, probability, active });
    await save();
    return id;
  },
  updateReward: async function (id, name, probability, active) {
    await load();
    const r = state.rewards.find(x => x.id === id);
    if (!r) return false;
    r.name = name !== undefined ? name : r.name;
    r.probability = probability !== undefined ? Number(probability) : r.probability;
    r.active = active !== undefined ? (active ? 1 : 0) : r.active;
    await save();
    return true;
  },
  deleteReward: async function (id) {
    await load();
    state.rewards = state.rewards.filter(x => x.id !== id);
    await save();
    return true;
  },
  getSetting: async function (key) {
    await load();
    return state.settings[key] || null;
  },
  setSetting: async function (key, value) {
    await load();
    state.settings[key] = value;
    await save();
    return true;
  }
};

// initialize immediately
init().catch(console.error);
