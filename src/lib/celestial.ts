export type Direction3 = readonly [number, number, number];

export type CelestialPosition = {
  angularRadius: number;
  azimuth: number;
  direction: Direction3;
  elevation: number;
  geometricElevation: number;
  hourAngle: number;
};

export type CelestialState = {
  localSiderealAngle: number;
  moon: CelestialPosition;
  moonIllumination: number;
  period: string;
  primaryLightAngularRadius: number;
  primaryLightDirection: Direction3;
  primaryLightStrength: number;
  sun: CelestialPosition;
};

export type CelestialOptions = {
  fullMoonScene?: boolean;
};

export type DaylightWindow = {
  sunriseMinute: number;
  sunsetMinute: number;
};

export type LunarCoordinates = {
  distanceKm: number;
  latitude: number;
  longitude: number;
};

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const JULIAN_UNIX_EPOCH = 2_440_587.5;
const JULIAN_J2000 = 2_451_545;
const EARTH_EQUATORIAL_RADIUS_KM = 6_378.14;
const MOON_RADIUS_KM = 1_737.4;
const SUN_SEMIDIAMETER_AT_ONE_AU = 959.63 / 3_600 * DEGREES_TO_RADIANS;

const LUNAR_LONGITUDE_DISTANCE_TERMS = [
  [0, 0, 1, 0, 6_288_774, -20_905_355],
  [2, 0, -1, 0, 1_274_027, -3_699_111],
  [2, 0, 0, 0, 658_314, -2_955_968],
  [0, 0, 2, 0, 213_618, -569_925],
  [0, 1, 0, 0, -185_116, 48_888],
  [0, 0, 0, 2, -114_332, -3_149],
  [2, 0, -2, 0, 58_793, 246_158],
  [2, -1, -1, 0, 57_066, -152_138],
  [2, 0, 1, 0, 53_322, -170_733],
  [2, -1, 0, 0, 45_758, -204_586],
  [0, 1, -1, 0, -40_923, -129_620],
  [1, 0, 0, 0, -34_720, 108_743],
  [0, 1, 1, 0, -30_383, 104_755],
  [2, 0, 0, -2, 15_327, 10_321],
  [0, 0, 1, 2, -12_528, 0],
  [0, 0, 1, -2, 10_980, 79_661],
  [4, 0, -1, 0, 10_675, -34_782],
  [0, 0, 3, 0, 10_034, -23_210],
  [4, 0, -2, 0, 8_548, -21_636],
  [2, 1, -1, 0, -7_888, 24_208],
  [2, 1, 0, 0, -6_766, 30_824],
  [1, 0, -1, 0, -5_163, -8_379],
  [1, 1, 0, 0, 4_987, -16_675],
  [2, -1, 1, 0, 4_036, -12_831],
  [2, 0, 2, 0, 3_994, -10_445],
  [4, 0, 0, 0, 3_861, -11_650],
  [2, 0, -3, 0, 3_665, 14_403],
  [0, 1, -2, 0, -2_689, -7_003],
  [2, 0, -1, 2, -2_602, 0],
  [2, -1, -2, 0, 2_390, 10_056],
  [1, 0, 1, 0, -2_348, 6_322],
  [2, -2, 0, 0, 2_236, -9_884],
  [0, 1, 2, 0, -2_120, 5_751],
  [0, 2, 0, 0, -2_069, 0],
  [2, -2, -1, 0, 2_048, -4_950],
  [2, 0, 1, -2, -1_773, 4_130],
  [2, 0, 0, 2, -1_595, 0],
  [4, -1, -1, 0, 1_215, -3_958],
  [0, 0, 2, 2, -1_110, 0],
  [3, 0, -1, 0, -892, 3_258],
  [2, 1, 1, 0, -810, 2_616],
  [4, -1, -2, 0, 759, -1_897],
  [0, 2, -1, 0, -713, -2_117],
  [2, 2, -1, 0, -700, 2_354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1_423],
  [0, 0, 4, 0, 537, -1_117],
  [4, -1, 0, 0, 520, -1_571],
  [1, 0, -2, 0, -487, -1_739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4_421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1_165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8_752],
] as const;

