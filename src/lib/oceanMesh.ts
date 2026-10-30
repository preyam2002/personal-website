export const OCEAN_MESH_FAR = 12_000;

export function oceanMeshDistance(t: number): number {
  if (t <= 0.4) return -4 + 49 * t / 0.4;
  // Match row spacing at both joins so the wave filter changes smoothly.
  if (t <= 0.7) {
    const u = (t - 0.4) / 0.3;
    const nearSlope = (49 / 0.4) * 0.3 / 145;
    return 45 + 145 * (u + (nearSlope - 1) * u * (1 - u) ** 2);
  }
  const u = (t - 0.7) / 0.3;
  const startSlope = 145 / 190;
  const growth = Math.log(OCEAN_MESH_FAR / 190) - startSlope;
  return 190 * Math.exp(startSlope * u + growth * u * u);
}

export function createOceanMeshData(columns: number, rows: number) {
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint32Array(columns * rows * 6);
  for (let row = 0; row <= rows; row += 1) {
    const distance = oceanMeshDistance(row / rows);
    const storedDistance = Math.fround(distance);
    const spacing = Math.max(
      oceanMeshDistance(Math.min(row + 1, rows) / rows) - storedDistance,
      storedDistance - oceanMeshDistance(Math.max(row - 1, 0) / rows),
    );
    for (let column = 0; column <= columns; column += 1) {
      const offset = (row * (columns + 1) + column) * 3;
      vertices[offset] = column / columns * 2 - 1;
      vertices[offset + 1] = distance;
      vertices[offset + 2] = spacing;
    }
  }
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = row * (columns + 1) + column;
      const next = left + columns + 1;
      indices[index] = left;
      indices[index + 1] = left + 1;
      indices[index + 2] = next;
      indices[index + 3] = left + 1;
      indices[index + 4] = next + 1;
      indices[index + 5] = next;
      index += 6;
    }
  }
  return { vertices, indices };
}
