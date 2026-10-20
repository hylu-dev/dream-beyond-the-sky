# Flight body language

The flight keeps the existing standing-idle base and PINOC “Skydiver Recovery” launch layer. `src/flightRig.js` adds responsive body-space rotations after the animation pose is evaluated. No new generated clip or change to steering physics is required for this pass.

Once the launch flail settles, she still looks inexperienced: low-frequency, independent balance adjustments move each arm, hip and knee. Her elbows stay soft, her knees hang slightly bent, and her feet are less pointed. The left and right sides have different timing rather than a synchronized swimming cycle. Confidence reduces these corrections but never removes them entirely.

On a new turn or reversal, the gap between steering intent and actual bank briefly opens her arms and flexes her elbows to catch her balance. Her gaze and shoulders respond first; hips and knees follow with slower springs. Sustained turns now combine the physical bank with an additional 27-degree body roll, reaching about 65 degrees overall. Her head counterturns roughly 38 degrees across the bank, with the gaze rotation applied around the transverse body axis so it reads from the chase camera. The outside arm opens wider and the inside knee bends further. Expressive roll is capped at 82 degrees and never affects steering or collision travel. Climb acceleration is bounded before reaching the legs, and all pose springs integrate in steps no larger than 1/120 second, preventing a slow render frame from destabilizing loose joints.

`flightCliffs.awareness()` samples the current and 0.7-second-ahead position against actual cliff boxes. Within 26 metres, a nearby cliff produces a graded, side-specific protective reach, a clear glance toward it, curled knees and a roll away. The guarding elbow rises and its forearm crosses in front of her face. `src/flightFaceGuard.js` solves that arm against the current head position using its actual bone lengths, then blends into the result with a damped spring. The other arm keeps its normal steering and balance motion. The guarding side stays latched until the arm lowers, so overlapping cloud and rock reactions cannot raise both arms or abruptly swap sides. Already-passed and distant cliffs release the reaction. This query never changes the flight path; the existing cliff avoidance retains control of safe steering.

Cloud reactions use the existing puff-entry detection, one second ahead of flight. A visible bank prompts the same one-arm face shield on its side, curled knees and a partial body roll. The gesture rises over 0.4 seconds, holds through one second, then releases through 3.5 seconds. A four-second cooldown prevents overlapping banks from retriggering a continuous flail. Hidden reserved banks cannot trigger the reaction. Cloud movement and audio retain their existing scheduling.

Disabling and re-enabling the rig clears old spring motion and cloud reactions. The debug API exposes `__demo.flightRig.stats()` for review; it reports pose channels without changing them.

Validation:

```sh
node tools/verify-flight-rig.mjs
node tools/verify-cliff-avoidance.mjs
npm run build
```

The rig checks cover turn reversals, slow frames, cloud recovery, cliff side and distance, bounded normalized rotations, and restart behavior. A two-bone hierarchy check verifies that the shielding wrist crosses the face on either side through ±65-degree banks, while the opposite arm stays unchanged. Browser review should cover neutral flight, both banks, reversals, climb, cloud entry and recovery at normal speed; numerical checks do not establish subjective animation quality.
