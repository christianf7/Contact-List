import express from 'express';
import dotenv from 'dotenv';
import { render } from './template';
import { usersDb, insertContact } from './db';
import contactsRouter from './routes/contacts';
import usersRouter from './routes/users';
import {
  getSession,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from './auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API-key middleware
function validateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

app.post('/api/contacts', validateApiKey, async (req, res) => {
  try {
    const { tags } = req.body;
    const tagArr = Array.isArray(tags)
      ? tags
      : typeof tags === 'string'
      ? [tags]
      : [];
    const contact = await insertContact({ ...req.body, tags: tagArr });
    res.status(201).json(contact);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  const session = getSession(req);
  if (session) {
    return res.redirect('/contacts');
  }
  res.send(render('landing.ejs'));
});

app.get('/login', (req, res) => {
  res.send(render('login.ejs', { error: null }));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await usersDb.findOne({ username });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.send(render('login.ejs', { error: 'Invalid credentials' }));
  }
  createSession(res, {
    _id: user._id!,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  res.redirect('/contacts');
});

app.get('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

app.get('/no-permission', (req, res) => {
  res.send(render('no-permission.ejs'));
});

app.use('/contacts', contactsRouter);
app.use('/users', usersRouter);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// initialise admin user
async function initAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  const existing = await usersDb.findOne({ username });
  if (!existing) {
    await usersDb.insert({
      username,
      passwordHash: hashPassword(password),
      isAdmin: true,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    });
    console.log('Admin user created');
  }
}

initAdmin();
