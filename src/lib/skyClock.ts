export const MINUTES_PER_DAY = 1440;
export const DIAL_STEP_MINUTES = 5;
const NOON_MINUTE = 720;

/** Dial angle in radians, clockwise from the top. Noon sits at the top. */
export function minuteToDialAngle(minute: number) {
  return ((minute - NOON_MINUTE) / MINUTES_PER_DAY) * Math.PI * 2;
}

/** Nearest dial step for one angle. The result stays inside one day. */
export function dialAngleToMinute(angle: number) {
  const turns = angle / (Math.PI * 2);
  const minute =
    Math.round((turns * MINUTES_PER_DAY + NOON_MINUTE) / DIAL_STEP_MINUTES)
    * DIAL_STEP_MINUTES;
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Dial angle for a pointer offset from the dial centre, screen axes. */
export function pointToDialAngle(offsetX: number, offsetY: number) {
  return Math.atan2(offsetX, -offsetY);
}

export function dialPoint(minute: number, radius: number) {
  const angle = minuteToDialAngle(minute);
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

/** SVG arc from one minute clockwise to a later minute. */
export function dialArcPath(startMinute: number, endMinute: number, radius: number) {
  const start = dialPoint(startMinute, radius);
  const end = dialPoint(endMinute, radius);
  const span =
    (((endMinute - startMinute) % MINUTES_PER_DAY) + MINUTES_PER_DAY)
    % MINUTES_PER_DAY;
  const largeArc = span > MINUTES_PER_DAY / 2 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} `
    + `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export function stepMinute(minute: number, steps: number) {
  const next = minute + steps * DIAL_STEP_MINUTES;
  return ((next % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
