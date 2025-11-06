import type { UserRecord } from './catalog.js';

declare module 'express-session' {
  interface SessionData {
    user?: {
      username: string;
      role: 'admin' | 'user';
      lastActive: string;
    };
    csrfToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: UserRecord;
    }
  }
}

export {};
