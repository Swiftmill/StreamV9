import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import dayjs from 'dayjs';
import slugify from 'slugify';
import { CATEGORIES_FILE, MOVIES_FILE, SERIES_ROOT } from '../config/constants.js';
import {
  categorySchema,
  episodeSchema,
  movieSchema,
  seasonSchema,
  seriesSchema
} from '../validation/schemas.js';
import type { Category, Movie, Series } from '../types/catalog.js';
import { ensureDir, ensureJsonFile, readJsonFile, withFileLock, writeJsonFile } from '../utils/fs.js';

interface MoviesFile {
  movies: Movie[];
}

interface CategoriesFile {
  categories: Category[];
}

export async function listCategories(): Promise<Category[]> {
  await ensureJsonFile<CategoriesFile>(CATEGORIES_FILE, { categories: [] });
  return withFileLock(CATEGORIES_FILE, async () => {
    const data = await readJsonFile<CategoriesFile>(CATEGORIES_FILE, { categories: [] });
    return categorySchema.array().parse(data.categories);
  });
}

export async function saveCategories(categories: Category[]): Promise<void> {
  await ensureJsonFile<CategoriesFile>(CATEGORIES_FILE, { categories: [] });
  await withFileLock(CATEGORIES_FILE, async () => {
    await writeJsonFile<CategoriesFile>(CATEGORIES_FILE, { categories });
  });
}

export async function createCategory(input: Omit<Category, 'id'>): Promise<Category> {
  const category: Category = categorySchema.parse({ ...input, id: randomUUID() });
  const categories = await listCategories();
  categories.push(category);
  categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  await saveCategories(categories);
  return category;
}

export async function updateCategory(id: string, update: Partial<Category>): Promise<Category> {
  const categories = await listCategories();
  const index = categories.findIndex((cat) => cat.id === id);
  if (index === -1) {
    throw new Error('Category not found');
  }
  const updated = categorySchema.parse({ ...categories[index], ...update });
  categories[index] = updated;
  categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  await saveCategories(categories);
  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  const categories = await listCategories();
  const filtered = categories.filter((cat) => cat.id !== id);
  await saveCategories(filtered);
}

export async function reorderCategories(order: string[]): Promise<Category[]> {
  const categories = await listCategories();
  const orderMap = new Map(order.map((id, idx) => [id, idx]));
  const reordered = categories.map((cat) => ({
    ...cat,
    order: orderMap.get(cat.id) ?? cat.order
  }));
  reordered.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  await saveCategories(reordered);
  return reordered;
}

export async function listMovies(): Promise<Movie[]> {
  await ensureJsonFile<MoviesFile>(MOVIES_FILE, { movies: [] });
  return withFileLock(MOVIES_FILE, async () => {
    const data = await readJsonFile<MoviesFile>(MOVIES_FILE, { movies: [] });
    return movieSchema.array().parse(data.movies);
  });
}

export async function saveMovies(movies: Movie[]): Promise<void> {
  await ensureJsonFile<MoviesFile>(MOVIES_FILE, { movies: [] });
  await withFileLock(MOVIES_FILE, async () => {
    await writeJsonFile<MoviesFile>(MOVIES_FILE, { movies });
  });
}

export async function createMovie(payload: Omit<Movie, 'id' | 'createdAt' | 'updatedAt' | 'views'>): Promise<Movie> {
  const now = dayjs().toISOString();
  const movie: Movie = movieSchema.parse({
    ...payload,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    views: 0
  });
  const movies = await listMovies();
  if (movies.some((existing) => existing.slug === movie.slug)) {
    throw new Error('Movie slug already exists');
  }
  movies.push(movie);
  movies.sort((a, b) => a.title.localeCompare(b.title));
  await saveMovies(movies);
  return movie;
}

export async function updateMovie(id: string, update: Partial<Movie>): Promise<Movie> {
  const movies = await listMovies();
  const index = movies.findIndex((movie) => movie.id === id);
  if (index === -1) {
    throw new Error('Movie not found');
  }
  const updated = movieSchema.parse({ ...movies[index], ...update, updatedAt: dayjs().toISOString() });
  movies[index] = updated;
  await saveMovies(movies);
  return updated;
}

export async function deleteMovie(id: string): Promise<void> {
  const movies = await listMovies();
  const filtered = movies.filter((movie) => movie.id !== id);
  await saveMovies(filtered);
}

export async function incrementMovieView(id: string): Promise<void> {
  const movies = await listMovies();
  const index = movies.findIndex((movie) => movie.id === id);
  if (index === -1) {
    return;
  }
  movies[index].views += 1;
  movies[index].updatedAt = dayjs().toISOString();
  await saveMovies(movies);
}

export async function ensureSeriesRoot(): Promise<void> {
  await ensureDir(SERIES_ROOT);
}

export async function listSeries(): Promise<Series[]> {
  await ensureSeriesRoot();
  const fs = await import('node:fs/promises');
  const files = await fs.readdir(SERIES_ROOT);
  const series: Series[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const record = await readSeriesFile(seriesFilePathFromSlug(file));
    if (record) {
      series.push(record);
    }
  }
  series.sort((a, b) => a.name.localeCompare(b.name));
  return series;
}

