import { act, cleanup, render } from "@testing-library/react";
import PondSurface from "./PondSurface";

jest.mock("@/lib/prepareOcean", () => ({
  prepareOcean: jest.fn(async () => ({
    cascades: { initial: new Float32Array(4), filterVariance: new Float32Array(4) },
    mesh: { vertices: new Float32Array(3), indices: new Uint32Array(3) },
    noise: new Uint8Array(4),
  })),
}));
jest.mock("@/lib/webglPrograms", () => ({
  compileWebGLPrograms: jest.fn(async (_gl, sources: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(sources).map(name => [name, {}]))),
}));

describe("ocean first frame", () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let fence: jest.Mock;
  let wait: jest.Mock;
  let sequence: number;
  let reducedMotion: boolean;
  let scissor: jest.Mock;
  let drawMesh: jest.Mock;
  let viewport: jest.Mock;

  beforeEach(() => {
    callbacks = new Map();
    sequence = 0;
    reducedMotion = false;
    fence = jest.fn(() => ({}));
    wait = jest.fn(() => 2);
    scissor = jest.fn();
    drawMesh = jest.fn();
    viewport = jest.fn();
    const gl = new Proxy({}, {
      get: (_target, name: string) => {
        if (name === "FRAMEBUFFER_COMPLETE") return 1;
        if (name === "TIMEOUT_EXPIRED") return 2;
        if (name === "TEXTURE0") return 33984;
        if (/^[A-Z_0-9]+$/.test(name)) return 0;
        if (name === "fenceSync") return fence;
        if (name === "clientWaitSync") return wait;
        if (name === "scissor") return scissor;
        if (name === "drawElements") return drawMesh;
        if (name === "viewport") return viewport;
        if (name === "getExtension") return () => ({});
        if (name === "checkFramebufferStatus") return () => 1;
        if (name.startsWith("create") || name === "getUniformLocation") return () => ({});
        return () => undefined;
      },
    });
    jest.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((() => gl) as unknown as HTMLCanvasElement["getContext"]);
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      callbacks.set(++sequence, callback);
      return sequence;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { callbacks.delete(id); });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => ({
      matches: reducedMotion, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    })) });
    class Observer { observe() {} disconnect() {} }
    Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: Observer });
    window.history.replaceState(null, "", "/water?ocean-quality=low");
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  const frame = async (time: number) => {
    const [id, callback] = callbacks.entries().next().value!;
    callbacks.delete(id);
    await act(async () => { callback(time); });
  };

  it("keeps the scene hidden until two startup frames finish and excludes that delay from the quality budget", async () => {
    const status = jest.fn();
    await act(async () => { render(<PondSurface seed={42} onStatusChange={status} />); });
    const canvas = document.querySelector("canvas")!;
    await frame(16);
    expect(fence).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.webgl).toBe("pending");
    await frame(800);
    expect(fence).toHaveBeenCalledTimes(1);
    wait.mockReturnValue(3);
    await frame(900);
    expect(fence).toHaveBeenCalledTimes(2);
    expect(canvas.dataset.webgl).toBe("pending");
    await frame(1800);
    expect(canvas.dataset.webgl).toBe("active");
    expect(canvas.dataset.renderScale).toBe("1.00");
    expect(status).toHaveBeenLastCalledWith("active");
  });

  it.each(["fixed", "reduced motion"])("reveals a %s scene after its GPU frame completes and then stops", async mode => {
    reducedMotion = mode === "reduced motion";
    if (mode === "fixed") window.history.replaceState(null, "", "/water?ocean-quality=low&ocean-time=12");
    await act(async () => { render(<PondSurface seed={42} />); });
    const canvas = document.querySelector("canvas")!;
    await frame(16);
    expect(canvas.dataset.webgl).toBe("pending");
    wait.mockReturnValue(3);
    await frame(100);
    expect(canvas.dataset.webgl).toBe("active");
    expect(callbacks.size).toBe(0);
  });

  it.each(["full", "low"])("preserves a sharp horizon in the %s profile with one surface pass", async quality => {
    window.history.replaceState(null, "", `/water?ocean-quality=${quality}`);
    jest.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 1440, 900));
    await act(async () => { render(<PondSurface seed={42} />); });
    await frame(16);
    const canvas = document.querySelector("canvas")!;
    expect(canvas.width * canvas.height).toBeGreaterThan(990_000);
    expect(drawMesh).toHaveBeenCalledTimes(1);
    expect(scissor).toHaveBeenCalledTimes(1);
    const [x, bottom, width, height] = scissor.mock.calls[0];
    expect(x).toBe(0);
    expect(width).toBe(canvas.width);
    expect(bottom).toBeGreaterThan(canvas.height * 0.4);
    expect(bottom + height).toBeLessThan(canvas.height * 0.75);
    expect(height).toBeLessThan(canvas.height * 0.25);
    expect(viewport).toHaveBeenLastCalledWith(0, 0, canvas.width, canvas.height);
  });
});
