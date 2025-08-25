export interface Contact {
  _id?: string;
  firstName?: string;
  email: string;
  createdAt: string;
  tags?: string[];
}

export interface User {
  _id?: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt?: string;
  createdBy?: string;
}

export interface SessionUser {
  _id: string;
  username: string;
  isAdmin: boolean;
}
