export const ATMOSPHERE_VIEW_SAMPLES = 48;
export const PLANET_RADIUS_KM = 6360;
export const ATMOSPHERE_RADIUS_KM = 6460;
export const SKY_MIN_ELEVATION = 0.0005;

export function skyElevation(uv: number) {
  return SKY_MIN_ELEVATION + (Math.PI / 2 - SKY_MIN_ELEVATION) * uv * uv;
}

export function skyElevationUv(elevation: number) {
  return Math.sqrt(Math.min(1, Math.max(0, (elevation - SKY_MIN_ELEVATION)
    / (Math.PI / 2 - SKY_MIN_ELEVATION))));
}

export const skyMappingShader = `
float skyElevation(float uv) {
  return mix(${SKY_MIN_ELEVATION}, 1.570796326794897, uv * uv);
}
float skyElevationUv(float elevation) {
  return sqrt(clamp((elevation - ${SKY_MIN_ELEVATION}) / ${(Math.PI / 2 - SKY_MIN_ELEVATION).toFixed(15)}, 0.0, 1.0));
}
`;

const GAUSS_NODES = [
  0.005299532504175, 0.027712488463384, 0.067184398806084, 0.122297795822499,
  0.191061877798678, 0.270991611171386, 0.359198224610371, 0.452493745081181,
  0.547506254918819, 0.640801775389629, 0.729008388828614, 0.808938122201322,
  0.877702204177502, 0.932815601193916, 0.972287511536616, 0.994700467495825,
];
const GAUSS_WEIGHTS = [
  0.013576229705876, 0.031126761969324, 0.047579255841246, 0.062314485627767,
  0.074797994408288, 0.084578259697501, 0.091301707522462, 0.094725305227534,
  0.094725305227534, 0.091301707522462, 0.084578259697501, 0.074797994408288,
  0.062314485627767, 0.047579255841246, 0.031126761969324, 0.013576229705876,
];

type Vector3 = readonly [number, number, number];

export function atmosphereViewSegment(index: number, distance: number): readonly [number, number] {
  const start = index / ATMOSPHERE_VIEW_SAMPLES;
  const end = (index + 1) / ATMOSPHERE_VIEW_SAMPLES;
  return [distance * (start * start + end * end) * 0.5, distance * (end * end - start * start)];
}

export function atmosphereDensity(altitudeKm: number): Vector3 {
  return [
    Math.exp(-Math.max(altitudeKm, 0) / 8),
    Math.exp(-Math.max(altitudeKm, 0) / 1.2),
    Math.max(0, 1 - Math.abs(altitudeKm - 25) / 15),
  ];
}

/** Integrate density in kilometres. The squared path resolves dense air near the observer. */
export function atmosphereOpticalDepth(origin: Vector3, direction: Vector3, distance: number): Vector3 {
  const depth: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < GAUSS_NODES.length; i += 1) {
    const t = GAUSS_NODES[i];
    const sampleDistance = distance * t * t;
    const altitude = Math.hypot(...origin.map((value, axis) => value + direction[axis] * sampleDistance))
      - PLANET_RADIUS_KM;
    const density = atmosphereDensity(altitude);
    const weight = 2 * distance * t * GAUSS_WEIGHTS[i];
    for (let axis = 0; axis < 3; axis += 1) depth[axis] += density[axis] * weight;
  }
  return depth;
}

export const atmosphereOpticsShader = `
const float PLANET_RADIUS = ${PLANET_RADIUS_KM.toFixed(1)};
const float ATMOSPHERE_RADIUS = ${ATMOSPHERE_RADIUS_KM.toFixed(1)};
const float AIR_NODES[16] = float[16](${GAUSS_NODES.map(value => value.toFixed(15)).join(", ")});
const float AIR_WEIGHTS[16] = float[16](${GAUSS_WEIGHTS.map(value => value.toFixed(15)).join(", ")});

vec2 atmosphereViewSegment(int index, float distanceToEnd) {
  float start = float(index) / ${ATMOSPHERE_VIEW_SAMPLES.toFixed(1)};
  float end = float(index + 1) / ${ATMOSPHERE_VIEW_SAMPLES.toFixed(1)};
  return distanceToEnd * vec2((start * start + end * end) * 0.5, end * end - start * start);
}

float raySphereFar(vec3 origin, vec3 direction, float radius) {
  float projected = dot(origin, direction);
  float discriminant = projected * projected - dot(origin, origin) + radius * radius;
  if (discriminant <= 0.0) return -1.0;
  return -projected + sqrt(discriminant);
}

float raySphereNear(vec3 origin, vec3 direction, float radius) {
  float projected = dot(origin, direction);
  float discriminant = projected * projected - dot(origin, origin) + radius * radius;
  if (discriminant <= 0.0) return -1.0;
  return -projected - sqrt(discriminant);
}

vec3 atmosphereDensity(float altitude) {
  return vec3(exp(-max(altitude, 0.0) / 8.0), exp(-max(altitude, 0.0) / 1.2),
    max(0.0, 1.0 - abs(altitude - 25.0) / 15.0));
}

vec3 atmosphereOpticalDepth(vec3 origin, vec3 direction, float distanceToEnd) {
  vec3 depth = vec3(0.0);
  for (int i = 0; i < 16; i += 1) {
    float t = AIR_NODES[i];
    vec3 position = origin + direction * distanceToEnd * t * t;
    depth += atmosphereDensity(length(position) - PLANET_RADIUS)
      * (2.0 * distanceToEnd * t * AIR_WEIGHTS[i]);
  }
  return depth;
}

vec3 opticalDepthToSpace(vec3 position, vec3 lightDirection) {
  if (raySphereNear(position, lightDirection, PLANET_RADIUS) > 0.0) return vec3(1e5);
  return atmosphereOpticalDepth(position, lightDirection,
    raySphereFar(position, lightDirection, ATMOSPHERE_RADIUS));
}
`;
