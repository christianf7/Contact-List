import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { ensureLoggedIn } from '../auth';
import { contactsDb, insertContact } from '../db';
import { render } from '../template';
import { Contact } from '../types';

const router = Router();
const upload = multer();

router.get('/', ensureLoggedIn, async (req, res) => {
  const tag = req.query.tag as string | undefined;
  const sort = req.query.sort as string | undefined;
  let contacts: Contact[] = await contactsDb.find(tag ? { tags: tag } : {});
  if (sort === 'tag') {
    contacts.sort((a, b) => (a.tags?.[0] || '').localeCompare(b.tags?.[0] || ''));
  } else {
    contacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  const total = contacts.length;
  const today = new Date();
  const labels: string[] = [];
  const data: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    labels.push(day.toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane' }));
    data.push(contacts.filter(c => c.createdAt.slice(0, 10) === dayStr).length);
  }
  const allContacts = await contactsDb.find({});
  const allTags = Array.from(new Set(allContacts.flatMap(c => c.tags || []))).sort();
  res.send(
    render('contacts.ejs', {
      contacts,
      total,
      labels: JSON.stringify(labels),
      data: JSON.stringify(data),
      isAdmin: (req as any).session.isAdmin,
      tags: allTags,
      currentTag: tag || '',
      sort: sort || '',
    })
  );
});

router.post('/add', ensureLoggedIn, async (req, res) => {
  const { firstName, email, createdAt, tags } = req.body;
  const tagArr = typeof tags === 'string'
    ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : Array.isArray(tags) ? tags : [];
  try {
    await insertContact({
      firstName,
      email,
      tags: tagArr,
      createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
    });
    res.redirect('/contacts');
  } catch (err: any) {
    res.status(400).send(err.message);
  }
});

router.post('/:id/edit', ensureLoggedIn, async (req, res) => {
  const { id } = req.params;
  const { firstName, email, createdAt, tags } = req.body;
  const tagArr = typeof tags === 'string'
    ? tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : Array.isArray(tags) ? tags : [];
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
          tags: tagArr,
          createdAt: createdAt
            ? new Date(createdAt).toISOString()
            : new Date().toISOString(),
        },
      }
    );
    res.redirect('/contacts');
  } catch (err: any) {
    res.status(400).send(err.message);
  }
});

router.post('/:id/delete', ensureLoggedIn, async (req, res) => {
  try {
    await contactsDb.remove({ _id: req.params.id });
    res.redirect('/contacts');
  } catch (err: any) {
    res.status(400).send(err.message);
  }
});

router.post('/bulk', ensureLoggedIn, upload.single('csv'), async (req, res) => {
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
        console.error(`Failed to add ${r.email}:`, (err as Error).message);
      }
    }
    res.redirect('/contacts');
  } catch (err) {
    res.status(400).send('Invalid CSV');
  }
});

router.get('/export', ensureLoggedIn, async (req, res) => {
  const contacts = await contactsDb.find({});
  const lines = [
    'firstName,email,createdAt,tags',
    ...contacts.map(c =>
      [
        c.firstName,
        c.email,
        c.createdAt,
        (c.tags || []).join('|'),
      ]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.send(lines.join('\n'));
});

export default router;
