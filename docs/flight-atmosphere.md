# Flying realm atmosphere

Small painted floating islands, distant gliding birds, and local air effects activate in `swapToSky()`. The island/menu sequence retains its existing scene controls. `?fly=1&debug=1` starts directly in flight and exposes `flightScenery.stats()` and `flightAir.stats()` on `window.__demo`.

## Art direction

Each island is one transparent painted plane: the illustration supplies its cliffs, trees, temple ruins, waterfall, brushwork, and lighting. Four paintings are placed at different world distances to create fly-by parallax. The planes turn around world-up to face the camera, preserving upright architecture during banking. Their painted front stays unmirrored so the warm highlights remain consistent.

Soft alpha edges, painted mist, and per-object lavender atmospheric haze blend the cutouts into the sky. The planes do not write depth, so transparent borders cannot occlude the background. They fade on approaches closer than 11 metres, becoming fully invisible at 4 metres. Missing textures hide the planes instead of displaying rectangles. No global lighting or fog changes are needed.

Selected artwork: `public/assets/flight/painted-islands-atlas.png` (1254 × 1254 RGBA, four paintings). Created with the built-in image generation tool using the user's floating-cliff reference as visual guidance. Approximately 65% of the atlas is fully transparent. Hand-authored UV frames in `ISLAND_ART` preserve each painting's aspect ratio and mist. The wider waterfall painting extends beyond an equal quarter, so it has its own wider frame. The unused previous stone texture was removed during repository cleanup and remains recoverable from Git history.

Final generation prompt:

> Use case: stylized-concept. Asset type: one game sprite atlas, square 2048 x 2048, a precise 2 by 2 grid of four separate floating island cutout paintings, genuinely transparent RGBA background. Input image is STYLE AND DESIGN REFERENCE only. Match its beautiful painterly matte-painting brushwork, slender vertically eroded suspended stone cliffs, tiny ancient temple ruins, windswept evergreen pines, muted blue-lavender grey stone shadows, dusty olive vegetation, pale warm sunlight on the upper right edges. These will be mapped onto flat planes inside that exact reference world; they must feel like painted pieces of that vista, not 3D renders or icons.
>
> Each sprite is wholly contained in its own equal square quadrant with at least 12 percent fully transparent padding on all four edges of each quadrant. No sprite overlaps a cell boundary. One coherent isolated mini-island per quadrant, entirely visible from tree tip to the long tapered rocky underside, occupying around 70 percent cell height. Top left: narrow floating crag with one weathered stone temple arch and a leaning pine, tiny hanging vines. Top right: asymmetrical pine-covered floating pinnacle with a little broken pagoda pavilion. Bottom left: broader small mossy ledge with a ruined stone gateway, two pines and a thin waterfall fading softly into transparency below. Bottom right: slender split stone spire supporting a tiny quiet shrine roof and one windswept pine. Natural variety of silhouettes and size, each island mostly vertical, never a round boulder.
>
> Camera: a distant environmental view, nearly level with the summit with just a little top visible, no exaggerated isometric game-object view. Mood: quiet luminous wonder, gentle aerial perspective, soft lost-and-found painted edges, restrained detail, low contrast shadows. Paint the lighting into the image. Transparent empty space around and between the four islands, including openings in arches. No sky, no horizon, no ground plane, no rectangular backgrounds, no solid backing, no cast shadows outside island, no UI, no typography, no grid lines, no checkerboard painted into the art. Subtle local mist may dissolve the lowest rock and waterfall tips into alpha but do not surround the objects with white halos.

## Motion and cost

- 12 pooled painted islands, alternating sides and distances, appearing 34 metres ahead initially. New paintings fade in at the far end of the route and recycle only behind the player.
- Three flocks of seven birds with offset wingbeats and gliding intervals.
- 14 tapered wind filaments and 64 gold motes share one dynamic mesh. Intensity responds to speed, turbulence, and banking. Existing wind streaks lengthen in turbulent pockets.
- 16 additional mesh instances using 8 shared mesh buffers, including birds and air effects. All 12 islands together use just 24 triangles. Counts remain fixed during sustained flight.

Controls live in `SCENERY_DEFAULTS` and `ISLAND_ART` in `src/flightScenery.js`, the local constants in `src/flightAir.js`, and `WIND_DEFAULTS` in `src/windFx.js`.

## Validation

`npm run build`

`node tools/verify-flight-atmosphere.mjs`

The runtime check uses PlayCanvas's null graphics device with the actual entities, materials, mesh buffers, and flight simulation. It covers four headings, banking, variable frame times, more than four minutes of flight, recycling, fixed buffers, finite vertices, bounded alpha, RGBA atlas hookup, upright camera-facing planes, no depth-writing rectangles, close-approach fade, reset/disable behavior, turbulence response, and render submission. Atlas transparency and non-clipped silhouettes were separately inspected. This does not replace an in-browser GPU/visual check; no browser connection was available during implementation.
