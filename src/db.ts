import path from 'path';
import fs from 'fs';
import Datastore from 'nedb-promises';
import fetch from 'node-fetch';
import { Contact, User } from './types';

const dataDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const contactsDb = Datastore.create<Contact>({
  filename: path.join(dataDir, 'contacts.db'),
  autoload: true,
});

export const usersDb = Datastore.create<User>({
  filename: path.join(dataDir, 'users.db'),
  autoload: true,
});

export async function insertContact({
  email,
  firstName = '',
  createdAt = new Date().toISOString(),
  tags = [],
}: Partial<Contact>): Promise<Contact> {
  if (!email) {
    throw new Error('Email is required');
  }
  if (await contactsDb.findOne({ email })) {
    throw new Error('Contact already exists');
  }
  const contact: Contact = { email, firstName, createdAt, tags };
  await contactsDb.insert(contact);

  if (process.env.WEBHOOK_URL) {
    try {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Contact-Email': contact.email,
        },
        body: JSON.stringify(contact),
      });
    } catch (err) {
      console.error('Failed to send webhook:', err);
    }
  }

  return contact;
}
