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

import { Sprite, type Ticker } from 'pixi.js';
import { buildHull } from '../gen/hull.js';
import { buildModule, MODULE_CATALOGUE } from '../gen/module.js';
import { compositeShip, type Loadout } from '../gen/composite.js';
import { bakeRotations, binForHeading, headingForBin } from '../gen/rotate.js';
import { buildLodSet } from '../gen/lod.js';
import { buildPoiStack } from '../gen/celestial.js';
import { EMISSIVE, FACTION_PALETTE, NEUTRAL } from '../gen/palette.js';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { integrate } from '../sim/integrate.js';
import { makeMoveOrder, steer, type MoveOrder } from '../sim/order.js';
import { makeLoop } from '../sim/loop.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { createDevice, resizeDevice, type Device } from '../render/device.js';
import { makeScene, setLayerSprite } from '../render/scene.js';
import { atlasFromBins, textureFromPixBuf, type BinAtlas } from '../render/textures.js';
import { makeCamera, followBody, snappedCentre } from '../render/camera.js';
import { makePlacement, placeLayer, sortedLayers } from '../render/parallax.js';
import { pivotOffset, tierCorrection } from '../render/lodpivot.js';
import {
  advanceZoom, crossfadeAlpha, lodTierFor, makeZoom, setZoom, stepZoom, unitsPerPixel,
} from '../render/zoom.js';
import {
  screenToWorld, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, worldToScreen,
} from '../render/viewport.js';
import { makePostChain, type PostChain } from '../render/post.js';
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
  const tierCorr = vec2();

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
  const layers = sortedLayers(stack);
  const layerSprites = layers.map((layer) => {
    const sprite = new Sprite(textureFromPixBuf(layer.buf));
    const target = layer.parallax > 1 ? scene.foreground : scene.background;
    target.addChild(sprite);
    return sprite;
  });
  const placement = makePlacement();

  const body = makeBody(CRUISER_BODY);
  const camera = makeCamera(body.position);
  const zoom = makeZoom(1);
  const loop = makeLoop();
  const input = makeInput();
  let order: MoveOrder | null = null;

  const centre = vec2();
  const screenPoint = vec2();
  const worldPoint = vec2();
  const shipScreen = vec2();

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
    const dt = ticker.deltaMS / 1000;

    const pending = drainInput(input);
    if (pending.moveTarget !== null) order = makeMoveOrder(pending.moveTarget);
    if (pending.zoomRequest !== null) setZoom(zoom, pending.zoomRequest);
    if (pending.zoomStep !== 0) stepZoom(zoom, pending.zoomStep);
    if (pending.timeScale !== null) loop.scale = pending.timeScale;

    // Simulation: fixed ticks only.
    // `loop.tickSeconds`, not the TICK_SECONDS constant: the loop is the thing
    // that decided how many ticks to run, so it has to be the thing that says
    // how long one is. Two sources of truth for the fixed timestep is exactly
    // how a "fixed" timestep stops being fixed. `makeLoop()` defaults it to
    // TICK_SECONDS, so this is that value — by derivation rather than by
    // coincidence.
    const ticks = loop.ticksFor(dt);
    for (let i = 0; i < ticks; i++) {
      integrate(body, steer(body, order), loop.tickSeconds);
    }

    // Render: reads the sim, writes nothing back to it.
    advanceZoom(zoom, dt);
    followBody(camera, body, dt);

    const upp = unitsPerPixel(zoom.level);
    snappedCentre(centre, camera, upp);

    // Bin 0 is the unrotated source, which is drawn nose-up; a body heading of
    // 0 points along +x. Hence the quarter turn. If the ship renders a quarter
    // turn off, this sign is the first thing to check.
    const bin = binForHeading(body.heading + Math.PI / 2);
    // The shared transform, not a copy of its arithmetic: viewport.test.ts
    // establishes that worldToScreen and screenToWorld round-trip at all four
    // zoom divisors, and the input path above already uses screenToWorld. An
    // inlined forward transform here would leave that round-trip property
    // half-honoured in production, which is where it matters.
    worldToScreen(shipScreen, body.position, centre, upp, device.viewport);
    const screenX = Math.round(shipScreen.x);
    const screenY = Math.round(shipScreen.y);

    // Tier 3's frame is centred on a different physical point of the ship
    // than tiers 0-2 (see render/lodpivot.ts); only nudge the sprite that is
    // actually showing tier 3, and only by as much as that tier's own bin
    // angle and the render's current scale call for.
    const currentTier = lodTierFor(zoom.level);
    const currentAtlas = atlases[currentTier]!;
    shipCurrent.texture = currentAtlas.frames[bin]!;
    if (currentTier === 3) {
      tierCorrection(tierCorr, shipPivotOffset, headingForBin(bin), upp);
      shipCurrent.position.set(screenX + tierCorr.x, screenY + tierCorr.y);
    } else {
      shipCurrent.position.set(screenX, screenY);
    }
    shipCurrent.alpha = zoom.from === null ? 1 : crossfadeAlpha(zoom);

    if (zoom.from !== null) {
      const previousTier = lodTierFor(zoom.from);
      const previousAtlas = atlases[previousTier]!;
      shipPrevious.texture = previousAtlas.frames[bin]!;
      if (previousTier === 3) {
        tierCorrection(tierCorr, shipPivotOffset, headingForBin(bin), upp);
        shipPrevious.position.set(screenX + tierCorr.x, screenY + tierCorr.y);
      } else {
        shipPrevious.position.set(screenX, screenY);
      }
      shipPrevious.alpha = 1 - crossfadeAlpha(zoom);
      shipPrevious.visible = true;
    } else {
      shipPrevious.visible = false;
    }

    for (let i = 0; i < layers.length; i++) {
      placeLayer(placement, layers[i]!, centre, upp);
      setLayerSprite(layerSprites[i]!, placement);
    }
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
