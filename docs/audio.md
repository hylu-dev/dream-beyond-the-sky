# Sound

Foley and ambience across the whole game, from the title menu to the flight, and the storm's music sting. The rest of the music is made separately (see Music below). The girl is heard only once, catching her breath as she wakes under the tree at the end. She has no sleeping, stepping or falling sounds, and the only animals are birds. `src/audio.js` plays everything in Web Audio, and `src/main.js` drives it from the story's states and the flight.

Browsers won't play sound until the page is clicked or a key pressed, so the sound starts on the first of those. On the menu that is usually the Start press itself, so the night ambience is heard only once the player has clicked somewhere.

## Sounds

Beds loop under the scene, at a level from 0 to 1 that the game sets every frame. One-shots play on the story's moments.

| Sound | Kind | When, and what drives it |
|---|---|---|
| `night-bed` | bed | Smooth open night air, with no rustling and no animals, under the menu; it fades as the sun comes up |
| `dawn-bed` | bed | Birdsong coming up with the dawn (the sun's elevation), kept low |
| `island-wind` | bed | Strong wind across the island, from the gusting wind `updateAir` already computes; never below half, and rising on the edge |
| `rumble` | bed | The tremor on the edge, following `rumble` as it builds and dies away |
| `ui-hover`, `ui-start` | one-shot | Pointer over Start; Start pressed |
| `approach-swell` | one-shot | The camera moving in on her face |
| `turn-swell` | one-shot | The camera rising to the sunrise |
| `pulse` | one-shot | The pulse of light: a monumental deep gong struck as the ring leaves the sun. A huge boom and its bloom, a temple bell's toll pitched down for the bronze, a breath of tam-tam, and a synthesized sub dropping from 70 to 38 Hz (with its octave, so small speakers carry it), under a 1 kHz low pass and a 7 s dark convolution reverb, 14 s in all |
| `launch` | one-shot | She bursts back up flying |
| `cloud-pass` | one-shot | Through the cloud bank, peaking as the camera crosses its middle (the scene swap) |
| `area-reveal` | one-shot | The area title |
| `ui-skip` | one-shot | Hold-to-skip completes; the cut-scene's one-shots fade out with the cut to black |
| `flight-wind` | bed | Rushing air, with her speed |
| `flight-whistle` | bed | Higher wind, as she climbs, dives or banks |
| `turbulence` | bed | Buffeting, with the flight's rough-air `pocket` |
| `cloth-flap` | bed | Her clothes flapping as she flails, and a little in steady flight |
| `sky-bed` | bed | The open sky, once she's in the sky scene |
| `bank-whoosh` ×3 | one-shot | A sharp roll into a bank, panned toward the roll and louder the further it will go |
| `cliff-pass` ×3 | one-shot | A cliff passing within 16 m (`flightCliffs` `onPass`), panned to its side, timed so its peak arrives as she draws level |
| `birds-distant` ×2 | one-shot | A flock within 70 m calls every 6–16 s, panned to its side |
| `cliff-impact` | one-shot | Her blow against the cliff in the crash ending (`src/crash.js`), the hardest hit in the game, built as one blow. Every layer starts on its attack, and the foley is cut short before anything in it could read as a second hit. A punch and a synthesized kick make the blow; a body thud and a stone crunch make it a body against rock, on any speaker; a trailer boom, a sub drop and a rumble rolling away give it weight. The mix is lightly saturated in a short dark space, and it ducks everything else while it strikes |
| `wake-gasp` | one-shot | She jolts awake under the tree after the fall: one frightened gasp as her lids first open, 0.15 s in. Close and dry, breath only |
| `wake-pant` | one-shot | From 0.7 s in, her ragged panting, slowing as she calms. It fades out as the deep breath starts |
| `wake-breath` | one-shot | The deep breath, on the cut in at `WAKE_UP.endAt`: the inhale of one slow breath |
| `wake-sigh` | one-shot | Her sigh as she sinks back against the tree, with the sigh clip at `WAKE_UP.sigh.at`: the exhale of a sigh of relief, which finishes the deep breath |

Sounds marked ×N have N takes. Each time, one is picked at random. The sound pauses while the scene waits for a phone to be turned, and while the page is hidden.

## Music

The score shares one world: a Western cinematic orchestra in D minor (strings, brass and horns, timpani, big orchestral percussion and taiko), with Chinese instruments only as a sparing solo colour, an erhu or dizi line at most, and no guzheng. Slow pieces are at 60 BPM, the flight at 96. All of it is instrumental. The three main cues come from Suno: the awakening and dawn, the leap and flight, and the waking ending. The title screen's music comes from Suno too (see docs/music.md).

One piece is made here, with ElevenLabs Music (`music_v2_5`):

| Sound | Kind | When, and what it is |
|---|---|---|
| `music-night` | bed | The title screen's and the ending's music (Suno's `Hush of a Night Sky`). It comes in as she wakes under the tree and stays up through the title screen, looping with a 6 s crossfade, kept under the night ambience; it fades out on Start |
| `music-dawn` | one-shot | Dawn (Suno's `The Great Reveal`, from `art/audio/music/`; see `docs/music.md`), from the Start press, its first swell peaking on the gong. It plays on through the edge and eases out over 1 s as she falls, leaving her fall silent |
| `music-flight` | one-shot | The flight (Suno's `风过长空`) from its start, from her launch, so its burst comes as the area's title shows (a skip to the flight starts it partway in), until the storm eases it out over 5 s |
| `music-storm` | one-shot | The storm swallowing her flight, 7.3 s before she hits the cliff. The flight's soaring turned ominous: string tremolo, rising dissonant clusters, brass swells, an erhu cry, timpani and taiko rolls building to a crash at its very end, where it is cut dead and the impact takes over. No resolution, no tail |

It is generated from a composition plan (`plan` in the manifest): three sections, a 3 s ominous rise, a 5 s crescendo and a 3 s sustained peak, each with its own styles and the styles to avoid (vocals, choir, guzheng, an ending, a fade-out). The piece is made 11 s long so that the model's own ending falls after the cut. `process-audio.mjs` keeps a music one-shot's lead-in and cuts it to its `seconds`. The take that ships (take 3) is silent for its first 0.65 s, swells steadily from there, and peaks on a crash at 6.9–7.25 s, so the 7.3 s cut lands on the crash. A plan can only ask the model to stay instrumental through its styles; a plain `text` prompt is sent with `force_instrumental`, which guarantees it.

```sh
rm art/audio/raw/music-storm-*.mp3            # to make new takes
node tools/generate-audio.mjs music-storm     # about 150 credits per 11 s take
```

Then pick a take with `use`, check that its peak falls at the cut, and run `process-audio.mjs`.

## Making them

Every sound except the music was generated with ElevenLabs' sound-effects model (`eleven_text_to_sound_v2`, 44.1 kHz/192 kbps MP3). Beds were made with its seamless-loop option. Each sound's prompt, length and number of takes, and which takes ship, are recorded in `tools/audio-sounds.mjs`. Some takes are layers, generated only to be mixed: `pulse` and `cliff-impact` are built from layers. Each layer is brought to one loudness, then given its own dB, delay and optional ffmpeg filter (a bass boost, a pitch-down, a trim). A layer can also be synthesized by ffmpeg (the sub drops under the gong and the impact), a `mixFilter` runs over the whole mix, and `reverb` sends it through a convolution tail made from decaying, darkened pink noise.

```sh
node tools/generate-audio.mjs [name ...]   # raw takes into art/audio/raw; existing takes are kept
node tools/process-audio.mjs               # chosen takes into public/assets/audio, plus art/audio/audition.html
node tools/verify-audio.mjs                # files, levels, and audio.js's looping/unlock/cut behaviour
```

`generate-audio.mjs` uses `ELEVENLABS_API_KEY`, or the ElevenLabs MCP server's key from `~/.claude.json`. It sends two requests at a time, the most the subscription allows. The MCP tool itself caps sounds at 5 s.

`process-audio.mjs` builds every file into `public/assets/audio.next/` and swaps it in only when all of them are made, so a failure leaves the shipped sounds as they were. It brings every file to one loudness: -24 LUFS for beds, -18 LUFS for one-shots, with a limiter at -1.5 dB that runs at four times the sample rate, so it holds between samples too. A sound's `lufs` can set it louder: the gong and the impact are. Beds get gain only, so their loop points stay intact. One-shots have their leading silence trimmed and their tail faded (`fade` in the manifest, for ones that end abruptly). A mix keeps its lead-in, so its layers' timing holds. The mix lives in the `gain` of each sound in `SOUNDS` in `src/audio.js`, and in the levels `main.js` sets. A sound with `duck` (the cliff impact) drops everything else to a share of its level as it strikes, then lets it back.

Beds loop by overlapping copies of themselves with a 1.5 s equal-power crossfade, instead of relying on gapless MP3 decoding.

## Choosing takes

With `npm run dev` running, open `/art/audio/audition.html`. It shows each sound as the game plays it, beside every raw take and its prompt; the takes in use, directly or in a mix, are highlighted. To swap a take, change the sound's `use` or `mix` and run `process-audio.mjs` again. If the number of shipped takes changes, update `variants` in `src/audio.js` too; `verify-audio.mjs` checks the two agree.

Takes were chosen without listening. The choices were based on spectrograms and loudness envelopes: one clear event where one was asked for, no abrupt cut-off, peaks where the moment needs them. The mix levels were set the same way. Both need a listening pass.
