"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  r: number;
  phase: number;
  accent?: boolean;
};

const points: Point[] = [
  { x: 0.05, y: 0.24, r: 2.5, phase: 0.1 },
  { x: 0.13, y: 0.18, r: 4, phase: 1.1, accent: true },
  { x: 0.2, y: 0.34, r: 2, phase: 2.4 },
  { x: 0.29, y: 0.29, r: 3, phase: 0.8 },
  { x: 0.37, y: 0.42, r: 4.5, phase: 3.1, accent: true },
  { x: 0.46, y: 0.25, r: 2.5, phase: 1.8 },
  { x: 0.54, y: 0.36, r: 3, phase: 4.2 },
  { x: 0.63, y: 0.17, r: 4, phase: 2.2, accent: true },
  { x: 0.71, y: 0.31, r: 2.5, phase: 3.7 },
  { x: 0.81, y: 0.23, r: 3.5, phase: 0.4 },
  { x: 0.9, y: 0.38, r: 2, phase: 2.9 },
  { x: 0.96, y: 0.2, r: 4, phase: 1.4, accent: true },
  { x: 0.08, y: 0.62, r: 3.5, phase: 2.1, accent: true },
  { x: 0.18, y: 0.55, r: 2, phase: 4.6 },
  { x: 0.27, y: 0.68, r: 3, phase: 1.3 },
  { x: 0.38, y: 0.59, r: 2.5, phase: 3.5 },
  { x: 0.49, y: 0.73, r: 4.5, phase: 0.6, accent: true },
  { x: 0.6, y: 0.57, r: 2.5, phase: 2.7 },
  { x: 0.7, y: 0.7, r: 3.5, phase: 4 },
  { x: 0.79, y: 0.56, r: 2, phase: 1.7 },
  { x: 0.88, y: 0.68, r: 4, phase: 3.3, accent: true },
  { x: 0.96, y: 0.58, r: 2.5, phase: 0.2 },
];

const edges = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 7],
  [6, 7], [6, 8], [7, 9], [8, 9], [9, 10], [9, 11], [10, 11], [0, 12],
  [2, 13], [12, 13], [13, 14], [4, 15], [14, 15], [14, 16], [15, 16],
  [6, 17], [16, 17], [16, 18], [17, 18], [8, 19], [18, 19], [18, 20],
  [19, 20], [10, 21], [20, 21],
];

export default function SignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const positions = points.map((point) => {
        const pulse = reducedMotion ? 0 : Math.sin(time * 0.00045 + point.phase) * 4;
        const baseX = point.x * width;
        const baseY = point.y * height + pulse;
        const dx = pointerRef.current.x - baseX;
        const dy = pointerRef.current.y - baseY;
        const distance = Math.hypot(dx, dy);
        const influence = Math.max(0, 1 - distance / 180);

        return {
          ...point,
          px: baseX - dx * influence * 0.06,
          py: baseY - dy * influence * 0.06,
        };
      });

      context.lineWidth = 1;
      for (const [startIndex, endIndex] of edges) {
        const start = positions[startIndex];
        const end = positions[endIndex];
        context.beginPath();
        context.moveTo(start.px, start.py);
        context.lineTo(end.px, end.py);
        context.strokeStyle = "rgba(202, 226, 255, 0.3)";
        context.stroke();
      }

      for (const point of positions) {
        context.beginPath();
        context.arc(point.px, point.py, point.r + 5, 0, Math.PI * 2);
        context.strokeStyle = point.accent
          ? "rgba(255, 99, 56, 0.45)"
          : "rgba(202, 226, 255, 0.14)";
        context.stroke();

        context.beginPath();
        context.arc(point.px, point.py, point.r, 0, Math.PI * 2);
        context.fillStyle = point.accent ? "#ff6338" : "#f4f7ff";
        context.fill();
      }

      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw();
    });
    observer.observe(canvas);
    resize();
    draw();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="obs-signal-field"
      aria-hidden="true"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: -1000, y: -1000 };
      }}
    />
  );
}
