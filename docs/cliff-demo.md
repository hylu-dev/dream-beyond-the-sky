# Foreground cliff approval demo

Open [the local preview](http://localhost:5173/cliff-demo.html) with Vite running (`npm run dev`). This is an isolated approval scene; the main flight has not been switched to these assets.

## Four variants

| Formation | Shape | Total triangles, including scenery |
|---|---|---:|
| Tall Spire | Narrow tall pillar, ruined doorway, one floating shard | 1,560 |
| Chunk | Two connected masses forming an upper and lower shelf, two shards | 1,698 |
| Arch | A genuine opening through the full depth, two legs, a bridge and two shards | 1,348 |
| Slab | Wide, shallow single island with a short ruined column | 1,120 |

Each keeps one windswept pine, sparse summit masonry, painted moss and ten long ivy quads. The original stone, pine/moss atlas and dedicated pointed-leaf ivy textures are preserved. The main shells use 76–396 triangles. Satellite shards are separate intentionally; each main shell is connected.

Inspect opens at an elevated angle. Drag to orbit, scroll to move closer, and use the four formation buttons to compare. Fly-by loops a close pass. Pause holds a view; Restart resets it. Cloud shroud and Cover control the local cloud wrapping. All clouds are the existing in-game `createWindFx` puffs, with eight anchored banks. No clouds are painted into the assets.

The original three procedural puff textures, billow placement and base-to-top tint are restored in both the demo and live flight. The painted cloud experiments are inactive.

## Grass and stone transition

`painted-grass.png` supplies a new muted meadow/moss surface. A shader blends it with the existing limestone using a mesh-authored slope/rim weight in vertex alpha. Grass luminance breaks up the transition, with a smooth threshold, so the edge varies naturally. Surface projection uses vertical coordinates on walls to avoid stretching the meadow down the cliff. The old solid green cap is gone. The mask affects surface colour only: the cliff stays opaque and writes depth.

The same blend exists in Blender and in GLSL/WGSL runtime materials. Portable GLBs bake it to a separate UV layer and embedded texture; they do not require the custom shader. A round-trip import/render checks the portable Slab.

## Lighting match

The flight sky uses the captured colour of `cloud-realm.spz`; it is not dynamically relit. Read-only sampling of its decoded splat colours in 30-degree azimuth sectors found the strongest warm upper-horizon sector at capture azimuth 60–90 degrees (bright samples around RGB 0.96, 0.89, 0.81). The flight view rotates the capture by +60 degrees in this demo. The cliff key is therefore aimed at world azimuth 135 degrees, with an art-directed 20-degree elevation, soft cream highlights and lavender ambient fill. Contact shadows remain baked into the painted vertex colours. Runtime haze was lowered from the previous bright blue-grey to linear RGB (0.34, 0.35, 0.40), closer to the sampled cloud shadows.

This is palette/direction calibration, not a recovered physical lighting solution. Final blending with GPU-rendered splats still needs browser review: no browser automation connection is available. The splat itself and the main scene lighting code are unchanged.

## Files

- Editable Blender source with packed textures: `art/flight-cliffs/painted-cliffs.blend`
- Four-variant render: `art/flight-cliffs/blender-assets-preview.png`
- Individual renders: `art/flight-cliffs/{tall-spire,chunk,arch,slab}-model-preview.png`
- Portable GLBs: `public/assets/flight/cliffs/{tall-spire,chunk,arch,slab}.glb`
- Direct mesh export: `public/assets/flight/cliffs/cliffs.mesh.json`
- New meadow: `public/assets/flight/cliffs/painted-grass.png`
- Existing textures: `painted-stone.png`, `painted-foliage.png`, `painted-ivy.png` in the same folder.
- Superseded study builders/renders and the old `crown-wall`, `high-buttress` and `stepped-ledge` GLBs were removed during repository cleanup. They remain recoverable from Git history.

Rebuild assets:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/build-flight-cliffs.py
```

## Validation

`node tools/verify-cliff-demo.mjs` checks four distinct silhouettes, one connected main shell per asset, a real Arch opening with two legs and bridge, geometry budgets, grass/stone transition weights, full finite mesh attributes, intact unlit GLB materials and baked terrain UVs, correctly proportioned two-triangle ivy quads, GLSL and WGSL shader generation/preprocessing, cloud textures, two minutes of anchored cloud behavior, pooling and render submission on a null graphics device. This does not compile shaders on a GPU or validate final browser pixels.

The isolated `cliff-demo.html` production build passes, with Vite's existing engine bundle-size warning. Blender renders the actual assets for visual inspection.

## Meadow generation

Created using the built-in image-generation tool; final saved file: `public/assets/flight/cliffs/painted-grass.png`. Final prompt:

> Production seamless game surface texture, square 1536x1536. Straight overhead orthographic flat albedo of short meadow grass and moss on an ancient floating limestone plateau. Completely fill the image; no object silhouette or background. Sophisticated painterly gouache / matte painting style: broad quiet dry brush strokes, soft varied mats of muted sage and dusty olive grass, subtle dry straw flecks and small patches of faded taupe earth. Very low contrast, restrained grayish greens, no neon or saturation. About 80 percent grass and moss, 20 percent soft bare-earth wear, organically interwoven. Small scattered pale limestone chips are acceptable but no large stones or geological cliff bands. No trees, leaves on stems, shrubs, individual tall blades, flowers, clouds, mist, text, directional cast shadows, highlights or lighting gradient. Diffuse even illumination so it can be shaded in-game. Scale is a roughly 10 metre patch, no close-up macro vegetation. Fine painted surface texture within large simple restful color shapes. Seamless at all four boundaries. This texture will blend into a separate pale lavender-gray painted limestone texture on floating cliff rims under cool lavender cloud fill and warm cream sunlight.

## Texture generation

The existing approved painted limestone texture is reused. The final foliage atlas was created with the built-in image generation tool, with transparent output. Final prompt:

> Production game foliage texture atlas, square RGBA image. EXACTLY four ISOLATED small foliage cutouts on transparent background, each centered at the center of a quadrant. Every object must fit entirely inside an invisible rectangle that is 36% of the image width and 36% of the image height. Leave a very wide transparent cross-shaped gutter between all four objects, at least 12% of the image width. Nothing may cross a quadrant boundary. All silhouettes complete, no cropped tips. Sophisticated muted fantasy gouache painting, visible soft brush strokes and simplified shapes, not photoreal textures, no 3D rendering. Reference style: floating weathered limestone islands with quiet antique ruins and windswept pines, colors grey blue green and restrained dry olive, subtle warm afternoon rims. Top-left: ONE single horizontally spreading flat tuft of old pine foliage, with a handful of irregular rounded needle clusters, mostly dark dusty blue-green with a few muted olive sunlit accents; minimal twigs, no trunk, not an entire tree, no multiple stacked tiers. Top-right: ONE small olive broadleaf shrub with irregular pointed leaves, painterly grouped brushmarks and dark moss green centers. Bottom-left: ONE complete hanging ivy cluster, width about two thirds its height, three irregular thin trailing tendrils hanging from a leafy top, muted grey green leaves, complete long delicate tips. Bottom-right: ONE organic ragged carpet of moss viewed exactly from above, varied tiny sage olive brush strokes, darker muted moss greens and faded earth patches, smooth painted clusters rather than detailed pebbles. All four isolated cutouts have subtle warm upper-right illumination but subdued dark midtones. No text, no background, no clouds, no rocks, no borders.


## Dedicated ivy generation

Generated with the built-in image generation tool, using the user's cropped leaf close-up as a style reference. Saved as `public/assets/flight/cliffs/painted-ivy.png`; transparency is preserved. Final prompt:

> Create a NEW production game texture of hanging ivy on genuinely transparent background. Use the supplied image only as reference for the leaf shapes and painted style. Tall portrait canvas with exact width to height ratio 1:3 (for example 1024x3072). A SINGLE complete hanging vine cluster: three thin descending sinuous stems, attached near the upper edge with a small gathering of leaves, hanging downward under gravity. One long main stem reaches almost the bottom, two side stems reach roughly 70% and 85% down. Flat elongated pointed olive-green leaves alternating along stems, each clear simple painted shape, about 14 to 20 leaves per main stem, varying sizes and angles. Loose asymmetrical spacing, transparent gaps showing between leaves and stems. Palette from reference: subdued moss olive shadows, dusty warm yellow-green sunlit leaf faces, muted sage mids; broad soft painterly color facets, almost flat 2D look. Leaves should be distinct simple silhouettes not needles or bushy clumps. Full cluster visible with 8 percent transparent margin all sides, no cropped stems or leaf tips. TOP to BOTTOM orientation. No rocks, ground, tree trunk, tree canopy, shrubs, clouds, background color, border, labels, text, cast shadows or scenery. Do not copy the reference's rectangular stone backdrop. This is an isolated foliage texture that will be mapped onto one long simple quad; avoid dense massing.