const LUNAR_LATITUDE_TERMS = [
  [0, 0, 0, 1, 5_128_122],
  [0, 0, 1, 1, 280_602],
  [0, 0, 1, -1, 277_693],
  [2, 0, 0, -1, 173_237],
  [2, 0, -1, 1, 55_413],
  [2, 0, -1, -1, 46_271],
  [2, 0, 0, 1, 32_573],
  [0, 0, 2, 1, 17_198],
  [2, 0, 1, -1, 9_266],
  [0, 0, 2, -1, 8_822],
  [2, -1, 0, -1, 8_216],
  [2, 0, -2, -1, 4_324],
  [2, 0, 1, 1, 4_200],
  [2, 1, 0, -1, -3_359],
  [2, -1, -1, 1, 2_463],
  [2, -1, 0, 1, 2_211],
  [2, -1, -1, -1, 2_065],
  [0, 1, -1, -1, -1_870],
  [4, 0, -1, -1, 1_828],
  [0, 1, 0, 1, -1_794],
  [0, 0, 0, 3, -1_749],
  [0, 1, -1, 1, -1_565],
  [1, 0, 0, 1, -1_491],
  [0, 1, 1, 1, -1_475],
  [0, 1, 1, -1, -1_410],
  [0, 1, 0, -1, -1_344],
  [1, 0, 0, -1, -1_335],
  [0, 0, 3, 1, 1_107],
  [4, 0, 0, -1, 1_021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeRadians(value: number) {
  return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function sineDegrees(value: number) {
  return Math.sin(value * DEGREES_TO_RADIANS);
}

function cosineDegrees(value: number) {
  return Math.cos(value * DEGREES_TO_RADIANS);
}

function julianDay(date: Date) {
  return date.getTime() / 86_400_000 + JULIAN_UNIX_EPOCH;
}

function meanObliquityDegrees(centuries: number) {
  const seconds =
    21.448 -
    centuries * (46.815 + centuries * (0.00059 - centuries * 0.001813));
  return 23 + 26 / 60 + seconds / 3_600;
}

function horizontalPosition(
  rightAscension: number,
  declination: number,
  localSiderealAngle: number,
  latitude: number,
  angularRadius: number,
): CelestialPosition {
  const hourAngle = normalizeRadians(localSiderealAngle - rightAscension + Math.PI) - Math.PI;
  const sineElevation =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const geometricElevation = Math.asin(clamp(sineElevation, -1, 1));
  const azimuth = normalizeRadians(
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) -
        Math.tan(declination) * Math.cos(latitude),
    ) + Math.PI,
  );
  const horizontalRadius = Math.cos(geometricElevation);

  return {
    angularRadius,
    azimuth,
    direction: [
      horizontalRadius * Math.sin(azimuth),
      Math.sin(geometricElevation),
      horizontalRadius * Math.cos(azimuth),
    ],
    elevation: geometricElevation,
    geometricElevation,
    hourAngle,
  };
}

function atmosphericRefractionDegrees(elevationDegrees: number) {
  if (elevationDegrees > 85) return 0;

  const tangent = Math.tan(elevationDegrees * DEGREES_TO_RADIANS);
  if (elevationDegrees > 5) {
    return (
      58.1 / tangent -
      0.07 / tangent ** 3 +
      0.000086 / tangent ** 5
    ) / 3_600;
  }

  if (elevationDegrees > -0.575) {
    return (
      1_735 +
      elevationDegrees * (
        -518.2 +
        elevationDegrees * (103.4 + elevationDegrees * (-12.79 + elevationDegrees * 0.711))
      )
    ) / 3_600;
  }

  return (-20.772 / tangent) / 3_600;
}

function applyAtmosphericRefraction(position: CelestialPosition) {
  const refraction = atmosphericRefractionDegrees(
    position.geometricElevation * RADIANS_TO_DEGREES,
  ) * DEGREES_TO_RADIANS;
  const elevation = position.geometricElevation + refraction;
  const horizontalRadius = Math.cos(elevation);

  return {
    ...position,
    direction: [
      horizontalRadius * Math.sin(position.azimuth),
      Math.sin(elevation),
      horizontalRadius * Math.cos(position.azimuth),
    ] as Direction3,
    elevation,
  };
}

function topocentricEquatorialPosition(
  rightAscension: number,
  declination: number,
  localSiderealAngle: number,
  latitude: number,
  horizontalParallax: number,
) {
  const hourAngle = normalizeRadians(
    localSiderealAngle - rightAscension + Math.PI,
  ) - Math.PI;
  const reducedLatitude = Math.atan(0.99664719 * Math.tan(latitude));
  const observerSinLatitude = 0.99664719 * Math.sin(reducedLatitude);
  const observerCosLatitude = Math.cos(reducedLatitude);
  const sineParallax = Math.sin(horizontalParallax);
  const rightAscensionCorrection = Math.atan2(
    -observerCosLatitude * sineParallax * Math.sin(hourAngle),
    Math.cos(declination) -
      observerCosLatitude * sineParallax * Math.cos(hourAngle),
  );
  const topocentricRightAscension = rightAscension + rightAscensionCorrection;
  const topocentricDeclination = Math.atan2(
    (Math.sin(declination) - observerSinLatitude * sineParallax) *
      Math.cos(rightAscensionCorrection),
    Math.cos(declination) -
      observerCosLatitude * sineParallax * Math.cos(hourAngle),
  );

  return {
    declination: topocentricDeclination,
    rightAscension: topocentricRightAscension,
  };
}

export function getSolarPosition(
  date: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
): CelestialPosition {
  const day = julianDay(date);
  const centuries = (day - JULIAN_J2000) / 36_525;
  const meanLongitude = normalizeDegrees(
    280.46646 + centuries * (36_000.76983 + centuries * 0.0003032),
  );
  const meanAnomaly = normalizeDegrees(
    357.52911 + centuries * (35_999.05029 - 0.0001537 * centuries),
  );
  const equationOfCenter =
    sineDegrees(meanAnomaly) * (1.914602 - centuries * (0.004817 + 0.000014 * centuries)) +
    sineDegrees(2 * meanAnomaly) * (0.019993 - 0.000101 * centuries) +
    sineDegrees(3 * meanAnomaly) * 0.000289;
  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = 125.04 - 1_934.136 * centuries;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sineDegrees(omega);
  const obliquity = (
    meanObliquityDegrees(centuries) + 0.00256 * cosineDegrees(omega)
  ) * DEGREES_TO_RADIANS;
  const apparentLongitudeRadians = apparentLongitude * DEGREES_TO_RADIANS;
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(apparentLongitudeRadians),
  );
  const rightAscension = normalizeRadians(
    Math.atan2(
      Math.cos(obliquity) * Math.sin(apparentLongitudeRadians),
      Math.cos(apparentLongitudeRadians),
    ),
  );
  const greenwichSiderealDegrees = normalizeDegrees(
    280.46061837 +
    360.98564736629 * (day - JULIAN_J2000) +
    0.000387933 * centuries ** 2 -
    centuries ** 3 / 38_710_000,
  );
  const localSiderealAngle = normalizeRadians(
    (greenwichSiderealDegrees + longitudeDegrees) * DEGREES_TO_RADIANS,
  );
  const position = horizontalPosition(
    rightAscension,
    declination,
    localSiderealAngle,
    latitudeDegrees * DEGREES_TO_RADIANS,
    0,
  );
  const orbitalEccentricity =
    0.016708634 - centuries * (0.000042037 + 0.0000001267 * centuries);
  const trueAnomaly = (meanAnomaly + equationOfCenter) * DEGREES_TO_RADIANS;
  const distanceAu = (
    1.000001018 * (1 - orbitalEccentricity ** 2)
  ) / (
    1 + orbitalEccentricity * Math.cos(trueAnomaly)
  );

  return applyAtmosphericRefraction({
    ...position,
    angularRadius: SUN_SEMIDIAMETER_AT_ONE_AU / distanceAu,
  });
}

