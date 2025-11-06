import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import {
  AUDIT_ACTIONS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  SESSIONS_ROOT
} from './config/constants.js';
import { attachUser, auditLogin, auditLogout, requireAuth, requireRole } from './middleware/auth.js';
import { adminRateLimiter } from './middleware/rateLimit.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
  createMovie,
  deleteMovie,
  incrementMovieView,
  listMovies,
  updateMovie,
  ensureSeriesRoot,
  listSeries,
  mergeEpisode,
  createOrMergeSeries,
  updateSeries,
  incrementSeriesView
} from './services/catalogService.js';
import {
  appendHistory,
  createUser,
  findUserByUsername,
  getHistory,
  listUsers,
  updateUser,
  verifyCredentials
} from './services/userService.js';
import { logAudit } from './services/auditService.js';
import {
  categorySchema,
  episodeSchema,
  featureSchema,
  historyEntrySchema,
  loginSchema,
  movieSchema,
  publishSchema,
  seriesSchema
} from './validation/schemas.js';
import type { Request, Response, NextFunction } from 'express';
import { ensureDir } from './utils/fs.js';

const FileStore = FileStoreFactory(session);

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'change-me-now';
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS ?? 'http://localhost:3000').split(',');

await ensureDir(SESSIONS_ROOT);
await ensureSeriesRoot();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: CLIENT_ORIGINS,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS
    },
    store: new FileStore({
      path: SESSIONS_ROOT,
      ttl: SESSION_TTL_MS / 1000,
      retries: 1
    })
  })
);

app.use(attachUser);

function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomUUID();
  }
  return req.session.csrfToken;
}

function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = req.session.csrfToken;
  if (!sessionToken) {
    res.status(403).json({ message: 'Invalid CSRF token' });
    return;
  }
  const token = (req.get('x-csrf-token') ?? req.body?._csrf ?? req.query?._csrf) as string | undefined;
  if (!token || token !== sessionToken) {
    res.status(403).json({ message: 'Invalid CSRF token' });
    return;
  }
  next();
}

