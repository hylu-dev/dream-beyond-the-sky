# Drop sound review

Open `index.html` directly, or visit `/art/audio/drop-review/` on the Vite development server. The folder is self-contained: keep `audio/`, `options.js`, `review.js`, and `review.css` beside the HTML. This review page is not part of the production Vite build.

Eight separately generated ElevenLabs takes and the derived revisions 03B and 03C are presented as isolated sounds and consistent audio mockups. The mockups use the shipped dawn track from 26 s, with foot release at 3 s, a 2.5-second dawn crossfade, the candidate, ambience, a musical pause, and flight at 6.9 s (9.65 s for the extended 03B preview). These previews do not change game playback. The reference button uses the current dawn phrase without a candidate.

The clip descriptions describe the audition's intended character. Actual generated pitches were screened: C, E, and A options fit the dawn phrase; option 03 retains a D/A suspension for comparison. Option 05 is lowered one octave from its shrill source. There is no claim that all takes are exact performances of their prompts. The raw takes and prompts remain available in `raw/` and `generation.json`.

Candidates are trimmed of leading silence, faded briefly to prevent clicks, and normalized to -24 LUFS. All use the same gain in scene mixes. The shorter option 08 releases earlier by design. Scene mixes use fixed levels rather than separate normalization, so background loudness stays comparable.

Favorites and notes are saved only in browser local storage. Copy or download feedback to share it. No selections are sent automatically and no take is applied to the game.

Rebuild the audio and metadata from the retained sources:

```sh
node tools/build-drop-review.mjs
```

Requires ffmpeg. Generation itself is not repeated by this command.

## Revision 03B

The user selected 03 and asked for a higher, longer version with a slower dawn crossfade. 03B reuses that exact raw performance, transposes D/A up a perfect fifth to A/E, and stretches its sustain to six seconds. Its entrance fade is 0.25 s and release is 0.4 s. The complete preview is 12.65 s: drop at 3 s, string release complete at 9 s, a 0.65 s musical pause, then three seconds of flight intro. Other candidate previews also use the longer 2.5 s dawn crossfade and three-second flight excerpt. The original 03 solo retains its pitch and duration. No new generation was needed.

Timeline labels and markers follow each variant's timing. Existing browser favorites and notes retain their IDs; revision 03B is a separate choice.

## Revision 03C

03C raises the original D/A section by an octave (a fourth above 03B) and extends it to nine seconds. The steady bowed body is repeated with 0.4 s overlapping seams so the added time retains a sustained tone instead of stretching the source decay. Both the violin entrance and dawn exit now last five seconds, beginning at the drop. The string release lasts 0.5 s. The 15.65 s preview places drop at 3 s, the end of strings at 12 s, and flight at 12.65 s. Earlier versions retain their timing and pitch for comparison. The longer preview is an audition, not a change to the game's camera or launch timeline.

## Dedicated ElevenLabs performances: 03D–03F

These are new twelve-second performances generated with ElevenLabs Music v2 from dedicated prompts. The audition uses the first nine seconds, with level normalization, a five-second entrance envelope and a half-second release. There is no pitch shift, time stretch, repeated section, or leading-silence removal. The original twelve-second MP3s and exact prompts are retained. The prompts target the upper chamber-string character of 03C; generated pitch is labeled from spectral inspection, rather than assuming that the model followed the requested register exactly.

- 03D: steady section, centered on G with string overtones.
- 03E: expressive bowing, E and A material compatible with dawn's harmony.
- 03F: fine tremolo, D and A suspension.

Nearly silent and prematurely fading generations were rejected before selecting these performances. All three use the 03C preview timeline: drop at 3 s, a five-second dawn fade, nine seconds of strings, 0.65 s of musical silence, then flight at 12.65 s. The game remains on its existing audio until a choice is applied.

## Pitch and release corrections: 03F2 and 03D2

The dedicated generations came back below 03C’s established register. These two revisions tune the fresh performances rather than reusing the original 03: 03F2 raises 03F by an octave to D5/A5, and 03D2 raises 03D by a perfect fifth to D5. Tempo compensation preserves duration after pitch correction. Neither repeats a section. The retained raw recordings and the original 03D–03F auditions remain unchanged.

Both cues still last nine seconds and enter over five seconds as dawn fades. Their release now spans the final 2.5 seconds (6.5–9 s in the solo, 9.5–12 s in the scene mix), reaching silence before the 0.65-second musical pause. The ambience and flight timing stay the same. Separate IDs preserve earlier favorites and notes.

## Native target-pitch generation: 03G

03G is a new twelve-second ElevenLabs Music v2 orchestral performance, generated using 03D2 as an audio conditioning reference. The reference was padded with silence to meet the upload minimum; only its audible 3–6.5 s region was used for conditioning. The composition plan contains a generation chunk, not an unchanged audio-reference chunk. The exact plan and uploaded song ID are retained in `generation.json`.

The unprocessed output sustains D5: spectral peaks at 1, 3, 5, 7 and 9 s are approximately 589, 589, 591, 589 and 588 Hz, with upper harmonics and ordinary ensemble pitch variation around the 587.33 Hz target. Four text-only attempts and a second conditioned attempt missed the register and were excluded. Scratch generation records are in `/tmp/dream-native-d5/`.

The audition uses the first nine seconds with level normalization, a five-second entrance and 2.5-second release. There is no local pitch correction, tempo change, stretching or looping. The dawn crossfade and 0.65-second musical pause match 03D2; the existing game audio and earlier auditions remain unchanged. Judge the new performance's tone against 03D2 on the review page.

## Softer bowing and mix: 03I and 03J

Two new reference-guided ElevenLabs performances target softer, smoother bowing at the same D5 pitch. 03I requests a muted section with light bow pressure, sul tasto tone, minimal vibrato and staggered bow changes. 03J requests a blended legato section with a steady body. Both retain the pitch without local pitch shifting, stretching or looping. Raw-file spectral checks place the fundamentals around 587–590 Hz throughout; exact plans and measurements are retained in `generation.json`.

These auditions target -30 LUFS, 6 dB below the earlier -24 LUFS versions in both solo and scene playback. A gentle -3 dB treble shelf at 3.2 kHz reduces the bright bow edge before normalization. The builder records these per-take settings; earlier auditions retain their original processing. All timing stays at nine seconds of strings, a five-second dawn blend, a 2.5-second string release, and a 0.65-second musical pause. The game's audio is unchanged.

## Selected and applied: 03J

The user selected 03J. The game uses a seven-second edit rebuilt from the raw performance by `node tools/build-ledge-cue.mjs`. It retains the original audition's gain, pitch, treble shelf, five-second entrance and 2.5-second release. Its prepared master is `audio/03J-game.mp3`, copied unchanged to `public/assets/audio/music-ledge.mp3` by the builder and the audio processing manifest.

In the game the cue starts half a second before foot release with gain 0.8; dawn fades over five seconds. Launch follows the seven-second cue and 0.8 seconds of wind and birds, 1.5 seconds sooner than the timing before the cue was shortened. The archived nine-second auditions retain their original timing. The review page marks 03J as selected; favoriting another card does not change the game automatically.
