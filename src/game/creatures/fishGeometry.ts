/** Procedural fish bodies for the schools: unit length, head along +z. */

import { curve, finStations, loftBody, loftFin, mergeParts, mirrorX, type RGB } from "./geometry";

export type Pattern = (s: number, angle: number, height: number) => RGB;

export type ProceduralShape = {
  /** Body depth (top + bottom) as a fraction of length, at its deepest. */
  depth: number;
  /** Body half width as a fraction of length. */
  width: number;
  /** Where the body is deepest, from the snout (0) to the tail (1). */
  deepest: number;
  /** Fork depth of the tail, 0 for a square tail. */
  fork: number;
  pattern: Pattern;
  /** Colour of the fins. */
  fin: RGB;
};

/** A procedural fish of unit length, head along +z (from z = 0.5 to the tail at -0.5). */
export function buildProceduralFish(shape: ProceduralShape, detail: "high" | "low") {
  const rings = detail === "high" ? 12 : 9;
  const segments = detail === "high" ? 8 : 6;
  const bodyLength = 0.8;
  const headZ = 0.5;
  const halfDepth = shape.depth / 2;
  const profile = curve([[0, 0.05], [0.08, 0.55], [shape.deepest, 1], [0.7, 0.55], [0.92, 0.2], [1, 0.14]]);
  const body = loftBody({
    length: bodyLength,
    headZ,
    rings,
    segments,
    section: s => ({ width: shape.width * curve([[0, 0.1], [0.15, 0.8], [shape.deepest, 1], [0.75, 0.5], [1, 0.2]])(s), top: halfDepth * profile(s), bottom: halfDepth * profile(s) * 0.95 }),
    color: (s, angle) => shape.pattern(s, angle, Math.cos(angle)),
  });
  const tailRoot = headZ - bodyLength + 0.01;
  const lobe = (up: number) =>
    loftFin({
      stations: finStations([0, 0, tailRoot + 0.02], [0, 0.17 * up * (shape.depth / 0.3 + 0.4) / 1.4, -0.16], [0, 0, -1], 4, t => 0.12 * (1 - t * (0.4 + shape.fork * 0.5)), () => 0.08),
      chordDirection: [0, 0, -1],
      normalDirection: [1, 0, 0],
      segments: 4,
      color: () => shape.fin,
    });
  const dorsal = loftFin({
    stations: finStations([0, halfDepth * 0.9, headZ - bodyLength * 0.3], [0, halfDepth * 0.5, -0.05], [0, 0, -1], 3, t => 0.32 * (1 - t * 0.5), () => 0.06),
    chordDirection: [0, 0, -1],
    normalDirection: [1, 0, 0],
    segments: 4,
    color: () => shape.fin,
  });
  const pectoral = loftFin({
    stations: finStations([shape.width * 0.8, -halfDepth * 0.2, headZ - bodyLength * 0.22], [0.05, -0.02, -0.06], [0, 0, -1], 3, t => 0.07 * (1 - t * 0.6), () => 0.08),
    chordDirection: [0, 0, -1],
    normalDirection: [0.3, 0.95, 0],
    segments: 4,
    color: () => shape.fin,
  });
  const parts = [body, lobe(1), lobe(-1), dorsal, pectoral, mirrorX(pectoral)];
  pectoral.dispose();
  return mergeParts(parts);
}

