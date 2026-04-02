/**
 * Cookie parsing for SAP ADT authentication.
 *
 * Supports two formats:
 * 1. Netscape cookie file (used by curl, wget, browser extensions)
 *    Format: domain\tflag\tpath\tsecure\texpiration\tname\tvalue
 * 2. Inline cookie string (key1=val1; key2=val2)
 *
 * Used for BTP Cloud Connector scenarios where browser cookies
 * are exported and passed to ARC-1 for authentication.
 */

import { readFileSync } from 'node:fs';

/**
 * Load cookies from a Netscape-format cookie file.
 *
 * Lines starting with # are comments.
 * Empty lines are skipped.
 * Falls back to key=value format if line doesn't have 7 tab-separated fields.
 */
export function loadCookiesFromFile(cookieFile: string): Record<string, string> {
  const content = readFileSync(cookieFile, 'utf-8');
  return parseCookieFileContent(content);
}

/** Parse cookie file content (separated for testability) */
export function parseCookieFileContent(content: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    // Netscape format: 7 tab-separated fields
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const name = parts[5]!;
      const value = parts[6]!;
      cookies[name] = value;
    } else if (line.includes('=')) {
      // Simple key=value fallback
      const eqIndex = line.indexOf('=');
      const key = line.slice(0, eqIndex).trim();
      const val = line.slice(eqIndex + 1).trim();
      if (key) cookies[key] = val;
    }
  }

  return cookies;
}

/**
 * Parse a cookie string in the format "key1=val1; key2=val2".
 * Used with --cookie-string CLI flag or SAP_COOKIE_STRING env var.
 */
export function parseCookieString(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieString.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.includes('=')) continue;

    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (key) cookies[key] = val;
  }

  return cookies;
}
