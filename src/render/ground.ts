import { Mesh, MeshBasicNodeMaterial, PlaneGeometry, type Scene } from 'three/webgpu';
import { abs, float, fract, fwidth, min, mx_noise_float, positionWorld, vec3 } from 'three/tsl';

// A dark reference plane below the battle: faint 500 m grid plus dust, so the
// tilt-shift blur has depth to work on.
export function addGround(scene: Scene, centerX: number, centerZ: number): void {
  const p = positionWorld.xz;
  const cell = p.div(500);
  const d = abs(fract(cell.sub(0.5)).sub(0.5)).div(fwidth(cell));
  const line = float(1).sub(min(min(d.x, d.y), float(1)));
  const dust = mx_noise_float(vec3(p.mul(0.00035), 0)).mul(0.5).add(0.5);
  const base = vec3(0.004, 0.004, 0.0037);
  const colorNode = base.add(vec3(0.012, 0.0115, 0.0105).mul(line)).add(vec3(0.007, 0.0068, 0.0062).mul(dust));

  const mat = new MeshBasicNodeMaterial();
  mat.colorNode = colorNode;
  const mesh = new Mesh(new PlaneGeometry(80000, 80000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centerX, -320, centerZ);
  scene.add(mesh);
}
