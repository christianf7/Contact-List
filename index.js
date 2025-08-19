require('dotenv').config();
const express   = require('express');
const basicAuth = require('basic-auth');
const path      = require('path');
const Datastore = require('nedb-promises');

const app       = express();
const port      = process.env.PORT || 3000;
const db = Datastore.create({
  filename: path.resolve(__dirname, 'contacts.db'),
  autoload: true,
});

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

    if (await db.findOne({ email })) {
      return res.status(400).json({ error: 'Contact already exists' });
    }

    const contact = {
      email,
      firstName: firstName || '',
      lastName:  lastName  || '',
      createdAt: new Date().toISOString(),
    };
    await db.insert(contact);

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

// Export contacts as CSV
  app.get('/contacts/export', auth, async (req, res) => {
    const contacts = await db.find({});
    const lines = [
      'firstName,lastName,email,createdAt',
      ...contacts.map(c =>
        [c.firstName, c.lastName, c.email, c.createdAt]
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send(lines.join('\n'));
  });

// Web UI
  app.get('/contacts', auth, async (req, res) => {
    const contacts = await db.find({});
    const rows = contacts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(
        c => `
          <tr>
            <td>${c.firstName}</td>
            <td>${c.lastName}</td>
            <td>${c.email}</td>
            <td>${new Date(c.createdAt).toLocaleString()}</td>
          </tr>`
      )
      .join('');

    res.send(`
      <html>
        <head>
          <title>Contacts</title>
          <style>
          body { font-family: Arial, sans-serif; margin: 2rem; }
          table { border-collapse: collapse; width: 100%; }
          th, td { padding: 8px 12px; border: 1px solid #ddd; }
          th { background-color: #f4f4f4; text-align: left; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .export-btn { margin-bottom: 1rem; display: inline-block; padding: 8px 12px; background-color: #007BFF; color: white; text-decoration: none; border-radius: 4px; }
          .export-btn:hover { background-color: #0056b3; }
        </style>
      </head>
      <body>
        <h1>Registered Contacts</h1>
        <a class="export-btn" href="/contacts/export">Export CSV</a>
        <table>
          <thead>
            <tr>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Email</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
