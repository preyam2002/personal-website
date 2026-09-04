# Claude Handoff: Personal Ocean Portfolio

Date: 2026-09-02 (updated after the realism pass)

Project: `/Users/preyam/repo/website`

Primary route: `http://localhost:3017/water`

## Read This First

The ocean renderer is complete and verified after a fresh production build.

The server on port `3017` runs `next start` on the current build. Restart it
after every `npm run build`. The server does not reload a new build by itself.

The previous partial shader edit is finished. All uniforms upload correctly.
The canvas reports `data-webgl="active"` and `data-quality="full"` in Chrome.

## User Goal

Build a professional personal website around a realistic ocean simulation. The
effect must show technical skill and must not use a video.

The ocean must feel large, irregular, and natural. The page must move from the
surface to underwater and then to the seabed as the user scrolls.

## Fixed User Decisions

Keep these decisions unless the user changes them:

- The full day is shown, including the night. The user asked for the moon
  and a night scene on 2026-09-03 after an earlier removal. Keep it physical:
  the real moon phase, moonlight as the primary light, stars, and twilight.
- Keep the camera direction fixed as time changes.
- Do not show half of the first view as sky.
- Show the sun in a narrow sky band.
- Keep the ocean motion slow enough to feel heavy.
- Avoid obvious sine patterns.
- Avoid sharp horizon lines and repeated distant detail.
- Avoid circles, oval boundaries, plane edges, and Snell window artifacts underwater.
  A look-up "Snell's window" camera beat was built and rejected on 2026-09-02.
  Do not add it again. The physical window still exists in the refraction
  math, but the camera never turns up to frame it.
- Make the ocean look infinite. Do not expose a mesh edge or a corner.
- Keep the surface-to-underwater change continuous.
- Keep only three scroll sections.
- Keep the text minimal and professional.
- Keep `Work` and `Contact` available throughout the page.
- Keep GitHub and LinkedIn links.
- Do not use Playwright. The user explicitly prohibited it.
- Keep mobile devices and weak computers functional.
- Keep pointer ripples disabled.
- Do not commit or push without exact permission from the user.

## Files

- `src/lib/oceanWaves.ts`: the seeded wave field, the sea-state summary, and
  the sun mapping helpers. Pure functions with tests in `oceanWaves.test.ts`.
- `src/components/PondSurface.tsx`: the WebGL 2 renderer. Five programs:
  IWave simulation, caustics, atmosphere, clouds, and display.
- `src/components/OceanExperience.tsx`: the session seed, the daylight time
  control, and the sea-state readout.
- `src/app/water/page.tsx` and `water.module.css`: the three sections.

## Wave Field

`createOceanWaveField(seed)` returns nine deep-water components:

- Three swell components. The base wavelength is 72 to 96 meters. The other
  two use ratios near 0.79 and 0.62. The three nearly aligned components beat
  and produce wave sets of four to five waves.
- Six wind-sea components between 7 and 40 meters. Each uses a steepness
  between 0.022 and 0.038, capped at 0.07 meters of amplitude.

The shader applies Gerstner choppiness (`u_choppiness` = 1.7) with the
inverse-displacement trick `h(p - lambda * D(p))`. The surface stays a height
field, so the ray march never sees a fold.

Each component fades with view distance at 9 to 26 wavelengths. The local
IWave tile fades between 45 and 190 meters. The horizon shows only the long
swell, so distant detail never repeats.

The significant wave height is 0.55 to 0.75 meters. The wind speed is 5.8 to
7.6 meters per second. The seed is stable for one browser session.

## Night Scene

The time control spans the full day. The live clock is not clamped. The
celestial state selects the primary light: the sun while its strength is above
zero, then the moon with a phase-scaled strength up to 0.03.

- The moon uses the same two mappings as the sun: a scene direction with the
  true elevation and a compressed azimuth for light, and a display direction
  in the sky band for the disc and the glitter path.
