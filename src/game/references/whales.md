# Video and footage references: humpback whale and whale shark

WebFetch could not reach any of these pages from this container (frontiersin.org and wikipedia.org are not on the network allowlist), so I read every source below only through WebSearch result summaries. Each entry gives the source, the concrete facts I took from it, and what I changed because of it.

## Humpback whale (Megaptera novaeangliae)

1. **Tonga underwater stock footage: mother and calf, 4K low angle, Vava'u**
   - Adobe Stock: https://stock.adobe.com/video/a-giant-female-humpback-whale-megaptera-novaeangliae-swimming-with-her-young-calf-in-tow-4k-low-angle-shot-underwater-diving-expeditions-in-vava-u-tonga/740393031
   - Getty, Rumble Editorial: https://gettyimages.be/detail/video/tonga-is-one-of-the-few-places-in-the-world-where-people-nieuwsfootage/1389876862
   - Bubblevision HD Tonga humpbacks: https://bubblevision.com/underwater-videos/Fiji-and-Tonga/humpback-whales.htm
   - What these clips show: the calf rides close beside and above the mother. Both are seen from below as a dark back over a pale, pleated belly, with long white flippers held out like wings. Calves roll and play.
   - Changes: the calf keeps its station above the mother (as before). The calf now rolls playfully onto its side (`updateRoll`, playful). The mother rolls slowly to 20–50°. I checked the belly-up view against these clips (after-humpback-whale-below.png).

2. **Edel and Winn (1978), "Observations on underwater locomotion and flipper movement of the humpback whale"**, and the tag study on turning performance (drone plus suction-cup tags)
   - https://oadoi.org/10.1007/BF00397155
   - https://cascadiaresearch.org/publications/body-flexibility-enhances-maneuverability-worlds-largest-predator/
   - https://devlists.uvic.ca/archives/list/marmam@devlists.uvic.ca/thread/6VK7G4VOQ7MQMWRGQ4DORHWGP6TIVSG7/
   - Facts: the flippers are used for banked turns, both climbing and diving. The long flippers generate lift that rolls the whale into the turn. The flukes provide propulsion.
   - Changes: a new `uFinRoll` vertex-shader term tilts the flippers against the turn (inside flipper down, at most 0.3 rad), driven by yaw rate. The symmetric flap with the stroke dropped from 0.22 to 0.10 × effort, so the flippers stay mostly still and wing-like. I added a small fore and aft sweep (`uFlapSweep` 0.1).

3. **Segre et al. (2017), "A hydrodynamically active flipper-stroke in humpback whales"** (Current Biology, from animal-borne video)
   - https://openpolar.no/Record/ftcapeput:oai:digitalknowledge.cput.ac.za:11189%2F7161
   - Fact: the flippers do make occasional lift strokes, but these are rare and tied to lunges.
   - Change: the flipper motion stays small and lags the stroke by about 0.15 cycle. I did not add a big flapping motion.

4. **Fluke stroke rates from tag studies**: Gough et al. 2019, "Scaling of swimming performance in baleen whales" (JEB); bowhead DTAG work; Iwata dive classification
   - https://cob.silverchair.com/jeb/article/222/20/jeb204172/224449/Scaling-of-swimming-performance-in-baleen-whales
   - https://cob.silverchair.com/jeb/article/222/20/jeb216044/224491/Whales-no-faster-than-other-ocean-inhabitants
   - https://devlists.uvic.ca/archives/list/marmam@devlists.uvic.ca/thread/AJXLY3MFQVESQZ3LT7FZZTZSXUJ2WLHG/
   - https://nbid43.ifm.liu.se/?p=18841
   - Facts: cruising speed is about 1.9–2 m/s. Stroke frequency falls with body length, to about 0.15–0.2 Hz (5–6 s per stroke) for large baleen whales. Whales use a stroke-and-glide gait, and resting dives have fewer than 2 strokes per minute.
   - Changes: the Strouhal-locked stroke stays at about 0.2 Hz at 1.6 m/s (A = 2.4 m peak to peak). I added a `BeatGlide` rhythm: 12–28 s of strokes (2–5 strokes), then a 6–14 s glide with amplitude down to 20%, and the whale slows by about 12% while gliding.

