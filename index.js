require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Datastore = require('nedb-promises');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { render } = require('./lib/template');

const app = express();
const port = process.env.PORT || 3000;

// ensure data directory exists
const dataDir = path.resolve(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const contactsDb = Datastore.create({
  filename: path.join(dataDir, 'contacts.db'),
  autoload: true,
});
const usersDb = Datastore.create({
  filename: path.join(dataDir, 'users.db'),
  autoload: true,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer();

// simple in-memory sessions
const sessions = new Map();

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    if (!key) return;
    const value = decodeURIComponent(parts.join('='));
    list[key] = value;
  });
  return list;
}

function getSession(req) {
  const { sid } = parseCookies(req);
  if (sid && sessions.has(sid)) {
    return sessions.get(sid);
  }
  return null;
}

function ensureLoggedIn(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.redirect('/login');
  }
  req.session = session;
  next();
}

function ensureAdmin(req, res, next) {
  const session = getSession(req);
  if (!session || !session.isAdmin) {
    return res.status(403).send('Forbidden');
  }
  req.session = session;
  next();
}

function createSession(res, user) {
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, user);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/`);
}

function destroySession(req, res) {
  const { sid } = parseCookies(req);
  if (sid) {
    sessions.delete(sid);
    res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === hashed;
}

async function initAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  const existing = await usersDb.findOne({ username });
  if (!existing) {
    await usersDb.insert({
      username,
      passwordHash: hashPassword(password),
      isAdmin: true,
    });
    console.log('Admin user created');
  }
}
initAdmin();

// API-key middleware
function validateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

async function insertContact({ email, firstName = '', createdAt = new Date().toISOString() }) {
  if (!email) {
    throw new Error('Email is required');
  }
  if (await contactsDb.findOne({ email })) {
    throw new Error('Contact already exists');
  }

  const contact = { email, firstName, createdAt };
  await contactsDb.insert(contact);
  console.log('Contact added:', contact);

  if (process.env.WEBHOOK_URL) {
    try {
      await import('node-fetch').then(({ default: fetch }) =>
        fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Contact-Email': contact.email,
          },
          body: JSON.stringify(contact),
        })
      );
    } catch (err) {
      console.error('Failed to send webhook:', err);
    }
  }

  return contact;
}

// API endpoint to add a contact
app.post('/api/contacts', validateApiKey, async (req, res) => {
  try {
    const contact = await insertContact(req.body);
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Authentication routes
app.get('/login', (req, res) => {
  res.send(render('login.ejs', { error: null }));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await usersDb.findOne({ username });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.send(render('login.ejs', { error: 'Invalid credentials' }));
  }
  createSession(res, { username: user.username, isAdmin: user.isAdmin });
  res.redirect('/contacts');
});

app.get('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/login');
});

// User management
app.get('/users', ensureAdmin, async (req, res) => {
  const users = await usersDb.find({});
  res.send(render('users.ejs', { users }));
});

app.post('/users/add', ensureAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password required');
  }
  if (await usersDb.findOne({ username })) {
    return res.status(400).send('User exists');
  }
  await usersDb.insert({
    username,
    passwordHash: hashPassword(password),
    isAdmin: isAdmin === 'on',
  });
  res.redirect('/users');
});

// Export contacts as CSV
app.get('/contacts/export', ensureLoggedIn, async (req, res) => {
  const contacts = await contactsDb.find({});
  const lines = [
    'firstName,email,createdAt',
    ...contacts.map(c =>
      [c.firstName, c.email, c.createdAt]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.send(lines.join('\n'));
});

// Add single contact from UI
app.post('/contacts/add', ensureLoggedIn, async (req, res) => {
  const { firstName, email, createdAt } = req.body;
  try {
    await insertContact({
      firstName,
      email,
      createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
    });
    res.redirect('/contacts');
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.post('/contacts/:id/edit', ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  const { firstName, email, createdAt } = req.body;
  try {
    const existing = await contactsDb.findOne({ email, _id: { $ne: id } });
    if (existing) {
      return res.status(400).send('Contact already exists');
    }
    await contactsDb.update(
      { _id: id },
      {
        $set: {
          firstName,
          email,
          createdAt: createdAt
            ? new Date(createdAt).toISOString()
            : new Date().toISOString(),
        },
      }
    );
    res.redirect('/contacts');
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.post('/contacts/:id/delete', ensureLoggedIn, async (req, res) => {
  try {
    await contactsDb.remove({ _id: req.params.id });
    res.redirect('/contacts');
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// Bulk add contacts from CSV upload
app.post('/contacts/bulk', ensureLoggedIn, upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('CSV file required');
  }
  try {
    const records = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      trim: true,
      skip_empty_lines: true,
    });
    for (const r of records) {
      try {
        await insertContact({
          firstName: r.firstName,
          email: r.email,
          createdAt: r.createdAt || undefined,
        });
      } catch (err) {
        console.error(`Failed to add ${r.email}:`, err.message);
      }
    }
    res.redirect('/contacts');
  } catch (err) {
    res.status(400).send('Invalid CSV');
  }
});

// Contacts UI
app.get('/contacts', ensureLoggedIn, async (req, res) => {
  const contacts = await contactsDb.find({});
  contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = contacts.length;
  const today = new Date();
  const labels = [];
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    labels.push(
      day.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })
    );
    data.push(contacts.filter(c => c.createdAt.slice(0, 10) === dayStr).length);
  }
  res.send(
    render('contacts.ejs', {
      contacts,
      total,
      labels: JSON.stringify(labels),
      data: JSON.stringify(data),
      isAdmin: req.session.isAdmin,
    })
  );
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
