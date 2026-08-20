/**
 * Move orders.
 *
 * Right-click puts a point in the world and the ship works out how to get
 * there. The important property is turn commitment: the ship points itself
 * before it pushes. If it thrust while facing away it could crab sideways to
 * any target, and positioning to bring a firing arc to bear — which the spec
 * calls the primary combat skill — would stop mattering.
 *
 * Braking starts early enough that the ship settles on the waypoint rather than
 * sailing past and circling back.
 */

import { speed, type Body } from './body.js';
import { stoppingDistance, type Control } from './integrate.js';
import { angleDelta, angleOf, distance, sub, vec2, type Vec2 } from './math/vec2.js';

export interface MoveOrder {
  target: Vec2;
  arriveRadius: number;
}

/** Forward thrust is only applied when the target is within this cone of the nose. */
export const FACING_CONE = 0.6;

const DEFAULT_ARRIVE_RADIUS = 24;

export function makeMoveOrder(target: Vec2, arriveRadius = DEFAULT_ARRIVE_RADIUS): MoveOrder {
  return { target: vec2(target.x, target.y), arriveRadius };
}

export function hasArrived(body: Body, order: MoveOrder): boolean {
  return distance(body.position, order.target) <= order.arriveRadius;
}

const _toTarget = vec2();

export function steer(body: Body, order: MoveOrder | null): Control {
  if (order === null) return { thrust: 0, turn: 0 };

  sub(_toTarget, order.target, body.position);
  const range = Math.hypot(_toTarget.x, _toTarget.y);

  // Arrived: kill remaining drift rather than nudging around the waypoint.
  // The predicate is `hasArrived` rather than an inline comparison so there is
  // exactly one definition of "arrived" in the codebase — the one the UI will
  // draw an order marker from has to agree with the one the ship acts on, and
  // two copies of `range <= arriveRadius` are two things to drift apart. The
  // repeated hypot is one per tick for one ship; correctness wins that trade.
  if (hasArrived(body, order)) {
    return { thrust: speed(body) > 0.5 ? -1 : 0, turn: 0 };
  }

  const bearing = angleOf(_toTarget);
  const offBy = angleDelta(body.heading, bearing);

  // Turn proportionally, saturating well before the error is large, so the ship
  // commits to a turn instead of feathering it.
  const turn = Math.max(-1, Math.min(1, offBy * 2.5));

  // Brake when the remaining range is inside the distance it takes to stop.
  if (range <= stoppingDistance(body)) {
    return { thrust: -1, turn };
  }

  // Push only when roughly pointed at the target.
  const thrust = Math.abs(offBy) < FACING_CONE ? 1 : 0;

  return { thrust, turn };
}
