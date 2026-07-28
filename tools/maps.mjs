/**
 * TEXTURE CONTACT SHEET — the plate layout at 1:1, without booting the game.
 *
 *   node tools/maps.mjs                       # player, all three frequency tiers
 *   node tools/maps.mjs --faction coalition
 *   node tools/maps.mjs --out docs/probes/hullmaps.png
 *
 * WHY THIS EXISTS
 * The material probe renders spheres. A sphere is the right thing for judging
 * roughness and metalness and the wrong thing for judging a plate layout: the calm
 * armour tier is a 94 m tile, so a 26 m sphere shows a third of one tile and the
 * question "do the seams run continuously fore-and-aft" cannot be asked of it at all.
 * It is also a full game boot per look, which under software rasterisation is minutes.
 *
 * This draws the generated ALBEDO, NORMAL and ORM canvases straight onto a 2D canvas
 * at 1:1 with a metre ruler under each, which is the only view in which "seam width
 * 0.26 m" and "largest plate module >= 55 m" are checkable claims.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const faction = arg('faction', 'player');
const outPath = path.resolve(ROOT, arg('out', 'docs/probes/hullmaps.png'));
const port = Number(process.env.PORT || 5311);

await fs.mkdir(path.dirname(outPath), { recursive: true });

let server, browser, failed = false;
try {
  // Dev mode on purpose: this tool imports SOURCE modules by path, which is the whole
  // point — it is looking at the generator, not at a bundle.
  server = await startServer({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1720, height: 1760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });

  await page.evaluate(async ({ faction }) => {
    const { hullMaps } = await import('/src/art/textures/hullMaps.js');
    const { macroField } = await import('/src/art/textures/macro.js');
    const { RNG } = await import('/src/core/rng.js');

    const VARIANTS = ['hull', 'plating', 'greeble'];
    const S = 384;             // display size per map
    const PAD = 14;
    const LABEL = 26;
    const W = 1720, H = 1760;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.id = 'sheet';
    document.body.style.margin = '0';
    document.body.innerHTML = '';
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    g.font = '13px monospace';
    g.textBaseline = 'top';

    const rng = new RNG('maps-sheet');
    let y = PAD;
    for (const variant of VARIANTS) {
      // `markings: false` matches the registry: hullMaps' TILING stencils are off in
      // the game (see materials/index.js#hullMapsFor) because anything stamped into a
      // tiling map repeats fifteen times down the hull. The macro atlas draws them once.
      const maps = hullMaps({ rng: rng.fork(variant), faction, variant, tier: 2, size: 512, markings: false });
      const tileM = maps.tileM;
      g.fillStyle = '#cfd6dc';
      g.fillText(
        `${variant.toUpperCase().padEnd(9)} tile ${tileM.toFixed(1)} m   `
        + `repeats over 1400 m: ${(1400 / tileM).toFixed(1)}   `
        + `strakes ${maps.panel.strakes.length}   `
        + `plates/strake ${maps.panel.strakes.map((s) => s.plates.length).join(',')}   `
        + `strake height ${(tileM / maps.panel.strakes.length).toFixed(1)} m`,
        PAD, y);
      y += LABEL;

      const canvases = [
        [maps.albedoCanvas, 'ALBEDO'],
        [maps.normalCanvas, 'NORMAL'],
        [maps.ormCanvas, 'ORM  (R ao  G rough  B metal)'],
      ];
      let x = PAD;
      for (const [cv, name] of canvases) {
        g.imageSmoothingEnabled = false;
        try { g.drawImage(cv, x, y, S, S); } catch (e) { throw new Error('map drawImage ' + name + ' ' + variant + ': ' + e.message + ' | ' + Object.prototype.toString.call(cv)); }
        g.strokeStyle = '#2a3138';
        g.strokeRect(x + 0.5, y + 0.5, S, S);
        g.fillStyle = '#8b969f';
        g.fillText(name, x + 3, y + S + 4);

        // A 10 m ruler along the bottom of the first map, so seam widths and plate
        // lengths are readable as metres rather than as texels.
        if (name === 'ALBEDO') {
          const pxPerM = S / tileM;
          g.strokeStyle = '#4f9dd6';
          g.beginPath();
          for (let mm = 0; mm <= tileM; mm += 10) {
            const px = x + mm * pxPerM;
            g.moveTo(px, y + S);
            g.lineTo(px, y + S + (mm % 50 === 0 ? 10 : 5));
          }
          g.stroke();
          g.fillStyle = '#4f9dd6';
          g.fillText('|--10 m--|', x, y + S + 12);
        }
        x += S + PAD;
      }

      y += S + 34;
    }
    /**
     * THE MACRO ATLAS, ONE CHANNEL AT A TIME.
     *
     * Drawn straight, the atlas is unreadable: the marks live in ALPHA, so an RGBA
     * blit puts them THROUGH the drift channel and a hazard band on the bay rail
     * looks like a hole. The two things worth checking here — are the marks on
     * structure, and did the two families separate — are both alpha-only questions.
     * Each region is annotated with the hull feature its marks are anchored to.
     */
    const macro = macroField({ rng: rng.fork('macro'), faction, seed: 0, marks: 1 });
    // The atlas is a DataTexture, so `image` is {data, width, height} and the bytes
    // are read straight off it. That is exactly WHY it is a DataTexture: this map's
    // ALPHA channel carries data rather than coverage, and routing it through a 2D
    // canvas would premultiply the other three channels away wherever alpha is 0 —
    // which is almost everywhere. See textures/macro.js.
    const img = macro.texture.image;
    const px = img.data;

    /**
     * A one-line proof that the DataTexture in textures/macro.js is not a style
     * choice. Round-trips a byte with alpha 0 through the 2D canvas the atlas used to
     * be built on, in the same browser the game runs in, and prints what comes back.
     */
    {
      const t = document.createElement('canvas');
      t.width = 2; t.height = 1;
      const tg = t.getContext('2d', { willReadFrequently: true });
      const tid = tg.createImageData(2, 1);
      tid.data.set([200, 150, 100, 0, 200, 150, 100, 255]);
      tg.putImageData(tid, 0, 0);
      const back = tg.getImageData(0, 0, 2, 1).data;
      g.fillStyle = '#ffb454';
      g.fillText(
        `canvas alpha round-trip: wrote RGB(200,150,100) at A=0, read back RGB(${back[0]},${back[1]},${back[2]})`
        + `   |   at A=255 read back RGB(${back[4]},${back[5]},${back[6]})`,
        PAD, y - 2 + 0);
      y += 18;
    }

    const CH = [
      [0, 'R  value drift  (+ the 180 m frame rhythm)'],
      [2, 'B  soot'],
      [3, 'A  marks:  mid grey = ink 0.42,  white = hazard 1.0'],
    ];
    const cw = 470, chh = cw * (img.height / img.width);
    let cx = PAD;
    g.fillStyle = '#cfd6dc';
    g.fillText('MACRO ATLAS   regions:  0 +X flank  1 -X flank  2 +Y deck  /  3 -Y belly  4 +Z bow  5 -Z stern',
      PAD, y);
    y += LABEL;
    for (const [ch, name] of CH) {
      const out = document.createElement('canvas');
      out.width = img.width; out.height = img.height;
      const oc = out.getContext('2d');
      const id = oc.createImageData(img.width, img.height);
      for (let i = 0; i < img.width * img.height; i++) {
        const v = px[i * 4 + ch];
        id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
      }
      oc.putImageData(id, 0, 0);
      try { g.drawImage(out, cx, y, cw, chh); } catch (e) { throw new Error('macro drawImage ch' + ch + ': ' + e.message + ' | out=' + Object.prototype.toString.call(out) + ' w=' + out.width); }
      g.strokeStyle = '#2a3138';
      g.strokeRect(cx + 0.5, y + 0.5, cw, chh);
      // Region grid, so a mark can be attributed to a face without counting pixels.
      g.strokeStyle = '#4f9dd6';
      g.beginPath();
      g.moveTo(cx + cw / 3, y); g.lineTo(cx + cw / 3, y + chh);
      g.moveTo(cx + cw * 2 / 3, y); g.lineTo(cx + cw * 2 / 3, y + chh);
      g.moveTo(cx, y + chh / 2); g.lineTo(cx + cw, y + chh / 2);
      g.stroke();
      g.fillStyle = '#8b969f';
      g.fillText(name, cx + 3, y + chh + 4);
      cx += cw + PAD;
    }
  }, { faction });

  await page.locator('#sheet').screenshot({ path: outPath });
  console.log(`maps sheet -> ${path.relative(ROOT, outPath)}`);
  if (errors.length) { failed = true; for (const e of errors) console.error('  ' + e.split('\n')[0]); }
} catch (err) {
  failed = true;
  console.error('MAPS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}
process.exit(failed ? 1 : 0);
