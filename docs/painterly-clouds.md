# Cloud experiments (inactive)

The original procedural cloud puffs in `src/windFx.js` have been restored at the user’s request. Live flight and the cliff demo use the original three noise-eroded textures, square billboards, base-to-top tint and soft transparency. The distant cloud splat is unchanged.

The inactive generated artwork, study images and cloud atlas were removed during repository cleanup. Their prompts remain in `art/clouds/`; the original images are recoverable from Git history.

Run `node tools/verify-cliff-demo.mjs` to check original puff generation, anchored shrouds, pooling and render submission on a null graphics device.
