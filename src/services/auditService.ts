import dayjs from 'dayjs';
import { AUDIT_LOG_FILE } from '../config/constants.js';
import { appendToFile } from '../utils/fs.js';

export async function logAudit(
  user: string,
  action: string,
  target: string,
  details: Record<string, unknown> | string
): Promise<void> {
  const timestamp = dayjs().toISOString();
  const serializedDetails =
    typeof details === 'string' ? details : JSON.stringify(details, null, 2);
  const line = `${timestamp} | ${user} | ${action} | ${target} | ${serializedDetails}`;
  await appendToFile(AUDIT_LOG_FILE, line);
}
