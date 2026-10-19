# Music

The score is one musical world, modern Chinese cinematic, as in a modern Chinese fantasy film or game:
- **The orchestra** (strings, horns, timpani) carries the weight and the harmony.
- **Chinese soloists** carry the melodies: erhu as the lead voice, with dizi and the breathy xiao around it. The Chinese colour comes from these instruments and their ornaments (slides, breath, grace notes), not from the scale.
- **The melodies are understated.** They are short motifs that develop, in D Dorian or Aeolian, over suspended and open chords that don't resolve neatly. Asking Suno for "pentatonic", "beautiful melody", "heroic" or "emotional" gets cheesy stock tunes and "Oriental" runs, so the prompts avoid those words and exclude the clichés.
- **Modern touches** (airy pads, a low synth pulse, risers) keep it from sounding traditional.
- **No plucked instruments** (no guzheng, no pipa), and nothing that sounds like a kung fu film.

Each piece has its own character:
- **Dawn** is grand and orchestral.
- **The flight** is orchestral too. It starts as tense tremolo on the edge, goes silent as she falls, and bursts out epic as she flies up. Then it eases into an elegant theme whose motion comes from flowing strings rather than drums, with light percussion.
- **The title and ending** is a sparse solo piano with long silences and a faint pad, so the world's own ambience can breathe through it.

All instrumental. 60 BPM for the quiet pieces, 96 BPM for the flight.

Three pieces are made in Suno, for the moments that carry the game, and one in ElevenLabs Music:

1. **Awakening and dawn** (Suno, done: `The Great Reveal`, `music-dawn`): from Start until she falls off the cliff edge.
2. **The leap and flight** (Suno, done: `风过长空`, `music-flight`): the main theme, from the edge through the launch and the whole flight.
3. **Main title and ending** (Suno, done: `Hush of a Night Sky`, `music-night`): one piece for both. It comes out of the black as she wakes under the tree at the end, and plays on into the title screen, looping for as long as the menu is up. It also plays on first load, from the first click.
4. **The storm** (ElevenLabs Music, `music-storm` in `tools/audio-sounds.mjs`): 7.3 s, from the storm's start, building to its peak on her blow against the cliff, cut dead there.

No music plays from the blow to the black: the impact, the fall's build and her heartbeat have it.

## The game's timing

Measured from Start in a full playthrough:

| From Start | Scene | Length |
|---|---|---|
| title screen | She dozes under the tree at night | as long as the player waits |
| 0.0 s | In to her face; she wakes | 6.5 s |
| 6.5 s | The camera turns to the sun; the gong pulse at about 15 s | 9 s |
| 15.5 s | Dawn, and back out to her on the edge | 7.8 s |
| 23.3 s | The edge rumbles; she steps off and drops | 8.4 s |
| 31.7 s | Up through the cloud | 5.1 s |
| 36.9 s | Free flight | 58.9 s |
| 95.8 s | The storm (7.3 s) to the blow, then her fall (5.2 s) to the black | 13 s |
| 108.8 s | She wakes under the tree; the sky; back to the title screen | about 28 s |

Hold to skip jumps from anywhere in the cutscene to the flight.

## Suno prompts

For each, turn on Instrumental, paste the style into Style of Music, the exclusions into Exclude Styles, and the structure into Lyrics. Suno won't land on exact seconds: generate a few, keep the one whose shape is closest, and cut it to the cue points above. The bars are laid out so they fall near them (at 60 BPM a bar is 4 s; at 96 BPM, 2.5 s).

Make the flight first. To carry its melody into the other two, use Suno's Cover on the flight track with their style, or upload a few bars of its theme as audio to build on, rather than hoping a fresh generation lands on the same tune.

Exclude Styles, for dawn (the flight and the title have their own):
```
guzheng, pipa, koto, plucked zither, shamisen, kung fu, vocals, singing, choir, chant, lyrics, spoken word, EDM, trap, pop beat, drum machine, electric guitar, rock, lo-fi
```

### 1. Awakening and dawn (Start to her on the edge, about 24 s)

Title: `Waking Above the Clouds - Dawn`

Style of Music:
```
Modern Chinese cinematic orchestral film score, instrumental, D minor pentatonic, 60 BPM, 4/4. Begins almost silent: a low string drone, an airy synth pad and a lone breathy xiao. A solo erhu takes a slow pentatonic melody as strings and French horns swell, tanggu drums and a soft synth pulse growing underneath, to one huge radiant climax like a sunrise: full orchestra and a bright cymbal swell. Then it opens out wide and majestic, a dizi soaring over sweeping strings and brass, and ends suspended and tense on an unresolved chord. Modern Chinese fantasy epic, emotional, reverent, awed.
```

