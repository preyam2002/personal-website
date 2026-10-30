import { compileWebGLPrograms } from "./webglPrograms";

function context(parallel = true) {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    LINK_STATUS: 3,
    getExtension: jest.fn(() => parallel ? { COMPLETION_STATUS_KHR: 4 } : null),
    createProgram: jest.fn(() => ({})),
    createShader: jest.fn(() => ({})),
    shaderSource: jest.fn(),
    compileShader: jest.fn(),
    attachShader: jest.fn(),
    linkProgram: jest.fn(),
    getProgramParameter: jest.fn(() => true),
    getProgramInfoLog: jest.fn(() => "Link failed"),
    isContextLost: jest.fn(() => false),
    deleteProgram: jest.fn(),
    deleteShader: jest.fn(),
  };
}

const sources = { sky: ["vertex", "sky"], sea: ["vertex", "sea"] } as const;

describe("asynchronous shader initialization", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([true, false])("submits every program before a status check (parallel=%s)", async parallel => {
    const gl = context(parallel);
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, new AbortController().signal);
    expect(gl.linkProgram).toHaveBeenCalledTimes(2);
    expect(gl.getProgramParameter).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();
    expect(Object.keys(await task)).toEqual(["sky", "sea"]);
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.compileShader).toHaveBeenCalledTimes(3);
    expect(gl.attachShader).toHaveBeenCalledTimes(4);
    expect(gl.deleteShader).toHaveBeenCalledTimes(3);
  });

  it("cancels an incomplete compile and releases its resources", async () => {
    const gl = context();
    gl.getProgramParameter.mockReturnValue(false);
    const controller = new AbortController();
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, controller.signal);
    const check = expect(task).rejects.toMatchObject({ name: "AbortError" });
    await jest.advanceTimersByTimeAsync(32);
    controller.abort();
    await check;
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("releases all programs if a link fails", async () => {
    const gl = context(false);
    gl.getProgramParameter.mockReturnValue(false);
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, new AbortController().signal);
    const check = expect(task).rejects.toThrow("Link failed");
    await jest.runAllTimersAsync();
    await check;
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
  });

  it("checks completed programs after one yield when parallel compilation is unavailable", async () => {
    const gl = context(false);
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, new AbortController().signal);
    await jest.advanceTimersByTimeAsync(16);
    expect(Object.keys(await task)).toEqual(["sky", "sea"]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("yields between slow program checks without parallel compilation", async () => {
    const gl = context(false);
    gl.getProgramParameter.mockImplementation(() => {
      jest.advanceTimersByTime(10);
      return true;
    });
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, new AbortController().signal);
    await jest.advanceTimersByTimeAsync(16);
    expect(gl.getProgramParameter).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    await task;
    expect(gl.getProgramParameter).toHaveBeenCalledTimes(2);
  });

  it("stops a compile after context loss", async () => {
    const gl = context();
    gl.getProgramParameter.mockReturnValue(false);
    gl.isContextLost.mockReturnValue(true);
    const task = compileWebGLPrograms(gl as unknown as WebGLRenderingContext, sources, new AbortController().signal);
    const check = expect(task).rejects.toThrow();
    await jest.runAllTimersAsync();
    await check;
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
  });
});
