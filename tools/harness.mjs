import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

function chromePath() {
  for (const c of CHROME_CANDIDATES) if (c) return c;
  return undefined;
}

/**
 * Software rasterisation via SwiftShader. This exists so the visual review loop can
 * run without a GPU. It is correct but slow - never read a frame rate off it.
 */
const SWIFTSHADER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
];

export async function startServer({ port = 5173, mode = 'dev' } = {}) {
  const cmd = mode === 'dev'
    ? ['npx', ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort']]
    : ['npx', ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1', '--strictPort']];

  const proc = spawn(cmd[0], cmd[1], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.stderr.on('data', (d) => { out += d.toString(); });

  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { proc, url, log: () => out };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 350));
  }
  proc.kill('SIGKILL');
  throw new Error(`server failed to start on ${port}\n${out}`);
}

export async function stopServer(server) {
  if (!server?.proc) return;
  server.proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  if (!server.proc.killed) server.proc.kill('SIGKILL');
}

export async function launchBrowser() {
  return chromium.launch({
    executablePath: chromePath(),
    args: SWIFTSHADER_ARGS,
  });
}

/**
 * Open the game, wait for boot, and hand back the page plus anything the console
 * complained about on the way. Console errors are treated as defects by the review
 * pass, so they are collected from before the first navigation.
 */
export async function openGame(browser, url, {
  width = 1600, height = 900, query = '', settleFrames = 90, timeout = 90000,
} = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleErrors.push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));

  const full = url + (query ? (url.includes('?') ? '&' : '?') + query : '');
  await page.goto(full, { waitUntil: 'domcontentloaded', timeout });

  await page.waitForFunction(() => window.__NADIR !== undefined, null, { timeout });
  const state = await page.evaluate(() => ({ ready: window.__NADIR.ready, error: window.__NADIR.error }));
  if (!state.ready) {
    return { page, consoleErrors, pageErrors, booted: false, bootError: state.error };
  }

  // Let the frame settle - shaders compile, LODs pick a level, VFX warm up.
  await page.evaluate((n) => new Promise((resolve) => {
    let i = 0;
    const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), settleFrames);

  return { page, consoleErrors, pageErrors, booted: true };
}
