import { createWebGLFrameGate } from "./webglFrame";

function context() {
  return {
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    clientWaitSync: jest.fn(() => 0x911b),
    fenceSync: jest.fn(() => ({})),
    deleteSync: jest.fn(),
    flush: jest.fn(),
  };
}

describe("WebGL frame queue", () => {
  it("defers another frame until the GPU finishes, without a blocking wait", () => {
    const gl = context();
    const gate = createWebGLFrameGate(gl as unknown as WebGL2RenderingContext);
    expect(gate.ready()).toBe(true);
    gate.submit();
    const fence = gl.fenceSync.mock.results[0].value;
    expect(gl.flush).toHaveBeenCalledTimes(1);
    expect(gate.ready()).toBe(false);
    expect(gate.ready()).toBe(false);
    expect(gl.clientWaitSync).toHaveBeenLastCalledWith(fence, 0, 0);
    expect(gl.deleteSync).not.toHaveBeenCalled();
    gl.clientWaitSync.mockReturnValue(gl.CONDITION_SATISFIED);
    expect(gate.ready()).toBe(true);
    expect(gl.deleteSync).toHaveBeenCalledWith(fence);
    expect(gate.ready()).toBe(true);
    expect(gl.deleteSync).toHaveBeenCalledTimes(1);
  });

  it("releases a pending fence during cleanup", () => {
    const gl = context();
    const gate = createWebGLFrameGate(gl as unknown as WebGL2RenderingContext);
    gate.submit();
    gate.dispose();
    gate.dispose();
    expect(gl.deleteSync).toHaveBeenCalledTimes(1);
    expect(gate.ready()).toBe(true);
  });

  it("does not retain a failed fence after context loss", () => {
    const gl = context();
    const gate = createWebGLFrameGate(gl as unknown as WebGL2RenderingContext);
    gate.submit();
    gl.clientWaitSync.mockReturnValue(gl.WAIT_FAILED);
    expect(gate.ready()).toBe(true);
    expect(gl.deleteSync).toHaveBeenCalledTimes(1);
  });
});
