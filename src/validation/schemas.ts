import { z } from 'zod';
import { sanitize } from '../utils/sanitize.js';
import { STREAM_TYPES, VIDEO_DOMAIN_WHITELIST } from '../config/constants.js';

const sanitizedString = (schema: z.ZodString) =>
  schema.transform((value) => sanitize(value));

export const usernameSchema = sanitizedString(
  z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(64, 'Username must be at most 64 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username must be alphanumeric with ._- allowed')
);

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema
});

export const csrfSchema = z.object({
  _csrf: z.string({ required_error: 'CSRF token missing' })
});

export const categorySchema = z.object({
  id: z.string().uuid(),
  name: sanitizedString(
    z
      .string({ required_error: 'Category name required' })
      .min(1, 'Category name required')
      .max(64, 'Category name too long')
  ),
  slug: sanitizedString(
    z
      .string({ required_error: 'Category slug required' })
      .min(1, 'Category slug required')
      .max(64, 'Category slug too long')
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase and hyphenated')
  ),
  order: z.number().int().min(0)
});

export const subtitleSchema = z.object({
  lang: sanitizedString(z.string().min(2).max(8)),
  label: sanitizedString(z.string().min(1).max(64)),
  url: z
    .string()
    .url()
    .refine((url) => VIDEO_DOMAIN_WHITELIST.includes(new URL(url).hostname), {
      message: 'Subtitle URL domain not allowed'
    })
});

export const streamUrlSchema = z
  .string({ required_error: 'Stream URL required' })
  .url('Invalid URL')
  .refine((url) => {
    const { hostname } = new URL(url);
    return VIDEO_DOMAIN_WHITELIST.includes(hostname);
  }, 'Stream URL domain not allowed');

export const movieSchema = z.object({
  id: z.string().uuid(),
  title: sanitizedString(z.string().min(1).max(160)),
  slug: sanitizedString(
    z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase and hyphenated')
  ),
  description: sanitizedString(z.string().max(1024)),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  duration: z.number().int().positive(),
  posterUrl: z
    .string()
    .url()
    .refine((url) => VIDEO_DOMAIN_WHITELIST.includes(new URL(url).hostname), {
      message: 'Poster URL domain not allowed'
    }),
  streamUrl: streamUrlSchema,
  subtitles: z.array(subtitleSchema).default([]),
  categories: z.array(z.string().uuid()),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  views: z.number().int().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const episodeSchema = z.object({
  id: z.string().uuid(),
  title: sanitizedString(z.string().min(1).max(160)),
  description: sanitizedString(z.string().max(1024)),
  season: z.number().int().min(1),
  episode: z.number().int().min(1),
  duration: z.number().int().positive(),
  streamUrl: streamUrlSchema,
  subtitles: z.array(subtitleSchema).default([]),
  published: z.boolean().default(false),
  views: z.number().int().min(0).default(0),
  lastUpdated: z.string()
});

export const seasonSchema = z.object({
  season: z.number().int().min(1),
  episodes: z.array(episodeSchema)
});

export const seriesSchema = z.object({
  id: z.string().uuid(),
  name: sanitizedString(z.string().min(1).max(160)),
  slug: sanitizedString(
    z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase and hyphenated')
  ),
  description: sanitizedString(z.string().max(1024)),
  posterUrl: z
    .string()
    .url()
    .refine((url) => VIDEO_DOMAIN_WHITELIST.includes(new URL(url).hostname), {
      message: 'Poster URL domain not allowed'
    }),
  categories: z.array(z.string().uuid()),
  seasons: z.array(seasonSchema),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const historyEntrySchema = z.object({
  contentId: z.string(),
  type: z.enum(STREAM_TYPES),
  progress: z.number().min(0).max(1),
  lastWatched: z.string(),
  season: z.number().int().min(1).optional(),
  episode: z.number().int().min(1).optional()
});

export const userSchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
  passwordHash: z.string(),
  role: z.enum(['admin', 'user']),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'user']).default('user')
});

export const updateUserSchema = z.object({
  password: passwordSchema.optional(),
  active: z.boolean().optional(),
  role: z.enum(['admin', 'user']).optional()
});

export const publishSchema = z.object({
  published: z.boolean()
});

export const featureSchema = z.object({
  featured: z.boolean()
});

export const heroSchema = z.object({
  heroMovieId: z.string().uuid().optional(),
  heroSeriesSlug: z.string().optional()
});

export type LoginPayload = z.infer<typeof loginSchema>;
export type MoviePayload = z.infer<typeof movieSchema>;
export type SeriesPayload = z.infer<typeof seriesSchema>;
export type CategoryPayload = z.infer<typeof categorySchema>;
export type UserPayload = z.infer<typeof userSchema>;
export type HistoryEntryPayload = z.infer<typeof historyEntrySchema>;
