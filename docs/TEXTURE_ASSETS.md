# Texture assets

Created on 2026-10-03 for the documentary-style shallow reef prototype.

## Manifest

| Asset | Browser URL | Resolution | Format | Purpose |
| --- | --- | --- | --- | --- |
| `public/assets/sand-albedo.png` | `/assets/sand-albedo.png` | 1254 × 1254 px | PNG, opaque RGB | Fine ivory calcareous sand base color |
| `public/assets/reef-rock-albedo.png` | `/assets/reef-rock-albedo.png` | 1254 × 1254 px | PNG, opaque RGB | Porous aged reef limestone, olive film and brown encrustation base color |

Both assets were generated using the built-in Imagegen tool under the `imagegen` skill. No API key, fallback CLI, stock asset download, or external image source was used. The tool returned 1254 px square images despite the approximately 1024 px request; the originals were copied into the project without resizing or image editing.

### Provenance

- Sand original: `D:/codex/home/generated_images/01a0fd6a-2977-7b61-96f3-c4f27db74dcf/exec-af685a40-34a8-4648-ac62-89ee1f8ec8a4.png`
- Reef original: `D:/codex/home/generated_images/01a0fd6a-2977-7b61-96f3-c4f27db74dcf/exec-8b95bfec-3100-4a77-a5a1-5be72163cbcb.png`
- Sand SHA-256: `9641B6C8A1DD0048DE2BD992AEADA2C723B5B2B8203D9FEBDA60E4CF204365CA`
- Reef SHA-256: `125E892FD7F81628F8703D2D787D2F2ACE54D98DFD13BC3568EB59EE2F043812`

The inspected style guide was `F:/codex_project/1002_gpt6project/output/art-direction/ocean-documentary-reference-v1.png`. It informed the muted natural palette only. It was not supplied as an edit target, so these are newly generated textures.

## Intended use and limits

- Use as sRGB base-color maps; configure repeat wrapping and select world-scale repeats appropriate for the material.
- Keep lighting, blue-green underwater attenuation, caustics, and depth fog in the renderer rather than baking them into the texture.
- The images were prompted for seamless repetition. They have continuous fine detail and no obvious border, object, text, horizon, strong directional light, or transparent areas on visual inspection. Pixel-perfect opposite-edge equality is not asserted; verify tiling in the scene and use subtle geometric/material variation to reduce visible repetition.
- Sand has low-contrast grain-distribution variation, without large ripple ridges. Physical sand-ripple relief belongs in terrain geometry or a separately validated height/normal map.
- These are AI-generated visual material assets, not sampled underwater photographs, measured reflectance, scientifically validated seabed composition, or biological reference data.
- No third-party stock license or source attribution applies; retain this generation record. Biological and environmental claims must use independent scientific sources.

## Exact generation prompts

### Sand

```text
Use case: photorealistic-natural
Asset type: seamless base-color/albedo texture for a real-time 3D ocean-floor material, square 1024 by 1024.
Primary request: an orthographic straight-down material scan of shallow tropical calcareous sand. A continuous flat surface fills every pixel, no border, no perspective.
Color palette: subdued warm ivory and very pale beige, with tiny sparse light tan grains. Natural quiet ocean-documentary realism.
Materials/textures: very fine realistic sand grains, a subtle dense network of soft shallow current-made ripple traces. The ripple traces should be only low-contrast changes in grain distribution and color, without baked shadows. Uniformly detailed across the square, many small ripples rather than large ridges.
Lighting: neutral diffuse even illumination; raw albedo appearance with no directional lighting, no cast shadows, no ambient occlusion, no highlights, no underwater blue color cast, no caustics.
Constraints: designed to tile seamlessly in both horizontal and vertical directions, opposing edges match; no horizon, no water surface, no transparent areas. No rocks, shells, coral, plants, creatures, footprints, objects, text, logos, or watermark. Avoid strong contrast, dark pits, salt-and-pepper noise, large sand waves, or vignette. This is a material texture asset, not a photograph of an underwater scene.
```

### Reef limestone

```text
Use case: photorealistic-natural
Asset type: seamless base-color/albedo texture for an aged coral-reef limestone material in a real-time 3D simulation, square 1024 by 1024.
Primary request: an orthographic straight-on flat material scan of old porous reef limestone. A continuous limestone surface fills every pixel, no border, no perspective.
Color palette: natural muted grey-beige limestone with subdued olive algal film, sparse warm brown organic encrustation and faint ivory worn areas. Quiet ocean-documentary realism, tonal harmony with warm ivory calcareous sand.
Materials/textures: fine natural limestone pores of several subtle sizes, small irregular weathered mineral grains, soft uneven patches of olive algal film and light brown encrustation. Detail distributed naturally across the surface, organic subtle mottling, no major rock silhouettes and no large cracks. Pores should be represented with modest color variation, without dramatic deep black shadows.
Lighting: neutral diffuse completely even illumination; raw albedo appearance with no directional lighting, cast shadows, ambient occlusion, specular glints, underwater blue color cast, or caustics.
Constraints: tile seamlessly on both horizontal and vertical edges, opposing edges match. No living coral branches, discrete rocks, creatures, plants, objects, text, logos, watermark, border, perspective, or water. Avoid strongly raised 3D relief, overexposed highlights, high-contrast noise, and repetitive obvious patterns. This is a flat base-color texture asset, not a scene or rendered rock object.
```