5. **Coronula barnacles, tubercles, flipper colour, pleats, fluke**
   - https://en.wikipedia.org/wiki/Coronula_diadema
   - https://www.nationalparks.nsw.gov.au/get-inspired/stories/lumpy-bumpy-whales
   - https://whalewatch.com/?p=4469
   - https://juneauflukes.org/physical.html
   - https://iwdg.ie/cms_files/wp-content/uploads/2019/04/Humpback-whale-profile.pdf
   - https://crru.org.uk/education/species/humpback-whale
   - https://www.environment.nsw.gov.au/topics/animals-and-plants/native-animals/native-animal-facts/marine-mammals/whales/humpback-whale
   - Facts:
     - Coronula diadema lives on humpback skin.
     - Each tubercle on the rostrum and jaw holds a hair, and tubercles also line the flipper's leading edge.
     - Most North Atlantic humpbacks have white flippers. Elsewhere they range from white only underneath to white all over.
     - There are 14–35 throat pleats, reaching back to the navel.
     - The flippers are up to about 30% of body length. The flukes are 27–33% of body length across, with a serrated trailing edge and a deep central notch.
     - The fluke underside pattern is individual and is the basis of ID catalogues.
     - The blow is bushy and V- or heart-shaped, up to about 3 m tall.
   - Changes (new `humpbackSkin.ts`, a 2048×1024 atlas at high quality):
     - About 22 wavy pleats per side from chin to navel, dark in the furrows, with a normal map and ambient occlusion.
     - Tubercles on the rostrum, at the same cells as the mesh knobs, plus a row along the lower lip, each with a dark hair pit.
     - Coronula clusters with pale six-plate crowns and dark centres, raised in the normal map and rough, with orange whale lice around them. They sit on the chin, snout tip, lip line, throat, genital slit, the knobs of the flipper's leading edge, the flipper tip and the fluke tips.
     - Paired blowholes behind a splash guard.
     - Flippers dark at the root and white beyond (North Atlantic style), white underneath.
     - The fluke underside has a black serrated trailing margin, a dark notch wash and a dark leading edge. Its blotches and white rake scratches change with the seed. Both flukes share one image across the notch, like an ID photo.
     - Proportions checked: flippers 4.5/14 = 32%, fluke span 4.7/14 = 34% (unchanged).
     - A blow: a 3 m bushy column of seven sprites that rises in about 1 s and drifts away over 4 s. It fires every 15–25 s while the blowhole is out of the water.

6. **Scars seen in close underwater footage**: Vava'u breach video ("chunks of barnacles and skin dislodged"), Oregon State bubble-net footage (barnacles on the back)
   - https://thekidshouldseethis.com/post/up-close-and-underwater-as-a-humpback-whale-breaches
   - https://blogs.oregonstate.edu/ltercetaceans/tag/foraging
   - Facts: the skin shows sloughing patches, scratches and barnacle patches.
   - Changes:
     - Elongated, ragged, pale sloughing patches.
     - 8 sets of orca rake marks (2–4 parallel pale lines, 5–9 cm apart).
     - 45 cookie-cutter oval scars.
     - 60 fine scratches.
     - Pale flecks on the flanks.
     - Belly marbling that varies by individual.
     - A clear coat of 0.25 (roughness 0.35) over 0.32–0.5 satin skin for the wet sheen. The engine's caustics (patchMaterial) supply the dappled light on the back, now broken up by the normal map.

## Whale shark (Rhincodon typus)

7. **BBC Earth / OceanX "Open Ocean" loop (opens on a whale shark)** and **Seven Worlds, One Planet 360 "Swim With The Biggest Fish"**
   - https://mymodernmet.com/10-hour-sea-life-footage-bbc-earth/
   - https://nerdist.com/article/take-a-virtual-360-degree-swim-with-worlds-biggest-fish/
   - https://wetpixel.com/articles/bbc-team-captures-unique-whaleshark-behaviour
   - What these clips show: a broad flat head with a terminal mouth, a pale belly, and a checkerboard on the flanks that fades into blue water at 10–20 m. The tail sweeps slowly and the shark glides.
   - Changes: a blunter, flatter head (snout width 0.2 m at the tip, lower head top), deeper shoulders, a chunkier first dorsal fin, and a matte material (roughness 0.5–0.8, no clear coat).

