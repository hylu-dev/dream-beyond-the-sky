// A controllable media transport for lifecycle tests, not a browser decoder.
export class TestMedia extends EventTarget {
  static instances = [];
  static durations = {};
  constructor() {
    super();
    TestMedia.instances.push(this);
    this.src = '';
    this.preload = '';
    this.duration = NaN;
    this.readyState = 0;
    this.paused = true;
    this.seeking = false;
    this.position = 0;
    this.loads = this.plays = 0;
    this.blockPlay = false;
    this.autoReady = true;
    this.deferPlay = false;
    this.pendingPlays = [];
    // Like iOS Safari: preload is a hint it may ignore, buffering only once
    // play() is called.
    this.bufferOnPlay = false;
  }
  get name() { return this.src.split('/').at(-1).replace(/\.mp3$/, ''); }
  get currentTime() { return this.position; }
  set currentTime(value) {
    this.position = value;
    this.seeking = true;
    queueMicrotask(() => {
      this.seeking = false;
      this.dispatchEvent(new Event('seeked'));
      if (!this.paused && !this.deferPlay) this.dispatchEvent(new Event('playing'));
    });
  }
  ready() {
    this.duration = TestMedia.durations[this.name] ?? (this.name === 'music-night' ? 188 : 76);
    this.readyState = 4;
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('canplay'));
    // A play() waiting on data starts once it arrives, as browsers do.
    if (!this.paused && !this.deferPlay) this.dispatchEvent(new Event('playing'));
  }
  load() {
    this.loads++;
    if (this.src && this.autoReady && !this.bufferOnPlay) this.ready();
  }
  play() {
    this.plays++;
    if (this.blockPlay) return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'));
    this.paused = false;
    if (this.bufferOnPlay && this.readyState < 2) queueMicrotask(() => this.ready());
    if (this.deferPlay) return new Promise(resolve => this.pendingPlays.push(resolve));
    if (this.readyState >= 2) queueMicrotask(() => {
      if (!this.paused) this.dispatchEvent(new Event('playing'));
    });
    return Promise.resolve();
  }
  finishPlay() {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    for (const resolve of this.pendingPlays.splice(0)) resolve();
  }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  // A paused element whose buffer the browser has dropped, as iOS does
  // under memory pressure: metadata only, and no more data until play().
  purge() {
    this.readyState = 1;
  }
  stall() {
    this.readyState = 1;
    this.dispatchEvent(new Event('waiting'));
  }
  tick(dt) {
    if (this.paused || this.seeking || this.readyState < 2) return;
    this.position += dt;
    if (this.position >= this.duration) {
      this.position = this.duration;
      this.paused = true;
      this.dispatchEvent(new Event('ended'));
    }
  }
}
