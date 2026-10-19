# Cloud experiments (inactive)

The original procedural cloud puffs in `src/windFx.js` have been restored at the user’s request. Live flight and the cliff demo use the original three noise-eroded textures, square billboards, base-to-top tint and soft transparency. The distant cloud splat is unchanged.

Generated artwork and study images in `art/clouds/`, and the unused atlas in `public/assets/flight/clouds/`, remain as references only. They are not loaded by the game.

Run `node tools/verify-cliff-demo.mjs` to check original puff generation, anchored shrouds, pooling and render submission on a null graphics device.
