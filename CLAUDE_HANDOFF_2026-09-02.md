# Claude Handoff: Personal Ocean Portfolio

Date: 2026-09-02

Project: `/Users/preyam/repo/website`

Primary route: `http://localhost:3017/water`

## Read This First

Warning: The current `PondSurface.tsx` source contains an incomplete shader edit.

Do not treat the active page on port `3017` as the current source result. The server uses an older production bundle from 09:08.

Complete the uniform setup before you restart the server. The current source will select the WebGL fallback after a new build.

The immediate cause is simple:

- The caustic shader no longer declares `u_seed`.
- The JavaScript code still requests the `u_seed` location from the caustic program.
- Both shaders now require wave arrays, but the JavaScript code does not upload those arrays.
- The display shader now requires `u_displaySunDirection` and `u_windSpeed`, but the JavaScript code does not upload them.

## User Goal

Build a professional personal website around a realistic ocean simulation. The effect must show technical skill and must not use a video.

The ocean must feel large, irregular, and natural. The page must move from the surface to underwater and then to the seabed as the user scrolls.

The latest request has three parts:

- Add more random wave motion.
- Add occasional larger wave sets.
- Add strong sunlight and a visible solar disc.

## Fixed User Decisions

Keep these decisions unless the user changes them:

- Use only sunrise through sunset. Do not add the night scene again.
- Keep the camera direction fixed as time changes.
- Do not show half of the first view as sky.
- Show the sun in a narrow sky band.
- Keep the ocean motion slow enough to feel heavy.
- Add more motion than the last valid version had.
- Avoid obvious sine patterns.
- Avoid sharp horizon lines and repeated distant detail.
- Avoid circles, oval boundaries, plane edges, and Snell window artifacts underwater.
- Make the ocean look infinite. Do not expose a mesh edge or a corner.
- Keep the surface-to-underwater change continuous.
- Keep only three scroll sections.
- Keep the text minimal and professional.
- Keep `Work` and `Contact` available throughout the page.
- Keep a minimal experience section and a short about section.
- Keep GitHub and LinkedIn links.
- Do not use Playwright. The user explicitly prohibited it.
- Keep mobile devices and weak computers functional.
- Keep pointer ripples disabled for now if they reduce quality or performance.

## Current Page Structure

`src/app/water/page.tsx` defines three sections:

1. The hero shows only `Preyam Rao`.
2. The work section shows a minimal experience list.
3. The about section shows a short biography and profile links.

`src/app/water/water.module.css` sets the page height to `300svh`. Each section uses one viewport height.

`OceanExperience.tsx` keeps the canvas fixed behind all three sections. It also shows a small daylight time control.

The experience data is a local draft. No current check confirms that it matches the full LinkedIn profile.

## Current Technical Design

The project uses Next.js 16, React 19, strict TypeScript, and WebGL 2.

`src/components/PondSurface.tsx` contains the complete ocean renderer. It does not use Three.js for this route.

The renderer contains these systems:

- An IWave height solver for local surface detail.
- A deep-water wave sum for long ocean swells.
- A ray-marched infinite height field for the visible surface.
- Fresnel reflection and refraction.
- A Cox-Munk sun glitter model.
- A precomputed atmosphere texture.
- Solar and lunar position data from `src/lib/celestial.ts`.
- Water absorption, volume light, caustics, and a procedural seabed.
- A scroll-based camera descent from above the sea to the seabed.

`OceanExperience.tsx` uses the current local date. It clamps a time outside daylight to 35 minutes inside sunrise or sunset.

The slider covers sunrise through sunset. The camera does not change with time.

## Last Valid State

The last valid state existed before the current partial shader edit.

These checks passed at that point:

```bash
npm test -- --runInBand src/lib/celestial.test.ts src/lib/iwave.test.ts
npx eslint src/components/PondSurface.tsx src/components/OceanExperience.tsx src/app/water/page.tsx
npm run build
```

The two Jest suites had 11 passing tests.

A direct headless Chrome capture also showed a valid WebGL frame. That check did not use Playwright.

## Changes That Already Exist

The current worktree includes many user changes. Do not revert unrelated files.

The last valid ocean changes include:

- `SIMULATION_PLAYBACK_RATE` is `0.60`.
- `OCEAN_WAVE_HEIGHT_SCALE` is `1.18`.
- Full quality uses 60 frames per second and a 1,700,000 pixel budget.
- Reduced quality uses 30 frames per second and a 400,000 pixel budget.
- Reduced quality uses a 112 by 112 IWave grid.
- Full quality uses a 192 by 192 IWave grid.
- Caustic work uses lower texture sizes and lower update rates than the first version.
- The horizon filter removes fine wave detail near the horizon.
- The render loop stops when the canvas leaves the viewport.
- Reduced motion stops the ocean time and solver updates.

The current partial edit adds these changes to `PondSurface.tsx`:

