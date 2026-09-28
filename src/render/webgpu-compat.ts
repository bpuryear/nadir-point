// three r186 passes `swizzle: 'rgba'` on every texture view. Chromium builds
// around 141 know an older form of that member and throw on the string. 'rgba'
// is the identity swizzle and the default, so dropping it changes nothing.

interface ViewDescriptor {
  swizzle?: unknown;
}

type CreateView = (this: object, desc?: ViewDescriptor) => unknown;

export function patchWebGPUCompat(): void {
  const proto = (globalThis as { GPUTexture?: { prototype: { createView: CreateView; __nadirPatched?: boolean } } }).GPUTexture?.prototype;
  if (!proto || proto.__nadirPatched) return;
  const original = proto.createView;
  proto.createView = function (desc?: ViewDescriptor) {
    if (desc && desc.swizzle === 'rgba') {
      const { swizzle: _identity, ...rest } = desc;
      return original.call(this, rest);
    }
    return original.call(this, desc);
  };
  proto.__nadirPatched = true;
}
