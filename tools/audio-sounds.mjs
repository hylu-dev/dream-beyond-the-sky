// Every sound in the game, as generated with ElevenLabs' sound-effects model
// (tools/generate-audio.mjs). `takes` are generated per sound and `use`
// names the ones that ship (tools/process-audio.mjs; the first, unless it
// says); a sound that recurs (a bank, a cliff going by) ships several and
// plays one at random. `fade` is the seconds a one-shot's tail fades over,
// for one that ends abruptly. `loop` sounds are made to loop seamlessly and
// loop in src/audio.js; everything else is a one-shot. A `layer` is
// generated only to be mixed into others: a sound with `mix` is built from
// layers, one list per file it ships, each layer [sound, take, dB, delay in
// seconds, ffmpeg filter], every layer first brought to one loudness so the
// dB are between layers, and `mixFilter` run over the whole. A layer named
// 'lavfi' is synthesized by ffmpeg from the source in its take's place, and
// `reverb` ({ seconds, wet }) puts the mix in a long dark space. `lufs`
// makes a sound louder (or quieter) than the rest, for the big moments. No music: that is made separately, and nothing of the girl
// sleeping, stepping or falling.

const NO_MUSIC = 'No music, no melody, no voices.';
const BED = 'Seamless steady loop, no distinct events.';
// Starts a layer on its attack rather than its first faint sound.
const ATTACK = 'silenceremove=start_periods=1:start_threshold=-30dB:start_silence=0';

