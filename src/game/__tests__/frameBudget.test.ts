import { createResolutionScaler } from "../frameBudget";

function run(scaler: ReturnType<typeof createResolutionScaler>, fps: number, seconds: number) {
  const changes: number[] = [];
  for (let time = 0; time < seconds; time += 1 / fps) {
    const next = scaler.update(1 / fps);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe("resolution scaler", () => {
  it("keeps full resolution at 60 frames per second", () => {
    const scaler = createResolutionScaler();
    expect(run(scaler, 60, 20)).toEqual([]);
    expect(scaler.scale).toBe(1);
  });

  it("lowers the resolution step by step when frames are slow, down to the limit", () => {
    const scaler = createResolutionScaler({ min: 0.5 });
    const changes = run(scaler, 30, 30);
    expect(changes[0]).toBe(0.9);
    expect(scaler.scale).toBe(0.5);
  });

  it("raises the resolution again when frames become fast", () => {
    const scaler = createResolutionScaler();
    run(scaler, 30, 5);
    const low = scaler.scale;
    run(scaler, 60, 60);
    expect(low).toBeLessThan(1);
    expect(scaler.scale).toBe(1);
  });

  it("ignores stalls and invalid frame times", () => {
    const scaler = createResolutionScaler();
    expect(scaler.update(2)).toBeNull();
    expect(scaler.update(0)).toBeNull();
    expect(scaler.update(Number.NaN)).toBeNull();
    expect(scaler.frameSeconds).toBeCloseTo(1 / 60);
  });
});
