# Foreground cliff approval demo

Open [the local preview](http://localhost:5173/cliff-demo.html) with Vite running (`npm run dev`). This is an isolated approval scene; the main flying scene has not been switched to these assets.

## Review controls

The demo opens in Inspect mode, above the front terrace. Drag to orbit and scroll to adjust distance. Choose Sanctuary, Garden ledge, or Watchtower. Fly-by loops a close pass; Pause holds a view; Restart resets it. Cloud shroud toggles the local wrapping clouds, and Cover adjusts their opacity. The background realm retains its clouds.

The shroud calls `createWindFx` from the game: the same three procedural puff textures, billow geometry, lavender/peach tint, blending, and close-lens fade. Eight banks remain anchored to the cliff. No cloud artwork is generated or painted onto these assets.

## Reference-led revision

The latest simplified reference uses broad continuous stone faces, a few large fracture plates, asymmetric taper and a gently sloping grassy summit. Small stone chips and dense ground patches were removed. Each summit retains a broken flagstone path, an open ruined stone arch, sparse fallen masonry and two windswept pines. The original stone and pine/moss texture files are unchanged.

Underside ivy now uses its own tall painted texture, based on the user's pointed olive-leaf close-up. Each hanging cluster is a single long quad (two triangles), with the full image mapped once at its native aspect ratio. This replaces the distorted foliage-atlas strips. Vines attach at the lip and hang freely; moss remains on the summit.

Stone, architecture and foliage use unlit painted materials. Vertex shading includes directional illumination and baked contact occlusion; shadow rays respect both foliage textures' alpha. The browser adds matching atmospheric haze to all five mesh parts. Foliage uses alpha testing and writes depth, so clouds behind it remain behind it.

| Asset | Rock triangles | Stone detail | Trunks / grass | Foliage | Ivy | Total |
|---|---:|---:|---:|---:|---:|---:|
| Sanctuary | 190 | 776 | 568 | 204 | 20 | 1,758 |
| Garden ledge | 190 | 776 | 568 | 208 | 20 | 1,762 |
| Watchtower | 190 | 776 | 568 | 188 | 20 | 1,742 |

This reduces triangle counts by approximately 68% from the detailed Sanctuary revision. Each visible formation uses five mesh instances and three shared textures. Only one formation is enabled at a time in the demo. Live-game streaming and distance LOD remain outside this approval scene.

- Editable Blender source, packed textures: `art/flight-cliffs/painted-cliffs.blend`
- Three-model render: `art/flight-cliffs/blender-assets-preview.png`
- Actual Sanctuary model render: `art/flight-cliffs/sanctuary-model-preview.png`
- Portable textured GLBs: `public/assets/flight/cliffs/{crown-wall,stepped-ledge,high-buttress}.glb` (stable filenames retained)
- Direct runtime mesh export: `public/assets/flight/cliffs/cliffs.mesh.json`
- Painted stone: `public/assets/flight/cliffs/painted-stone.png`
- Painted pine / scrub / ivy / moss atlas: `public/assets/flight/cliffs/painted-foliage.png`
- Dedicated hanging ivy: `public/assets/flight/cliffs/painted-ivy.png` (the atlas ivy quadrant is no longer used)
- Earlier rejected block builder and image: `art/flight-cliffs/previous/`

GLBs retain unlit materials, vertex colours, texture alpha and embedded images. Rebuild with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/build-flight-cliffs.py
```

## Texture generation

The existing approved painted limestone texture is reused. The final foliage atlas was created with the built-in image generation tool, with transparent output. Final prompt:

> Production game foliage texture atlas, square RGBA image. EXACTLY four ISOLATED small foliage cutouts on transparent background, each centered at the center of a quadrant. Every object must fit entirely inside an invisible rectangle that is 36% of the image width and 36% of the image height. Leave a very wide transparent cross-shaped gutter between all four objects, at least 12% of the image width. Nothing may cross a quadrant boundary. All silhouettes complete, no cropped tips. Sophisticated muted fantasy gouache painting, visible soft brush strokes and simplified shapes, not photoreal textures, no 3D rendering. Reference style: floating weathered limestone islands with quiet antique ruins and windswept pines, colors grey blue green and restrained dry olive, subtle warm afternoon rims. Top-left: ONE single horizontally spreading flat tuft of old pine foliage, with a handful of irregular rounded needle clusters, mostly dark dusty blue-green with a few muted olive sunlit accents; minimal twigs, no trunk, not an entire tree, no multiple stacked tiers. Top-right: ONE small olive broadleaf shrub with irregular pointed leaves, painterly grouped brushmarks and dark moss green centers. Bottom-left: ONE complete hanging ivy cluster, width about two thirds its height, three irregular thin trailing tendrils hanging from a leafy top, muted grey green leaves, complete long delicate tips. Bottom-right: ONE organic ragged carpet of moss viewed exactly from above, varied tiny sage olive brush strokes, darker muted moss greens and faded earth patches, smooth painted clusters rather than detailed pebbles. All four isolated cutouts have subtle warm upper-right illumination but subdued dark midtones. No text, no background, no clouds, no rocks, no borders.

## Validation

- Blender rendered the actual three models and a larger Sanctuary view for visual inspection.
- `node tools/verify-cliff-demo.mjs` passes: connected rock shell, narrow taper, complete mesh attributes, reduced geometry budget, foliage cutout material, ruins and ivy extents, two triangles per vine with undistorted texture proportions, GLB materials and vertex colours, cloud texture generation, two minutes of anchored clouds, buffer pooling and render submission using PlayCanvas's null graphics device.
- The isolated `cliff-demo.html` production build passes. Vite reports its existing large engine-bundle warning.
- The demo URL returns HTTP 200.
- Browser automation has no available browser connection. Final GPU-rendered cloud blending and pointer controls need visual review in the browser; Blender renders do not substitute for that check.

## Dedicated ivy generation

Generated with the built-in image generation tool, using the user's cropped leaf close-up as a style reference. Saved as `public/assets/flight/cliffs/painted-ivy.png`; transparency is preserved. Final prompt:

> Create a NEW production game texture of hanging ivy on genuinely transparent background. Use the supplied image only as reference for the leaf shapes and painted style. Tall portrait canvas with exact width to height ratio 1:3 (for example 1024x3072). A SINGLE complete hanging vine cluster: three thin descending sinuous stems, attached near the upper edge with a small gathering of leaves, hanging downward under gravity. One long main stem reaches almost the bottom, two side stems reach roughly 70% and 85% down. Flat elongated pointed olive-green leaves alternating along stems, each clear simple painted shape, about 14 to 20 leaves per main stem, varying sizes and angles. Loose asymmetrical spacing, transparent gaps showing between leaves and stems. Palette from reference: subdued moss olive shadows, dusty warm yellow-green sunlit leaf faces, muted sage mids; broad soft painterly color facets, almost flat 2D look. Leaves should be distinct simple silhouettes not needles or bushy clumps. Full cluster visible with 8 percent transparent margin all sides, no cropped stems or leaf tips. TOP to BOTTOM orientation. No rocks, ground, tree trunk, tree canopy, shrubs, clouds, background color, border, labels, text, cast shadows or scenery. Do not copy the reference's rectangular stone backdrop. This is an isolated foliage texture that will be mapped onto one long simple quad; avoid dense massing.
