/**
 * Keep the frame rate near the target by changing the render resolution.
 *
 * The scaler watches a smoothed frame time. When frames are slow for a while,
 * it lowers the resolution by one step. When frames are fast for longer, it
 * raises it again by a smaller step. The waits stop the scale from hunting.
 */
export type ResolutionScaler = {
  readonly scale: number;
  readonly frameSeconds: number;
  /** Add one frame. Return the new scale when it changes, else null. */
  update: (delta: number) => number | null;
};

export type ScalerOptions = {
  targetFps?: number;
  min?: number;
  max?: number;
  downStep?: number;
  upStep?: number;
  /** Seconds of slow frames before the scale falls. */
  downWait?: number;
  /** Seconds of fast frames before the scale rises. */
  upWait?: number;
};

export function createResolutionScaler(options: ScalerOptions = {}): ResolutionScaler {
  const {
    targetFps = 60,
    min = 0.5,
    max = 1,
    downStep = 0.1,
    upStep = 0.05,
    downWait = 1.5,
    upWait = 4,
  } = options;
  const target = 1 / targetFps;
  let scale = max;
  let average = target;
  let slowTime = 0;
  let fastTime = 0;
  return {
    get scale() {
      return scale;
    },
    get frameSeconds() {
      return average;
    },
    update(delta) {
      // Ignore stalls, for example a hidden tab or a shader compile, but still count
      // a device that is slow on every frame.
      if (!(delta > 0) || delta > 1) return null;
      const frame = Math.min(delta, 0.25);
      average += (frame - average) * 0.08;
      if (average > target * 1.12) {
        slowTime += frame;
        fastTime = 0;
      } else if (average < target * 1.04) {
        fastTime += frame;
        slowTime = 0;
      } else {
        slowTime = 0;
        fastTime = 0;
      }
      if (slowTime > downWait && scale > min) {
        scale = Math.max(min, Math.round((scale - downStep) * 100) / 100);
        slowTime = 0;
        return scale;
      }
      if (fastTime > upWait && scale < max) {
        scale = Math.min(max, Math.round((scale + upStep) * 100) / 100);
        fastTime = 0;
        return scale;
      }
      return null;
    },
  };
}