- `moonPhaseLight` is the true sun direction rotated by the same azimuth
  offset as the moon, so the disc shows the real phase and terminator.
- The moon disc is a lit sphere with limb darkening and earthshine. Its
  brightness is about 1/77 of the sun disc before exposure.
- Stars: two hash layers in a latitude and longitude grid, 1 to 2 pixel
  cores, twinkle, warm and cool tints, and a faint galactic band. They fade
  in when the sun drops below 3.4 degrees, fade at the horizon, and are
  occluded by clouds. Reflections carry 40 percent of their radiance.
- Twilight: a warm glow near the horizon toward the sun between 0 and 20
  degrees of depression, turning violet as the sun sinks.
- Night sky floor: airglow plus a lunar sky term scaled by the moon
  illumination. The horizon haze uses the same background, so the sea meets
  the sky without a line at night.
- Clouds take moonlight in the cloud pass and cast their alpha over the moon.
- Exposure rises to 6.4 above water and 6.2 below when the sun is 17 degrees
  down. A moonless night still shows a faint sea texture and star glints.

## Sun Mapping

The camera never turns. Two helpers compress the daily solar path:

- `getSceneSunDirection()` keeps the physical elevation and compresses the
  azimuth by `hourAngle * scale`. Every light computation uses this direction:
  the atmosphere texture, transmittance, underwater light, and caustics.
- `getDisplaySunDirection()` uses the same azimuth and a presentation
  elevation between 0.8 and 4.5 degrees. The visible disc and the Cox-Munk
  glitter use this direction, so the glitter path always leads to the disc.

`getSunAzimuthScale()` derives the scale from the canvas aspect. The disc
stays inside the frame on a phone and stays clear of the top-right nav.

Warning: the disc position and the glitter path are a presentation. The
colors, the sky, and the underwater light use the physical elevation.

## Renderer Systems

- Ray march: bracket the surface between the crest and trough planes with
  seven steps, then five bisections and one false-position step.
- Normals: central differences with a step that grows with distance.
- Glitter: Cox-Munk with a sub-pixel slope variance of `0.0025 + 0.0016 U`.
  Two layers of drifting value-noise slopes add capillary sparkle inside
  260 meters.
- Subsurface scattering: a turquoise term on crests that face the viewer with
  the sun behind them. It grows when the sun is low.
- Foam: the Jacobian of the horizontal displacement. Foam starts below 0.855
  and saturates at 0.79. That covers the top 0.3 to 1 percent of the surface.
  Wind streak noise adds faint lines on high crests.
- Sky: the atmosphere texture stays unchanged. A second panoramic texture
  composites two procedural cloud layers over it: cumulus fragments at 1.9
  kilometers and wind-stretched cirrus at 8 kilometers. The alpha channel
  shades the sun disc. The texture updates every 3 display frames at full
  quality and every 8 at reduced quality.
- Haze: distant water blends toward the horizon sky. The horizon band also
  blends within 1.6 degrees of the horizon.
- Marine snow: four screen-aligned particle layers at 0.9, 2.1, 4.6, and 9.5
  meters. Cells live on a plane perpendicular to the camera, so a speck never
  crosses a cell border. Near specks are soft bokeh and far specks are sharp.
- Seabed: 24 meters deep with silt, ripples, stones, and shells. The camera
  ends 2.8 meters above it.
- Tone mapping: ACES filmic, a light vignette, and a one-bit dither.

## Debug Views

Add a query parameter to the route:

- `?ocean-debug=sky`: the composited sky texture over a 90 degree arc.
- `?ocean-debug=cloud`: the cloud alpha channel.
- `?ocean-debug=foam`: the foam mask in red on the water.
- `?ocean-quality=reduced` or `full`: force a quality profile.
- `?ocean-scale=1`: force the render scale, which disables the controller.
  Use it to measure the true GPU cost.
