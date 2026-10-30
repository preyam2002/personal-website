import { createOceanMeshData } from "./oceanMesh";
import { createOceanCascades } from "./oceanSpectrum";
import { createDistantCrestNoise, type OceanWaveField } from "./oceanWaves";

export type OceanWorkerRequest = {
  field: OceanWaveField;
  size: number;
  columns: number;
  rows: number;
};

export type OceanWorkerResult = {
  cascades: ReturnType<typeof createOceanCascades>;
  mesh: ReturnType<typeof createOceanMeshData>;
  noise: Uint8Array;
};

const worker = self as unknown as {
  onmessage: (event: MessageEvent<OceanWorkerRequest>) => void;
  postMessage: (data: OceanWorkerResult, transfer: ArrayBuffer[]) => void;
};

worker.onmessage = ({ data: { field, size, columns, rows } }) => {
  const cascades = createOceanCascades(field, size);
  const mesh = createOceanMeshData(columns, rows);
  const noise = createDistantCrestNoise(field.seed);
  worker.postMessage({ cascades, mesh, noise }, [
    cascades.initial.buffer as ArrayBuffer,
    cascades.filterVariance.buffer as ArrayBuffer,
    mesh.vertices.buffer as ArrayBuffer,
    mesh.indices.buffer as ArrayBuffer,
    noise.buffer as ArrayBuffer,
  ]);
};
