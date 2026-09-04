"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import PondSurface from "@/components/PondSurface";
import { getDaylightWindow } from "@/lib/celestial";
import {
  createOceanWaveField,
  describeSeaState,
  getSessionOceanSeed,
} from "@/lib/oceanWaves";
import {
  dialAngleToMinute,
  dialArcPath,
  dialPoint,
  pointToDialAngle,
  stepMinute,
} from "@/lib/skyClock";
import styles from "./OceanExperience.module.css";

type OceanExperienceProps = {
  stageId: string;
  surfaceClassName: string;
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
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateMs));
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
}: OceanExperienceProps) {
  const [now, setNow] = useState<number | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [previewMinute, setPreviewMinute] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const updateSeed = () => setSeed(getSessionOceanSeed());
    updateNow();
    updateSeed();
    const timer = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const seaState = useMemo(
    () => (seed === null ? null : describeSeaState(createOceanWaveField(seed))),
    [seed],
  );

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
  const dateMs = dateAtMinute(baseDateMs, shownMinute);

  return (
    <>
      {seed !== null && (
        <PondSurface
          className={surfaceClassName}
          dateMs={dateMs}
          latitude={LATITUDE}
          longitude={LONGITUDE}
          seed={seed}
          stageId={stageId}
        />
      )}
      <div className={styles.instrument} aria-label="Sky time">
        <SkyClock
          minute={shownMinute}
          onChange={setPreviewMinute}
          sunriseMinute={daylightWindow.sunriseMinute}
          sunsetMinute={daylightWindow.sunsetMinute}
          valueText={formatTime(dateMs)}
        />
        <div className={styles.readout}>
          <time dateTime={new Date(dateMs).toISOString()}>
            {now === null ? "Time" : formatTime(dateMs)}
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
      </div>
      {seaState && (
        <dl className={styles.seaState} aria-label="Sea state">
          <div>
            <dt>Wind</dt>
            <dd>{seaState.windSpeed.toFixed(1)} m/s</dd>
          </div>
          <div>
            <dt>Swell</dt>
            <dd>{seaState.swellPeriod.toFixed(1)} s</dd>
          </div>
          <div>
            <dt>Hs</dt>
            <dd>{seaState.significantWaveHeight.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>Cloud</dt>
            <dd>{Math.round(seaState.cloudCover * 8)}/8</dd>
          </div>
        </dl>
      )}
    </>
  );
}