export function getDaylightWindow(
  date: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
): DaylightWindow {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  const sunriseElevation = -0.833 * DEGREES_TO_RADIANS;
  let sunriseMinute: number | null = null;
  let sunsetMinute: number | null = null;
  let previousAboveHorizon = getSolarPosition(
    midnight,
    latitudeDegrees,
    longitudeDegrees,
  ).geometricElevation >= sunriseElevation;

  for (let minute = 5; minute <= 1_440; minute += 5) {
    const sample = new Date(midnight);
    sample.setMinutes(minute);
    const aboveHorizon = getSolarPosition(
      sample,
      latitudeDegrees,
      longitudeDegrees,
    ).geometricElevation >= sunriseElevation;

    if (!previousAboveHorizon && aboveHorizon && sunriseMinute === null) {
      sunriseMinute = minute;
    }
    if (previousAboveHorizon && !aboveHorizon) {
      sunsetMinute = Math.max(0, Math.min(minute - 5, 1_439));
    }
    previousAboveHorizon = aboveHorizon;
  }

  return {
    sunriseMinute: sunriseMinute ?? 0,
    sunsetMinute: sunsetMinute ?? 1_439,
  };
}

export function getLunarCoordinates(date: Date): LunarCoordinates {
  const day = julianDay(date);
  const centuries = (day - JULIAN_J2000) / 36_525;
  const centuriesSquared = centuries ** 2;
  const centuriesCubed = centuries ** 3;
  const centuriesFourth = centuries ** 4;
  const meanLongitude = normalizeDegrees(
    218.3164477 + 481_267.88123421 * centuries -
      0.0015786 * centuriesSquared +
      centuriesCubed / 538_841 - centuriesFourth / 65_194_000,
  );
  const elongation = normalizeDegrees(
    297.8501921 + 445_267.1114034 * centuries -
      0.0018819 * centuriesSquared +
      centuriesCubed / 545_868 - centuriesFourth / 113_065_000,
  );
  const solarAnomaly = normalizeDegrees(
    357.5291092 + 35_999.0502909 * centuries -
      0.0001536 * centuriesSquared + centuriesCubed / 24_490_000,
  );
  const lunarAnomaly = normalizeDegrees(
    134.9633964 + 477_198.8675055 * centuries +
      0.0087414 * centuriesSquared +
      centuriesCubed / 69_699 - centuriesFourth / 14_712_000,
  );
  const latitudeArgument = normalizeDegrees(
    93.272095 + 483_202.0175233 * centuries -
      0.0036539 * centuriesSquared -
      centuriesCubed / 3_526_000 + centuriesFourth / 863_310_000,
  );
  const eccentricity = 1 - 0.002516 * centuries - 0.0000074 * centuriesSquared;
  let longitudeSum = 0;
  let distanceSum = 0;

  for (const [d, m, moon, f, longitudeTerm, distanceTerm] of LUNAR_LONGITUDE_DISTANCE_TERMS) {
    const argument = (
      d * elongation + m * solarAnomaly + moon * lunarAnomaly + f * latitudeArgument
    ) * DEGREES_TO_RADIANS;
    const eccentricityFactor = Math.abs(m) === 1
      ? eccentricity
      : Math.abs(m) === 2
        ? eccentricity ** 2
        : 1;
    longitudeSum += longitudeTerm * eccentricityFactor * Math.sin(argument);
    distanceSum += distanceTerm * eccentricityFactor * Math.cos(argument);
  }

  let latitudeSum = 0;
  for (const [d, m, moon, f, latitudeTerm] of LUNAR_LATITUDE_TERMS) {
    const argument = (
      d * elongation + m * solarAnomaly + moon * lunarAnomaly + f * latitudeArgument
    ) * DEGREES_TO_RADIANS;
    const eccentricityFactor = Math.abs(m) === 1
      ? eccentricity
      : Math.abs(m) === 2
        ? eccentricity ** 2
        : 1;
    latitudeSum += latitudeTerm * eccentricityFactor * Math.sin(argument);
  }

  const a1 = (119.75 + 131.849 * centuries) * DEGREES_TO_RADIANS;
  const a2 = (53.09 + 479_264.29 * centuries) * DEGREES_TO_RADIANS;
  const a3 = (313.45 + 481_266.484 * centuries) * DEGREES_TO_RADIANS;
  const meanLongitudeRadians = meanLongitude * DEGREES_TO_RADIANS;
  const latitudeArgumentRadians = latitudeArgument * DEGREES_TO_RADIANS;
  const lunarAnomalyRadians = lunarAnomaly * DEGREES_TO_RADIANS;
  longitudeSum +=
    3_958 * Math.sin(a1) +
    1_962 * Math.sin(meanLongitudeRadians - latitudeArgumentRadians) +
    318 * Math.sin(a2);
  latitudeSum +=
    -2_235 * Math.sin(meanLongitudeRadians) +
    382 * Math.sin(a3) +
    175 * Math.sin(a1 - latitudeArgumentRadians) +
    175 * Math.sin(a1 + latitudeArgumentRadians) +
    127 * Math.sin(meanLongitudeRadians - lunarAnomalyRadians) -
    115 * Math.sin(meanLongitudeRadians + lunarAnomalyRadians);

  return {
    distanceKm: 385_000.56 + distanceSum * 0.001,
    latitude: latitudeSum * 0.000001 * DEGREES_TO_RADIANS,
    longitude: normalizeRadians(
      (meanLongitude + longitudeSum * 0.000001) * DEGREES_TO_RADIANS,
    ),
  };
}