Lyrics (structure):
```
[Intro]
[Instrumental: near silence, low string drone, airy pad, lone xiao, 2 bars]
[Build]
[Instrumental: erhu melody, strings and horns swelling, tanggu drums and synth pulse growing, 2 bars]
[Climax]
[Instrumental: full orchestra sunrise, cymbal swell, low end left clear]
[Reveal]
[Instrumental: wide majestic strings and brass, dizi soaring, awe, 2 bars]
[Outro]
[Instrumental: suspended, tense, unresolved, held]
[End]
```

In the game: `The Great Reveal` (a 3.5 min piece, in `art/audio/music/`) plays from its own start on the Start press. Its first swell peaks 15.0-15.7 s in, and the gong lands 15.56 s after Start, so it needs no cut there. `tools/process-audio.mjs` cuts it to 27 s, and `main.js` fades it out over 3 s from the edge (23.3 s), leaving room for the flight's intro.

For a new take: cut it so the climax lands at 15 s from Start, on the gong. Leave its very low end thin there, with no gong or deep hit of its own: the game's gong is already the deepest thing in the game.

### 2. The leap and flight: the main theme (her on the edge, the launch, the whole flight)

Title: `Waking Above the Clouds - Flight`

The piece follows her off the edge:

| From the edge (from Start) | She | The music |
|---|---|---|
| 0 s (23.3 s) | Stands on the edge as it rumbles | The dawn music plays on |
| 4.9 s (28.2 s) | Her feet leave the edge, and she falls | It eases out, and she falls in silence |
| 8.4 s (31.7 s) | Bursts back up through the cloud | This piece from its start: its quiet intro and a breath |
| 14.8 s (38.1 s) | The area's title | Its burst, 0.8 s later |
| 13.6 s (36.9 s) | Free flight | Eases into the elegant theme, which loops for the rest of the flight |

In the game: the dawn music plays on until she falls. As her feet leave the edge it eases out over 1 s, and she falls in silence. On the launch, `风过长空` (in `art/audio/music/`) starts from its beginning as `music-flight`: its quiet intro, a breath, and its burst (its first sound at 7.165 s). The burst comes 0.8 s after the area's title starts, as it shows (`FLIGHT_MUSIC` in `main.js`). It runs 76 s, which covers the 64 s from the launch to the storm and its 5 s fade. The storm comes in at 1:04.0 of it, where its C major phrase has ended and it turns dark (G, then B), so the music isn't cut off mid-phrase (`CRASH_AFTER` in `main.js`). The storm eases it out over 5 s, under `music-storm`'s rise. Skipping to the flight starts it partway in, so the burst still comes with the title.

Only the flight's music comes from this piece. The edge keeps the dawn music, and the fall is silent.

The playback mix lifts the flight recording's quiet opening by about 6 dB through track time 10.5 s, then smoothly returns to its normal level at 12 s (`introLift` in `src/audio.js`). This brings the opening forward without shifting the track, its 7.165 s burst, the title cue, or the storm. Skipped playback joins the envelope at the corresponding track time; cut and stop fades remain independent.

The flight and menu/ending tracks stream through HTML audio elements into the existing Web Audio mixer (`src/streamingMusic.js`). They are excluded from full-file decoding. The menu uses two reusable players for its six-second overlap; flight uses one. Menu loading starts at setup, and the first interaction primes all three players and begins buffering flight during the opening cinematic. Dawn, storm and short effects remain decoded buffers.

If loading or buffering delays flight playback, it seeks forward to the position of the original cue on the AudioContext clock. A hold or browser audio interruption pauses the media elements too. This preserves the intended musical timeline instead of restarting late; media starts/seeks are not sample-accurate and need browser listening checks. No track offsets, title timings or storm timings were changed.

Style of Music:
```
Contemporary cinematic orchestral score with Chinese solo instruments, instrumental, D Dorian, 96 BPM, 4/4. Opens hushed and tense: trembling string tremolo, high and low, a held breath of suspense, slowly rising. Then a sudden total silence. Then an instant epic burst: the full orchestra at full force, soaring brass and strings, timpani and a cymbal crash, a vast sense of lift. Then it eases into something elegant and flowing that can go on: spiccato string ostinatos and rippling woodwind figures, light percussion, a short understated motif on erhu with subtle slides and grace notes, passed between high strings, horns and a breathy dizi, over suspended chords that never fully resolve. Modern, graceful, airy, like wind over a vast sky. Sophisticated, not sentimental.
```

