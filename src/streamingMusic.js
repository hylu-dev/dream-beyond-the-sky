// Long tracks use the browser's media buffer, never a full decoded AudioBuffer.
// AudioContext time remains the cue clock. A late load/seek catches up to that
// clock; pausing also pauses the media elements (suspending Web Audio alone
// would leave them running silently). Media starts are not sample-accurate.
export function createStreamingMusic(ctx, destination, sounds, url) {
  let unlocked = false, held = false, destroyed = false;
  const tracks = new Map();

  function makeSlot(track) {
    const media = new Audio();
    media.preload = 'none';
    media.src = `${url}${track.name}.mp3`;
    const source = ctx.createMediaElementSource(media);
    const envelope = ctx.createGain();
    const fade = ctx.createGain();
    envelope.gain.value = 0;
    source.connect(envelope).connect(fade).connect(track.gain);
    const slot = { track, media, source, envelope, fade, prepared: false,
      active: false, generation: 0, cycle: -1, at: 0, offset: 0,
      stopAt: Infinity, cut: false, attempting: false, blocked: false,
      audible: false, resync: true, primed: false };
    const ready = () => service(slot);
    const waiting = () => { slot.audible = false; slot.resync = true; mute(slot); };
    const playing = () => {
      // Let a silent priming play resolve before pausing it in attempt().
      // Pausing inside its playing event can abort that pending play promise.
      if (!slot.active) return;
      if (held || destroyed) { media.pause(); return; }
      slot.audible = true;
      // play() and seeking may have taken time after canplay. Recheck at the
      // actual playback event, not only when we first requested playback.
      slot.resync = true;
      service(slot);
    };
    const ended = () => release(slot);
    const error = () => {
      release(slot);
      slot.blocked = true;
      console.warn(`Music ${track.name} unavailable.`, media.error);
    };
    slot.listeners = { loadedmetadata: ready, canplay: ready, seeked: ready,
      waiting, playing, ended, error };
    for (const [type, fn] of Object.entries(slot.listeners)) media.addEventListener(type, fn);
    return slot;
  }

  for (const [name, spec] of Object.entries(sounds)) {
    if (!spec.stream) continue;
    const gain = ctx.createGain();
    gain.gain.value = spec.loop ? 0 : spec.gain;
    gain.connect(destination);
    const track = { name, spec, gain, target: 0, value: 0, seconds: 0.5, origin: null, slots: [] };
    track.slots = Array.from({ length: spec.loop ? 2 : 1 }, () => makeSlot(track));
    tracks.set(name, track);
  }

  function prepare(name) {
    for (const slot of tracks.get(name)?.slots ?? []) {
      if (slot.prepared) continue;
      slot.prepared = true;
      slot.media.preload = 'auto';
      slot.media.load();
    }
  }

  function mute(slot) {
    // These nodes are reused: assigning AudioParam.value alone does not
    // override a prior automation event that is still approaching its target.
    slot.envelope.gain.cancelScheduledValues(ctx.currentTime);
    slot.envelope.gain.setValueAtTime(0, ctx.currentTime);
  }

  function release(slot) {
    slot.generation++;
    slot.active = slot.audible = false;
    slot.cut = false;
    slot.media.pause();
    mute(slot);
    slot.fade.gain.cancelScheduledValues(ctx.currentTime);
    slot.fade.gain.setValueAtTime(1, ctx.currentTime);
  }

  // All three reusable elements are primed from the user's gesture. Their
  // envelope is silent unless assigned a live cue. Retry policy failures only
  // on another gesture, not every frame, and absorb intentional pause aborts.
  function attempt(slot, prime = false) {
    if (slot.attempting || slot.blocked || destroyed) return;
    if (!prime && (!slot.active || held || !unlocked || ctx.state !== 'running')) return;
    const generation = slot.generation;
    slot.attempting = true;
    slot.media.play().then(() => {
      slot.primed = true;
      if (!slot.active || held || destroyed || ctx.state !== 'running' || ctx.currentTime < slot.at) slot.media.pause();
    }).catch(error => {
      if (destroyed) return;
      if (error.name === 'NotAllowedError') slot.blocked = true;
      else if (generation === slot.generation && error.name !== 'AbortError') {
        slot.blocked = true;
        console.warn(`Music ${slot.track.name} could not play.`, error);
      }
    }).finally(() => { slot.attempting = false; });
  }

  function assign(slot, at, offset, cut = false, cycle = -1) {
    release(slot);
    slot.active = true;
    slot.at = at;
    slot.offset = offset;
    slot.cut = cut;
    slot.cycle = cycle;
    slot.stopAt = Infinity;
    slot.resync = true;
    service(slot);
  }

  function service(slot) {
    if (!slot.active || destroyed) return;
    const now = ctx.currentTime;
    const position = slot.offset + Math.max(0, now - slot.at);
    const media = slot.media;
    if (now >= slot.stopAt || (Number.isFinite(media.duration) && position >= media.duration)) {
      release(slot);
      return;
    }
    if (!unlocked || held || ctx.state !== 'running' || now < slot.at || slot.blocked) return;
    if (media.readyState < 2 || media.seeking) return;
    if (slot.resync) {
      slot.resync = false;
      if (Math.abs(media.currentTime - position) > 0.1) {
        slot.audible = false;
        mute(slot);
        media.currentTime = position;
        return; // seeked/canplay (or the next update) resumes at the cue time
      }
    }
    if (media.paused) attempt(slot);
    if (!slot.audible) return;
    let level = 1;
    const { spec } = slot.track;
    if (spec.loop) {
      const overlap = Math.min(spec.crossfade, media.duration / 4);
      level = Math.sin(Math.min(position / overlap, 1) * Math.PI / 2)
        * Math.sin(Math.min(Math.max(media.duration - position, 0) / overlap, 1) * Math.PI / 2);
    }
    const lift = spec.introLift;
    if (lift && position < lift.end) {
      const u = Math.min(Math.max((position - lift.hold) / (lift.end - lift.hold), 0), 1);
      level *= 1 + (lift.gain - 1) * (1 - u * u * (3 - 2 * u));
    }
    slot.envelope.gain.setTargetAtTime(level, now, 0.015);
  }

  function fadeOut(slot, seconds) {
    if (!slot.active) return;
    slot.cut = false;
    if (!slot.audible || seconds <= 0) { release(slot); return; }
    slot.fade.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    slot.stopAt = Math.min(slot.stopAt, ctx.currentTime + seconds);
  }

  function update(dt = 0) {
    if (!unlocked || held || destroyed || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const track of tracks.values()) {
      if (track.spec.loop) {
        track.value += (track.target - track.value) * (1 - Math.exp(-dt / Math.max(track.seconds, 1e-3)));
        track.gain.gain.setTargetAtTime(track.value * track.spec.gain, now, 0.05);
        if (track.target === 0 && track.value <= 1e-3) {
          if (track.origin !== null) {
            for (const slot of track.slots) release(slot);
            track.origin = null;
          }
          continue;
        }
        prepare(track.name);
        const duration = track.slots[0].media.duration;
        if (!Number.isFinite(duration) || duration <= 0) continue;
        if (track.origin === null) track.origin = now;
        const period = duration - Math.min(track.spec.crossfade, duration / 4);
        const cycle = Math.floor((now - track.origin) / period);
        const slot = track.slots[cycle % 2];
        if (slot.cycle !== cycle || !slot.active) assign(slot, track.origin + cycle * period, 0, false, cycle);
      }
      for (const slot of track.slots) service(slot);
    }
  }

  const stateChanged = () => {
    if (ctx.state !== 'running') {
      for (const track of tracks.values()) for (const slot of track.slots) {
        slot.media.pause();
        slot.audible = false;
        mute(slot);
        slot.resync = true;
      }
    } else update();
  };
  ctx.addEventListener('statechange', stateChanged);

  return {
    prepare,
    unlock() {
      if (destroyed) return;
      unlocked = true;
      for (const track of tracks.values()) {
        // First interaction is early enough to buffer flight during the opening.
        prepare(track.name);
        for (const slot of track.slots) {
          slot.blocked = false;
          if (!held && !slot.primed) attempt(slot, true);
        }
      }
      update();
    },
    set held(value) {
      if (held === value) return;
      held = value;
      for (const track of tracks.values()) for (const slot of track.slots) {
        if (held) { slot.media.pause(); slot.audible = false; mute(slot); }
        slot.resync = true;
      }
      if (!held) update();
    },
    level(name, value, seconds) {
      const track = tracks.get(name);
      track.target = Math.min(Math.max(value, 0), 1);
      track.seconds = seconds;
    },
    play(name, { gain = 1, offset = 0, delay = 0, cut = false } = {}) {
      const track = tracks.get(name);
      prepare(name);
      track.gain.gain.value = track.spec.gain * gain;
      assign(track.slots[0], ctx.currentTime + delay, offset, cut);
    },
    stop(name, seconds) {
      for (const slot of tracks.get(name)?.slots ?? []) fadeOut(slot, seconds);
    },
    cut(seconds) {
      for (const track of tracks.values()) for (const slot of track.slots) if (slot.cut) fadeOut(slot, seconds);
    },
    update,
    stats() {
      return [...tracks.values()].map(track => ({ name: track.name, players: track.slots.length,
        active: track.slots.filter(slot => slot.active).length,
        positions: track.slots.map(slot => slot.media.currentTime),
        ready: track.slots.map(slot => slot.media.readyState),
      }));
    },
    destroy() {
      destroyed = true;
      ctx.removeEventListener('statechange', stateChanged);
      for (const track of tracks.values()) {
        for (const slot of track.slots) {
          release(slot);
          for (const [type, fn] of Object.entries(slot.listeners)) slot.media.removeEventListener(type, fn);
          slot.media.removeAttribute('src');
          slot.media.load();
          slot.source.disconnect();
          slot.envelope.disconnect();
          slot.fade.disconnect();
        }
        track.gain.disconnect();
      }
    },
  };
}