export async function readSeriesFile(slug: string): Promise<Series | null> {
  const path = join(SERIES_ROOT, `${slug}.json`);
  if (!existsSync(path)) {
    return null;
  }
  return withFileLock(path, async () => {
    const raw = await readFile(path, 'utf-8');
    const data = JSON.parse(raw) as Series;
    return seriesSchema.parse(data);
  });
}

export async function saveSeries(series: Series): Promise<void> {
  const path = join(SERIES_ROOT, `${series.slug}.json`);
  await withFileLock(path, async () => {
    await writeJsonFile(path, series);
  });
}

export async function createOrMergeSeries(
  payload: Omit<Series, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<Series> {
  const now = dayjs().toISOString();
  await ensureSeriesRoot();
  const slug = slugify(payload.slug || payload.name, { lower: true, strict: true });
  const existing = await readSeriesFile(slug);
  let series: Series;

  if (existing) {
    // merge seasons and episodes
    const mergedSeasons = mergeSeasons(existing.seasons, payload.seasons);
    series = seriesSchema.parse({
      ...existing,
      ...payload,
      slug,
      id: existing.id,
      seasons: mergedSeasons,
      updatedAt: now
    });
  } else {
    series = seriesSchema.parse({
      ...payload,
      id: payload.id ?? randomUUID(),
      slug,
      createdAt: now,
      updatedAt: now
    });
  }

  await saveSeries(series);
  return series;
}

export async function updateSeries(slug: string, update: Partial<Series>): Promise<Series> {
  const existing = await readSeriesFile(slug);
  if (!existing) {
    throw new Error('Series not found');
  }
  const merged = seriesSchema.parse({
    ...existing,
    ...update,
    slug,
    updatedAt: dayjs().toISOString()
  });
  await saveSeries(merged);
  return merged;
}

export async function mergeEpisode(
  slug: string,
  episodePayload: {
    title: string;
    description: string;
    season: number;
    episode: number;
    duration: number;
    streamUrl: string;
    subtitles: Series['seasons'][number]['episodes'][number]['subtitles'];
    published: boolean;
  }
): Promise<Series> {
  const existing = await readSeriesFile(slug);
  if (!existing) {
    throw new Error('Series not found');
  }
  const now = dayjs().toISOString();
  const seasonIndex = existing.seasons.findIndex((season) => season.season === episodePayload.season);
  if (seasonIndex === -1) {
    existing.seasons.push(
      seasonSchema.parse({
        season: episodePayload.season,
        episodes: [
          episodeSchema.parse({
            ...episodePayload,
            id: randomUUID(),
            lastUpdated: now,
            views: 0
          })
        ]
      })
    );
  } else {
    const season = existing.seasons[seasonIndex];
    const episodeIndex = season.episodes.findIndex((ep) => ep.episode === episodePayload.episode);
    if (episodeIndex === -1) {
      season.episodes.push(
        episodeSchema.parse({
          ...episodePayload,
          id: randomUUID(),
          lastUpdated: now,
          views: 0
        })
      );
    } else {
      season.episodes[episodeIndex] = episodeSchema.parse({
        ...season.episodes[episodeIndex],
        ...episodePayload,
        lastUpdated: now
      });
    }
    season.episodes.sort((a, b) => a.episode - b.episode);
  }
  existing.seasons.sort((a, b) => a.season - b.season);
  existing.updatedAt = now;
  await saveSeries(existing);
  return existing;
}

export async function incrementSeriesView(slug: string, season: number, episodeNumber: number): Promise<void> {
  const series = await readSeriesFile(slug);
  if (!series) {
    return;
  }
  const targetSeason = series.seasons.find((s) => s.season === season);
  const targetEpisode = targetSeason?.episodes.find((ep) => ep.episode === episodeNumber);
  if (!targetEpisode) {
    return;
  }
  targetEpisode.views += 1;
  targetEpisode.lastUpdated = dayjs().toISOString();
  await saveSeries(series);
}

function mergeSeasons(
  existingSeasons: Series['seasons'],
  incomingSeasons: Series['seasons']
): Series['seasons'] {
  const seasonMap = new Map<number, Series['seasons'][number]>();
  for (const season of existingSeasons) {
    seasonMap.set(season.season, {
      ...season,
      episodes: [...season.episodes]
    });
  }
  for (const incoming of incomingSeasons) {
    const sanitizedSeason = seasonSchema.parse(incoming);
    const current = seasonMap.get(sanitizedSeason.season);
    if (!current) {
      seasonMap.set(sanitizedSeason.season, sanitizedSeason);
    } else {
      const episodeMap = new Map<number, typeof sanitizedSeason.episodes[number]>();
      for (const episode of current.episodes) {
        episodeMap.set(episode.episode, episode);
      }
      for (const incomingEpisode of sanitizedSeason.episodes) {
        const parsedEpisode = episodeSchema.parse(incomingEpisode);
        const existingEpisode = episodeMap.get(parsedEpisode.episode);
        if (!existingEpisode) {
          episodeMap.set(parsedEpisode.episode, parsedEpisode);
        } else {
          episodeMap.set(parsedEpisode.episode, {
            ...existingEpisode,
            ...parsedEpisode,
            lastUpdated: dayjs().toISOString()
          });
        }
      }
      current.episodes = Array.from(episodeMap.values()).sort((a, b) => a.episode - b.episode);
      seasonMap.set(current.season, current);
    }
  }

  return Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);
}

export function seriesFilePathFromSlug(path: string): string {
  return basename(path, '.json');
}
