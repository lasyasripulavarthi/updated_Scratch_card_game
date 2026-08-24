const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// multer for logo uploads
const assetsDir = path.join(__dirname, 'public', 'assets');
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, assetsDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    const fname = `logo-${Date.now()}${ext}`;
    cb(null, fname);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 2 * 1024 * 1024 } });

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid auth' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.admin = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing creds' });
  try {
    const admin = await db.findAdminAsync(username);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list active rewards
app.get('/api/rewards', async (req, res) => {
  try {
    const rewards = await db.getActiveRewards();
    res.json(rewards);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve current logo (dynamic)
app.get('/api/logo', async (req, res) => {
  try {
    const logoPath = await db.getSetting('logo');
    let filePath;
    if (!logoPath) filePath = path.join(__dirname, 'public', 'assets', 'logo.png');
    else filePath = path.join(__dirname, 'public', logoPath.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      return res.sendFile(path.join(__dirname, 'public', 'assets', 'logo.png'));
    }
    res.sendFile(filePath);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

// Public: request a random reward (server-side probability)
app.get('/api/rewards/random', async (req, res) => {
  try {
    const rewards = await db.getActiveRewards();
    if (!rewards.length) return res.status(404).json({ error: 'No active rewards' });
    const total = rewards.reduce((s, r) => s + (r.probability || 0), 0);
    const rnd = Math.random() * total;
    let acc = 0;
    for (const r of rewards) {
      acc += r.probability || 0;
      if (rnd <= acc) return res.json(r);
    }
    res.json(rewards[rewards.length - 1]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/ping', (req, res) => res.send('pong'));

// Admin endpoints
app.get('/api/admin/rewards', authMiddleware, async (req, res) => {
  try {
    const rows = await db.getAllRewards();
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: upload new logo
app.post('/api/admin/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const rel = '/assets/' + req.file.filename;
    await db.setSetting('logo', rel);
    res.json({ ok: true, path: rel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/rewards', authMiddleware, async (req, res) => {
  try {
    const { name, probability = 0, active = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = await db.addReward(name, Number(probability) || 0, active ? 1 : 0);
    res.json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/rewards/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, probability, active } = req.body;
    await db.updateReward(id, name, probability, active);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/rewards/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.deleteReward(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
