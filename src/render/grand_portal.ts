// Procedural Grand Portal prop: the mage's party portal (content/grand_teleports.ts).
// An arcane oval swirl standing on a small stone base, blue-violet, with a soft
// pulsing point light. Isolated behind the same build/sync/dispose seam as the
// Soulwell (soulwell.ts) so a generated GLB can replace it later without touching
// sim rules, interaction, or wire state, and registered through
// summoned_objects.ts so renderer.ts never names it.

import * as THREE from 'three';
import { GFX, surfaceMat } from './gfx';

export const GRAND_PORTAL_VISUAL_SPEC = {
  height: 3.1,
  ringRadius: 1.05,
  runeCount: 6,
} as const;

function stoneMaterial(color: number, roughness = 0.9): THREE.Material {
  return surfaceMat({
    color,
    roughness,
    metalness: 0.06,
    flatShading: !GFX.standardMaterials,
  });
}

function emissiveMaterial(color: number, emissive: number, intensity: number): THREE.Material {
  return surfaceMat({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.02,
    flatShading: !GFX.standardMaterials,
  });
}

export function buildGrandPortal(entityId: number): { group: THREE.Group; height: number } {
  const root = new THREE.Group();
  root.name = `grand_portal_${entityId}`;

  // The stone and rune materials come from surfaceMat, the global dedupe cache
  // (gfx.ts): they are shared with every other prop asking for the same opts and
  // must never be disposed here. Only the additive MeshBasicMaterials built below
  // belong to this one portal.
  const baseMat = stoneMaterial(0x1d1b2e, 0.95);
  const trimMat = stoneMaterial(0x3b3557, 0.72);
  const runeMat = emissiveMaterial(0x4f6cff, 0x6f8dff, 2.2);
  const ownedMaterials: THREE.Material[] = [];

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.28, 0.2, 10), baseMat);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.16, 10), trimMat);
  step.position.y = 0.28;
  step.castShadow = true;
  step.receiveShadow = true;
  root.add(step);

  // Six rune stones around the rim, tilted outward.
  for (let i = 0; i < GRAND_PORTAL_VISUAL_SPEC.runeCount; i++) {
    const angle = (i / GRAND_PORTAL_VISUAL_SPEC.runeCount) * Math.PI * 2;
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), runeMat);
    rune.position.set(Math.sin(angle) * 1.0, 0.3, Math.cos(angle) * 1.0);
    rune.rotation.set(0.3, angle, 0);
    root.add(rune);
  }

  // The standing arcane frame: an oval torus of trim stone, then the swirl.
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(GRAND_PORTAL_VISUAL_SPEC.ringRadius, 0.1, 6, 28),
    trimMat,
  );
  frame.scale.set(0.82, 1.18, 1);
  frame.position.y = 1.7;
  frame.castShadow = true;
  root.add(frame);

  const swirl = new THREE.Group();
  swirl.position.y = 1.7;
  swirl.scale.set(0.82, 1.18, 1);
  const discMaterial = new THREE.MeshBasicMaterial({
    color: 0x3e5cff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  ownedMaterials.push(discMaterial);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(GRAND_PORTAL_VISUAL_SPEC.ringRadius - 0.08, 28),
    discMaterial,
  );
  swirl.add(disc);
  for (const [radius, opacity, color] of [
    [0.82, 0.5, 0x8f7bff],
    [0.56, 0.62, 0xb08cff],
    [0.3, 0.78, 0xe6dcff],
  ] as const) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    ownedMaterials.push(ringMaterial);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.03, 6, 24), ringMaterial);
    swirl.add(ring);
  }
  root.add(swirl);

  const light = new THREE.PointLight(0x6d7dff, 3.6, 8, 2);
  light.position.set(0, 1.7, 0);
  root.add(light);

  root.userData.grandPortalSwirl = swirl;
  root.userData.grandPortalLight = light;
  root.userData.grandPortalOwnedMaterials = ownedMaterials;
  return { group: root, height: GRAND_PORTAL_VISUAL_SPEC.height };
}

export function disposeGrandPortalVisual(root: THREE.Object3D): void {
  const materials = root.userData.grandPortalOwnedMaterials as THREE.Material[] | undefined;
  if (!materials) return;
  for (const material of new Set(materials)) material.dispose();
  delete root.userData.grandPortalOwnedMaterials;
}

export function syncGrandPortalVisual(root: THREE.Object3D, time: number, entityId: number): void {
  const swirl = root.userData.grandPortalSwirl as THREE.Object3D | undefined;
  const light = root.userData.grandPortalLight as THREE.PointLight | undefined;
  if (swirl) {
    const phase = time * 1.4 + entityId * 0.23;
    for (let i = 1; i < swirl.children.length; i++) {
      swirl.children[i].rotation.z = phase * (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.25);
    }
    const pulse = 1 + Math.sin(time * 2.6 + entityId) * 0.03;
    swirl.scale.set(0.82 * pulse, 1.18 * pulse, 1);
  }
  if (light) light.intensity = 3.2 + Math.sin(time * 2.6 + entityId) * 0.6;
}
