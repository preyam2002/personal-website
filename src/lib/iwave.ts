export const IWAVE_RADIUS = 6;
export const IWAVE_SIZE = IWAVE_RADIUS * 2 + 1;
export const WATER_IOR = 1.333;

export const WATER_ABSORPTION_RGB_PER_METER = [
  0.34,
  0.0565,
  0.00922,
] as const;

let cachedKernel: Float32Array | null = null;

export function besselJ0(value: number): number {
  const absolute = Math.abs(value);

  if (absolute < 8) {
    const squared = value * value;
    const numerator =
      57568490574 +
      squared *
        (-13362590354 +
          squared *
            (651619640.7 +
              squared *
                (-11214424.18 +
                  squared * (77392.33017 + squared * -184.9052456))));
    const denominator =
      57568490411 +
      squared *
        (1029532985 +
          squared *
            (9494680.718 +
              squared * (59272.64853 + squared * (267.8532712 + squared))));
    return numerator / denominator;
  }

  const reciprocal = 8 / absolute;
  const squared = reciprocal * reciprocal;
  const phase = absolute - 0.785398164;
  const amplitude =
    1 +
    squared *
      (-0.001098628627 +
        squared *
          (0.00002734510407 +
            squared * (-0.000002073370639 + squared * 0.0000002093887211)));
  const correction =
    -0.01562499995 +
    squared *
      (0.0001430488765 +
        squared *
          (-0.000006911147651 +
            squared * (0.0000007621095161 - squared * 0.0000000934945152)));

  return (
    Math.sqrt(0.636619772 / absolute) *
    (Math.cos(phase) * amplitude - reciprocal * Math.sin(phase) * correction)
  );
}

export function createIWaveKernel(): Float32Array {
  if (cachedKernel) return cachedKernel.slice();

  const sampleCount = 10_000;
  const deltaQ = 0.001;
  let normalization = 0;

  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const q = sample * deltaQ;
    normalization += q * q * Math.exp(-q * q);
  }

  const kernel = new Float32Array(IWAVE_SIZE * IWAVE_SIZE);
  let index = 0;

  for (let y = -IWAVE_RADIUS; y <= IWAVE_RADIUS; y += 1) {
    for (let x = -IWAVE_RADIUS; x <= IWAVE_RADIUS; x += 1) {
      const radius = Math.hypot(x, y);
      let value = 0;

      for (let sample = 1; sample <= sampleCount; sample += 1) {
        const q = sample * deltaQ;
        value += q * q * Math.exp(-q * q) * besselJ0(q * radius);
      }

      kernel[index] = value / normalization;
      index += 1;
    }
  }

  cachedKernel = kernel;
  return kernel.slice();
}

export function exactDielectricFresnel(
  cosineIncident: number,
  incidentIor = 1,
  transmittedIor = WATER_IOR,
): number {
  const clampedCosine = Math.min(1, Math.max(-1, cosineIncident));
  const entering = clampedCosine >= 0;
  const etaIncident = entering ? incidentIor : transmittedIor;
  const etaTransmitted = entering ? transmittedIor : incidentIor;
  const cosine = Math.abs(clampedCosine);
  const sineIncident = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const sineTransmitted = (etaIncident / etaTransmitted) * sineIncident;

  if (sineTransmitted >= 1) return 1;

  const cosineTransmitted = Math.sqrt(Math.max(0, 1 - sineTransmitted * sineTransmitted));
  const parallel =
    (etaTransmitted * cosine - etaIncident * cosineTransmitted) /
    (etaTransmitted * cosine + etaIncident * cosineTransmitted);
  const perpendicular =
    (etaIncident * cosine - etaTransmitted * cosineTransmitted) /
    (etaIncident * cosine + etaTransmitted * cosineTransmitted);

  return (parallel * parallel + perpendicular * perpendicular) * 0.5;
}
