# Painted opening leaf particles

The opening ambience uses four painted leaf silhouettes from
`public/assets/ambience/painted-leaves.png`. Each occupies one equal cell in a
2 × 2 transparent atlas: sage lanceolate, olive oval, curled yellow-green,
and straw gold. The atlas was generated using the built-in image generation
tool; its original alpha is preserved.

`src/ambience.js` loads the atlas asynchronously and distributes its four cells
across the existing leaf pool. All four meshes share one material and texture.
The existing leaf count, size, wind motion, flutter, fading and daylight tint
are preserved. The original canvas leaf remains a loading/error fallback.

## Generation prompt

Use case: stylized-concept
Asset type: production game particle texture atlas, square RGBA with real transparent background.
Primary request: Four separate beautifully hand-painted windblown leaves for a dreamy floating-cliff sanctuary game. Quiet painterly gouache brushwork, broad simple color facets, subtle central veins, soft weathered natural texture, inspired by olive/sage vines and windswept fantasy island vegetation. Muted sage green, dusty olive, lichen yellow-green, and subdued warm straw gold. Avoid saturated green, orange autumn leaves or photorealism.
Composition: EXACTLY a regular 2 by 2 atlas of equal square cells, one SINGLE detached leaf centered in each cell, all tips pointing up and short stems down. Each leaf fits entirely within the central 70 percent of its own cell, with generous fully transparent gutters. Top left: gently bent narrow lanceolate sage leaf. Top right: broader pointed oval olive leaf with asymmetric sides. Bottom left: softly curled slender yellow-green leaf, still seen mostly face-on. Bottom right: small broad tapered straw-gold leaf with a slight crease. Each is a full, legible individual leaf with a short fine stem, never a branch or cluster. All four approximately same height, no extreme perspective.
Lighting: diffuse warm daylight painted into muted colors, gentle cool sage shadows, low contrast; no hard shadows.
Constraints: genuine alpha transparency everywhere outside the four silhouettes including gutters; no background, no checkerboard drawn into art, no ground shadow, no glow, no outlines, no labels, no text, no border, no extra flecks, no branches, no scenery. Crisp organic alpha silhouettes with lightly antialiased edges. Square atlas.

## Padding refinement prompt

Edit this production leaf particle atlas. Preserve the four painted leaf designs, brushwork, muted colors and real transparency. Fix ONLY layout and padding: square image divided into precisely four equal square quadrants (2x2). Center each entire leaf at the exact center of its quadrant: (25%,25%), (75%,25%), (25%,75%), (75%,75%) of the full image. SCALE EACH LEAF DOWN so its complete silhouette INCLUDING stem and tip occupies at most 65% of its cell height. Leave at least 17.5% completely transparent padding above AND below each leaf within its own quadrant, with generous left/right margins also. There MUST be a wide clean empty horizontal gutter through the center of the full image and a wide clean empty vertical gutter. No leaf pixels may cross or touch the quadrant boundaries. Keep actual alpha transparency, do not paint a background or checkerboard, no cast shadows, no new objects, no labels, no text.