8. **Photo-ID sources**: SharkBook photographing guide, Ningaloo Atlas monitoring, the astronomy star-matching study, the MEPS 2021 photo-ID vs genetics study, and the CSIRO Ningaloo whale shark deck
   - https://sharkbook.ai/photographing.jsp
   - https://ningaloo-atlas.org.au/content/whale-shark-monitoring-ningaloo
   - https://www.sciencedaily.com/releases/2007/12/071226003604.htm
   - https://int-res.com/abstracts/meps/v668/p177-183
   - https://research.csiro.au/ningaloo/wp-content/uploads/sites/59/2024/02/05_Anth_Whale_sharks.pdf
   - Facts: the ID area is the flank just above the pectoral fin, behind the fifth gill. Spots are unique per animal and stable. Scars on the head, fins and body also help identify individuals.
   - Changes (new `whaleSharkSkin.ts`, 2048×1024):
     - Stripes start just behind the fifth gill slit (s = 0.215), above the pectoral fin.
     - The pattern is seeded per session, so each shark is an individual.
     - A few pale propeller and scratch scars on the back.

9. **Anatomy descriptions**: FAO species catalogue, Marine Megafauna Foundation anatomy guide, Fishes of Texas, Naturalis
   - https://www.fao.org/docrep/pdf/009/ad468e/ad468ePD.pdf
   - https://marinemegafauna.org/guide-to-whale-sharks/anatomy
   - https://fishesoftexas.org/taxa/rhincodon-typus
   - https://sharks.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=62534
   - Facts:
     - The mouth is terminal, up to 1.5 m wide, in front of the eyes.
     - A small spiracle sits behind each eye.
     - There are five large gill slits. The posterior three lie over the pectoral base, and the fifth is set apart.
     - Prominent lateral ridges run along the body, and the lowest becomes a keel on the tail stock.
     - The pattern is a checkerboard of creamy spots between pale transverse stripes, with pale horizontal lines along the ridges, on a dark ground. The belly is light.
   - Changes:
     - Five long, bowed gill slits (s = 0.132–0.205, the fifth apart). They are dark inside, with a raised trailing flap in the normal map and occlusion. They replace the per-vertex dark bars, which were limited by mesh resolution.
     - A terminal mouth with pale lips, aligned with the mesh groove.
     - A spiracle behind the eye.
     - Dense small random spots on the head (1–2.5 cm, on a 7.5 cm jittered grid).
     - Transverse stripes 0.12–0.32 m apart, scaled with girth, wavy and occasionally broken, continuing over the back.
     - Irregular columns of larger spots (2–5.5 cm) between the stripes.
     - Pale broken lines along the three ridge crests (the checkerboard), with ridge relief in the normal map.
     - A clean white belly below about 1.95 rad, with a soft ragged border.

10. **Skin**: whale shark ultrasound study (phys.org 2024), plus general denticle studies
    - https://phys.org/news/2024-07-whale-sharks-health-ultrasound-imaging.pdf
    - https://www.frontiersin.org/articles/10.3389/fmars.2022.975062/full
    - Fact: hard denticles make the skin feel like sandpaper, over connective tissue up to 20 cm deep.
    - Change: denticle grain and fine noise in the normal map, and high roughness for a matte, non-glossy skin.

11. **Swimming**: Gleiss, Norman and Wilson (2010) Ningaloo accelerometers; Gleiss et al. 2015, "Swimming strategy and body plan of the world's largest fish" (Frontiers)
    - https://www.eurekalert.org/pub_releases/2010-11/w-wsd112310.php
    - https://www.frontiersin.org/article/10.3389/fmars.2015.00064
    - Facts: whale sharks are negatively buoyant. They glide when descending and must beat their tails to ascend. They save energy with low, constant swimming speeds, glides and asymmetric dives. The glide thresholds (4.8 s for 3 beats in a 7 m shark) imply tail beats of a few seconds.
    - Changes:
      - A vertical yo-yo: during glides the target depth sinks at 0.12 m/s, and with tail beats it climbs at 0.09 m/s, within -2.5…+1.5 m.
      - Glides are longer (6–14 s).
      - The tail beat is about 2.8 s at cruise (Strouhal 0.4, amplitude 0.05 L, up from about 3.7 s).

## Seen in screenshots (path prefix /tmp/claude-0/-home-user/6bb52760-02fa-5e7c-b446-4dfee0fe462d/scratchpad/whale-shots/)
- Before: before-humpback-whale-{side,below,front}.png, before-whale-shark-{side,above,front}.png
- After: after-humpback-whale-{side,below,front}.png, after-whale-shark-{side,above,front}.png, after-close-humpback-whale-head.png, after-close-whale-shark-head.png
- Atlases: atlas/humpback-albedo.png, atlas/humpback-normal.png, atlas/whaleshark-albedo.png, atlas/whaleshark-normal.png
