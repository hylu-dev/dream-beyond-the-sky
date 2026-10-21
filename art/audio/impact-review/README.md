# Cliff impact sound review

Open `/art/audio/impact-review/` on the Vite server. Options 01–04 are fresh ElevenLabs sound effects; 05 is a tighter remix of existing layers, and 00 is the previous shipped impact. The generation prompts and measured levels are retained in `generation.json`. Generated descriptions describe intent; listen to judge timbre and realism.

Auditions start at -22 LUFS with a short release. The selected **03 — Deep canyon collision** then receives +2 dB gain and a gentle +1.5 dB low shelf at 120 Hz; both its isolated and scene previews include this lift. Scene previews have identical ambience, approach and fall cues, with contact at 1.2 seconds. The hit leans left toward the cliff. 03 is installed as the game’s cliff impact. Changing favorites on the review page does not install a sound; favorites and notes are stored locally and can be copied as feedback.

`node tools/build-impact-review.mjs` rebuilds auditions from retained raw files. `--generate` explicitly requests missing 01–04 takes from ElevenLabs; it does not replace existing takes. No retuning or synthesized bass is added to the new performances.

Run `node tools/build-impact-review.mjs --install` to rebuild and copy the selected master to `public/assets/audio/cliff-impact.mp3`. The main audio manifest marks the selected master as prepared, preserving it unchanged during future rebuilds.

The pre-impact breath/gasp has been removed from both game playback and scene previews.
