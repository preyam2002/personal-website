/**
 * Where the animals live: loops and homes laid out on the zones of world.ts.
 *
 * Heights are absolute (y < 0 under water). A very low height (BOTTOM) means
 * "follow the seabed": the animal's clearance clamps it to a set height above
 * the bottom. The tests check every loop against the seabed and the surface.
 */

import { ellipseLoop, type Point3 } from "./motion";

export const BOTTOM = -200;

/** Humpbacks: a wide loop over the drop-off and the open water to the north. */
export const WHALE_ROUTE: Point3[] = [
  { x: 60, y: -13, z: 232 },
  { x: 140, y: -13, z: 256 },
  { x: 225, y: -13, z: 240 },
  { x: 244, y: -13, z: 160 },
  { x: 228, y: -13, z: 108 },
  { x: 168, y: -13, z: 122 },
  { x: 105, y: -13, z: 172 },
];

/** The whale shark: a slow pass over the sand flats and by the wreck, in mid-water. */
export const WHALE_SHARK_ROUTE: Point3[] = [
  { x: 0, y: -10, z: -60 },
  { x: 60, y: -9, z: -122 },
  { x: 130, y: -10, z: -100 },
  { x: 150, y: -11, z: -30 },
  { x: 95, y: -10, z: 32 },
  { x: 20, y: -9, z: 18 },
  { x: -35, y: -10, z: -25 },
];

/** The great white patrols along the top of the drop-off wall. */
export const GREAT_WHITE_ROUTE: Point3[] = [
  { x: 60, y: -16, z: 122 },
  { x: 110, y: -17, z: 60 },
  { x: 170, y: -18, z: 18 },
  { x: 222, y: -18, z: 12 },
  { x: 240, y: -18, z: 52 },
  { x: 205, y: -18, z: 75 },
  { x: 150, y: -18, z: 112 },
  { x: 92, y: -17, z: 150 },
];

/** Grey reef sharks circle the reef close to the bottom. */
export const REEF_SHARK_ROUTES: Point3[][] = [
  ellipseLoop(10, -190, 42, 30, BOTTOM, 9, 0.2, 0.12, 1),
  ellipseLoop(-2, -178, 26, 36, BOTTOM, 8, 0.6, 0.15, 2),
  ellipseLoop(28, -202, 52, 34, BOTTOM, 10, -0.4, 0.1, 3),
];

/** The manta circles a cleaning station on the upper drop-off. */
export const MANTA_ROUTE: Point3[] = ellipseLoop(95, 110, 18, 13, -12, 8, 0.4, 0.15, 4);

/** Green turtles cruise over the reef near the bottom. */
export const TURTLE_ROUTES: Point3[][] = [
  ellipseLoop(0, -165, 28, 20, BOTTOM, 8, 0.3, 0.15, 5),
  ellipseLoop(45, -150, 22, 16, BOTTOM, 8, -0.5, 0.15, 6),
];

/** Moon jelly swarms: centre, radius, and the depth band they drift in. */
export const JELLY_SWARMS = [
  { x: 130, z: 150, radius: 22, top: -3, bottom: -15, share: 0.45 },
  { x: 30, z: -70, radius: 18, top: -2.5, bottom: -12, share: 0.35 },
  { x: -110, z: 30, radius: 14, top: -3, bottom: -10, share: 0.2 },
] as const;

export type SchoolHome = { x: number; z: number; y: number; radius: number; drift: number };

/** Homes for the fish schools: each school's home point drifts round a small circle. */
export const SCHOOL_HOMES = {
  sardines: { x: 150, z: 150, y: -8, radius: 22, drift: 0.6 },
  // Jacks circle 5-10 m above the wreck's forward deck (the hull lies along heading 0.6 from (40, 40)).
  jacks: { x: 48, z: 53, y: -9.5, radius: 3, drift: 0.2 },
  // Snapper hang off the wreck's starboard side, beside the hull rather than inside it.
  snapper: { x: 52, z: 32, y: -21, radius: 4, drift: 0.15 },
  yellowTang: { x: -5, z: -185, y: BOTTOM, radius: 14, drift: 0.3 },
  blueTang: { x: 30, z: -202, y: BOTTOM, radius: 14, drift: 0.3 },
  barramundi: { x: 60, z: -150, y: -12, radius: 10, drift: 0.2 },
  blacksmith: { x: -150, z: -20, y: -8, radius: 18, drift: 0.3 },
} satisfies Record<string, SchoolHome>;