export const SOUNDS = [
  // ── The island at night, and the dawn ───────────────────────────────────
  {
    name: 'night-bed', loop: true, seconds: 30, takes: 3, use: [2], influence: 0.5,
    text: `Clearly audible steady wind blowing across a high open mountain plateau at night: a smooth, soft, airy whoosh with a gentle low hum, slowly swelling and easing. Pure wind tone. ${BED} No rustling, no animals, no music.`,
  },
  {
    name: 'dawn-bed', loop: true, seconds: 30, takes: 2, use: [2], influence: 0.5,
    text: `Clearly audible early morning ambience on a high mountain meadow: a lively chorus of songbirds chirping and singing from the trees nearby and in the distance, a soft breeze through grass and leaves, open airy space. ${BED} No music, no voices.`,
  },
  {
    name: 'island-wind', loop: true, seconds: 30, takes: 2, use: [2], influence: 0.5,
    text: `Clearly audible strong wind across a high exposed cliff top: deep powerful gusts of air surging and easing, a full roaring airflow with a low rumbling weight. Pure wind. ${BED} No rustling, no leaves, no whistle, no animals, no music.`,
  },
  {
    name: 'rumble', loop: true, seconds: 10, takes: 1,
    text: `Low deep earth rumble, a rock ledge trembling under the feet, faint dirt and tiny pebbles trickling. Ominous sub-bass tremor. ${BED} ${NO_MUSIC}`,
  },

  // ── The menu and the cinematic ──────────────────────────────────────────
  {
    name: 'ui-hover', seconds: 0.6, takes: 3, use: [1], influence: 0.6,
    text: 'Very soft subtle UI hover sound: a single gentle dry wooden tick with a faint breathy air tail. Minimal and quiet. No music.',
  },
  {
    name: 'ui-start', seconds: 2.5, takes: 3, use: [1], influence: 0.5,
    text: 'Elegant start confirmation: one soft low wooden temple block knock blended with a silky airy whoosh that rises and fades. Warm, calm, single hit. No melody, no music.',
  },
  {
    name: 'approach-swell', seconds: 3, takes: 2, use: [1], fade: 0.3,
    text: `Slow soft cinematic air swell: a gentle breathy whoosh rising and settling, faint low hum of wind, smooth and intimate. ${NO_MUSIC}`,
  },
  {
    name: 'turn-swell', seconds: 8, takes: 2, use: [2], fade: 0.5,
    text: `Slow rising airy swell as a camera lifts up toward a sunrise: soft wind building gently and opening out wide, warm and expansive, ending softly. ${NO_MUSIC}`,
  },
  // The pulse of light: a deep Chinese gong, in layers.
  {
    name: 'gong-tamtam', layer: true, seconds: 10, takes: 2, influence: 0.5,
    text: 'A huge deep Chinese tam-tam gong struck softly with a large felt mallet: a low dark roar that blooms and swells for a second after the hit, then a long rich shimmering decay. Single strike, deep and resonant. No music, no melody.',
  },
  {
    name: 'gong-chau', layer: true, seconds: 10, takes: 2, influence: 0.5,
    text: 'A large Chinese chau gong struck firmly once: a powerful crashing wash of bronze, dense metallic overtones swirling and ringing out over a long decay. Single strike. No music, no melody.',
  },
  {
    name: 'gong-sub', layer: true, seconds: 6, takes: 2, influence: 0.5,
    text: 'Very deep sub-bass boom: a giant felt-mallet hit on a huge drum blended with a low cinematic sub drop, a warm rumbling tail. Single hit. No music.',
  },
  {
    name: 'gong-shimmer', layer: true, seconds: 8, takes: 2, influence: 0.5,
    text: 'Bowed bronze gong shimmer: a high glassy metallic singing tone rising and swelling, airy and ethereal, then fading slowly. No music, no melody.',
  },
  {
    name: 'gong-boom', layer: true, seconds: 10, takes: 3, influence: 0.55,
    text: 'Massive cinematic deep boom: an enormous low bronze bell toll and a giant gong struck together, a huge sub-bass impact and a long dark resonant swell rolling out across a vast cavernous space. Monumental, ominous and awe-inspiring. Single hit. No music, no melody.',
  },
  {
    name: 'gong-toll', layer: true, seconds: 10, takes: 2, influence: 0.55,
    text: 'One enormous ancient temple bell tolling very low and slow: a deep dark bronze bong with a heavy hum and long resonant decay, heard from inside a vast stone hall. Single toll. No music, no melody.',
  },
  {
    // Struck at once, as the ring leaves the sun, and deep as a cathedral: a
    // huge boom and its bloom, a temple bell's toll pitched down for the
    // bronze, a breath of tam-tam, and a sub that drops from 70 to 38 Hz
    // (with its octave, so small speakers carry it), under a low pass and a
    // long dark reverb.
    name: 'pulse', seconds: 14, fade: 3, lufs: -12,
    mix: [[
      ['gong-boom', 1, 0, 0, 'bass=g=4:f=50'],
      ['gong-boom', 2, -3, 0],
      ['gong-toll', 2, -5, 0, 'asetrate=44100*0.8,aresample=44100'],
      ['gong-tamtam', 1, -12, 0, 'asetrate=44100*0.75,aresample=44100'],
      ['lavfi', `aevalsrc='(sin(2*PI*(38*t+10.7*(1-exp(-3*t))))+0.35*sin(4*PI*(38*t+10.7*(1-exp(-3*t)))))*exp(-0.45*t)*(1-exp(-400*t))':s=44100:d=9`, -1],
    ]],
    mixFilter: 'lowpass=f=1000,lowpass=f=1000,bass=g=3:f=55',
    reverb: { seconds: 7, wet: 0.45 },
  },
  {
    name: 'launch', seconds: 4, takes: 3, use: [1], fade: 0.4,
    text: 'Powerful upward rushing whoosh of a person shooting up into the sky at speed right past the camera: a violent burst of air and heavy fabric flapping, wind roar swelling and then easing off. No music.',
  },
  {
    name: 'cloth-flap', loop: true, seconds: 8, takes: 1,
    text: `Loose martial arts clothing and wide fabric sleeves flapping and fluttering hard in strong wind, close. ${BED} No wind howl, no music.`,
  },
  {
    name: 'cloud-pass', seconds: 4, takes: 3, use: [2],
    text: 'Flying through a dense cloud: a soft muffled whoosh of thick damp air enveloping the listener, an airy hiss swelling and passing, gentle. No music.',
  },
  {
    name: 'ui-skip', seconds: 1.2, takes: 2, use: [2], influence: 0.5,
    text: 'Quick soft airy whoosh sweeping away into silence, a smooth cinematic cut-to-black transition. No music.',
  },
  {
    name: 'area-reveal', seconds: 5, takes: 2, use: [1], fade: 0.6, influence: 0.5,
    text: 'Soft title reveal: one gentle low resonant bronze bowl strike with a long airy shimmering wind tail fading out, peaceful and spacious. Single strike, no melody, no music.',
  },

  // ── Flight ──────────────────────────────────────────────────────────────
  {
    name: 'flight-wind', loop: true, seconds: 30, takes: 1,
    text: `Steady rushing wind heard by someone gliding fast through open sky: smooth broadband airflow rushing past the ears, soft low rumble underneath. No whistle, no gusts. ${BED} ${NO_MUSIC}`,
  },
  {
    name: 'flight-whistle', loop: true, seconds: 20, takes: 1,
    text: `High altitude wind whistling softly past the ears: airy thin whistle and hiss rising and falling gently, cold thin air. ${BED} ${NO_MUSIC}`,
  },
  {
    name: 'turbulence', loop: true, seconds: 15, takes: 1,
    text: `Turbulent buffeting wind in flight: rough gusty air pockets thumping and buffeting, fabric fluttering, low rumbling gusts. ${BED} ${NO_MUSIC}`,
  },
  {
    name: 'sky-bed', loop: true, seconds: 30, takes: 2, use: [2],
    text: `Vast open sky ambience far above a sea of clouds: very soft distant airy wind, deep calm spacious atmosphere, peaceful and airy. ${BED} ${NO_MUSIC}`,
  },
  {
    name: 'bank-whoosh', seconds: 1.5, takes: 3, use: [1, 2, 3], influence: 0.6,
    text: 'One single smooth swooping whoosh of air, a person banking into a turn while flying, a little cloth flutter. Only one whoosh, then silence. No music.',
  },
  {
    name: 'impact-crack', layer: true, seconds: 2, takes: 3, influence: 0.6,
    text: 'Violent close-mic foley: a cliff of stone cracking and shattering under a massive blow, a sharp splintering rock snap and gritty crunch, very loud and dry. Single hit. No music.',
  },
  {
    name: 'impact-boom', layer: true, seconds: 5, takes: 3, influence: 0.6,
    text: 'Enormous cinematic trailer impact: a gigantic deep boom slam with a hard punchy low thump, a sub-bass drop and a long dark rumbling tail. Single hit. No music, no melody.',
  },
  {
    name: 'hit-punch', layer: true, seconds: 2, takes: 4, influence: 0.7,
    text: 'One single massive cinematic impact hit: a giant deep punchy thud, like a colossal fist slamming into a mountain, a tight heavy low-end punch with a short dark decay. Exactly one hit and nothing after it. No music, no melody, no whoosh.',
  },
  {
    name: 'hit-body', layer: true, seconds: 1.5, takes: 4, influence: 0.7,
    text: 'Close-mic foley: a body slamming hard into a solid rock face, one heavy dull meaty thud with a cloth whump and a short gritty scrape of stone. Exactly one hit, no voice, no footsteps, nothing after. No music.',
  },
  {
    name: 'hit-tail', layer: true, seconds: 5, takes: 3, influence: 0.6,
    text: 'The deep low rumble left after a giant impact against a mountain: a dark heavy resonance rolling out and slowly decaying, a few small stones settling faintly far off. No new hits, no music, no melody.',
  },
  {
    // Her blow against the cliff at the end of the flight (crash.js), the
    // hardest hit in the game, built as one blow: every layer starts on its
    // attack, and the foley is cut short before anything in it could read
    // as a second hit. The punch and a synthesized kick (160 Hz falling to
    // 45) are the blow; the body thud and the stone crunch make it a body
    // against rock, on any speaker; the trailer boom, a sub drop (55 Hz
    // falling to 30) and the rumble rolling away are its weight.
    name: 'cliff-impact', seconds: 4, fade: 1.5, lufs: -16,
    mix: [[
      ['hit-punch', 1, 0, 0, ATTACK],
      ['lavfi', `aevalsrc='sin(2*PI*(45*t+4.6*(1-exp(-25*t))))*exp(-7*t)*(1-exp(-2000*t))':s=44100:d=1`, -4],
      ['hit-body', 3, 3, 0, `${ATTACK},atrim=0:0.4,afade=t=out:st=0.25:d=0.15,highpass=f=90`],
      ['impact-crack', 3, -1, 0, `${ATTACK},atrim=0:0.35,afade=t=out:st=0.2:d=0.15,highpass=f=250`],
      ['impact-boom', 1, -12, 0, `${ATTACK},lowpass=f=180,atrim=0:2.5,afade=t=out:st=0.4:d=2.1`],
      ['hit-tail', 2, -11, 0.05, 'lowpass=f=500,afade=t=in:d=0.08,afade=t=out:st=0.8:d=3'],
      ['lavfi', `aevalsrc='sin(2*PI*(30*t+6.25*(1-exp(-4*t))))*exp(-2.5*t)*(1-exp(-300*t))':s=44100:d=3`, -10],
    ]],
    // Driven a little into a soft clip, which shaves the peaks rather than
    // the decay: louder for its peak, and the saturation's overtones put the
    // low end on small speakers too. A short dark space round it.
    mixFilter: 'volume=8dB,asoftclip=type=tanh,volume=-8dB',
    reverb: { seconds: 2, wet: 0.2 },
  },
  {
    name: 'cliff-pass', seconds: 3, takes: 3, use: [1, 2, 3],
    text: 'A huge floating rock cliff rushing past at speed: a deep heavy whoosh of air compressing against stone, a doppler air sweep passing close and receding. No music.',
  },
  {
    name: 'birds-distant', seconds: 4, takes: 3, use: [1, 3],
    text: 'A distant flock of swifts calling high in an open sky: faint airy chirps and a few soft wing flutters far away. No music.',
  },
];