app.get('/api/auth/csrf', (req, res) => {
  const token = ensureCsrfToken(req);
  res.json({ token });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const sessionToken = ensureCsrfToken(req);
    const headerToken = req.get('x-csrf-token');
    if (!headerToken || headerToken !== sessionToken) {
      await auditLogin(req, false);
      res.status(403).json({ message: 'CSRF token mismatch' });
      return;
    }
    const user = await verifyCredentials(username, password);
    if (!user) {
      await auditLogin(req, false);
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    req.session.user = {
      username: user.username,
      role: user.role,
      lastActive: dayjs().toISOString()
    };
    req.currentUser = user;
    await auditLogin(req, true);
    res.json({
      user: {
        username: user.username,
        role: user.role
      },
      csrfToken: ensureCsrfToken(req)
    });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/auth/logout', requireAuth, verifyCsrf, async (req, res) => {
  await auditLogout(req);
  req.session.destroy((destroyError) => {
    if (destroyError) {
      res.status(500).json({ message: 'Failed to terminate session' });
      return;
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = req.currentUser!;
  res.json({
    user: {
      username: user.username,
      role: user.role,
      active: user.active
    },
    csrfToken: ensureCsrfToken(req)
  });
});

app.get('/api/catalog/categories', requireAuth, async (_req, res) => {
  const categories = await listCategories();
  res.json({ categories });
});

app.post('/api/catalog/categories', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = categorySchema.omit({ id: true }).parse(req.body);
    const category = await createCategory(payload);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.CREATE, 'category', category);
    res.status(201).json({ category, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put('/api/catalog/categories/:id', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const category = await updateCategory(req.params.id, req.body);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'category', category);
    res.json({ category, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/categories/reorder', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const reordered = await reorderCategories(req.body.order ?? []);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'category_order', reordered.map((cat) => cat.id));
    res.json({ categories: reordered, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.delete('/api/catalog/categories/:id', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    await deleteCategory(req.params.id);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.DELETE, 'category', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get('/api/catalog/movies', requireAuth, async (_req, res) => {
  const movies = await listMovies();
  res.json({ movies });
});

app.post('/api/catalog/movies', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = movieSchema.omit({ id: true, createdAt: true, updatedAt: true, views: true }).parse(req.body);
    const movie = await createMovie(payload as any);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.CREATE, 'movie', movie);
    res.status(201).json({ movie, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put('/api/catalog/movies/:id', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const movie = await updateMovie(req.params.id, req.body);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'movie', movie);
    res.json({ movie, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.delete('/api/catalog/movies/:id', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    await deleteMovie(req.params.id);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.DELETE, 'movie', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/movies/:id/publish', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = publishSchema.parse(req.body);
    const movie = await updateMovie(req.params.id, { published: payload.published });
    await logAudit(
      req.currentUser!.username,
      payload.published ? AUDIT_ACTIONS.PUBLISH : AUDIT_ACTIONS.UNPUBLISH,
      'movie',
      movie
    );
    res.json({ movie, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/movies/:id/feature', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = featureSchema.parse(req.body);
    const movie = await updateMovie(req.params.id, { featured: payload.featured });
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.FEATURE, 'movie', movie);
    res.json({ movie, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get('/api/catalog/series', requireAuth, async (_req, res) => {
  const series = await listSeries();
  res.json({ series });
});

app.post('/api/catalog/series', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = seriesSchema
      .omit({ id: true, createdAt: true, updatedAt: true })
      .partial({ seasons: true })
      .parse(req.body);
    const series = await createOrMergeSeries({
      ...payload,
      seasons: payload.seasons ?? []
    } as any);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.CREATE, 'series', series);
    res.status(201).json({ series, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put('/api/catalog/series/:slug', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = seriesSchema.partial().parse({ ...req.body, slug: req.params.slug });
    const series = await updateSeries(req.params.slug, payload as any);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'series', series);
    res.json({ series, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/series/:slug/episodes', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = episodeSchema.omit({ id: true, lastUpdated: true, views: true }).parse(req.body);
    const series = await mergeEpisode(req.params.slug, payload as any);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'episode', {
      series: req.params.slug,
      season: payload.season,
      episode: payload.episode
    });
    res.json({ series, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/series/:slug/publish', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = publishSchema.parse(req.body);
    const series = await updateSeries(req.params.slug, { published: payload.published } as any);
    await logAudit(
      req.currentUser!.username,
      payload.published ? AUDIT_ACTIONS.PUBLISH : AUDIT_ACTIONS.UNPUBLISH,
      'series',
      series
    );
    res.json({ series, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/series/:slug/feature', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = featureSchema.parse(req.body);
    const series = await updateSeries(req.params.slug, { featured: payload.featured } as any);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.FEATURE, 'series', series);
    res.json({ series, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/series/:slug/views', requireAuth, async (req, res) => {
  try {
    const { season, episode } = req.body;
    await incrementSeriesView(req.params.slug, Number(season), Number(episode));
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post('/api/catalog/movies/:id/views', requireAuth, async (req, res) => {
  try {
    await incrementMovieView(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get('/api/users', requireAuth, requireRole('admin'), adminRateLimiter, async (_req, res) => {
  const users = await listUsers();
  res.json({ users });
});

app.post('/api/users', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const payload = req.body as { username: string; password: string; role: 'admin' | 'user' };
    const user = await createUser(payload);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.CREATE, 'user', { username: user.username });
    res.status(201).json({ user, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put('/api/users/:username', requireAuth, requireRole('admin'), adminRateLimiter, verifyCsrf, async (req, res) => {
  try {
    const user = await updateUser(req.params.username, req.body);
    await logAudit(req.currentUser!.username, AUDIT_ACTIONS.UPDATE, 'user', { username: user.username });
    res.json({ user, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get('/api/history', requireAuth, async (req, res) => {
  const history = await getHistory(req.currentUser!.username);
  res.json({ history });
});

app.post('/api/history', requireAuth, verifyCsrf, async (req, res) => {
  try {
    const payload = historyEntrySchema.parse(req.body);
    await appendHistory(req.currentUser!.username, payload);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const message = err.stack ?? err.message;
  process.stderr.write(`${message}\n`);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  process.stdout.write(`StreamV9 API listening on port ${PORT}\n`);
});
