import type { Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';
import { AUDIT_ACTIONS, SESSION_TTL_MS } from '../config/constants.js';
import { logAudit } from '../services/auditService.js';
import { findUserByUsername } from '../services/userService.js';

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionUser = req.session.user;
    if (!sessionUser) {
      return next();
    }
    if (Date.now() - new Date(sessionUser.lastActive).getTime() > SESSION_TTL_MS) {
      delete req.session.user;
      return next();
    }
    const user = await findUserByUsername(sessionUser.username);
    if (!user || !user.active) {
      delete req.session.user;
      return next();
    }
    req.currentUser = user;
    req.session.user = {
      username: user.username,
      role: user.role,
      lastActive: dayjs().toISOString()
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  next();
}

export function requireRole(role: 'admin' | 'user') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (role === 'admin' && req.currentUser.role !== 'admin') {
      res.status(403).json({ message: 'Administrator privileges required' });
      return;
    }
    next();
  };
}

export async function auditLogin(req: Request, success: boolean): Promise<void> {
  const username = req.body?.username ?? 'unknown';
  await logAudit(username, success ? AUDIT_ACTIONS.LOGIN : AUDIT_ACTIONS.LOGIN_FAILED, 'auth', {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
}

export async function auditLogout(req: Request): Promise<void> {
  if (!req.currentUser) return;
  await logAudit(req.currentUser.username, AUDIT_ACTIONS.LOGOUT, 'auth', {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
}
