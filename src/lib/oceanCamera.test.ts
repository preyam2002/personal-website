import {
  CAMERA_ORIGIN_BOTTOM,
  CAMERA_ORIGIN_TOP,
  getCameraRay,
  getOceanCamera,
  getOceanSeedPhase,
  intersectHeightField,
  intersectHorizontalPlane,
  projectToScreen,
} from "./oceanCamera";

const length = (vector: readonly number[]) => Math.hypot(...vector);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("ocean camera mirror", () => {
  it("starts above the water and ends near the seabed", () => {
    const phase = getOceanSeedPhase(4603);
    expect(getOceanCamera(0, phase).origin).toEqual([...CAMERA_ORIGIN_TOP]);
    const bottom = getOceanCamera(1, phase).origin;
    expect(bottom[1]).toBeCloseTo(CAMERA_ORIGIN_BOTTOM[1], 6);
  });

  it.each([0, 0.1, 0.2, 0.45, 0.8, 1])("keeps an orthonormal basis at scroll %p", scroll => {
    const camera = getOceanCamera(scroll, 1.3);
    expect(length(camera.forward)).toBeCloseTo(1, 6);
    expect(length(camera.right)).toBeCloseTo(1, 6);
    expect(length(camera.up)).toBeCloseTo(1, 6);
    expect(dot(camera.forward, camera.right)).toBeCloseTo(0, 6);
    expect(dot(camera.forward, camera.up)).toBeCloseTo(0, 6);
    expect(camera.up[1]).toBeGreaterThan(0);
  });

  it("maps the screen center to the forward ray and the lower edge to nearer water", () => {
    const camera = getOceanCamera(0, 0);
    const center = getCameraRay(camera, 0, 0);
    center.forEach((value, index) => expect(value).toBeCloseTo(camera.forward[index], 6));
    const near = intersectHorizontalPlane(camera.origin, getCameraRay(camera, 0, -1), 0, 100)!;
    const far = intersectHorizontalPlane(camera.origin, getCameraRay(camera, 0, -0.2), 0, 100)!;
    expect(near[2]).toBeGreaterThan(camera.origin[2]);
    expect(far[2]).toBeGreaterThan(near[2]);
  });

  it("rejects rays above the horizon and hits beyond the limit", () => {
    const camera = getOceanCamera(0, 0);
    expect(intersectHorizontalPlane(camera.origin, getCameraRay(camera, 0, 0.5), 0, 100)).toBeNull();
    expect(intersectHorizontalPlane(camera.origin, getCameraRay(camera, 0, -0.01), 0, 5)).toBeNull();
  });
});

describe("pointer mapping", () => {
  it("finds a wave trough that the mean plane misses by meters", () => {
    const camera = getOceanCamera(0, 0);
    const ray = getCameraRay(camera, 0.2, -0.15);
    const heightAt = (x: number, z: number) => 0.25 * Math.sin(x * 0.3 + z * 0.07) - 0.1;
    const hit = intersectHeightField(camera.origin, ray, heightAt, 100)!;
    expect(hit[1]).toBeCloseTo(heightAt(hit[0], hit[2]), 4);
    const plane = intersectHorizontalPlane(camera.origin, ray, 0, 100)!;
    expect(Math.abs(plane[2] - hit[2])).toBeGreaterThan(0.2);
  });

  it("projects a point back to the screen position of its ray", () => {
    for (const scroll of [0, 0.1]) {
      const camera = getOceanCamera(scroll, 0.7);
      const ray = getCameraRay(camera, -0.4, -0.3);
      const point = camera.origin.map((value, axis) => value + ray[axis] * 7) as [number, number, number];
      const screen = projectToScreen(camera, point)!;
      expect(screen[0]).toBeCloseTo(-0.4, 6);
      expect(screen[1]).toBeCloseTo(-0.3, 6);
    }
    const camera = getOceanCamera(0, 0);
    expect(projectToScreen(camera, [0, 0, -20])).toBeNull();
  });
});