- `OCEAN_WAVE_COMPONENT_COUNT` is `9`.
- `CAMERA_TARGET_TOP` changed from `[0, -0.05, 0.7]` to `[0, 1.8, 0.7]`.
- Both shaders now declare `u_waveData[9]` and `u_wavePhase[9]`.
- Both shaders now use `spectralOceanHeight()` instead of seven fixed wave calls.
- The display shader now declares `u_displaySunDirection`.
- The display shader now declares `u_windSpeed`.
- The Cox-Munk slope value now uses `u_windSpeed`.
- The sun glitter scale changed from `0.28` to `0.36`.
- Direct solar light changed by a factor of `1.32`.
- The visible solar disc changed from `30.0` to `46.0`.
- The solar bloom changed from `2.8` to `4.6`.
- A broad solar aureole now uses a scale of `0.52`.
- Direct sky rays request the display sun direction.
- Reflection and underwater rays still request the physical sun direction.

## Complete the Spectral Wave Field

Create one seeded wave field on the CPU. Upload the same field to the caustic and display programs.

Use this data format for each wave:

```text
[waveVectorX, waveVectorZ, angularFrequency, amplitude]
```

Use a separate phase array.

Use these equations:

```text
k = 2 * PI / wavelength
waveVector = direction * k
angularFrequency = sqrt(9.81 * k)
```

Use the first two components as a close long-swell pair. Give the pair close wavelengths and nearly equal directions.

The pair will produce a slow beat. The beat will create occasional larger wave sets without a timer or a random amplitude jump.

Use the other seven components for the local sea state. Add seed-based variation to wavelength, direction, phase, and amplitude.

A suitable base set is:

```text
wavelengths: 11, 15, 21, 30, 43, 61, 92 meters
amplitudes:  0.010, 0.014, 0.019, 0.024, 0.030, 0.028, 0.023 meters
```

Use a long-swell base wavelength between 72 and 96 meters. Use pair amplitudes near `0.075` and `0.064` meters.

Use `seededRandom()` for all variation. Keep the session seed stable across a reload.

Return this object from a new `createOceanWaveField(seed)` function:

```ts
{
  data: Float32Array;
  phases: Float32Array;
  windSpeed: number;
}
```

Use a wind speed between 5.8 and 7.6 meters per second. The Cox-Munk model will use this value.

In `createPondEngine()`:

1. Create the wave field once.
2. Get `u_waveData[0]` and `u_wavePhase[0]` from both programs.
3. Upload the arrays with `uniform4fv()` and `uniform1fv()`.
4. Upload `u_windSpeed` to the display program.
5. Remove the caustic `u_seed` lookup and upload.
6. Keep the display `u_seed` because volume noise and the underwater camera use it.

Program uniforms keep their values after a program switch. Upload the static wave data once after the links complete.

## Make the Sun Visible

The fixed rectilinear camera cannot show the complete daily solar path inside a narrow sky band. A high midday sun and a low sunset sun do not fit the same narrow view.

Use a fixed panoramic sky projection for the direct solar disc. Keep all water light on the true physical solar direction.

Add a CPU helper that maps the true solar state into the narrow sky band:

```text
displayAzimuth = sun.hourAngle * 0.32
normalizedElevation = clamp(sun.elevation / (PI / 2), 0, 1)
displayElevation = radians(0.8 + 3.7 * sqrt(normalizedElevation))
```

Build the display direction with this coordinate rule:

```text
x = sin(displayAzimuth) * cos(displayElevation)
y = sin(displayElevation)
z = cos(displayAzimuth) * cos(displayElevation)
```

Upload the result to `u_displaySunDirection`.

Keep these uses separate:

- Direct sky view: use `u_displaySunDirection` for the disc and aureole.
- Atmosphere attenuation: use the true `u_sunDirection`.
- Water reflection: use the true `u_sunDirection`.
- Cox-Munk glitter: use the true `u_primaryLightDirection`.
- Underwater transmission: use the true `u_sunDirection`.
- Caustics and volume rays: use the true primary light direction.

This choice keeps the camera fixed. It also keeps the water optics tied to the computed solar position.

Warning: The visible disc position is a panoramic presentation, not a pinhole-camera projection. Do not call its screen position fully physical.

## Visual Quality Rules

Reject the result if you see one of these defects:

- A repeated diagonal wave lattice.
- Even wave spacing across the full screen.
- A noisy or dotted horizon.
- A sharp line between the sky and the sea.
- A sharp line between the surface and underwater.
- A circle or oval around the underwater sky.
- A visible water plane edge.
- A visible caustic texture boundary.
- Fast camera drift when time changes.
- A large sky area in the first view.
- A yellow overlay that does not follow a reflection path.
- A sun disc without a reflection response.

Keep the narrow sky band near 14 percent of the first viewport. The new `CAMERA_TARGET_TOP` value targets this composition.

Keep direct solar light bright enough to clip at the disc center. Keep the surrounding sky and water below broad white clipping.

Use the real surface normals for glitter. Do not add a screen-space sparkle texture.

## Underwater Rules

The underwater view uses three surface-normal samples to soften the Snell boundary. Keep that soft average.

Do not add a hard critical-angle mask. Do not draw a circular Snell window.

The ray field must continue to infinity. Use the current height-field intersection and horizon detail fade.

