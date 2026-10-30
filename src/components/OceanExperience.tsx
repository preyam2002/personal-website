"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import type { PondSurfaceStatus } from "@/components/PondSurface";
import { getDaylightWindow } from "@/lib/celestial";
import { getSessionOceanSeed } from "@/lib/oceanWaves";
import { getWaterQuality } from "@/lib/waterQuality";
import {
  dialAngleToMinute,
  dialArcPath,
  dialPoint,
  pointToDialAngle,
  stepMinute,
} from "@/lib/skyClock";
import styles from "./OceanExperience.module.css";

const loadPondSurface = () => import("@/components/PondSurface");
const PondSurface = dynamic(loadPondSurface, { ssr: false });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

type OceanExperienceProps = {
  stageId: string;
  surfaceClassName: string;
  fallback: ReactNode;
};

const DEFAULT_DATE = Date.UTC(2026, 7, 30, 14, 30);
const DEFAULT_MINUTE = 20 * 60;
const LATITUDE = 15.2;
const LONGITUDE = 73.7;

function dateAtMinute(baseDateMs: number, minute: number) {
  const date = new Date(baseDateMs);
  date.setHours(0, minute, 0, 0);
  return date.getTime();
}

function formatTime(dateMs: number) {
  return timeFormat.format(dateMs);
}

const DIAL_RADIUS = 22;

type SkyClockProps = {
  minute: number;
  onChange: (minute: number | null) => void;
  sunriseMinute: number;
  sunsetMinute: number;
  valueText: string;
};

/**
 * A 24 hour dial. Noon sits at the top and midnight at the bottom.
 * Drag anywhere on the dial to preview a time. Home returns to the clock.
 */
function SkyClock({
  minute,
  onChange,
  sunriseMinute,
  sunsetMinute,
  valueText,
}: SkyClockProps) {
  const hand = dialPoint(minute, DIAL_RADIUS);
  const sunrise = dialPoint(sunriseMinute, DIAL_RADIUS);
  const sunset = dialPoint(sunsetMinute, DIAL_RADIUS);

  const readPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - (bounds.left + bounds.width / 2);
    const offsetY = event.clientY - (bounds.top + bounds.height / 2);
    onChange(dialAngleToMinute(pointToDialAngle(offsetX, offsetY)));
  };

  const handleKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const steps: Record<string, number> = {
      ArrowDown: -1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -12,
      PageUp: 12,
    };
    if (event.key === "Home") {
      event.preventDefault();
      onChange(null);
      return;
    }
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(stepMinute(minute, step));
  };

  return (
    <svg
      aria-label="Time of day"
      aria-valuemax={1435}
      aria-valuemin={0}
      aria-valuenow={minute}
      aria-valuetext={valueText}
      className={styles.dial}
      onKeyDown={handleKey}
      onPointerDown={(event) => {
        // Cancel the native mouse action: no focus ring and no text
        // selection while dragging. Keyboard focus still works via Tab.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        readPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) readPointer(event);
      }}
      role="slider"
      tabIndex={0}
      viewBox="-28 -28 56 56"
    >
      <circle className={styles.dialRing} r={DIAL_RADIUS} />
      <path
        className={styles.dialDay}
        d={dialArcPath(sunriseMinute, sunsetMinute, DIAL_RADIUS)}
      />
      <circle className={styles.dialTick} cx={sunrise.x} cy={sunrise.y} r={1.3} />
      <circle className={styles.dialTick} cx={sunset.x} cy={sunset.y} r={1.3} />
      <line className={styles.dialHand} x1={0} x2={hand.x} y1={0} y2={hand.y} />
      <circle className={styles.dialMarker} cx={hand.x} cy={hand.y} r={2.6} />
      <circle className={styles.dialHub} r={1.4} />
    </svg>
  );
}

export default function OceanExperience({
  stageId,
  surfaceClassName,
  fallback,
}: OceanExperienceProps) {
  const [now, setNow] = useState<number | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [previewMinute, setPreviewMinute] = useState<number | null>(null);
  const [surfaceStatus, setSurfaceStatus] = useState<PondSurfaceStatus>("pending");

  useEffect(() => {
    let frame = 0;
    let ready = false;
    const start = () => {
      if (document.hidden || ready) return;
      ready = true;
      if (getWaterQuality() === "static") {
        setSurfaceStatus("fallback");
        return;
      }
      void loadPondSurface().catch(() => undefined);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setSeed(getSessionOceanSeed()));
      });
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const time = Date.now();
      setNow(time);
      if (previewMinute === null) timer = window.setTimeout(update, 30_000 - time % 30_000);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [previewMinute]);

  const baseDateMs = now ?? DEFAULT_DATE;
  const liveDate = new Date(baseDateMs);
  const dayStart = new Date(baseDateMs);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const daylightWindow = useMemo(
    () => getDaylightWindow(new Date(dayStartMs), LATITUDE, LONGITUDE),
    [dayStartMs],
  );
  const liveMinute = now === null
    ? DEFAULT_MINUTE
    : liveDate.getHours() * 60 + liveDate.getMinutes();
  const shownMinute = previewMinute ?? liveMinute;
  const dateMs = previewMinute === null
    ? baseDateMs
    : dateAtMinute(baseDateMs, shownMinute);

  return (
    <>
      {surfaceStatus === "fallback" && fallback}
      {seed !== null && now !== null && (
        <PondSurface
          className={surfaceClassName}
          dateMs={dateMs}
          latitude={LATITUDE}
          longitude={LONGITUDE}
          seed={seed}
          stageId={stageId}
          onStatusChange={setSurfaceStatus}
        />
      )}
      {now !== null && surfaceStatus === "active" && <div className={styles.instrument} aria-label="Sky time">
        <SkyClock
          minute={shownMinute}
          onChange={setPreviewMinute}
          sunriseMinute={daylightWindow.sunriseMinute}
          sunsetMinute={daylightWindow.sunsetMinute}
          valueText={formatTime(dateMs)}
        />
        <div className={styles.readout}>
          <time dateTime={new Date(dateMs).toISOString()}>
            {formatTime(dateMs)}
          </time>
          {previewMinute === null ? (
            <span className={styles.liveLabel}>Live</span>
          ) : (
            <button
              aria-label="Back to live time"
              className={styles.liveButton}
              onClick={() => setPreviewMinute(null)}
              type="button"
            >
              Live
            </button>
          )}
        </div>
      </div>}
    </>
  );
}
