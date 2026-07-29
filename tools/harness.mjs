import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SERVER LIFECYCLE. Read this before changing anything below it.
 *
 * An earlier version took a fixed port, spawned `vite --strictPort`, and polled the URL
 * until it answered. That has a failure mode that cost this project five hours of dead
 * agents, and it is worth writing down because it looks correct:
 *
 *   1. A previous run leaves an orphaned server holding the port.
 *   2. The new `vite --strictPort` fails to bind and exits.
 *   3. The poll fetches the URL and IT ANSWERS - because the ORPHAN is serving it.
 *   4. startServer reports success. The harness is now driving a zombie serving a
 *      STALE BUNDLE, so agents silently test code that is not the code on disk, and
 *      hang for good when the zombie eventually dies mid-run.
 *
 * The hang was the visible symptom; testing a stale bundle was the dangerous part.
 *
 * Three things prevent it now: the port is probed for freedom and moved if taken, so a
 * stale server can never be inherited; every spawned server is tracked and killed on
 * exit, including on SIGINT/SIGTERM and uncaught throws, so orphans are not created in
 * the first place; and startup waits for OUR child to be listening rather than for the
 * URL to answer.
 */
const LIVE_SERVERS = new Set();

function killServer(proc) {
  // Spawned detached, so the pid is a process-group leader. Killing the NEGATIVE pid
  // takes the group, which is the only way to be sure nothing vite spawned survives.
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* group already gone */ }
  try { proc.kill('SIGKILL'); } catch { /* already gone */ }
}

function killAllServers() {
  for (const proc of LIVE_SERVERS) killServer(proc);
  LIVE_SERVERS.clear();
}

let cleanupInstalled = false;
function installCleanup() {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) {
    process.on(sig, (err) => {
      killAllServers();
      if (sig === 'uncaughtException') {
        console.error('[harness] uncaught:', err);
        process.exit(1);
      }
      if (sig !== 'exit') process.exit(130);
    });
  }
}

/** Is this TCP port genuinely bindable right now? */
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

/**
 * First bindable port at or after `start`. Never inherit somebody else's server:
 * a port that is taken belongs to a run we know nothing about.
 */
export async function findFreePort(start, span = 400) {
  for (let p = start; p < start + span; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`[harness] no free port in ${start}..${start + span}`);
}

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

export async function startServer({ port = 5173, mode = 'dev', build = false } = {}) {
  if (build || mode === 'preview') {
    // Build first so `preview` has something to serve. Preview mode exists because
    // the dev server's HMR full-reloads the page mid-settle whenever another stream
    // writes to the tree, which the harness would otherwise report as a boot failure.
    await new Promise((resolve, reject) => {
      const b = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'error'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      b.stderr.on('data', (d) => { err += d.toString(); });
      b.stdout.on('data', (d) => { err += d.toString(); });
      b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build failed:\n${err}`))));
    });
  }

  installCleanup();

  // Never inherit a port. If the requested one is taken it belongs to a run we know
  // nothing about, and serving from it would test a bundle that is not ours.
  const actualPort = await findFreePort(port);
  if (actualPort !== port) {
    console.warn(`[harness] port ${port} is in use; using ${actualPort} instead`);
  }

  /*
   * Spawn the vite binary DIRECTLY, never through npx.
   *
   * `spawn('npx', ['vite', ...])` makes npx the direct child and vite a GRANDCHILD, so
   * proc.kill() kills npx and leaves vite running. The evidence was unmistakable once
   * looked for: every orphan had PPID 1, reparented to init after its real parent died.
   * That is why the cleanup handlers added earlier looked correct and swept nothing —
   * they were faithfully killing a process that was not holding the port.
   *
   * `detached: true` plus killing the negative pid takes out the whole process group,
   * so anything vite itself spawns goes with it.
   */
  const viteBin = path.join(ROOT, 'node_modules', '.bin', 'vite');
  const args = mode === 'dev'
    ? ['--port', String(actualPort), '--host', '127.0.0.1', '--strictPort']
    : ['preview', '--port', String(actualPort), '--host', '127.0.0.1', '--strictPort'];

  const proc = spawn(viteBin, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  LIVE_SERVERS.add(proc);
  let out = '';
  let exited = null;
  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.stderr.on('data', (d) => { out += d.toString(); });
  proc.on('exit', (code) => { exited = code ?? 0; LIVE_SERVERS.delete(proc); });

  const url = `http://127.0.0.1:${actualPort}/`;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    // If our child died, fail immediately rather than polling a port that some other
    // process might answer on. This is the check whose absence caused the zombie bug.
    if (exited !== null) {
      throw new Error(`[harness] vite exited with code ${exited} before serving ${url}\n${out}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { proc, url, port: actualPort, log: () => out };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 350));
  }
  killServer(proc);
  LIVE_SERVERS.delete(proc);
  throw new Error(`[harness] server failed to start on ${actualPort} within 45s\n${out}`);
}

export async function stopServer(server) {
  if (!server?.proc) return;
  try { process.kill(-server.proc.pid, 'SIGTERM'); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 300));
  killServer(server.proc);
  LIVE_SERVERS.delete(server.proc);
}

/** Kill anything this process started. Exported so a tool can clean up mid-run. */
export { killAllServers };

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
