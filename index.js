require('dotenv').config();
const express = require('express');
const basicAuth = require('basic-auth');
const fetch = (...args) =>
  import('node-fetch').then(mod => mod.default(...args));

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// In-memory store for contacts
const contacts = [];

// Middleware to validate API key in header
function validateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Route to add a new contact
app.post('/api/contacts', validateApiKey, async (req, res) => {
  const { email, firstName, lastName } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check for duplicates
  if (contacts.find(c => c.email === email)) {
    return res.status(400).json({ error: 'Contact already exists' });
  }

  // Create and store the contact
  const contact = {
    email,
    firstName: firstName || '',
    lastName: lastName || '',
    createdAt: new Date().toISOString()
  };
  contacts.push(contact);

  // Send webhook if configured, including email in both headers and payload
  if (process.env.WEBHOOK_URL) {
    try {
      const payload = { ...contact };
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Contact-Email': contact.email
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Failed to send webhook:', err);
    }
  }

  res.status(201).json(contact);
});

// Basic auth middleware for the web page
function auth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.pass !== process.env.ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Contacts"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

// Web page listing all contacts
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