- `?ocean-debug=fps`: a top-left readout with the draw rate, the
  requestAnimationFrame rate, the worst frame gap, the slow-draw count, the
  render scale, the canvas size, and the scroll value. It refreshes once per
  second. On a 120 hertz display expect about 60 draws and 120 callbacks.

## Camera Path

The scroll value drives four stages:

1. `entry` (0 to 0.205): the camera drops from 3.6 meters above the sea to the
   waterline and the focal length widens from 2.7 to 1.3.
2. The crossing: within 0.12 meters of the local surface the shader renders
   both paths and crossfades them. The CPU predicts this band from the
   spectral surface height and lowers the render scale to 0.8 ahead of time.
3. `deepDescent` (0.19 to 0.96): the descent to 21.2 meters with a slow sway.
4. `floorView` (0.58 to 0.96): the pitch down to the seabed.

`getCameraPosition()` in `PondSurface.tsx` mirrors the shader origin path. Keep
the two in step when you change either.

## Frame Pacing

The render loop throttles to the profile frame interval with a 2.5
millisecond tolerance. Without the tolerance, a requestAnimationFrame
timestamp a hair under 16.667 milliseconds skipped a draw, and a 120 hertz
display produced an irregular 17 and 25 millisecond cadence.

A render-scale controller multiplies the canvas size by a factor between
0.55 and 1. It uses a moving average of the drawn frame gaps. Fifteen frames
above 1.22 times the interval lower the scale by 14 percent. One hundred and
twenty calm frames raise it by 5 percent. The first 45 frames are ignored,
because the GPU process warms up. The canvas exposes `data-render-scale`,
`data-drawn-frames`, `data-slow-draws`, and `data-draw-gap-max` for checks.

## Quality Profiles

Full: 1,700,000 pixel budget, 60 frames per second, 192 IWave grid, 768 by
256 cloud texture, four snow layers.

Reduced: 400,000 pixel budget, 30 frames per second, 112 IWave grid, 384 by
128 cloud texture, two snow layers, fewer cloud octaves.

A coarse pointer, reduced motion, four or fewer cores, four or fewer
gigabytes, or data saver selects the reduced profile.

Measured on this Mac (Apple M5, headless Chrome on Metal, 1618 by 1051 canvas,
full profile, render scale forced to 1): 60 frames per second with zero slow
draws at the surface, at the crossing, under the surface, in the work
section, and at the seabed. A scroll sweep from top to seabed drops no frame.

History of the stutter fix on 2026-09-02:

- The surface crossing cost 52 milliseconds per frame because both render
  paths ran for every pixel. The band shrank from 0.22 to 0.12 meters and the
  dual state now halves the volume samples and normals.
- The frame throttle skipped draws on timestamp jitter. See Frame Pacing.
- The underwater volume march used two four-octave noise fields per sample.
  One field plus a single-octave field looks the same and costs half.
- The underwater view within 8 meters of the surface uses three volume
  samples, and short ray brackets use five march steps.

## Browser Check Without Playwright

The scratchpad script drives headless Chrome over the raw DevTools protocol.
It sets the time slider, scrolls, and captures PNG frames. Recreate it from
this description if the scratchpad is gone:

1. Start Chrome with `--headless=new --remote-debugging-port=<port>`.
2. `PUT /json/new?about:blank`, then open the returned WebSocket.
3. `Page.navigate`, wait for load, then `Runtime.evaluate` to set the range
   input through the native value setter and dispatch an `input` event.
4. `window.scrollTo` to a fraction of the page height, wait 10 seconds for the
   scroll smoothing, then `Page.captureScreenshot`.

Use `--use-angle=swiftshader` for a software check. Omit it to measure the
real GPU.

## Validation

```bash
git diff --check
npm test -- --runInBand src/lib/celestial.test.ts src/lib/iwave.test.ts src/lib/oceanWaves.test.ts
npx eslint src/components/PondSurface.tsx src/components/OceanExperience.tsx src/lib/oceanWaves.ts src/app/water/page.tsx
npm run build
```

All four passed on 2026-09-02 with 21 tests.

