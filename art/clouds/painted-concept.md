# Painted cloud sprite concept

Artwork: [painted-cloud-concept.png](painted-cloud-concept.png).
Status: style preview awaiting review; not connected to runtime materials.
The broad outer glow still needs cleanup before this can be a production sprite.

Generated with the built-in image generation tool using the user's cloud
art-direction sheet as a visual reference. This is separate cloud sprite art;
the cliffs contain no painted clouds.

Integration should preserve dense, opaque cloud cores while retaining soft
edge wisps. Current cliff shroud opacity (0.85) multiplied by cloud opacity
(0.97) limits even opaque texture pixels to 0.8245 before other fades.
That makes cliffs visible through solid cloud interiors. Artwork alone does
not fix that compositing behavior.

## Initial prompt

Create a production cloud sprite ART PREVIEW using the attached cloud art-direction sheet as the visual reference. The reference is the desired painterly rendering style, lighting, shape complexity and palette, NOT a layout to reproduce.

Make ONE large, horizontally spreading, irregular cumulus cloud mass, isolated on a genuinely transparent background. Wide 3:2 composition. The cloud fills about 80 percent of the width and 75 percent of the height with clear transparent margins. A low broad base rises into several asymmetric towers, with a rich hierarchy of many small billows and secondary rolling forms nested within larger masses. Not a ring or neat mound of equal spheres. It must look like a piece lifted from the PANORAMA VIEW and CLOSE UP panels of the reference.

Match the reference's sophisticated hand-painted fantasy matte painting / plein-air cloud aesthetic: sculpted luminous cream and pale peach sun-facing tops, slate blue-grey shadowed lower interiors, nuanced muted lavender transition planes, restrained saturation, broken warm highlights along selected edges, a mixture of crisp and softly lost edges, finely painted small billows. Strong internal depth, visible shaded pockets and overlapping cloud volumes, beautiful quiet painterly detail. Directional sunlight from the upper right. Think substantial sunlit cloud architecture with atmospheric softness, not smoke, cotton balls, soap foam, smooth plastic, cartoon symbols, or a fluffy white blob.

CRITICAL: the main body must be fully opaque, including the blue-grey shadows. Use alpha transparency ONLY outside the silhouette and in a narrow irregular fringe of thin wisps, never make the main body see-through. The cloud must read as dense and solid when placed over a cliff. No white outline around the entire cloud. No ground shadow, sky, sun disc, scenery, rock, buildings, text, labels, grid, borders, or baked checkerboard. This is separate cloud sprite artwork; no clouds baked onto any cliff asset.

## Cutout refinement

Edit this cloud sprite preview. Preserve its beautifully detailed painted billows, cloud architecture, muted blue-grey internal shadows and cream highlights. Change ONLY its production cutout: remove the broad luminous halo/bloom outside the cloud so no broad foggy aura surrounds the silhouette; keep fine wisps directly at the edge. Pull the whole cloud back within the canvas, scaling it to fit with at least 12 percent completely transparent margin on ALL FOUR sides. Every edge of the cloud must be visible, no cropping left/right/bottom. Keep the body completely opaque, alpha transparency only in fine silhouette wisps and the empty area outside. Keep the cloud's painted light but reduce overexposure in the brightest rims so their brush detail is visible. True transparent background, no sky, no black rectangle, no checkerboard baked into pixels, no text, no additional objects.
