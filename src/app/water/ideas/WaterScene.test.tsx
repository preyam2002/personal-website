import { act, cleanup, render } from "@testing-library/react";
import { getWaterQuality } from "@/lib/waterQuality";
import WaterScene from "./WaterScene";

jest.mock("@/lib/waterQuality", () => ({ getWaterQuality: jest.fn(() => "low") }));

type Resource = { generation: number };

function graphicsContext() {
  let generation = 0;
  let lost = false;
  const resource = () => ({ generation });
  const check = (value: Resource) => {
    if (!lost && value.generation !== generation) throw new Error("Stale graphics resource");
  };
  return {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
    ARRAY_BUFFER: 4, STATIC_DRAW: 5, FLOAT: 6, TRIANGLES: 7,
    getExtension: jest.fn((name: string) => name === "KHR_parallel_shader_compile"
      ? { COMPLETION_STATUS_KHR: 8 } : null),
    createProgram: jest.fn(resource),
    createShader: jest.fn(resource),
    createBuffer: jest.fn(resource),
    shaderSource: jest.fn(), compileShader: jest.fn(), attachShader: jest.fn(), linkProgram: jest.fn(),
    getProgramParameter: jest.fn(() => true),
    getProgramInfoLog: jest.fn(() => "Link failed"),
    isContextLost: jest.fn(() => lost),
    deleteProgram: jest.fn(check), deleteShader: jest.fn(check), deleteBuffer: jest.fn(check),
    useProgram: jest.fn(check),
    bindBuffer: jest.fn((_target: number, value: Resource) => check(value)),
    bufferData: jest.fn(), getAttribLocation: jest.fn(() => 0),
    enableVertexAttribArray: jest.fn(), vertexAttribPointer: jest.fn(),
    getUniformLocation: jest.fn((value: Resource) => { check(value); return resource(); }),
    uniform1f: jest.fn(check), uniform2f: jest.fn(check), viewport: jest.fn(), drawArrays: jest.fn(),
    lose: () => { lost = true; },
    restore: () => { lost = false; generation += 1; },
  };
}

describe("water preview lifecycle", () => {
  let gl: ReturnType<typeof graphicsContext>;
  let frames: Map<number, FrameRequestCallback>;
  let intersect: (visible: boolean) => void;
  let hidden: boolean;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(getWaterQuality).mockReturnValue("low");
    gl = graphicsContext();
    frames = new Map();
    hidden = false;
    let frameId = 0;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++frameId, callback);
      return frameId;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => gl) as unknown as HTMLCanvasElement["getContext"],
    );
    jest.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(390);
    jest.spyOn(HTMLCanvasElement.prototype, "clientHeight", "get").mockReturnValue(844);
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.assign(globalThis, {
      IntersectionObserver: class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          intersect = visible => callback([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect() {}
      },
      ResizeObserver: class { observe() {} disconnect() {} },
    });
  });

  afterEach(async () => {
    cleanup();
    await jest.runOnlyPendingTimersAsync();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function frame(stamp: number) {
    await act(async () => {
      const pending = Array.from(frames.values());
      frames.clear();
      pending.forEach(callback => callback(stamp));
      await jest.advanceTimersByTimeAsync(32);
    });
  }

  it("waits for visibility, limits pixels and frames, and stops in a hidden tab", async () => {
    const { container } = render(<WaterScene mode={0} />);
    expect(gl.createProgram).not.toHaveBeenCalled();
    act(() => intersect(true));
    await frame(16);
    await frame(32);
    const canvas = container.querySelector("canvas")!;
    expect(canvas.dataset.webgl).toBe("active");
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(181_000);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    await frame(48);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    await frame(66);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(0);
    await frame(1000);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    act(() => {
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await frame(1016);
    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
  });

  it("uses a new context generation after graphics recovery", async () => {
    const { container } = render(<WaterScene mode={0} />);
    const canvas = container.querySelector("canvas")!;
    act(() => intersect(true));
    await frame(16);
    await frame(32);
    act(() => {
      gl.lose();
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    expect(canvas.dataset.webgl).toBe("fallback");
    expect(frames.size).toBe(0);
    act(() => {
      gl.restore();
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    });
    await frame(64);
    await frame(80);
    expect(canvas.dataset.webgl).toBe("active");
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.deleteBuffer).not.toHaveBeenCalled();
  });

  it("skips graphics in static mode until the user selects play", async () => {
    jest.mocked(getWaterQuality).mockReturnValue("static");
    const { rerender } = render(<WaterScene mode={0} />);
    act(() => intersect(true));
    await frame(16);
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    rerender(<WaterScene mode={0} motion="playing" />);
    await frame(32);
    await frame(48);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  it("redraws paused controls without a permanent frame loop", async () => {
    const { rerender } = render(<WaterScene mode={0} motion="paused" />);
    act(() => intersect(true));
    await frame(16);
    await frame(32);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    rerender(<WaterScene mode={1} motion="paused" energy={1.5} />);
    await frame(48);
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it("keeps the fallback visible after shader failure", async () => {
    gl.getProgramParameter.mockReturnValue(false);
    gl.getExtension.mockReturnValue(null);
    const { container, getByRole } = render(<WaterScene mode={0} />);
    act(() => intersect(true));
    await frame(16);
    expect(container.querySelector("canvas")!.dataset.webgl).toBe("fallback");
    expect(getByRole("status")).toHaveTextContent("Link failed");
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("cancels pending shader work when the preview closes", async () => {
    gl.getProgramParameter.mockReturnValue(false);
    const { unmount } = render(<WaterScene mode={0} />);
    act(() => intersect(true));
    await frame(16);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    await act(async () => { unmount(); });
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
  });
});
