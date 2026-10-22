// The loading screen's bar. None of the loaders report bytes, so each load
// ticks off its own share - its rough size, in MB - as it finishes, and the
// bar creeps on into what is still coming so it never sits still, without
// ever reaching the end before the last of it is in. finish() runs it to the
// end; main.js then fades the bar into the menu's Start.

export const LOADING_DEFAULTS = {
  creep: 0.8, // of what is still coming, at most, the bar runs ahead into
  creepSeconds: 12, // how slowly it gets there
  follow: 0.08, // of the way to its goal the bar moves each frame
  finishFollow: 0.25, // and once it is all in
};

export function createLoadingBar(el, options = {}) {
  const o = { ...LOADING_DEFAULTS, ...options };
  const started = performance.now();
  let total = 0, done = 0, shown = 0, finishing = null;

  function draw() {
    el.style.setProperty('--p', shown.toFixed(4));
    el.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
  }

  function frame() {
    const coming = total - done;
    const ahead = coming * o.creep * (1 - Math.exp(-(performance.now() - started) / 1000 / o.creepSeconds));
    const goal = finishing ? 1 : total > 0 ? (done + ahead) / total : 0;
    shown += (goal - shown) * (finishing ? o.finishFollow : o.follow);
    if (finishing && shown > 0.998) {
      shown = 1;
      draw();
      finishing();
      return;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // Counts `promise` toward the bar, `weight` its share; hands it back.
    track(promise, weight = 1) {
      total += weight;
      promise.then(() => (done += weight), () => {});
      return promise;
    },
    // Fills the bar, then resolves.
    finish() {
      return new Promise((resolve) => (finishing = resolve));
    },
  };
}
