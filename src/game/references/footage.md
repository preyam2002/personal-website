# Real footage used to tune the water

This container reaches only GitHub, so these references come from underwater
research datasets on GitHub. The images stay out of this repository because
their licenses are not stated.

| Source | What it holds |
|---|---|
| https://github.com/xahidbuffon/FUnIE-GAN (`data/gif1.gif`, `data/gif2.gif`) | Two clips of real dive video (272 and 299 frames): a reef slope with a fish school, and divers in mid-water. |
| https://github.com/xahidbuffon/SUIM (`data/test/images/`) | Eight real photos: divers on a reef, a green turtle over coral, a school of sergeant majors, an angelfish, a wreck structure, and a ship's propeller on the seabed. |

## Measurements

Mean sRGB values (0–255) and standard deviation over the frame below the HUD.

| Image | Mean R, G, B | Std R, G, B |
|---|---|---|
| Video 1, reef slope | 41–43, 147–152, 139–147 | 18–22, 31–32, 29–31 |
| Video 2, divers | 46–51, 128–135, 111–146 | 23–57, 33–50, 35–48 |
| Photo, turtle over reef (top) | 62, 175, 189 | 39, 69, 70 |
| Photo, fish school (blue water) | 32, 92, 198 | 24, 34, 45 |
| Game before, reef at 4 m | 7, 109, 129 | 25, 33, 35 |
| Game after, reef at 4 m | 29, 109, 122 | 30, 34, 35 |

## What changed

- The footage keeps 20–60 of red, and green is close to blue. The game kept
  almost no red, and blue was stronger than green.
- A camera or a diver's eye partly corrects the water tint. The game now adds a
  partial white balance in linear light before tone mapping: `whiteBalance()`
  in `src/game/optics.ts`, 35% of a full correction at the camera depth, with
  a red gain of at most 4.
- After the change the reef view is in the range of the footage. Views at 12–18 m
  still have less contrast than the footage, because the haze dominates there.
