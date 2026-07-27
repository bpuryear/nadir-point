import * as THREE from 'three';

/**
 * Game assembly. This is the seam every stream plugs into.
 *
 * Right now it builds a placeholder so the render pipeline can be proven end to end.
 * As streams land, their `install*` calls replace the placeholder block below.
 */
export async function bootGame(world, params) {
  const { scene, far, renderer } = world;

  // --- placeholder starfield so the far scene is exercised ---
  const starGeo = new THREE.BufferGeometry();
  const starCount = 4000;
  const pos = new Float32Array(starCount * 3);
  const col = new Float32Array(starCount * 3);
  const rng = world.rng.fork('placeholder-stars');
  const c = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const p = rng.onSphere();
    const r = 8200;
    pos[i * 3] = p.x * r;
    pos[i * 3 + 1] = p.y * r;
    pos[i * 3 + 2] = p.z * r;
    c.setHSL(rng.range(0.5, 0.66), rng.range(0.0, 0.4), rng.range(0.4, 1.0));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 14, sizeAttenuation: true, vertexColors: true, depthWrite: false,
  }));
  far.add(stars);

  // --- placeholder key light + test object so lighting and post are visible ---
  const key = new THREE.DirectionalLight(0xffe6c4, 3.2);
  key.position.set(-1, 0.55, 0.7).normalize().multiplyScalar(6000);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 100;
  key.shadow.camera.far = 12000;
  const s = 2600;
  key.shadow.camera.left = -s; key.shadow.camera.right = s;
  key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0008;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x14202e, 0.6));

  const testMat = new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.85, roughness: 0.42 });
  const test = new THREE.Mesh(new THREE.BoxGeometry(1400, 180, 260), testMat);
  test.castShadow = true;
  test.receiveShadow = true;
  scene.add(test);

  world.placeholder = { stars, key, test };

  // The volumetric pass needs something to aim at.
  const keyProxy = new THREE.Object3D();
  keyProxy.position.copy(key.position);
  scene.add(keyProxy);
  renderer.post.setKeyLight(keyProxy, new THREE.Color(1.0, 0.9, 0.74));

  // Slow orbit so a capture is not a still life.
  world.engine.addRender({
    name: 'placeholder-orbit',
    order: 10,
    update: (dt, engine) => {
      const t = engine.frameTime * 0.06;
      const r = 3400;
      world.camera.position.set(Math.cos(t) * r, 900, Math.sin(t) * r);
      world.camera.lookAt(0, 0, 0);
    },
  });
}