Captured and reviewed on 2026-09-02: morning, noon, and sunset first views;
the surface crossing at scroll 0.2; the view under the surface at 0.3; the
work section at 0.5; the seabed at 1.0; the foam debug view; the reduced
profile; and a 430 by 860 mobile view.

Captured and reviewed on 2026-09-03 for the night scene: a moonless night at
23:00, a moonlit night at 02:00 with the moon 47 degrees up at 66 percent,
nautical twilight at 19:10, and dawn at 05:30 with the moon 79 degrees up.
Underwater at 02:00 and 23:00 at scroll 0.5 and 1.0.

Frame timing uses a second DevTools-protocol script. It records every
requestAnimationFrame gap for four seconds at each scroll position and reads
the canvas draw statistics. Run it on an idle machine. A busy foreground
Chrome tab shares the GPU and doubles every number.

## Known Limits

- The whitecap coverage is sparse by design. Real seas at this wind speed
  show foam on less than one percent of the surface.
- The seabed at 24 meters is monochrome blue. Water absorption removes red and
  green before the light reaches the floor.
- The cloud layers drift slowly. A viewer sees motion after about a minute.
- The visible disc elevation is not a pinhole projection of the real sun.
- The render-scale controller reacts after about 15 slow frames. A weak GPU
  shows a quarter second of stutter before the scale drops.

## Primary Physics Sources

- Jerry Tessendorf, `Simulating Ocean Water`.
- Cox and Munk, `Slopes of the Sea Surface Deduced from Photographs of Sun Glitter`.
- NASA, `The Subtleties of Sunglint`.
- NOAA, `Wave Groups in Surface Gravity Waves`.
- Monahan and O'Muircheartaigh, whitecap coverage versus wind speed.

## 2026-09-04 update: underwater chop, dusk blackout, decay, dial

### Underwater "choppy" feel (fixed)
The frame rate was a steady 60 fps. The picture was not. Two discrete cadences
made the underwater scene jump:

- The caustic map only re-rendered every 4 solver steps (about 9 Hz). Every
  light shaft and floor pattern jumped at that rate.
- The IWave tile advanced 36 steps per second with no interpolation, so the
  near-field surface moved in a 2-1 stutter pattern.

Fixes in `PondSurface.tsx`:

- `stateHeight()` blends `.g` (previous step) and `.r` (current step) of the
  solver texture with `u_stateBlend = accumulator / FIXED_TIME_STEP`. Both the
  display and caustic programs use it. `causticRevisionStride` is gone.
- The caustic map renders every frame with one light direction, then a
  four-tap half-texel blur (`causticBlurFragmentShader`) into `causticTarget`.
  The five-direction sun disc was a sub-texel jitter (0.6 texel at 24 m), so
  the blur gives the same softness at a fifth of the vertex work.

Verified with `scratchpad/motion.mjs` (per-frame image difference of a
320x200 centre block): the min/max ratio of neighbouring frame differences
went from 0.05 to 0.85-0.95 underwater.

### Black upper half at dusk and night (fixed)
Mid-water, the sky seen through the surface from below went NaN once twilight
terms switched on. Rays under total internal reflection get a zero refracted
vector, `atmosphere()` turns that into the exact zenith, and the star hash
runs `atan(0, 0)`. Zero transmission times NaN stays NaN, so the whole upper
half (every upward ray) rendered black with a hard edge at the horizon and no
marine snow. Reproduced at 19:00 and 23:30, scroll 0.6, with
`scratchpad/probe.mjs`. Fix: `renderBelowWaterSurface` skips the sky lookup
when the refracted direction is zero. `isnan()` is unreliable under Metal
fast-math; a `floatBitsToUint` exponent test found it.

