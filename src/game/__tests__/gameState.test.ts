import { PHOTO_RANGE, createJournal, evaluatePhoto, journalProgress, recordDiscovery } from "../gameState";

const camera: [number, number, number] = [0, -5, 0];
const forward: [number, number, number] = [0, 0, 1];
const up: [number, number, number] = [0, 1, 0];
const fov = Math.PI / 3;

describe("photos", () => {
  it("captures a large subject in the center of the frame", () => {
    const result = evaluatePhoto(camera, forward, up, fov, 1.6, [{ id: "whale", position: [0, -5, 20], radius: 6 }]);
    expect(result?.id).toBe("whale");
  });

  it("ignores subjects behind the camera, outside the frame, too small, or too far", () => {
    const subjects = [
      { id: "behind", position: [0, -5, -10] as [number, number, number], radius: 3 },
      { id: "side", position: [30, -5, 5] as [number, number, number], radius: 1 },
      { id: "small", position: [0, -5, 30] as [number, number, number], radius: 0.3 },
      { id: "far", position: [0, -5, PHOTO_RANGE + 20] as [number, number, number], radius: 6 },
    ];
    expect(evaluatePhoto(camera, forward, up, fov, 1.6, subjects)).toBeNull();
  });

  it("prefers the subject that fills more of the frame", () => {
    const result = evaluatePhoto(camera, forward, up, fov, 1.6, [
      { id: "fish", position: [0.5, -5, 6], radius: 0.6 },
      { id: "shark", position: [0, -5, 8], radius: 2 },
    ]);
    expect(result?.id).toBe("shark");
  });
});

describe("journal", () => {
  it("records a discovery only once and tracks progress", () => {
    const journal = createJournal([
      { id: "a", name: "A", subtitle: "", description: "" },
      { id: "b", name: "B", subtitle: "", description: "" },
    ]);
    expect(journalProgress(journal)).toEqual({ found: 0, total: 2, complete: false });
    expect(recordDiscovery(journal, "a", 4)).toBe(true);
    expect(recordDiscovery(journal, "a", 5)).toBe(false);
    expect(recordDiscovery(journal, "missing", 5)).toBe(false);
    expect(journal[0].foundAt).toBe(4);
    recordDiscovery(journal, "b", 6);
    expect(journalProgress(journal).complete).toBe(true);
  });
});
