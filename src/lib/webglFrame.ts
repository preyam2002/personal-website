export function createWebGLFrameGate(gl: WebGL2RenderingContext) {
  let pending: WebGLSync | null = null;

  const dispose = () => {
    if (pending !== null) gl.deleteSync(pending);
    pending = null;
  };

  return {
    ready() {
      if (pending === null) return true;
      if (gl.clientWaitSync(pending, 0, 0) === gl.TIMEOUT_EXPIRED) return false;
      dispose();
      return true;
    },
    submit() {
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    },
    dispose,
  };
}
