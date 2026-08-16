import type { Document } from '@gltf-transform/core';

export interface RiderSeatConfig {
  height: number;
  yaw?: number;
  seatY: number;
  seatFwd: number;
  hipSpread: number;
  parentBoneName: string;
}

export function addRiderSeatSockets(doc: Document, seat: RiderSeatConfig): void;
