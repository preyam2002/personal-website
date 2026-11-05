# Ocean game assets: credits and licenses

Every file in `public/game/models` and `public/game/textures` is listed below. Each one uses one of
three licenses: CC0 1.0, CC BY 4.0, or the BabylonJS/Assets repository license (CC BY 4.0).
Files under CC BY 4.0 must keep the attribution shown here. You can show it on an in-game
credits screen or link to this file.

The BabylonJS/Assets repository (https://github.com/BabylonJS/Assets) puts its contents under
CC BY 4.0, "unless specified otherwise in the asset folder". None of the folders used here has its
own license file, so CC BY 4.0 applies to them. The repository does not name individual artists.
Credit those files to "Babylon.js / BabylonJS Assets contributors".
License: https://creativecommons.org/licenses/by/4.0/

Changes made to every model: it was re-packed with glTF-Transform 4.5.1 (Meshopt geometry
compression, `EXT_meshopt_compression` + `KHR_mesh_quantization`). Its textures were resized and
converted to WebP (`EXT_texture_webp`). To load these models in three.js, call
`GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`.

## Models (`public/game/models`)

| File | Source | Author | License | Changes |
|---|---|---|---|---|
| shark.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/shark.glb | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Specular-glossiness material converted to metal-roughness (`gltf-transform metalrough`). Textures resized to at most 2048 px and converted to WebP. Meshopt compression. |
| tropical_fish.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/fish.glb | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Converted to metal-roughness. Textures resized to 512 px and converted to WebP. Meshopt compression. Mesh nodes renamed to clownfish, blue_tang, yellow_tang and moorish_idol. |
| grey_snapper.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/Demos/UnderWaterScene/fish/greySnapper_vertColor.glb | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Textures converted to WebP. Meshopt compression. |
| rocks_small.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/Demos/UnderWaterScene/underwaterScene.glb (node "moreRocks"), with textures from `rocks/rockMat1/` | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Extracted the "moreRocks" node only. Embedded the PBR textures, converted to WebP. Meshopt compression. |
| ship_wheel.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/Demos/UnderWaterScene/underwaterScene.glb (node "shipWheel"), with textures from `shipWheel/` | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Extracted the "shipWheel" node only. Embedded the PBR textures, converted to WebP. Meshopt compression. |
| wreck_boards.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/Demos/UnderWaterScene/underwaterScene.glb (node "boards"), with textures from `boards/` | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Extracted the "boards" node only. Embedded the PBR textures, converted to WebP. Meshopt compression. |
| seagrass.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/Demos/UnderWaterScene/underwaterScene.glb (node "grass"), with texture `grass/grassCard.png` | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Extracted the "grass" node only. Added an alpha-masked, double-sided material using the card texture (WebP, 512 px). Meshopt compression. |
| oil_drum.glb | https://github.com/BabylonJS/Assets/blob/master/meshes/ExplodingBarrel.glb | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Textures resized to 512 px and converted to WebP. Meshopt compression. |
| barramundi.glb | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish | Microsoft (2017) | CC0 1.0 | Textures converted to WebP (1024 px). Meshopt compression. |

## Textures (`public/game/textures`)

| Files | Source | Author | License | Changes |
|---|---|---|---|---|
| seabed_ripples_basecolor.jpg, seabed_ripples_normal.jpg, seabed_ripples_orm.jpg | https://github.com/BabylonJS/Assets/tree/master/meshes/Demos/UnderWaterScene/ground | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Renamed only (1024 px). |
| seabed_gravel_basecolor.jpg, seabed_gravel_normal.jpg, seabed_gravel_metalrough.jpg | https://github.com/BabylonJS/Assets/tree/master/textures (rockyGround_basecolor.png, rockyGround_normal.png, rockyGround_metalRough.png) | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | PNG converted to JPEG (quality 90). |
| sand_basecolor.jpg | https://github.com/BabylonJS/Assets/blob/master/textures/sand.jpg | Babylon.js / BabylonJS Assets contributors | CC BY 4.0 | Re-encoded as JPEG (quality 88). |
| rock020_color.jpg, rock020_normal.jpg, rock020_roughness.jpg, rock020_ao.jpg, rock020_displacement.jpg | ambientCG "Rock020" (1K), from https://github.com/pmndrs/market-assets/tree/main/files/materials/rock | ambientCG (https://ambientcg.com) | CC0 1.0 | Renamed. Color, normal, roughness and AO re-encoded as JPEG (quality 88). |

## Attribution text for CC BY 4.0 files

> Shark, tropical fish, grey snapper, reef rocks, rocks, ship wheel, wreck boards, seagrass, oil drum
> and seabed/sand textures: Babylon.js / BabylonJS Assets contributors
> (https://github.com/BabylonJS/Assets), licensed under CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/). Modified: compressed, textures resized and
> converted to WebP, materials converted or embedded.
