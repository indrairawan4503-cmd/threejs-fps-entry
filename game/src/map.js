// Dustline Yard: builds the map geometry from config boxes and returns the
// collision set, waypoints and anchors the simulation uses. Geometry and
// collision come from the same boxes, so what you see is what blocks you.
import * as THREE from 'three';
import { MAP, CRATES, PALETTE } from './config.js';

function boxMesh(min, max, material) {
  const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(min[0] + w / 2, min[1] + h / 2, min[2] + d / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Waypoints bots patrol: [x, z] nodes, edges by index.
export const WAYPOINTS = [
  [19, -5], [19, 5], [12, -11], [12, 11], [0, -11], [0, 11],
  [0, 0], [-8, -11], [-8, 11], [-14, 0], [17, -3], [17, 3],
  [8, -5], [8, 5], [-18, -3], [-18, 3],
];
export const ROUTES = {
  toA: [0, 2, 4, 6, 12, 10], // east spawn -> A-long -> mid -> reactor
  toB: [1, 3, 5, 7, 8, 14], // east spawn -> B-long -> mid -> courtyard
  toMid: [0, 2, 4, 6, 7, 5],
  holdA: [10, 11, 12],
  holdB: [14, 15, 8],
};

export function buildMap(scene) {
  const colliders = [];
  const addCollider = (min, max) => colliders.push({ min, max });

  // Ground: dark packed earth with a subtle grid of darker seams.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.halfX * 2 + 4, MAP.halfZ * 2 + 4),
    new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a5a40, roughness: 0.9 });
  const wallDefs = [
    { min: [-MAP.halfX - 1, 0, -MAP.halfZ - 1], max: [MAP.halfX + 1, MAP.wallHeight, -MAP.halfZ] },
    { min: [-MAP.halfX - 1, 0, MAP.halfZ], max: [MAP.halfX + 1, MAP.wallHeight, MAP.halfZ + 1] },
    { min: [-MAP.halfX - 1, 0, -MAP.halfZ], max: [-MAP.halfX, MAP.wallHeight, MAP.halfZ] },
    { min: [MAP.halfX, 0, -MAP.halfZ], max: [MAP.halfX + 1, MAP.wallHeight, MAP.halfZ] },
  ];
  for (const w of wallDefs) {
    scene.add(boxMesh(w.min, w.max, wallMat));
    addCollider(w.min, w.max);
  }

  // Crates: rust-red containers and sandbag blocks, with pale edge trim.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa86236, roughness: 0.85 });
  const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x8a7a48, roughness: 0.9 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffc46b });
  CRATES.forEach((c, i) => {
    const mesh = boxMesh(c.min, c.max, i % 2 ? crateMat2 : crateMat);
    scene.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry), edgeMat);
    edges.position.copy(mesh.position);
    scene.add(edges);
    addCollider(c.min, c.max);
  });

  // Reactor core at site A: glowing cylinder + ring, the plant objective.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 3.2, 12),
    new THREE.MeshStandardMaterial({
      color: 0x223344, roughness: 0.4, metalness: 0.6,
      emissive: 0xff7a1a, emissiveIntensity: 0.55,
    }),
  );
  core.position.set(MAP.siteA.core[0], 1.6, MAP.siteA.core[2]);
  core.castShadow = true;
  scene.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.12, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff8c2a, emissiveIntensity: 1.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(MAP.siteA.core[0], 0.12, MAP.siteA.core[2]);
  scene.add(ring);
  const coreLight = new THREE.PointLight(0xff8c2a, 30, 18, 1.8);
  coreLight.position.set(MAP.siteA.core[0], 3.4, MAP.siteA.core[2]);
  scene.add(coreLight);

  // Courtyard anchor at site B: a rusted water tower silhouette.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 5.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }),
  );
  tower.position.set(-18, 2.75, 0);
  tower.castShadow = true;
  scene.add(tower);
  const tank = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a5a2a, roughness: 0.7, metalness: 0.3 }),
  );
  tank.position.set(-18, 6, 0);
  tank.castShadow = true;
  scene.add(tank);
  addCollider({ min: [-19.2, 0, -1.2], max: [-16.8, 5.5, 1.2] });

  // Dusk lighting: low amber sun + cool violet fill + hemisphere.
  const sun = new THREE.DirectionalLight(0xff9a4a, 2.7);
  sun.position.set(-18, 14, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9a7ac0, 0x4a2e1c, 1.3));
  const fill = new THREE.DirectionalLight(0x7a6aff, 0.75);
  fill.position.set(14, 10, 12);
  scene.add(fill);
  const ambient = new THREE.AmbientLight(0x604838, 0.55);
  scene.add(ambient);

  scene.fog = new THREE.Fog(0x5a4030, 30, 85);
  scene.background = new THREE.Color(PALETTE.skyLow);

  // Distant silhouettes outside the walls: low dunes + crane arms.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const dune = new THREE.Mesh(new THREE.ConeGeometry(9 + i * 2, 4 + (i % 3), 5), duneMat);
    dune.position.set(-34 + i * 11, 0, -24 + (i % 2) * 44);
    scene.add(dune);
  }

  return { colliders, waypoints: WAYPOINTS, routes: ROUTES };
}

// Segment vs AABB test for line-of-sight. Returns true when the segment
// from a to b is NOT blocked by any collider.
export function hasLineOfSight(a, b, colliders) {
  for (const c of colliders) {
    if (segmentHitsBox(a, b, c.min, c.max)) return false;
  }
  return true;
}

function segmentHitsBox(a, b, min, max) {
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-9) {
      if (a[i] < min[i] || a[i] > max[i]) return false;
    } else {
      let t1 = (min[i] - a[i]) / d, t2 = (max[i] - a[i]) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Ray vs AABB, for bullet raycasts. Returns the hit distance or Infinity.
export function rayBox(origin, dir, min, max) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = dir[i];
    if (Math.abs(d) < 1e-9) {
      if (origin[i] < min[i] || origin[i] > max[i]) return Infinity;
    } else {
      let t1 = (min[i] - origin[i]) / d, t2 = (max[i] - origin[i]) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Move an AABB body (half extents hx, height h) by delta, resolving one axis
// at a time so the body slides along walls instead of sticking.
export function moveBody(pos, delta, hx, h, colliders) {
  const axes = [0, 1, 2];
  for (const ax of axes) {
    pos[ax] += delta[ax];
    for (const c of colliders) {
      const min = [pos[0] - hx, pos[1], pos[2] - hx];
      const max = [pos[0] + hx, pos[1] + h, pos[2] + hx];
      if (min[0] < c.max[0] && max[0] > c.min[0] &&
        min[1] < c.max[1] && max[1] > c.min[1] &&
        min[2] < c.max[2] && max[2] > c.min[2]) {
        if (delta[ax] > 0) pos[ax] = c.min[ax] - (ax === 0 || ax === 2 ? hx : h);
        else if (delta[ax] < 0) pos[ax] = c.max[ax] + (ax === 1 ? 0 : hx);
        if (ax === 1) pos[ax] = ax === 1 && delta[ax] < 0 ? Math.max(pos[ax], 0) : pos[ax];
      }
    }
  }
  if (pos[1] < 0) pos[1] = 0;
}
