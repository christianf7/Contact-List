require('dotenv').config();
const express   = require('express');
const basicAuth = require('basic-auth');
const fs        = require('fs');
const path      = require('path');

const app       = express();
const port      = process.env.PORT || 3000;
const DATA_FILE = path.resolve(__dirname, 'contacts.json');

// --- load existing contacts (or start empty) ---
let contacts = [];
try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  contacts  = JSON.parse(raw);
} catch (err) {
  if (err.code !== 'ENOENT') console.error('Failed to load contacts:', err);
  contacts = [];
}

// helper: save contacts array back to disk
async function saveContacts() {
  try {
    await fs.promises.writeFile(
      DATA_FILE,
      JSON.stringify(contacts, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to save contacts:', err);
  }
}

// Parse JSON bodies
app.use(express.json());

// API-key middleware
function validateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Add contact
app.post('/api/contacts', validateApiKey, async (req, res) => {
  const { email, firstName, lastName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  if (contacts.find(c => c.email === email)) {
    return res.status(400).json({ error: 'Contact already exists' });
  }

  const contact = {
    email,
    firstName: firstName || '',
    lastName:  lastName  || '',
    createdAt: new Date().toISOString(),
  };
  contacts.push(contact);

  // persist
  await saveContacts();

  // webhook
  if (process.env.WEBHOOK_URL) {
    try {
      await import('node-fetch').then(({ default: fetch }) =>
        fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type':     'application/json',
            'X-Contact-Email':  contact.email,
          },
          body: JSON.stringify(contact),
        })
      );
    } catch (err) {
      console.error('Failed to send webhook:', err);
    }
  }

  res.status(201).json(contact);
});

// Basic-auth middleware
function auth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.pass !== process.env.ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Contacts"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

// Web UI
app.get('/contacts', auth, (req, res) => {
  const listItems = contacts
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(c => `<li>${c.email} — added at ${c.createdAt}</li>`)
    .join('');

  res.send(`
    <html>
      <head><title>Contacts</title></head>
      <body>
        <h1>Registered Contacts</h1>
        <ul>${listItems}</ul>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
