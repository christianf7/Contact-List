require('dotenv').config();
const express = require('express');
const basicAuth = require('basic-auth');
const path = require('path');
const fs = require('fs');
const Datastore = require('nedb-promises');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

const app = express();
const port = process.env.PORT || 3000;

// ensure data directory exists
const dataDir = path.resolve(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = Datastore.create({
  filename: path.join(dataDir, 'contacts.db'),
  autoload: true,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer();

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
  if (await db.findOne({ email })) {
    throw new Error('Contact already exists');
  }

  const contact = { email, firstName, createdAt };
  await db.insert(contact);
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

// Basic-auth middleware for UI
function auth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== 'admin' || user.pass !== process.env.ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Contacts"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

// Export contacts as CSV
app.get('/contacts/export', auth, async (req, res) => {
  const contacts = await db.find({});
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
app.post('/contacts/add', auth, async (req, res) => {
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

// Bulk add contacts from CSV upload
app.post('/contacts/bulk', auth, upload.single('csv'), async (req, res) => {
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

// Web UI
app.get('/contacts', auth, async (req, res) => {
  const contacts = await db.find({});
  const rows = contacts
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(
      c => `
          <tr>
            <td>${c.firstName}</td>
            <td>${c.email}</td>
            <td>${new Date(c.createdAt).toLocaleString()}</td>
          </tr>`
    )
    .join('');

  res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Contacts</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
        </head>
        <body class="bg-light">
          <div class="container py-4">
            <h1 class="mb-4">Registered Contacts</h1>
            <form class="row gy-2 gx-3 align-items-end mb-4" action="/contacts/add" method="post">
              <div class="col-sm-3">
                <label class="form-label">Name</label>
                <input class="form-control" type="text" name="firstName" />
              </div>
              <div class="col-sm-3">
                <label class="form-label">Email*</label>
                <input class="form-control" type="email" name="email" required />
              </div>
              <div class="col-sm-3">
                <label class="form-label">Date</label>
                <input class="form-control" type="datetime-local" name="createdAt" />
              </div>
              <div class="col-sm-3">
                <button class="btn btn-primary" type="submit">Add Contact</button>
              </div>
            </form>

            <form class="mb-4" action="/contacts/bulk" method="post" enctype="multipart/form-data">
              <div class="row g-3 align-items-center">
                <div class="col-auto">
                  <label class="form-label">Bulk CSV</label>
                  <input class="form-control" type="file" name="csv" accept=".csv" required />
                </div>
                <div class="col-auto">
                  <button class="btn btn-secondary" type="submit">Upload</button>
                </div>
              </div>
              <div class="form-text">CSV headers: firstName,email,createdAt</div>
            </form>

            <a class="btn btn-success mb-3" href="/contacts/export">Download CSV</a>

            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
        </body>
      </html>
  `);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

