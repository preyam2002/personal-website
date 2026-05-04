"use client";

import { useEffect, useState } from "react";

function format(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

export default function IstClock({ initial }: { initial: string }) {
  const [time, setTime] = useState<string>(initial);

  useEffect(() => {
    const tick = () => setTime(format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="ist-clock" aria-live="off">
      {time} <span className="ist-tz">IST</span>
    </span>
  );
}