Exclude Styles:
```
cheesy, sentimental, melodramatic, saccharine, oriental cliche, pentatonic riff, new age, Disney, pop ballad, heroic anthem, guzheng, pipa, koto, harp, plucked zither, shamisen, kung fu, vocals, singing, choir, chant, lyrics, war drums, taiko, pounding drums, EDM, beat, drum machine, electric guitar, rock
```

Lyrics (structure):
```
[Intro]
[Instrumental: hushed, tense string tremolo, high and low, slowly rising, 2 bars]
[Break]
[Instrumental: total silence, 1 bar]
[Drop]
[Instrumental: sudden epic burst, full orchestra, soaring brass and strings, timpani and cymbal crash, 2 bars]
[Transition]
[Instrumental: the orchestra eases and settles, 2 bars]
[Theme]
[Instrumental: elegant and flowing, string ostinato, erhu states the short motif]
[Theme]
[Instrumental: high strings develop the motif, a breathy dizi answers, light percussion]
[Bridge]
[Instrumental: lighter, floating, woodwinds, celesta and strings]
[Theme]
[Instrumental: the motif at its fullest, strings and horns, graceful, never pounding]
```

From the elegant theme on, it should loop: find two bars where the theme comes round and cut the loop there, so the flight can run any length.

### 3. Main title and ending (the black to the title screen, then the title screen's loop, about 2-3 min)

Title: `Waking Above the Clouds - Main Title`

The world's own sound (the night wind, the island) should carry the title screen, and the music should sit inside it. That means a solo piano, sparse, with long silences between its phrases, and only a faint pad under it.

Style of Music:
```
Minimal contemporary solo piano, ambient, instrumental, D Aeolian, very slow and rubato, around 60 BPM. A soft felt piano plays sparse fragments of two or three notes, with long pauses and silence between them, letting every note ring out and decay. Open fifths and quiet suspended chords that don't resolve. Underneath, only a faint, barely-there pad and a soft low drone, with lots of empty space. Now and then a distant breathy xiao or a faint erhu plays a single short phrase from the flight's motif, very softly. Sparse, open, unhurried, no beat, no drums, no build, no climax, the same calm throughout so it can loop. Still, introspective, cool and understated, the hush of a night sky. Not sentimental.
```

Exclude Styles:
```
cheesy, sentimental, romantic, melodramatic, saccharine, oriental cliche, pentatonic riff, new age, lullaby, pop ballad, guzheng, pipa, koto, harp, plucked zither, vocals, singing, choir, lyrics, drums, percussion, beat, timpani, strings section, orchestra, epic, swell, crescendo, brass, dense, busy, arpeggios, lo-fi beat
```

Lyrics (structure):
```
[Intro]
[Instrumental: near silence, a faint pad, then a few soft piano notes, 2 bars]
[Memory]
[Instrumental: two or three piano notes from the flight's motif, a distant erhu answers once, 2 bars]
[Space]
[Instrumental: silence, a single piano note ringing out, 1 bar]
[Nocturne]
[Instrumental: sparse solo piano, long pauses, faint pad]
[Nocturne]
[Instrumental: a few piano notes far apart, a distant breathy xiao, lots of space]
[Nocturne]
[Instrumental: almost silent, pad and drone, a last soft piano phrase, no build, no ending]
```

In the game: `Hush of a Night Sky` (in `art/audio/music/`) is cut to its first 188 s, before its fade-out, and loops on itself with a 6 s crossfade. It is a bed: it comes in over about 3 s as she wakes and on the title screen, goes out over about 3 s on Start, and is kept under the night ambience (gain 0.55).

The first 28 s or so is the ending: she pants for breath at first (her breathing is in the sound effects, so keep the opening sparse), her sigh comes 11.2 s in, the camera turns up to the sky soon after, and the title screen comes back at about 28 s, where the nocturne should have begun. The nocturne is the title screen's loop: cut it on two bars where it comes round, with no build and no ending.

## ElevenLabs Music

`music-storm` is generated, levelled and checked like the sound effects (`tools/generate-audio.mjs`, `tools/process-audio.mjs`, `tools/verify-audio.mjs`; see `docs/audio.md`).
