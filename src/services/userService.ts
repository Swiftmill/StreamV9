import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import bcrypt from 'bcryptjs';
import { ADMIN_FILE, HISTORY_ROOT, USERS_FILE, USERS_ROOT } from '../config/constants.js';
import {
  createUserSchema,
  historyEntrySchema,
  loginSchema,
  updateUserSchema,
  userSchema
} from '../validation/schemas.js';
import type { HistoryEntry, UserRecord } from '../types/catalog.js';
import { ensureDir, ensureJsonFile, readJsonFile, withFileLock, writeJsonFile } from '../utils/fs.js';

interface UsersFile {
  users: UserRecord[];
}

interface AdminFile {
  admin: UserRecord;
}

export async function listUsers(): Promise<UserRecord[]> {
  await ensureJsonFile<UsersFile>(USERS_FILE, { users: [] });
  return withFileLock(USERS_FILE, async () => {
    const data = await readJsonFile<UsersFile>(USERS_FILE, { users: [] });
    return userSchema.array().parse(data.users);
  });
}

export async function getAdmin(): Promise<UserRecord | null> {
  if (!existsSync(ADMIN_FILE)) {
    return null;
  }
  return withFileLock(ADMIN_FILE, async () => {
    const data = await readJsonFile<AdminFile>(ADMIN_FILE, { admin: null as unknown as UserRecord });
    if (!data.admin) return null;
    return userSchema.parse(data.admin);
  });
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const admin = await getAdmin();
  if (admin && admin.username === username) {
    return admin;
  }
  const users = await listUsers();
  return users.find((user) => user.username === username) ?? null;
}

export async function createUser(
  payload: { username: string; password: string; role: 'admin' | 'user' }
): Promise<UserRecord> {
  const parsed = createUserSchema.parse(payload);
  const existing = await findUserByUsername(parsed.username);
  if (existing) {
    throw new Error('Username already exists');
  }
  const now = dayjs().toISOString();
  const passwordHash = await bcrypt.hash(parsed.password, 12);
  const user: UserRecord = userSchema.parse({
    id: randomUUID(),
    username: parsed.username,
    passwordHash,
    role: parsed.role,
    active: true,
    createdAt: now,
    updatedAt: now
  });
  if (user.role === 'admin') {
    await ensureDir(USERS_ROOT);
    await ensureJsonFile<AdminFile>(ADMIN_FILE, { admin: user });
    await withFileLock(ADMIN_FILE, async () => {
      await writeJsonFile<AdminFile>(ADMIN_FILE, { admin: user });
    });
  } else {
    const users = await listUsers();
    users.push(user);
    await withFileLock(USERS_FILE, async () => {
      await writeJsonFile<UsersFile>(USERS_FILE, { users });
    });
  }
  return user;
}

export async function updateUser(
  username: string,
  update: { password?: string; active?: boolean; role?: 'admin' | 'user' }
): Promise<UserRecord> {
  const parsed = updateUserSchema.parse(update);
  const admin = await getAdmin();
  if (admin && admin.username === username) {
    const updatedAdmin = await applyUserUpdate(admin, parsed);
    await withFileLock(ADMIN_FILE, async () => {
      await writeJsonFile<AdminFile>(ADMIN_FILE, { admin: updatedAdmin });
    });
    return updatedAdmin;
  }
  const users = await listUsers();
  const index = users.findIndex((user) => user.username === username);
  if (index === -1) {
    throw new Error('User not found');
  }
  const updated = await applyUserUpdate(users[index], parsed);
  users[index] = updated;
  await withFileLock(USERS_FILE, async () => {
    await writeJsonFile<UsersFile>(USERS_FILE, { users });
  });
  return updated;
}

async function applyUserUpdate(
  user: UserRecord,
  update: { password?: string; active?: boolean; role?: 'admin' | 'user' }
): Promise<UserRecord> {
  const now = dayjs().toISOString();
  const passwordHash = update.password
    ? await bcrypt.hash(update.password, 12)
    : user.passwordHash;
  return userSchema.parse({
    ...user,
    passwordHash,
    active: update.active ?? user.active,
    role: update.role ?? user.role,
    updatedAt: now
  });
}

export async function verifyCredentials(username: string, password: string): Promise<UserRecord | null> {
  const parsed = loginSchema.parse({ username, password });
  const user = await findUserByUsername(parsed.username);
  if (!user || !user.active) {
    return null;
  }
  const matches = await bcrypt.compare(parsed.password, user.passwordHash);
  return matches ? user : null;
}

export async function getHistory(username: string): Promise<HistoryEntry[]> {
  const path = `${HISTORY_ROOT}${username}.json`;
  await ensureJsonFile(path, { history: [] as HistoryEntry[] });
  return withFileLock(path, async () => {
    const data = await readJsonFile<{ history: HistoryEntry[] }>(path, { history: [] });
    return historyEntrySchema.array().parse(data.history);
  });
}

export async function appendHistory(username: string, entry: HistoryEntry): Promise<void> {
  const path = `${HISTORY_ROOT}${username}.json`;
  await ensureDir(HISTORY_ROOT);
  await ensureJsonFile(path, { history: [] as HistoryEntry[] });
  await withFileLock(path, async () => {
    const existing = await readJsonFile<{ history: HistoryEntry[] }>(path, { history: [] });
    const history = historyEntrySchema.array().parse(existing.history);
    const filtered = history.filter((item) => item.contentId !== entry.contentId);
    filtered.unshift(entry);
    await writeJsonFile(path, { history: filtered });
  });
}
