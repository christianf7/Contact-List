import test from 'node:test';
import assert from 'node:assert';

process.env.PORT = '0';
process.env.API_KEY = 'testkey';

let start;
let contactsDb;
let insertContact;
let server;
let baseUrl;

async function login() {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: 'admin' }).toString(),
    redirect: 'manual'
  });
  return res.headers.get('set-cookie');
}

test.before(async () => {
  ({ start } = await import('../dist/server.js'));
  ({ contactsDb, insertContact } = await import('../dist/db.js'));
  server = await start();
  const addr = server.address();
  const port = typeof addr === 'object' ? addr.port : 3000;
  baseUrl = `http://localhost:${port}`;
});

test.after(() => {
  server.close();
});

test.beforeEach(async () => {
  await contactsDb.remove({}, { multi: true });
});

test('POST /api/contacts requires API key', async () => {
  const res = await fetch(`${baseUrl}/api/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@example.com' })
  });
  assert.strictEqual(res.status, 401);
});

test('POST /api/contacts accepts tag array', async () => {
  const res = await fetch(`${baseUrl}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'testkey'
    },
    body: JSON.stringify({ email: 'b@example.com', tags: ['one', 'two'] })
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.deepStrictEqual(data.tags, ['one', 'two']);
});

test('POST /api/contacts works without tags', async () => {
  const res = await fetch(`${baseUrl}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'testkey'
    },
    body: JSON.stringify({ email: 'c@example.com' })
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.deepStrictEqual(data.tags, []);
});

test('GET /contacts redirects unauthenticated', async () => {
  const res = await fetch(`${baseUrl}/contacts`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
});

test('GET /contacts filters by tag and sorts by tag', async () => {
  await insertContact({ email: 'alpha@example.com', tags: ['alpha'] });
  await insertContact({ email: 'beta@example.com', tags: ['beta'] });
  const cookie = await login();
  const res = await fetch(`${baseUrl}/contacts?sort=tag`, {
    headers: { Cookie: cookie }
  });
  const text = await res.text();
  const idxAlpha = text.indexOf('alpha@example.com');
  const idxBeta = text.indexOf('beta@example.com');
  assert.ok(idxAlpha < idxBeta);
  const resTag = await fetch(`${baseUrl}/contacts?tag=alpha`, {
    headers: { Cookie: cookie }
  });
  const tagText = await resTag.text();
  assert.ok(tagText.includes('alpha@example.com'));
  assert.ok(!tagText.includes('beta@example.com'));
});
