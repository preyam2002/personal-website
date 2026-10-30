export const FOAM_DOMAIN_METERS = 256;
export const FOAM_ORIGIN = [-128, -64] as const;
export const FOAM_HALF_LIFE_SECONDS = 2.4;
export const FOAM_SOURCE_RATE = 1.2;
export const FOAM_DRIFT_FRACTION = 0.015;

/** Exact density update for a constant source: dF/dt = source * (1 - F) - decay * F. */
export function advanceFoam(density: number, source: number, seconds: number) {
  const birth = source * FOAM_SOURCE_RATE;
  const rate = birth + Math.LN2 / FOAM_HALF_LIFE_SECONDS;
  const retention = Math.exp(-rate * seconds);
  return density * retention + birth / rate * (1 - retention);
}

export const foamEvolutionShader = `
float advanceFoam(float density, float source, float seconds) {
  float birth = source * ${FOAM_SOURCE_RATE.toFixed(4)};
  float rate = birth + ${(Math.LN2 / FOAM_HALF_LIFE_SECONDS).toFixed(12)};
  float retention = exp(-rate * seconds);
  return density * retention + birth / rate * (1.0 - retention);
}
`;
