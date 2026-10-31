import { FISH_VERTEX_FLOATS, apparentUnderwaterPoint, parseFishMesh } from "./oceanFishModel";
import { WATER_IOR } from "./iwave";

function meshFile(vertexCount: number, indexCount: number, extra = 0) {
  const buffer = new ArrayBuffer(8 + vertexCount * FISH_VERTEX_FLOATS * 4 + indexCount * 2 + extra);
  const view = new DataView(buffer);
  view.setUint32(0, vertexCount, true);
  view.setUint32(4, indexCount, true);
  new Float32Array(buffer, 8, vertexCount * FISH_VERTEX_FLOATS).fill(0.5);
  new Uint16Array(buffer, 8 + vertexCount * FISH_VERTEX_FLOATS * 4, indexCount).set([0, 1, 2]);
  return buffer;
}

describe("fish mesh file", () => {
  it("reads the interleaved vertices and the indices", () => {
    const mesh = parseFishMesh(meshFile(3, 3));
    expect(mesh.vertices).toHaveLength(3 * FISH_VERTEX_FLOATS);
    expect(mesh.vertices[0]).toBe(0.5);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
  });

  it("rejects a file with a wrong size", () => {
    expect(() => parseFishMesh(meshFile(3, 3, 2))).toThrow("wrong size");
    expect(() => parseFishMesh(new ArrayBuffer(4))).toThrow("too short");
  });
});

describe("apparent position under the water", () => {
  const camera: [number, number, number] = [0, 1.2, -6.2];

  it.each([[0.5, -0.8, 1], [-1.5, -2, 4], [3, -0.4, -3]])("bends the ray by Snell's law for (%p, %p, %p)", (x, y, z) => {
    const point: [number, number, number] = [x, y, z];
    const { apparent, surface, path } = apparentUnderwaterPoint(camera, point);
    expect(surface[1]).toBe(0);
    const incoming = surface.map((value, axis) => value - camera[axis]);
    const outgoing = point.map((value, axis) => value - surface[axis]);
    const sine = (vector: number[]) => Math.hypot(vector[0], vector[2]) / Math.hypot(...vector);
    expect(sine(incoming)).toBeCloseTo(WATER_IOR * sine(outgoing), 5);
    expect(path).toBeCloseTo(Math.hypot(...incoming) + Math.hypot(...outgoing), 9);
    // The apparent point lies on the camera ray through the surface point, at the optical path.
    const view = apparent.map((value, axis) => value - camera[axis]);
    expect(Math.hypot(...view)).toBeCloseTo(path, 9);
    const cross = [
      view[1] * incoming[2] - view[2] * incoming[1],
      view[2] * incoming[0] - view[0] * incoming[2],
      view[0] * incoming[1] - view[1] * incoming[0],
    ];
    expect(Math.hypot(...cross)).toBeLessThan(1e-6);
  });

  it("keeps a point straight below the camera on the vertical camera ray", () => {
    const { apparent } = apparentUnderwaterPoint([0, 2, 0], [0, -1.33, 0]);
    expect(apparent[0]).toBeCloseTo(0, 9);
    expect(apparent[2]).toBeCloseTo(0, 9);
  });
});
