const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

let blobPut = null;
try {
  blobPut = require('@vercel/blob').put;
} catch (_) {
  blobPut = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const DEFAULT_LOGO = path.join(__dirname, 'public', 'assets', 'logo.svg');
const DEFAULT_LOGO_URL = '/assets/logo.svg';

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const storage = isVercel
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: function (_, __, cb) {
        cb(null, path.join(__dirname, 'public', 'assets'));
      },
      filename: function (_, file, cb) {
        const ext = path.extname(file.originalname) || '.png';
        const fname = `logo-${Date.now()}${ext}`;
        cb(null, fname);
      }
    });

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }
});

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
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function resolveLocalLogoPath(logoPath) {
  if (!logoPath) return DEFAULT_LOGO;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  const normalizedPath = logoPath.replace(/^\//, '');
  const localPath = path.join(__dirname, 'public', normalizedPath);
  return fs.existsSync(localPath) ? localPath : DEFAULT_LOGO;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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

app.get('/api/rewards', async (req, res) => {
  try {
    const rewards = await db.getActiveRewards();
    res.json(rewards);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/logo', async (req, res) => {
  try {
    const logoPath = await db.getSetting('logo');
    const target = resolveLocalLogoPath(logoPath || DEFAULT_LOGO_URL);

    if (/^https?:\/\//i.test(target)) {
      return res.redirect(target);
    }

    if (!fs.existsSync(target)) {
      return res.sendFile(DEFAULT_LOGO);
    }

    res.sendFile(target);
  } catch (e) {
    console.error(e);
    res.sendFile(DEFAULT_LOGO);
  }
});

app.get('/api/rewards/random', async (req, res) => {
  try {
    const rewards = await db.getActiveRewards();
    if (!rewards.length) return res.status(404).json({ error: 'No active rewards' });
    const total = rewards.reduce((sum, r) => sum + (Number(r.probability) || 0), 0);
    const rnd = Math.random() * total;
    let acc = 0;
    for (const r of rewards) {
      acc += Number(r.probability) || 0;
      if (rnd <= acc) return res.json(r);
    }
    res.json(rewards[rewards.length - 1]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/ping', (req, res) => res.send('pong'));

app.get('/api/admin/rewards', authMiddleware, async (req, res) => {
  try {
    const rows = await db.getAllRewards();
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    let logoUrl = null;
    if (isVercel && blobPut && req.file.buffer) {
      const safeName = `logo-${Date.now()}-${(req.file.originalname || 'logo.svg').replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      const blob = await blobPut(safeName, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype || 'image/png'
      });
      logoUrl = blob.url;
    } else {
      logoUrl = '/assets/' + req.file.filename;
    }

    await db.setSetting('logo', logoUrl);
    res.json({ ok: true, path: logoUrl });
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

module.exports = app;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
