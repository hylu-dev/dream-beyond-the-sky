# Opening motion

The opening uses PINOC **Standing Walk (2)**, generated as one seated rise, four forward steps, and a standing stop. Four variations cost 8 credits total; the second was selected after preview comparison and checked on the character in the rendered scene.

- Task: `0f3053af-1eb0-4aea-821d-383e36d45ed2`
- Source asset: `3b048062-ef15-490a-989d-a66bdd93e858`
- Export: `splat-skeleton-glb` (441 bones)
- Shipped files: `public/assets/anims/getup-sunrise.glb` and its `.path.json`

To reproduce, download that source asset from PINOC, then run:

```sh
node tools/prepare-opening-motion.mjs /path/to/source.glb
node tools/verify-opening-motion.mjs
```

Preparation removes the long seated pause, retimes the rise and walking into eight seconds, lightly filters frame jitter, and rotates the entire motion to match the existing drop clip's final facing. The path is extracted from the same prepared pelvis translation, so movement and footsteps share a clock. The runtime keeps a constant heading and blends poses over 0.8 seconds. A half-frame completion tolerance accommodates the engine's animation end clamp.

The generated clip travels about 3.1 metres, peaks at 1.11 m/s, and slows to 0.013 m/s in its last frame. Its pelvis heading matches the drop pose to less than 0.001 degrees. Offline skeleton contact measurements reduced mean horizontal planted-foot drift from 8.7 cm to 4.6 cm, and maximum drift from 22.3 cm to 8.8 cm. These measurements exclude terrain and are not a substitute for rendered review.

The ground height descends smoothly from the brow to the lip. The camera's approved dolly and final sun-facing rear composition are unchanged. Review the walk, settle, and drop together at normal playback speed; inspect foot contact on the slope and check that the transition never rotates the character entity.

Local animations use `loadAnimation`, which fetches through the browser’s revalidated HTTP cache, validates the GLB header, and registers the parsed clip. This bypasses the engine’s persistent binary cache, which can retain an HTML fallback response for an hour if a file was temporarily missing during development.

## Step off and fall

The held ledge stance still uses `vanish.glb`. The step-off now uses PINOC **Cliff Dive (1)**, task `466a3ba3-240c-4aad-981f-dfe60e9217eb`, asset `2d41f7a7-8c60-4144-aa06-900144024746`. Four variations cost 4 credits. Preparation keeps the forward step, matches the first pose to the existing stance, and ends before the source's landing/rebound:

```sh
node tools/prepare-step-off.mjs /path/to/cliff-dive-source.glb
node tools/verify-step-off.mjs
```

The prepared clip is 1.3 seconds. Its pose and travel share one explicit clock. Gravity takes over at 0.733 seconds, preserving release velocity and keeping horizontal momentum constant. The entity height compensates for the animated pelvis height so the drop is applied once. This also keeps falling after the last animation frame without a landing or an abrupt change in body position.

At release, the dawn music fades over 0.18 seconds and the rumble fades quickly. The camera holds the approved composition with a smaller nod, followed by 1.9 seconds on the empty ledge before the launch. Rendered review covers the step, release, disappearance, and uninterrupted transition into flight.
