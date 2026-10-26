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

## Environment re-renders

Each realm is a 1,048,576-splat capture. `Environment.setTint` in splat-engine 0.2.0 marks that capture's work buffer dirty, so the next frame re-renders all of its splats. The game called it every frame, even when nothing had changed:

- `timeOfDay.update()` re-applied the island's grade on every frame, including while the clock is stopped. The title menu holds the clock with `setSpeed(0)` and waits there indefinitely. A held or settled clock now applies nothing; a running clock (the dawn) still applies every frame. The performance check verifies this: under the old code, 10 seconds of menu caused 600 island re-tints; now there are none.
- `updateSkyGrade()` re-tinted the sky capture every frame for the whole flight, crash and wake. It now does so only during the `SKY_GRADE` settle window, when the value changes.

The output is unchanged: the tints written are the same values, just not rewritten. The sky-grade guard lives in `main.js`, which the Node checks cannot import, so only the island clock has an automated test. The GPU time saved per frame depends on the device and backend, and has not been measured in a browser yet.

## Memory and loading

The title screen waits only for what the menu and the opening play: the island realm, the character, the `idle`, `doze`, `wake`, `getup-sunrise` and `vanish` clips, and the two path files (about 22 MiB). Once those are in, the flight's assets load behind the menu and the opening: the sky realm, the cliff set, and the `step-off`, `flail`, `impact`, `limpfall`, `breathe` and `sigh` clips (about 25 MiB). She stands still at the brink until they are in, and a full hold-to-skip ring waits for them too. If either wait passes 1.5 s, their own progress bar (`#flight-loading`) fades in at the bottom right, in place of the skip prompt. `?fly=1` waits for them before starting. A failed load in either group shows the `#failed` sheet with a reload button; so does a lost graphics device (an iPhone can reclaim it after a switch to another app), since the splats are not restored with it. Audio loads alongside without blocking.

| Fetched at startup | Download | Resident afterwards |
| --- | ---: | --- |
| Island realm (`.spz`) | 16.3 MiB | ~32 MiB GPU textures + 12 MiB CPU sort centers (estimated from formats) |
| Sky realm (`.spz`) | 16.0 MiB | the same, held through the whole island sequence |
| Animation clips (11 `.glb`) | 10.3 MiB | parsed into keyframe tracks |
| Cliff textures (WebP) and mesh | 3.0 MiB | 32 MiB GPU (four 1254² RGBA textures with mips) |
| Character (`.vsplat`) | 1.2 MiB | small |
| Decoded sounds (`.mp3`) | 6.2 MiB | **~132 MiB** PCM at 48 kHz (360.6 s of stereo float32) |
| Streamed music (`.mp3`) | 4.3 MiB | browser media buffers only |
| **Total** | **57.2 MiB** | |

The decoded-sound figure is exact arithmetic from the files' durations. The splat figures follow from PlayCanvas's texture formats and still need confirming in a browser. Repository cleanup removed the three superseded cliff GLBs, inactive stone/cloud textures and favicon option galleries from `public/`, saving about 29 MiB per deployment. The four current cliff GLBs and the cliff textures' PNG sources live in `art/flight-cliffs/`, out of the deployment (about 31 MiB), for asset export and validation (`tools/build-flight-cliffs.py` and `tools/verify-cliff-demo.mjs`); runtime cliffs use `cliffs.mesh.json` and WebP copies of the textures. `python3 tools/build-cliff-textures.py` re-encodes them at quality 90 (1.4 MiB against 7.9 MiB of PNG), checking a mean colour error under 3/255 (it is at most 2.3) and pixel-identical foliage and ivy cutouts. The island atlas remains referenced by `src/flightScenery.js`.

## Checks

```sh
node tools/verify-performance.mjs
node tools/verify-flight-atmosphere.mjs
node tools/verify-cliff-demo.mjs
node tools/verify-cliff-avoidance.mjs
npm run build
```

`verify-cliff-avoidance` flies the real flight model and chase camera among the real cliff boxes for five seeds of two minutes each, with a pilot who aims at the nearest cliff. Without avoidance, three of the five runs put her inside the rock's 2.5 m hide distance (73–532 frames) and hide cliffs from the lens on 85–606 frames. With avoidance she stays at least 4.5 m off, no cliff hides from her or the lens, and the contact slide never moves her more than 0.17 m in a frame. Idle and gently wandering pilots on the same seeds are never steered or pushed.

The performance check covers initial invisibility, exact-zero hiding, faint nonzero visibility, fade-in restoration, and shrouds moved while hidden or parked. The atmosphere check also verifies birds-only startup avoids the atlas, alongside the existing sustained-flight, geometry, buffer reuse and scenery checks. The cliff check exercises anchored clouds and both shader source paths.

## Swap warm-up

The first draw of the sky realm (its work buffer for 1,048,576 splats) and of the cliffs' five materials (their shaders compile on first use) used to land on the frame the cloud bank swaps the island for the sky, freezing the launch for a moment. `warmFlight()` now runs as the empty-ledge shot (`hold`) begins, while she is out of sight: the sky is enabled with `setClipDistance(0, 0)`, an empty band that draws nothing, and a 1e-6-scale speck of each cliff formation draws 2 m in front of the lens for 0.4 s. `swapToSky()` restores the full band and removes the specks. The skip and `?fly=1` paths swap under the black curtain and don't need it. The warm-up was checked to leave the frame unchanged and the swap to restore the sky; the freeze itself needs timing on a phone, since the sandbox renders on the CPU.

## Clip size

`node tools/compact-clips.mjs public/assets/anims/*.glb` drops what the engine's clip decoder never reads (meshes, materials, skin bind matrices) stores float rotations as normalized 16-bit, keeps a channel that never changes (within 1e-5) as a single keyframe, and shares one buffer view across channels; translations stay float. It decodes each clip with `Animation.fromGlb` before and after and writes only if every keyframe value moves by at most 1e-4 (16-bit steps are 3e-5). Run it on any newly exported clip. It took the eleven clips from 25 MB to 10.8 MB (worst change 2e-5); the title screen's five from 19 MB to 5 MB.

## Music memory

The 188-second menu track and 76-second flight track now stream via three reusable media elements instead of `decodeAudioData`. At 48 kHz stereo, their full decoded buffers would occupy about 97 MiB combined (89 MiB at 44.1 kHz). Those application-owned buffers are no longer allocated; actual browser-managed buffering and total memory savings still require measurement in a browser. Audio file quality and the remaining decoded effects are unchanged.

`node tools/verify-streaming-music.mjs` exercises the transport with controllable media elements: staged loading, several loop seams, equal-power overlap, delayed starts, skips, opening volume lift, buffering catch-up, autoplay rejection, holds, interruptions, cancellation and replay. `node tools/verify-audio.mjs` also checks that the two streamed tracks never reach the decoder while dawn and storm still do. `window.__demo.audio.stats()` reports actual decoded buffer bytes and stream readiness/positions in a debug session.

No browser connection was available during implementation. Live autoplay policies, seek latency, crossfade sound and real memory consumption remain to be verified on desktop and mobile browsers.
