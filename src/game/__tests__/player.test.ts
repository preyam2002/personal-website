import { BREATH_SECONDS, SURFACE_HEIGHT, createDiver, isUnderwater, stepDiver, turnDiver, viewDirection } from "../player";

const flatSeabed = () => -20;
const idle = { forward: 0, strafe: 0, rise: 0, sprint: false };

function run(diver: ReturnType<typeof createDiver>, input: typeof idle, seconds: number, seabed = flatSeabed) {
  const events: string[] = [];
  for (let time = 0; time < seconds; time += 1 / 60) events.push(...stepDiver(diver, input, 1 / 60, seabed));
  return events;
}

describe("diver", () => {
  it("returns a unit view direction that looks north at yaw 0", () => {
    const view = viewDirection(0, 0);
    expect(view[2]).toBeCloseTo(1);
    expect(Math.hypot(...viewDirection(1.2, -0.7))).toBeCloseTo(1);
  });

  it("floats at the surface when idle", () => {
    const diver = createDiver(0, 0);
    run(diver, idle, 3);
    expect(diver.position[1]).toBeCloseTo(SURFACE_HEIGHT, 1);
    expect(isUnderwater(diver)).toBe(false);
  });

  it("swims level at the surface when the view is near level", () => {
    const diver = createDiver(0, 0);
    diver.pitch = -0.1;
    run(diver, { ...idle, forward: 1 }, 2);
    expect(isUnderwater(diver)).toBe(false);
    expect(diver.position[2]).toBeGreaterThan(4);
  });

  it("dives when the diver looks down and swims forward", () => {
    const diver = createDiver(0, 0);
    diver.pitch = -1;
    const events = run(diver, { ...idle, forward: 1 }, 3);
    expect(events).toContain("dived");
    expect(diver.position[1]).toBeLessThan(-3);
  });

  it("strafes to the screen right, which is -x when the diver looks north", () => {
    const diver = createDiver(0, 0);
    diver.pitch = 0;
    run(diver, { ...idle, strafe: 1 }, 1);
    expect(diver.position[0]).toBeLessThan(-1);
  });

  it("does not go below the seabed clearance", () => {
    const diver = createDiver(0, 0);
    diver.pitch = -1.4;
    run(diver, { ...idle, forward: 1, sprint: true }, 12, () => -6);
    expect(diver.position[1]).toBeGreaterThanOrEqual(-6 + 0.69);
  });

  it("uses air under water, faster in a sprint, and blacks out when empty", () => {
    const calm = createDiver(0, 0);
    calm.position[1] = -10;
    stepDiver(calm, idle, 1, flatSeabed);
    const sprint = createDiver(0, 0);
    sprint.position[1] = -10;
    stepDiver(sprint, { ...idle, sprint: true }, 1, flatSeabed);
    expect(1 - calm.oxygen).toBeCloseTo(1 / BREATH_SECONDS, 4);
    expect(1 - sprint.oxygen).toBeGreaterThan(1 - calm.oxygen);
    calm.oxygen = 0.001;
    calm.position[1] = -10;
    expect(stepDiver(calm, { ...idle, rise: -1 }, 1, flatSeabed)).toContain("blackout");
  });

  it("refills air at the surface", () => {
    const diver = createDiver(0, 0);
    diver.oxygen = 0.2;
    run(diver, idle, 1);
    expect(diver.oxygen).toBeGreaterThan(0.45);
  });

  it("limits the pitch", () => {
    const diver = createDiver(0, 0);
    turnDiver(diver, 0, 10);
    expect(diver.pitch).toBeLessThan(Math.PI / 2);
    turnDiver(diver, 0, -20);
    expect(diver.pitch).toBeGreaterThan(-Math.PI / 2);
  });
});