### Tile decay (fixed)
Solver damping (0.16) removed all tile energy with a 21 s time constant, so
the near-field texture vanished within two minutes. The solver now forces its
64 strongest modes every step: `nextHeight += 2 * damping * dt * target`.
A forcing of twice the damping holds a resonant mode at exactly its target
amplitude (checked with a one-mode simulation) and leaves other modes alone.
Each mode's frequency comes from the solver kernel eigenvalue
(`solverFrequency` in `createInitialState`), not from the deep-water formula;
with the analytic frequency the forcing sat off resonance and held nothing.
Surface motion per millisecond is the same at 100 s as at 3 s.

### Time dial
The range slider is gone. `SkyClock` in `OceanExperience.tsx` is a 24 hour
SVG dial: noon at the top, midnight at the bottom, the day arc from sunrise
to sunset, a hand for the shown time. Drag anywhere on the dial to preview a
time; arrows step 5 minutes, PageUp/PageDown step an hour, Home returns to
live. `src/lib/skyClock.ts` holds the pure geometry with tests. Scripts drive
it with real mouse events (`Input.dispatchMouseEvent` in `shoot.mjs`), because
`setPointerCapture` rejects synthetic pointer ids.

### Measurement notes
- Frame timing is only valid on an idle machine. A Rust build plus a prover
  job at load 11 doubled every number.
- `shoot.mjs` used SwiftShader (CPU) until today. It now uses the GPU.
- A `readPixels` stall each frame inflates GPU time because the GPU clocks
  down between frames. Use it for image metrics, not for cost.

### Weak hardware: measured tiers (2026-09-04, `scratchpad/weak.mjs`)
| Tier | Setup | Result |
|---|---|---|
| This Mac (M5), full profile | 1.7 MP canvas | 60 fps; seabed and surface hold scale 1.0, mid-water (scroll 0.3-0.6) settles at scale 0.8-0.9 under load |
| Phone, real GPU | 390x844 at DPR 3, coarse pointer → reduced profile | 0.4 MP canvas (430x930), 30 fps target met at every scroll, zero slow frames |
| Desktop, no GPU (SwiftShader), full profile, old controller | 1470x830 | 1.0 fps, scale never dropped (frame-counted timers) |
| Desktop, no GPU, reduced profile via URL | 842x475 | 2.5-3 fps |
| Desktop, no GPU, full profile, new controller + fall-back | | floor scale in 4 s, reduced profile at 10 s, then 6-7 fps at 463x261 |

Software rendering is the floor, not a real target: any integrated GPU is
10-50x faster than SwiftShader. Rough expectation for an old Intel UHD laptop
(about 10x slower than the M5): full profile at scale 1 is ~120-150 ms a
frame, the controller reaches the floor (0.3x pixels) in seconds, and the
fall-back to the reduced profile lands it near 25-35 fps at about 0.12 MP.
That is an estimate from throughput ratios, not a measurement.

### Controller and fall-back (rewritten 2026-09-04)
- All timers are milliseconds: warm-up 2.5 s (and 8 frames), slow confirm
  0.5 s, hold 0.9 s after a drop, 1.2 s after a raise, raise after 2.5 s calm.
  Drop when the smoothed gap exceeds 1.10x the frame interval, raise when it
  stays under 1.03x. The first drop is proportional to the measured gap
  (`sqrt(0.92 * interval / gap)`, at most 0.86), so a 1 s frame goes straight
  to the 0.55 floor.
- If the floor is still slow for 2.5 s, the effect re-runs with
  `REDUCED_QUALITY` (`qualityFallback` state). The cleanup must not lose the
  WebGL context in that case (`keepContext`), or the replacement engine dies
  with "floating-point color buffers are unavailable". The re-creation costs a
  few seconds on a slow CPU (initial solver state).
- The scene renders into `sceneTarget`, an RGBA8 framebuffer the size of the
  canvas, and `blitFramebuffer` copies the scaled sub-rectangle to the
  screen. Scale changes no longer reallocate the canvas: transition frames
  went from 90 ms to under 25 ms. `u_resolution` is the sub-rectangle size.
- The fps overlay (`?ocean-debug=fps`) shows the render size, not the canvas.
