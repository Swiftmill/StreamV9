import type { Request, Response, NextFunction } from 'express';

interface RateState {
  count: number;
  expiresAt: number;
}

const rateMap = new Map<string, RateState>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

export function adminRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = `${req.ip}:${req.currentUser?.username ?? 'guest'}`;
  const now = Date.now();
  const state = rateMap.get(key);
  if (!state || state.expiresAt < now) {
    rateMap.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    next();
    return;
  }
  if (state.count >= LIMIT) {
    res.status(429).json({ message: 'Too many requests. Please slow down.' });
    return;
  }
  state.count += 1;
  rateMap.set(key, state);
  next();
}
