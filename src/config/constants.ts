export const DATA_ROOT = new URL('../data/', import.meta.url).pathname;
export const USERS_ROOT = `${DATA_ROOT}users/`;
export const HISTORY_ROOT = `${DATA_ROOT}users/history/`;
export const CATALOG_ROOT = `${DATA_ROOT}catalog/`;
export const SERIES_ROOT = `${CATALOG_ROOT}series/`;
export const MOVIES_FILE = `${CATALOG_ROOT}movies.json`;
export const CATEGORIES_FILE = `${CATALOG_ROOT}categories.json`;
export const USERS_FILE = `${USERS_ROOT}users.json`;
export const ADMIN_FILE = `${USERS_ROOT}admin.json`;
export const AUDIT_LOG_FILE = `${DATA_ROOT}audit.log`;
export const SESSIONS_ROOT = `${DATA_ROOT}sessions/`;

export const SESSION_COOKIE_NAME = 'sv9.sid';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const VIDEO_DOMAIN_WHITELIST = [
  'example.com',
  'cdn.example.com',
  'videos.local',
  'stream.local'
];

export const STREAM_TYPES = ['movie', 'series'] as const;

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  PUBLISH: 'PUBLISH',
  UNPUBLISH: 'UNPUBLISH',
  FEATURE: 'FEATURE',
  RESET_PASSWORD: 'RESET_PASSWORD',
  DISABLE_USER: 'DISABLE_USER',
  VIEW: 'VIEW'
} as const;
