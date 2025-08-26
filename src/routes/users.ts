import { Router, Request, Response } from 'express';
import { ensureAdmin, hashPassword } from '../auth';
import { usersDb } from '../db';
import { render } from '../template';

const router = Router();

router.get('/', ensureAdmin, async (req: Request, res: Response) => {
  const users = await usersDb.find({});
  users.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  res.send(render('users.ejs', { users, currentUser: req.session!.username }));
});

router.post('/add', ensureAdmin, async (req: Request, res: Response) => {
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
    createdAt: new Date().toISOString(),
    createdBy: req.session!.username,
  });
  res.redirect('/users');
});

router.post('/:id/edit', ensureAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password, isAdmin } = req.body;
  const user = await usersDb.findOne({ _id: id });
  if (!user) {
    return res.status(404).send('User not found');
  }
  if (!username) {
    return res.status(400).send('Username required');
  }
  const existing = await usersDb.findOne({ username, _id: { $ne: id } });
  if (existing) {
    return res.status(400).send('User exists');
  }
  const update: Partial<{ username: string; isAdmin: boolean; passwordHash: string }> = { username, isAdmin: isAdmin === 'on' };
  if (password) {
    update.passwordHash = hashPassword(password);
  }
  await usersDb.update({ _id: id }, { $set: update });
  if (user.username === req.session!.username) {
    req.session!.username = username;
    req.session!.isAdmin = update.isAdmin!;
  }
  res.redirect('/users');
});

router.post('/:id/delete', ensureAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await usersDb.findOne({ _id: id });
  if (!user) {
    return res.redirect('/users');
  }
  if (user.username === req.session!.username) {
    return res.status(400).send('Cannot delete yourself');
  }
  await usersDb.remove({ _id: id });
  res.redirect('/users');
});

export default router;
