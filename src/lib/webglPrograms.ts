type GL = WebGLRenderingContext | WebGL2RenderingContext;
type ShaderSources = Record<string, readonly [string, string]>;

function yieldToBrowser(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Shader initialization stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 16);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export async function compileWebGLPrograms<T extends ShaderSources>(
  gl: GL,
  sources: T,
  signal: AbortSignal,
): Promise<{ [K in keyof T]: WebGLProgram }> {
  const programs: Record<string, WebGLProgram> = {};
  const shaders = new Map<string, WebGLShader>();
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  try {
    if (signal.aborted) throw new DOMException("Shader initialization stopped", "AbortError");
    for (const [name, pair] of Object.entries(sources)) {
      const program = gl.createProgram();
      if (!program) throw new Error("WebGL program allocation failed");
      programs[name] = program;
      pair.forEach((source, index) => {
        const key = `${index}:${source}`;
        let shader = shaders.get(key);
        if (!shader) {
          shader = gl.createShader(index === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER) ?? undefined;
          if (!shader) throw new Error("WebGL shader allocation failed");
          shaders.set(key, shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
        }
        gl.attachShader(program, shader);
      });
      gl.linkProgram(program);
    }
    await yieldToBrowser(signal);
    let yieldedAt = performance.now();
    for (const program of Object.values(programs)) {
      if (!parallel && performance.now() - yieldedAt >= 8) {
        await yieldToBrowser(signal);
        yieldedAt = performance.now();
      }
      while (parallel && !gl.isContextLost() && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
        await yieldToBrowser(signal);
      }
      if (gl.isContextLost() || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
      }
    }
    return programs as { [K in keyof T]: WebGLProgram };
  } catch (error) {
    Object.values(programs).forEach(program => gl.deleteProgram(program));
    throw error;
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader));
  }
}
