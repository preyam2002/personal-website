"use client";

import { useEffect, useMemo, useState } from "react";
import PondSurface from "@/components/PondSurface";
import { getDaylightWindow } from "@/lib/celestial";
import styles from "./OceanExperience.module.css";

type OceanExperienceProps = {
  stageId: string;
  surfaceClassName: string;
};

const DEFAULT_DATE = Date.UTC(2026, 7, 30, 14, 30);
const DEFAULT_MINUTE = 20 * 60;
const DAYLIGHT_EDGE_OFFSET_MINUTES = 35;
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

export default function OceanExperience({
  stageId,
  surfaceClassName,
}: OceanExperienceProps) {
  const [now, setNow] = useState<number | null>(null);
  const [previewMinute, setPreviewMinute] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const shownMinute = previewMinute !== null
    ? Math.min(
      daylightWindow.sunsetMinute,
      Math.max(daylightWindow.sunriseMinute, previewMinute),
    )
    : liveMinute < daylightWindow.sunriseMinute
      ? Math.min(
        daylightWindow.sunsetMinute,
        daylightWindow.sunriseMinute + DAYLIGHT_EDGE_OFFSET_MINUTES,
      )
      : liveMinute > daylightWindow.sunsetMinute
        ? Math.max(
          daylightWindow.sunriseMinute,
          daylightWindow.sunsetMinute - DAYLIGHT_EDGE_OFFSET_MINUTES,
        )
        : liveMinute;
  const dateMs = dateAtMinute(baseDateMs, shownMinute);

  return (
    <>
      <PondSurface
        className={surfaceClassName}
        dateMs={dateMs}
        latitude={LATITUDE}
        longitude={LONGITUDE}
        stageId={stageId}
      />
      <div className={styles.instrument} aria-label="Sky time">
        <time dateTime={new Date(dateMs).toISOString()}>
          {now === null ? "Time" : formatTime(dateMs)}
        </time>
        <input
          aria-label="Preview the daylight time"
          type="range"
          min={daylightWindow.sunriseMinute}
          max={daylightWindow.sunsetMinute}
          step="5"
          value={shownMinute}
          onChange={(event) => setPreviewMinute(Number(event.currentTarget.value))}
        />
      </div>
    </>
  );
}
