import { createOceanMeshData, oceanMeshDistance, OCEAN_MESH_FAR } from "./oceanMesh";

describe("ocean surface mesh", () => {
  it("keeps the range continuous and puts detail near the camera", () => {
    expect(oceanMeshDistance(0)).toBe(-4);
    expect(oceanMeshDistance(0.4)).toBe(45);
    expect(oceanMeshDistance(0.7)).toBeCloseTo(190);
    expect(oceanMeshDistance(1)).toBeCloseTo(OCEAN_MESH_FAR);
    for (const join of [0.4, 0.7]) {
      expect(Math.abs(oceanMeshDistance(join + 1e-8) - oceanMeshDistance(join - 1e-8)))
        .toBeLessThan(0.0001);
    }
    let previous = oceanMeshDistance(0);
    for (let row = 1; row <= 640; row += 1) {
      const distance = oceanMeshDistance(row / 640);
      expect(distance).toBeGreaterThan(previous);
      if (distance <= 45) expect(distance - previous).toBeLessThan(0.2);
      previous = distance;
    }
  });

  it.each([0.4, 0.7])("keeps the wave filter continuous at the %s mesh join", (join) => {
    const step = 1e-6;
    const left = (oceanMeshDistance(join) - oceanMeshDistance(join - step)) / step;
    const right = (oceanMeshDistance(join + step) - oceanMeshDistance(join)) / step;
    expect(right / left).toBeCloseTo(1, 4);
  });

  it.each([[384, 640], [192, 384], [96, 192]])("creates a connected %i by %i grid", (columns, rows) => {
    const { vertices, indices } = createOceanMeshData(columns, rows);
    expect(vertices).toHaveLength((columns + 1) * (rows + 1) * 3);
    expect(indices).toHaveLength(columns * rows * 6);
    expect(indices.every((index) => index < vertices.length / 3)).toBe(true);
    expect(vertices[0]).toBe(-1);
    expect(vertices[columns * 3]).toBe(1);
    expect(vertices.every((value, index) => index % 3 !== 2 || value > 0)).toBe(true);
    expect(Array.from(indices.slice(0, 6))).toEqual([0, 1, columns + 1, 1, columns + 2, columns + 1]);
    for (const join of [0.4, 0.7]) {
      const center = Math.round(join * rows);
      for (let row = center - 1; row <= center + 1; row += 1) {
        const before = vertices[((row - 1) * (columns + 1)) * 3 + 2];
        const after = vertices[(row * (columns + 1)) * 3 + 2];
        expect(after / before).toBeGreaterThan(0.9);
        expect(after / before).toBeLessThan(1.25);
      }
    }
  });
});
