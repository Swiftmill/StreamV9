import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';

export async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

export async function readJsonFile<T>(path: string, defaultValue: T): Promise<T> {
  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await ensureDir(dirname(path));
      await writeJsonFile(path, defaultValue);
      return defaultValue;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  await ensureDir(dirname(path));
  const tmpPath = `${path}.tmp-${Date.now()}-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, path);
}

export async function ensureJsonFile<T>(path: string, defaultValue: T): Promise<void> {
  if (!existsSync(path)) {
    await writeJsonFile(path, defaultValue);
  }
}

export async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await ensureDir(dirname(path));
  const release = await lockfile.lock(path, {
    retries: {
      retries: 5,
      minTimeout: 50,
      maxTimeout: 200
    },
    realpath: false
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function appendToFile(path: string, line: string): Promise<void> {
  await ensureDir(dirname(path));
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(path, { flags: 'a' });
    stream.write(`${line}\n`, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    stream.end();
  });
}