The final scroll position must reveal the seabed. Do not show a finite ocean box.

## Performance Rules

Do not add a video, a large texture, a geometry ocean mesh, or a new runtime dependency.

Keep these controls:

- The pixel budget limits the canvas size.
- Device memory and CPU count select the reduced profile.
- A coarse pointer selects the reduced profile.
- Data saver selects the reduced profile.
- Reduced motion stops the simulation.
- The intersection observer stops work off screen.
- The atmosphere texture updates only when the light signature changes.
- The caustic texture updates less often than the display frame.

The nine-wave shader loop costs more sine operations than the old seven-wave loop. The CPU now supplies wave numbers and frequencies, so the shader removes repeated trigonometric setup.

Test the full and reduced profiles. Do not raise the reduced pixel budget without device evidence.

## Browser Check Without Playwright

Build first. Then start the production server on port `3017`.

```bash
npm run build
npm start -- --port 3017
```

Use direct Chrome for a static WebGL check:

```bash
profile_dir="$(mktemp -d /private/tmp/water-check.XXXXXX)"
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --headless=new \
  --hide-scrollbars \
  --window-size=1440,900 \
  --force-device-scale-factor=1 \
  --use-angle=swiftshader \
  --enable-unsafe-swiftshader \
  --disable-background-networking \
  --disable-component-update \
  --disable-sync \
  --disable-extensions \
  --no-first-run \
  --no-default-browser-check \
  --run-all-compositor-stages-before-draw \
  --timeout=8000 \
  --user-data-dir="$profile_dir" \
  --screenshot=/private/tmp/water-sun.png \
  http://127.0.0.1:3017/water
```

This check proves that the shaders compile and draw. It does not prove native graphics performance or smooth motion.

Also inspect a mobile layout. Use direct Chrome or the in-app browser. Do not use Playwright.

## Validation Order

Run these checks after the implementation:

```bash
git diff --check
npm test -- --runInBand src/lib/celestial.test.ts src/lib/iwave.test.ts
npx eslint src/components/PondSurface.tsx src/components/OceanExperience.tsx src/app/water/page.tsx
npm run build
```

Then capture at least these views:

1. The first view at sunrise.
2. The first view near noon.
3. The first view near sunset.
4. The surface-to-underwater transition.
5. The second section underwater.
6. The final seabed view.
7. One narrow mobile view.

Check two frames at different times to confirm that the wave field moves and the camera does not move.

## Git State

Current branch: `main`

Current head: `4220520 fix: filter distant ocean detail`

Recent local commits:

```text
4220520 fix: filter distant ocean detail
a4f401a feat: add procedural ocean portfolio
9375096 chore: save workspace state
82885bf fix: update vulnerable website dependencies
```

The worktree is dirty. It includes changes outside the ocean route.

Do not reset, discard, or overwrite those changes. Do not commit or push unless the user gives exact permission.

## Primary Physics Sources

Use primary or authoritative sources for physics decisions:

- Jerry Tessendorf, `Simulating Ocean Water`: https://evasion.inrialpes.fr/Membres/Fabrice.Neyret/NaturalScenes/fluids/water/waves/fluids-nuages/waves/Jonathan/articlesCG/simulating-ocean-water-01.pdf
- Cox and Munk, `Slopes of the Sea Surface Deduced from Photographs of Sun Glitter`: https://escholarship.org/content/qt1p202179/qt1p202179_noSplash_f892a85da053aa23dcf8afac03342764.pdf?t=krnrdb
- NASA, `The Subtleties of Sunglint`: https://science.nasa.gov/earth/earth-observatory/the-subtleties-of-sunglint-151456/
- NASA NTRS, `Sun Glint and the Ocean`: https://ntrs.nasa.gov/api/citations/20000056100/downloads/20000056100.pdf
- NOAA, `Wave Groups in Surface Gravity Waves`: https://repository.library.noaa.gov/view/noaa/44996/noaa_44996_DS1.pdf
- NASA GISS solar angular radius data: https://data.giss.nasa.gov/modelE/ar5plots/srlocat.html
- NASA Dark Target ocean surface model: https://darktarget.gsfc.nasa.gov/atbd-ocean-algorithm

The useful conclusions are:

- Many components with random phases and deep-water dispersion hide simple sine patterns.
- Close frequencies produce wave groups through interference.
- Surface roughness spreads sun glitter across many facets.
- Direct sunlight can exceed the display range at the disc center.
- Reflection, refraction, atmospheric loss, and water absorption must use the physical light direction.

## Completion Standard

Do not stop after a successful build.

Complete the task only when all of these statements are true:

- WebGL stays active after a fresh production build.
- The sun appears in the first view.
- The sun moves left to right as daylight time changes.
- The camera angle stays fixed as daylight time changes.
- The water reflection uses the physical solar direction.
- Wave motion does not show a simple repeated pattern.
- Larger swells arrive as gradual sets.
- The horizon stays soft.
- The underwater view has no hard circle, line, side, or corner.
- The three page sections stay readable on desktop and mobile.
- The reduced profile keeps its limits.
- The targeted tests, lint, and production build pass.

