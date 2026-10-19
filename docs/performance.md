# Game performance

The `optimize/game-performance` branch removes work for invisible effects without reducing particle counts, resolution, or nonzero opacity fades.

- Shared sprites start hidden and leave the render queue at exactly zero opacity. Their entities keep simulating, so they can fade back in. Repeated opacity values no longer rewrite shader parameters. This also applies to the menu's stars, fireflies, leaves and motes.
- Fully transparent clouds skip lens-distance calculations and billboard rotation. Cloud placement, aging, anchored movement, recycling and entry sounds continue.
- Bird silhouettes and mote corners reuse constant arrays, removing 593 temporary arrays per flight frame (35,580 per second at 60 FPS).
- Birds-only scenery no longer requests the retired 1,432,465-byte island atlas or creates its four plane meshes. Configurations with painted islands still load it normally.

## Measured comparison

Baseline: commit `93218a1`. Run `node tools/verify-performance.mjs` for a seeded 30-second flight simulation with the game's 632 cloud/streak sprites, including 12 populated cliff shrouds. The camera follows a banking and climbing flight. Rendering is sampled every 60 frames; updates run every frame.

| Work measured | Baseline | Optimized | Reduction |
| --- | ---: | ---: | ---: |
| Sampled cloud/streak draw submissions | 13,759 | 8,910 | 35.2% |
| Billboard updates | 1,137,600 | 846,234 | 25.6% |
| Shader parameter writes | 1,137,908 | 105,899 | 90.7% |

The sampled opacity and nonzero-opacity world transforms have the same SHA-256 hash before and after: `c82274f7ea464127ff068384e36be52cd026f15106aa27f92dc21d1a62317b19`.

The benchmark uses PlayCanvas's null graphics device. These are effect-specific work counts, not whole-game GPU timings or FPS gains. Reported CPU median/p95 timings are diagnostic and depend on the machine and other running work. Browser GPU rendering and the full cinematic still need a visual check.

For a new comparison, run the same benchmark against the baseline source with `--measure-only > /tmp/splat-performance-before.json`, then run the optimized source with `--compare /tmp/splat-performance-before.json`. This asserts matching visible state and reduced work. The fixture is deterministic; use the same benchmark and dependency versions on both sides.

## Checks

```sh
node tools/verify-performance.mjs
node tools/verify-flight-atmosphere.mjs
node tools/verify-cliff-demo.mjs
npm run build
```

The performance check covers initial invisibility, exact-zero hiding, faint nonzero visibility, fade-in restoration, and shrouds moved while hidden or parked. The atmosphere check also verifies birds-only startup avoids the atlas, alongside the existing sustained-flight, geometry, buffer reuse and scenery checks. The cliff check exercises anchored clouds and both shader source paths.
