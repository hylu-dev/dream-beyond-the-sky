# Dream Beyond the Sky

A cinematic browser flight game built with PlayCanvas and Viggle's splat engine. Wake on a floating island, fly through clouds and ruins, and return from a dream.

## Run locally

Use Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Press **Start**, then steer with the mouse, touch, or **W/A/S/D**. Hold the mouse button or touch during the opening cinematic to skip to flight.

## Build and check

```sh
npm run build
npm run preview
```

Checks: `node tools/verify-performance.mjs`, `node tools/verify-flight-atmosphere.mjs`, `node tools/verify-cliff-demo.mjs`, and `node tools/verify-streaming-music.mjs`. Audio asset checks use `node tools/verify-audio.mjs` and require FFmpeg/ffprobe.

Opening camera framing: `node tools/verify-edge-shot.mjs` checks framing across landscape screen sizes. Review the rendered sequence too: projection checks cannot detect the island's splats blocking the lens. The camera backs away from the vista while keeping its bearing toward the sun; she rises into view during the move, which settles into the low ledge shot and holds as she drops.

Opening motion: `node tools/verify-opening-motion.mjs` checks the shipped animation with the engine decoder, its travel speed, and its facing at the drop transition. `node tools/verify-step-off.mjs` checks the held-pose match and continuity into gravity. See [opening motion](docs/opening-motion.md) for the generated source and preparation steps.

Add `?fly=1&debug=1` to jump to flight and expose `window.__demo` for debugging.

Source lives in `src/`, shipped assets in `public/assets/`, and asset tools in `tools/`. See [performance](docs/performance.md), [music](docs/music.md), and [deployment](docs/github-pages.md) notes for details.
