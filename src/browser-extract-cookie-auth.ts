/**
 * Browser SSO login for SAP ADT — standalone entry point.
 *
 * Launches a Chromium-based browser, opens the SAP ADT entry, and captures
 * session cookies via CDP once SSO completes. Cookies are written in Netscape
 * format, compatible with --cookie-file.
 *
 * URL is resolved the same way cli.ts resolves it (CLI > env > .env).
 * Browser path: --browser → $BROWSER → findBrowser() fallback.
 *
 * Usage:
 *   npx tsx src/browser-login.ts [--output cookies.txt] [--timeout 180] [--browser <exe>]
 *
 * No runtime deps — uses Node 22+ globals (fetch, WebSocket).
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from 'dotenv';
import { parseArgs as parseServerArgs } from './server/config.js';

config();

const AUTH_COOKIE = /^(MYSAPSSO2|SAP_SESSIONID)/i;

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: { message: string };
}

async function main(): Promise<void> {
  const scriptArgs = parseArgs(process.argv.slice(2));
  const serverConfig = parseServerArgs([]);
  const sapUrl = serverConfig.url;
  const browserExec = scriptArgs.browser ?? process.env['BROWSER'] ?? findBrowser();
  const output = scriptArgs.output ?? 'cookies.txt';
  const timeoutMs = Number(scriptArgs.timeout ?? 180) * 1000;

  if (!sapUrl) fail('SAP URL is required (--url, SAP_URL env, or .env)');
  if (!browserExec) fail('No Chromium-based browser found — install Chrome/Edge/Brave or pass --browser');

  try {
    const { cookies, origin } = await browserLogin(sapUrl, browserExec, timeoutMs);
    saveCookiesNetscape(output, cookies, origin);
    console.error(`[browser-login] saved ${Object.keys(cookies).length} cookies to ${output}`);
  } catch (err) {
    fail((err as Error).message || String(err));
  }
}

// ---------- core ----------

async function browserLogin(
  sapUrl: string,
  browserExec: string,
  timeoutMs: number,
): Promise<{ cookies: Record<string, string>; origin: string }> {
  const origin = new URL(sapUrl).origin;
  const profileDir = mkdtempSync(join(tmpdir(), 'arc1-login-'));
  const child = spawn(
    browserExec,
    [
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      `${origin}/sap/bc/adt/`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr?.on('data', (chunk) => process.stderr.write(`[browser] ${chunk}`));
  child.on('exit', (code) => console.error(`[browser-login] browser exited (code=${code})`));
  console.error(`[browser-login] opened ${origin}/sap/bc/adt/ — complete SSO in the browser window`);

  const isAlive = () => child.exitCode === null && !child.killed;
  try {
    try {
      const wsUrl = await discoverDebugger(profileDir, timeoutMs, isAlive);
      const cdp = await Cdp.open(wsUrl);
      try {
        const sessionId = await attachFirstPage(cdp, isAlive);
        const cookies = await pollCookies(cdp, sessionId, origin, timeoutMs, isAlive);
        return { cookies, origin };
      } finally {
        cdp.close();
      }
    } catch (err) {
      if (isBrowserGoneError(err, isAlive)) {
        throw new Error('Browser closed before we could get a cookie.');
      }
      throw err;
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await waitForExit(child, 3000);
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // best-effort — Chromium may briefly hold handles after exit
    }
  }
}

function isBrowserGoneError(err: unknown, isAlive: () => boolean): boolean {
  if (!isAlive()) return true;
  const msg = (err as Error | undefined)?.message ?? '';
  return /CDP WebSocket|CDP connect failed|session with given id not found|Browser exited|Browser was closed/i.test(
    msg,
  );
}

function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    child.once('exit', done);
    sleep(ms).then(done);
  });
}

/** Probe well-known Chromium-based browser paths. Returns undefined if none found. */
function findBrowser(): string | undefined {
  const candidates: string[] =
    process.platform === 'win32'
      ? [
          `${process.env['PROGRAMFILES'] ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${process.env['PROGRAMFILES'] ?? 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${process.env['PROGRAMFILES'] ?? 'C:\\Program Files'}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];
  return candidates.find((p) => p && existsSync(p));
}

function saveCookiesNetscape(path: string, cookies: Record<string, string>, origin: string): void {
  const host = new URL(origin).hostname;
  const lines = ['# Netscape HTTP Cookie File', `# Generated: ${new Date().toISOString()}`];
  for (const [name, value] of Object.entries(cookies)) {
    lines.push([host, 'FALSE', '/', 'FALSE', '0', name, value].join('\t'));
  }
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

async function discoverDebugger(profileDir: string, timeoutMs: number, isAlive: () => boolean): Promise<string> {
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Browser exited before debug port was ready');
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf-8').split('\n')[0]);
      if (Number.isFinite(port) && port > 0) {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        const { webSocketDebuggerUrl } = (await res.json()) as { webSocketDebuggerUrl: string };
        return webSocketDebuggerUrl;
      }
    }
    await sleep(100);
  }
  throw new Error('Browser did not open a debug port in time');
}

async function attachFirstPage(cdp: Cdp, isAlive: () => boolean): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Browser exited before page target was available');
    const { targetInfos } = await cdp.send<{ targetInfos: { targetId: string; type: string }[] }>('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    if (page) {
      const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
        targetId: page.targetId,
        flatten: true,
      });
      return sessionId;
    }
    await sleep(100);
  }
  throw new Error('No page target available');
}

async function pollCookies(
  cdp: Cdp,
  sessionId: string,
  origin: string,
  timeoutMs: number,
  isAlive: () => boolean,
): Promise<Record<string, string>> {
  const urls = [origin, `${origin}/sap/`, `${origin}/sap/bc/`, `${origin}/sap/bc/adt/`];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Browser was closed before login completed');
    const { cookies } = await cdp.send<{ cookies: { name: string; value: string }[] }>(
      'Network.getCookies',
      { urls },
      sessionId,
    );
    if (cookies.some((c) => AUTH_COOKIE.test(c.name))) {
      return Object.fromEntries(cookies.map((c) => [c.name, c.value]));
    }
    await sleep(500);
  }
  throw new Error('Login not completed within timeout');
}

// ---------- tiny CDP client ----------

class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, (msg: CdpResponse) => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)) as CdpResponse;
      if (typeof msg.id !== 'number') return;
      const cb = this.pending.get(msg.id);
      if (cb) {
        this.pending.delete(msg.id);
        cb(msg);
      }
    });
    const failAll = (reason: string) => {
      for (const cb of this.pending.values()) cb({ error: { message: reason } });
      this.pending.clear();
    };
    ws.addEventListener('close', () => failAll('CDP WebSocket closed'));
    ws.addEventListener('error', () => failAll('CDP WebSocket error'));
  }

  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.addEventListener('open', () => ok(), { once: true });
      ws.addEventListener('error', () => fail(new Error('CDP connect failed')), { once: true });
      ws.addEventListener('close', () => fail(new Error('CDP WebSocket closed before open')), { once: true });
    });
    return new Cdp(ws);
  }

  send<T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (msg) => {
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result as T);
      });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  close(): void {
    this.ws.close();
  }
}

// ---------- arg parsing ----------

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k.startsWith('--')) out[k.slice(2)] = argv[++i] ?? '';
  }
  return out;
}

function fail(msg: string): never {
  console.error(`[browser-login] ${msg}`);
  process.exit(1);
}

await main();
