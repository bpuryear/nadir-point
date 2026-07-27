/**
 * Object pools. Projectiles, debris chunks, VFX bursts and damage decals all cycle
 * through these. Nothing that spawns per-frame is allowed to allocate per-frame.
 */
export class Pool {
  /**
   * @param {() => any} factory        makes a fresh instance
   * @param {(o:any) => void} [reset]  returns an instance to a clean state
   * @param {number} [prewarm]
   * @param {number} [max]             hard ceiling; acquire() past it returns null
   */
  constructor(factory, reset = null, prewarm = 0, max = Infinity) {
    this.factory = factory;
    this.reset = reset;
    this.max = max;
    this.free = [];
    this.liveCount = 0;
    this.created = 0;
    for (let i = 0; i < prewarm; i++) {
      this.free.push(this.factory());
      this.created++;
    }
  }

  acquire() {
    let obj = this.free.pop();
    if (!obj) {
      if (this.created >= this.max) return null;
      obj = this.factory();
      this.created++;
    }
    this.liveCount++;
    return obj;
  }

  release(obj) {
    if (!obj) return;
    this.reset?.(obj);
    this.free.push(obj);
    this.liveCount--;
  }

  get stats() {
    return { created: this.created, live: this.liveCount, free: this.free.length };
  }
}

/**
 * Fixed-capacity ring of active items with a swap-remove free list. Used where we
 * iterate every frame and care about cache behaviour more than about ordering.
 */
export class ActiveSet {
  constructor(capacity, factory) {
    this.capacity = capacity;
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory(i);
    this.count = 0;
  }

  /** Returns the slot to write into, or null when full. */
  spawn() {
    if (this.count >= this.capacity) return null;
    return this.items[this.count++];
  }

  /** Swap-remove index i. Caller must not hold indices across a kill. */
  kill(i) {
    const last = --this.count;
    if (i !== last) {
      const tmp = this.items[i];
      this.items[i] = this.items[last];
      this.items[last] = tmp;
    }
  }

  forEach(fn) {
    for (let i = 0; i < this.count; i++) fn(this.items[i], i);
  }
}