export function getMoonPosition(
  date: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
): CelestialPosition {
  const day = julianDay(date);
  const centuries = (day - JULIAN_J2000) / 36_525;
  const lunar = getLunarCoordinates(date);
  const obliquity = meanObliquityDegrees(centuries) * DEGREES_TO_RADIANS;
  const rightAscension = normalizeRadians(
    Math.atan2(
      Math.sin(lunar.longitude) * Math.cos(obliquity) -
        Math.tan(lunar.latitude) * Math.sin(obliquity),
      Math.cos(lunar.longitude),
    ),
  );
  const declination = Math.asin(
    Math.sin(lunar.latitude) * Math.cos(obliquity) +
    Math.cos(lunar.latitude) * Math.sin(obliquity) * Math.sin(lunar.longitude),
  );
  const greenwichSiderealDegrees = normalizeDegrees(
    280.46061837 +
    360.98564736629 * (day - JULIAN_J2000) +
    0.000387933 * centuries ** 2 -
    centuries ** 3 / 38_710_000,
  );
  const localSiderealAngle = normalizeRadians(
    (greenwichSiderealDegrees + longitudeDegrees) * DEGREES_TO_RADIANS,
  );
  const observerLatitude = latitudeDegrees * DEGREES_TO_RADIANS;
  const horizontalParallax = Math.asin(
    EARTH_EQUATORIAL_RADIUS_KM / lunar.distanceKm,
  );
  const topocentric = topocentricEquatorialPosition(
    rightAscension,
    declination,
    localSiderealAngle,
    observerLatitude,
    horizontalParallax,
  );
  const position = horizontalPosition(
    topocentric.rightAscension,
    topocentric.declination,
    localSiderealAngle,
    observerLatitude,
    Math.asin(MOON_RADIUS_KM / lunar.distanceKm),
  );

  return applyAtmosphericRefraction(position);
}

