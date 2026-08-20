/**
 * Boot and the frame loop.
 *
 * The shape to preserve: the simulation advances in fixed ticks, and rendering
 * reads the result. The renderer never writes to a body. Everything that moves
 * does so because a tick moved it, which is what keeps the sim reproducible
 * from a seed and keeps a replay meaningful.
 *
 * The ship is baked into all four LOD tiers up front, one atlas per zoom
 * level, rather than one atlas at native resolution reused everywhere. Spec
 * §5.4 is explicit that zoom never scales a sprite — it swaps to a
 * pre-generated tier — and §11 requires "all four LOD tiers present for every
 * hull" and "moving across all four zoom levels never breaks the sense of
 * size". A single native-resolution atlas shown unscaled at every zoom level
 * would leave the cruiser exactly the same size on screen whether the camera
 * is at Close or Wide, which fails both. Two sprites (current tier, and the
 * tier being faded out of) cover the ~80ms crossfade zoom.ts already tracks
 * via `crossfadeAlpha` — that alpha was otherwise computed and unused.
 */

import { Sprite, TilingSprite, type Ticker } from 'pixi.js';
import { buildHull } from '../gen/hull.js';
import { buildModule, MODULE_CATALOGUE } from '../gen/module.js';
import { compositeShip, type Loadout } from '../gen/composite.js';
import { bakeRotations } from '../gen/rotate.js';
import { buildLodSet } from '../gen/lod.js';
import { buildPoiStack } from '../gen/celestial.js';
import { EMISSIVE, FACTION_PALETTE, NEUTRAL } from '../gen/palette.js';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { makeLoop } from '../sim/loop.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { createDevice, presentDevice, resizeDevice, type Device } from '../render/device.js';
import { makeScene, setLayerSprite } from '../render/scene.js';
import { atlasFromBins, textureFromPixBuf, type BinAtlas } from '../render/textures.js';
import { makeCamera, snappedCentre } from '../render/camera.js';
import { tiledLayers } from '../render/parallax.js';
import { pivotOffset } from '../render/lodpivot.js';
import { makeZoom, unitsPerPixel } from '../render/zoom.js';
import { screenToWorld, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../render/viewport.js';
import { makePostChain, type PostChain } from '../render/post.js';
import { makeFrameState, updateFrame } from './frame.js';
import { attachInput, drainInput, makeInput } from './input.js';

const SEED = 'wave2';

/**
 * What `boot` hands back.
 *
 * `post` is here because `setEnabled` is the only way to toggle a stage of the
 * post chain, and a chain whose return value is discarded can never be toggled
 * by anything. `stop` exists so a caller that booted the game can also take it
 * down — without it the ticker and the window listeners outlive their host.
 */
export interface Game {
  device: Device;
  post: PostChain;
  stop(): void;
}

export async function boot(): Promise<Game> {
  const host = document.getElementById('app');
  if (host === null) throw new Error('missing #app host element');

  const device = await createDevice(host);
  const scene = makeScene(device.stage);
  const post = makePostChain(scene.root);

  const rng = makeRng(SEED);

  // The ship: a fitted cruiser, baked into rotation bins and uploaded once per
  // LOD tier so every zoom level has its own correctly-sized sprite.
  const hull = buildHull({ faction: 'player', sizeClass: 'cruiser', rng: rng.split('hull') });
  const pick = (id: string) => MODULE_CATALOGUE.find((m) => m.id === id)!;
  const loadout: Loadout = {
    bow: buildModule(pick('siege-lance'), 'player', rng.split('m1')),
    dorsal: buildModule(pick('rail-battery'), 'player', rng.split('m2')),
    engine: buildModule(pick('thruster-uprate'), 'player', rng.split('m3')),
  };
  const ship = compositeShip(hull, loadout);

  // buildLodSet returns [native, /4, /8, silhouette] — the same order as
  // LOD_DIVISORS and ZoomLevel, so tiers[level] is always the right sprite.
  // Only tier 0 carries the composite's dither plan: it alone shares buf's
  // exact dimensions and coordinate frame, which bakeRotations requires of a
  // plan (see gen/rotate.ts). The reduced tiers are already flat, palette-
  // snapped colour picks with no residual dither to re-resolve per bin.
  const tiers = buildLodSet(ship.buf, hull.profile, FACTION_PALETTE.player, NEUTRAL[3]!, EMISSIVE.amber);
  const atlases: BinAtlas[] = tiers.map((tierBuf, i) =>
    atlasFromBins(bakeRotations(tierBuf, 64, i === 0 ? ship.plan : undefined)),
  );

  // Tier 3 (WIDE) is generated from the bare hull profile, independent of the
  // composite's own bounds, so it pivots on the hull centreline rather than
  // the composite bbox centre tiers 0-2 all share (see render/lodpivot.ts).
  // `shipPivotOffset` is the fixed, ship-relative gap between those two
  // pivots; only tier 3's sprite ever needs the correction it drives.
  const shipPivotOffset = pivotOffset(ship.buf.w, ship.buf.h, ship.centreX, ship.centreY);

  // Two sprites at the same screen position: `shipCurrent` shows the target
  // level, `shipPrevious` shows the level being faded out of. Outside a
  // transition `shipPrevious` is simply hidden.
  const shipCurrent = new Sprite(atlases[1]!.frames[0]);
  shipCurrent.anchor.set(0.5);
  scene.play.addChild(shipCurrent);

  const shipPrevious = new Sprite(atlases[1]!.frames[0]);
  shipPrevious.anchor.set(0.5);
  shipPrevious.visible = false;
  scene.play.addChild(shipPrevious);

  // The place: one POI's parallax stack.
  const stack = buildPoiStack('graveyard', VIRTUAL_WIDTH, VIRTUAL_HEIGHT, rng.split('poi'));
  const layers = tiledLayers(stack, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  // TilingSprite, not Sprite: each layer buffer is exactly one screen, so a
  // plain sprite scrolled by the parallax offset slides off and leaves void
  // behind it — the nearest background layer (parallax 0.45) clears the frame
  // after about a thousand world units at CLOSE, and the foreground (1.6)
  // after three hundred. The sprite covers the virtual canvas and never moves;
  // only `tilePosition` scrolls (see render/scene.ts's setLayerSprite).
  const layerSprites = layers.map((layer) => {
    const sprite = new TilingSprite({
      texture: textureFromPixBuf(layer.buf),
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      roundPixels: true,
    });
    const target = layer.parallax > 1 ? scene.foreground : scene.background;
    target.addChild(sprite);
    return sprite;
  });

  const body = makeBody(CRUISER_BODY);
  const camera = makeCamera(body.position);
  const zoom = makeZoom(1);
  const loop = makeLoop();
  const input = makeInput();

  // Everything the frame update needs, and nothing PixiJS. `updateFrame` in
  // ./frame.ts owns the arithmetic; this file owns the sprites.
  const frame = makeFrameState({
    body, camera, zoom, loop, viewport: device.viewport, layers, shipPivotOffset,
  });

  const centre = vec2();
  const screenPoint = vec2();
  const worldPoint = vec2();

  const detach = attachInput(input, host, (sx, sy) => {
    // Screen pixels to virtual-canvas pixels, then to world.
    screenPoint.x = (sx - device.viewport.offsetX) / device.viewport.scale;
    screenPoint.y = (sy - device.viewport.offsetY) / device.viewport.scale;
    snappedCentre(centre, camera, unitsPerPixel(zoom.level));
    return screenToWorld(worldPoint, screenPoint, centre, unitsPerPixel(zoom.level), device.viewport);
  });

  const onResize = (): void => {
    resizeDevice(device, host.clientWidth, host.clientHeight);
  };
  globalThis.addEventListener('resize', onResize);

  const onFrame = (ticker: Ticker): void => {
    // The viewport is replaced wholesale on resize, so re-read it rather than
    // capturing it once: a stale viewport would put every sprite half a
    // letterbox out after the first window change.
    frame.viewport = device.viewport;

    const out = updateFrame(frame, drainInput(input), ticker.deltaMS / 1000);

    shipCurrent.texture = atlases[out.current.tier]!.frames[out.bin]!;
    shipCurrent.position.set(out.current.x, out.current.y);
    shipCurrent.alpha = out.current.alpha;

    if (out.previous === null) {
      shipPrevious.visible = false;
    } else {
      shipPrevious.texture = atlases[out.previous.tier]!.frames[out.bin]!;
      shipPrevious.position.set(out.previous.x, out.previous.y);
      shipPrevious.alpha = out.previous.alpha;
      shipPrevious.visible = true;
    }

    for (let i = 0; i < layerSprites.length; i++) {
      setLayerSprite(layerSprites[i]!, out.layers[i]!);
    }

    // Draw the virtual canvas into its fixed-size framebuffer. Everything
    // above wrote to sprites; this is the one call that turns them into
    // pixels, and it has to happen at the virtual size so the post chain runs
    // there rather than over the already-upscaled image (see render/device.ts).
    presentDevice(device);
  };

  device.app.ticker.add(onFrame);

  const stop = (): void => {
    device.app.ticker.remove(onFrame);
    globalThis.removeEventListener('resize', onResize);
    globalThis.removeEventListener('beforeunload', stop);
    detach();
  };
  globalThis.addEventListener('beforeunload', stop);

  return { device, post, stop };
}
