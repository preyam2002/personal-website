"use client";

import { useEffect, useRef, useState } from "react";
import { waterFragmentShader } from "./waterShader";
import { compileWebGLPrograms } from "@/lib/webglPrograms";
import { getWaterQuality } from "@/lib/waterQuality";
import s from "./ideas.module.css";

export type MotionMode = "system" | "playing" | "paused";
export type SceneStatus =
  | "Live"
  | "Paused"
  | "Reduced motion"
  | "Graphics unavailable";

type SceneProps = {
  mode: number;
  energy?: number;
  motion?: MotionMode;
  thumbnail?: boolean;
  className?: string;
  onStatus?: (status: SceneStatus) => void;
};

export default function WaterScene({
  mode,
  energy = 1,
  motion = "system",
  thumbnail = false,
  className,
  onStatus,
}: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ mode, energy, motion });
  const invalidate = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settings.current = { mode, energy, motion };
    invalidate.current?.();
  }, [mode, energy, motion]);

  useEffect(() => {
    const el = canvas.current!;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let controller = new AbortController();
    let initializing = false;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let clock = 12;
    let last = 0;
    let lastDraw = 0;
    let currentMode = settings.current.mode;
    let visible = false;
    let dirty = true;
    let lost = false;
    let disposed = false;
    let impulse = 0;
    let resizeNeeded = true;
    let width = 1;
    let height = 1;
    let scale = 1;
    let averageGap = 0;
    let scaleCheck = 0;
    const quality = getWaterQuality();
    const constrained = quality !== "full";
    const frameInterval = 1000 / (thumbnail ? 12 : constrained ? 30 : 60);
    const pointer = [0, 0];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function isPaused() {
      return (
        settings.current.motion === "paused" ||
        (settings.current.motion === "system" && (reduced.matches || quality === "static"))
      );
    }

    function reportStatus() {
      onStatus?.(
        lost
          ? "Graphics unavailable"
          : settings.current.motion === "paused" || quality === "static" && settings.current.motion !== "playing"
            ? "Paused"
            : isPaused()
              ? "Reduced motion"
              : "Live",
      );
    }

    function release() {
      if (!gl) return;
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      buffer = null;
      program = null;
    }

    async function initialize() {
      const signal = controller.signal;
      gl ??= el.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
      if (!gl) throw new Error("This browser does not support the water preview.");
      if (gl.isContextLost()) return;
      const compiled = await compileWebGLPrograms(gl, {
        water: ["attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}", waterFragmentShader],
      }, signal);
      if (signal.aborted) {
        gl.deleteProgram(compiled.water);
        return;
      }
      program = compiled.water;
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer)
        throw new Error("The browser could not create the water preview.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(
        ["resolution", "pointer", "time", "energy", "mode", "impulse"].map(
          (name) => [name, gl!.getUniformLocation(program!, name)],
        ),
      );
      lost = false;
      setError(null);
      reportStatus();
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }

    function schedule() {
      if (!frame && !initializing && visible && !document.hidden && !disposed && !lost) {
        frame = requestAnimationFrame(draw);
      }
    }

    function requestDraw() {
      dirty = true;
      last = 0;
      if (program) reportStatus();
      schedule();
    }

    function draw(stamp: number) {
      frame = 0;
      if (!visible || document.hidden || disposed || lost) return;
      if (quality === "static" && settings.current.motion !== "playing") {
        reportStatus();
        return;
      }
      if (!program) {
        initializing = true;
        const signal = controller.signal;
        initialize().then(() => {
          if (signal.aborted) return;
          initializing = false;
          schedule();
        }).catch(failure => {
          if (signal.aborted) return;
          initializing = false;
          release();
          lost = true;
          el.dataset.webgl = "fallback";
          setError(failure instanceof Error ? failure.message : "The water preview is unavailable.");
          reportStatus();
        });
        return;
      }
      if (!gl || !program) return;
      const paused = isPaused();
      if (
        !dirty &&
        stamp - lastDraw < frameInterval - 2
      ) {
        if (!paused) schedule();
        return;
      }
      if (settings.current.mode !== currentMode) {
        currentMode = settings.current.mode;
        clock = 12;
        impulse = 0;
        pointer[0] = pointer[1] = 0;
        last = 0;
      }
      if (last && !paused) {
        const gap = stamp - last;
        averageGap = averageGap ? averageGap * 0.9 + gap * 0.1 : gap;
        if (stamp - scaleCheck > 1500) {
          if (averageGap > frameInterval * 1.25 && scale > 0.5) {
            scale = Math.max(0.5, scale * 0.8);
            resizeNeeded = true;
          }
          scaleCheck = stamp;
        }
      }
      const delta = last ? Math.min((stamp - last) / 1000, 0.05) : 0;
      last = lastDraw = stamp;
      if (!paused) {
        clock += delta;
        impulse = Math.max(0, impulse - delta * 0.25);
      }
      if (resizeNeeded) {
        const cssWidth = el.clientWidth;
        const cssHeight = el.clientHeight;
        const budget = thumbnail ? 120_000 : quality === "low" || quality === "static" ? 180_000
          : constrained ? 300_000 : 1_400_000;
        const ratio = Math.min(devicePixelRatio, constrained || thumbnail ? 1 : 1.25,
          Math.sqrt(budget / Math.max(1, cssWidth * cssHeight))) * scale;
        width = Math.max(1, Math.round(cssWidth * ratio));
        height = Math.max(1, Math.round(cssHeight * ratio));
        if (el.width !== width || el.height !== height) {
          el.width = width;
          el.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.uniform2f(uniforms.resolution, width, height);
        resizeNeeded = false;
      }
      gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
      gl.uniform1f(uniforms.time, clock);
      gl.uniform1f(uniforms.mode, settings.current.mode);
      gl.uniform1f(uniforms.energy, settings.current.energy);
      gl.uniform1f(uniforms.impulse, impulse);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (el.dataset.webgl !== "active") el.dataset.webgl = "active";
      dirty = false;
      if (!paused) schedule();
    }

    function move(event: PointerEvent) {
      if (isPaused()) return;
      const rect = el.getBoundingClientRect();
      pointer[0] =
        (((event.clientX - rect.left) / rect.width - 0.5) * rect.width) /
        rect.height;
      pointer[1] = 0.5 - (event.clientY - rect.top) / rect.height;
      impulse = 1;
      dirty = true;
      schedule();
    }

    function visibility() {
      if (document.hidden) stop();
      else requestDraw();
    }

    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      controller.abort();
      program = null;
      buffer = null;
      el.dataset.webgl = "fallback";
      stop();
      setError(
        "The graphics context stopped. The preview will return when the browser restores it.",
      );
      reportStatus();
    }

    function contextRestored() {
      release();
      controller = new AbortController();
      initializing = false;
      resizeNeeded = true;
      lost = false;
      requestDraw();
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestDraw();
      else stop();
    });
    const resize = new ResizeObserver(() => {
      resizeNeeded = true;
      requestDraw();
    });
    observer.observe(el);
    resize.observe(el);
    invalidate.current = requestDraw;
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("webglcontextlost", contextLost);
    el.addEventListener("webglcontextrestored", contextRestored);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", requestDraw);

    return () => {
      disposed = true;
      controller.abort();
      stop();
      invalidate.current = null;
      observer.disconnect();
      resize.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", move);
      el.removeEventListener("webglcontextlost", contextLost);
      el.removeEventListener("webglcontextrestored", contextRestored);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", requestDraw);
      release();
      queueMicrotask(() => {
        if (!el.isConnected)
          gl?.getExtension("WEBGL_lose_context")?.loseContext();
      });
    };
  }, [onStatus, thumbnail]);

  return (
    <>
      <canvas ref={canvas} className={className} aria-hidden="true" data-webgl="pending" />
      {error && (
        <span className={s.sceneError} role="status">
          {error}
        </span>
      )}
    </>
  );
}