function getFullMoonScenePosition(
  sun: CelestialPosition,
  actualMoon: CelestialPosition,
) {
  const azimuth = normalizeRadians(sun.azimuth + Math.PI);
  const geometricElevation = Math.min(
    -sun.geometricElevation,
    38 * DEGREES_TO_RADIANS,
  );
  const horizontalRadius = Math.cos(geometricElevation);

  return applyAtmosphericRefraction({
    angularRadius: actualMoon.angularRadius,
    azimuth,
    direction: [
      horizontalRadius * Math.sin(azimuth),
      Math.sin(geometricElevation),
      horizontalRadius * Math.cos(azimuth),
    ],
    elevation: geometricElevation,
    geometricElevation,
    hourAngle: normalizeRadians(sun.hourAngle + Math.PI),
  });
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function getPeriod(sun: CelestialPosition) {
  const elevation = sun.geometricElevation * RADIANS_TO_DEGREES;
  const beforeNoon = sun.hourAngle < 0;

  if (elevation < -18) return "Night";
  if (elevation < -12) return beforeNoon ? "Before dawn" : "Late dusk";
  if (elevation < -6) return beforeNoon ? "Dawn" : "Dusk";
  if (elevation < -0.833) return beforeNoon ? "First light" : "Evening";
  if (elevation < 6) return beforeNoon ? "Sunrise" : "Sunset";
  return beforeNoon ? "Morning" : "Afternoon";
}

export function getCelestialState(
  date: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
  options: CelestialOptions = {},
): CelestialState {
  const sun = getSolarPosition(date, latitudeDegrees, longitudeDegrees);
  const actualMoon = getMoonPosition(date, latitudeDegrees, longitudeDegrees);
  const actualMoonIllumination = clamp(
    (1 - (
      sun.direction[0] * actualMoon.direction[0] +
      sun.direction[1] * actualMoon.direction[1] +
      sun.direction[2] * actualMoon.direction[2]
    )) * 0.5,
    0,
    1,
  );
  const moon = options.fullMoonScene
    ? getFullMoonScenePosition(sun, actualMoon)
    : actualMoon;
  const moonIllumination = options.fullMoonScene ? 1 : actualMoonIllumination;
  const sunElevationDegrees = sun.geometricElevation * RADIANS_TO_DEGREES;
  const moonElevationDegrees = moon.geometricElevation * RADIANS_TO_DEGREES;
  const sunStrength = smoothstep(-0.833, 2, sunElevationDegrees);
  const phaseAngleDegrees = Math.acos(
    clamp(2 * moonIllumination - 1, -1, 1),
  ) * RADIANS_TO_DEGREES;
  const phaseMagnitude =
    0.026 * phaseAngleDegrees + 4e-9 * phaseAngleDegrees ** 4;
  const phaseBrightness = 10 ** (-0.4 * phaseMagnitude);
  const moonStrength =
    smoothstep(-0.3, 2, moonElevationDegrees) * phaseBrightness * 0.03;
  const primaryLightDirection = sunStrength > 0
    ? sun.direction
    : moon.direction;
  const primaryLightAngularRadius = sunStrength > 0
    ? sun.angularRadius
    : moon.angularRadius;
  const day = julianDay(date);
  const centuries = (day - JULIAN_J2000) / 36_525;
  const localSiderealAngle = normalizeRadians((
    280.46061837 +
    360.98564736629 * (day - JULIAN_J2000) +
    0.000387933 * centuries ** 2 -
    centuries ** 3 / 38_710_000 +
    longitudeDegrees
  ) * DEGREES_TO_RADIANS);

  return {
    localSiderealAngle,
    moon,
    moonIllumination,
    period: getPeriod(sun),
    primaryLightAngularRadius,
    primaryLightDirection,
    primaryLightStrength: sunStrength > 0 ? sunStrength : moonStrength,
    sun,
  };
}
