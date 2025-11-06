import createDOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';
import type { DOMWindow } from 'jsdom';

const window = new JSDOM('').window as unknown as DOMWindow;
const DOMPurify = createDOMPurify(window);

export function sanitize(input: string): string {
  return DOMPurify.sanitize(input ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
