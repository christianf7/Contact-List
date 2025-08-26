import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SessionUser } from './types';

const sessions = new Map<string, SessionUser>();

function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (!key) return;
    const value = decodeURIComponent(parts.join('='));
    list[key] = value;
  });
  return list;
}

export function getSession(req: Request): SessionUser | null {
  const { sid } = parseCookies(req);
  if (sid && sessions.has(sid)) {
    return sessions.get(sid)!;
  }
  return null;
}

export function ensureLoggedIn(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (!session) {
    return res.redirect('/login');
  }
  req.session = session;
  next();
}

export function ensureAdmin(req: Request, res: Response, next: NextFunction) {
  const session = getSession(req);
  if (!session || !session.isAdmin) {
    return res.redirect('/no-permission');
  }
  req.session = session;
  next();
}

export function createSession(res: Response, user: SessionUser) {
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, user);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/`);
}

export function destroySession(req: Request, res: Response) {
  const { sid } = parseCookies(req);
  if (sid) {
    sessions.delete(sid);
    res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/');
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === hashed;
}
