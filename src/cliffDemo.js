import { Vec3 } from 'playcanvas';
import { Scene, Environment } from '@viggle/splat-engine';
import { loadCliffAssets } from './cliffAssets.js';
import { createWindFx } from './windFx.js';
import { createFlight } from './flight.js';
import { createFlightAir } from './flightAir.js';
import { smooth } from './sprites.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const status = $('loading');

async function start() {
  const scene = await Scene.create(canvas, { fov: 58, near: .1, far: 5000 });
  scene.start();
  const [assets, sky] = await Promise.all([
    loadCliffAssets(scene),
    Environment.load(scene, '/assets/cloud-realm.spz', { scale: 6.065 * 30 }),
  ]);
  // Same realm and bearing as the flying game, viewed along -Z in this study.
  sky.entity.setEulerAngles(0, 180 - 120, 0);
  scene.getOrCreateCameraFrame();
  const cliffs = assets.variants.map((_, i) => {
    const cliff = assets.instantiate(i);
    cliff.entity.setPosition(-18, 0, 0);
    cliff.entity.enabled = i === 0;
    return cliff;
  });
  const flight = createFlight({ headingDeg: 180 });
  flight.reset({ x: 7, y: 2, z: 65 }, 180);
  const camera = scene.cameraEntity;
  const wind = createWindFx(scene, {
    clouds: 8, spritesPerCloud: 16, streaks: 0, cloudAhead: 240,
    baseColor: [.6, .62, .8], topColor: [1, .86, .68],
  });
  wind.enabled = true;
  wind.reset(flight, camera);
  // Every bank is the game's existing cloud asset and shader. The clusters
  // straddle front/back and remain attached to the base, ledges and shoulders.
  const banks = [
    [-22,-21,2,17,.95], [-10,-19,5,13,.95],
    [-26,13,-5,10,.7], [-29,9,4,8,.65],
    [-14,-3,11,7,.65], [-9,11,-6,8,.65],
    [-23,-8,11,8,.8], [-6,-15,3,11,.9],
  ];
  banks.forEach(([x,y,z,r,opacity], i) => wind.anchorCloud(i, new Vec3(x,y,z), r, { opacity }));
  const air = createFlightAir(scene);
  air.reset(flight);

  let variant = 0, mode = 'inspect', paused = false, clouds = true;
  let clock = 0, orbitYaw = .48, orbitHeight = 26, orbitDistance = 63;
  let dragging = false, pointerX = 0, pointerY = 0;
  const target = new Vec3(), delta = new Vec3();
  const curtain = document.createElement('div');
  Object.assign(curtain.style, { position: 'fixed', inset: '0', background: '#8892a4', pointerEvents: 'none', opacity: '0' });
  document.body.insertBefore(curtain, document.querySelector('header'));

  function setMode(value) {
    mode = value;
    clock = 0;
    $('fly').setAttribute('aria-pressed', String(mode === 'fly'));
    $('inspect').setAttribute('aria-pressed', String(mode === 'inspect'));
    air.enabled = mode === 'fly';
    air.reset(flight);
    air.enabled = mode === 'fly';
  }
  for (const button of document.querySelectorAll('[data-variant]')) {
    button.addEventListener('click', () => {
      variant = Number(button.dataset.variant);
      cliffs.forEach((cliff, i) => { cliff.entity.enabled = i === variant; });
      for (const b of document.querySelectorAll('[data-variant]')) b.setAttribute('aria-pressed', String(b === button));
      $('title').textContent = assets.variants[variant].name;
      clock = 0;
    });
  }
  $('fly').addEventListener('click', () => setMode('fly'));
  $('inspect').addEventListener('click', () => setMode('inspect'));
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').setAttribute('aria-pressed', String(paused));
    $('pause').textContent = paused ? 'Resume' : 'Pause';
  });
  $('clouds').addEventListener('click', () => {
    clouds = !clouds;
    wind.enabled = clouds;
    $('clouds').setAttribute('aria-pressed', String(clouds));
  });
  $('restart').addEventListener('click', () => {
    clock = 0;
    orbitYaw = .48; orbitHeight = 26; orbitDistance = 63;
    air.reset(flight); air.enabled = mode === 'fly';
  });
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'inspect') return;
    dragging = true; pointerX = event.clientX; pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    orbitYaw -= (event.clientX - pointerX) * .006;
    orbitHeight = Math.max(-25, Math.min(55, orbitHeight + (event.clientY - pointerY) * .09));
    pointerX = event.clientX; pointerY = event.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { dragging = false; });
  canvas.addEventListener('wheel', event => {
    if (mode !== 'inspect') return;
    event.preventDefault();
    orbitDistance = Math.max(27, Math.min(95, orbitDistance + event.deltaY * .04));
  }, { passive: false });

  function update(rawDt) {
    const dt = paused ? 0 : Math.min(rawDt, .05);
    clock += dt;
    const t = clock % 20 / 20;
    if (mode === 'fly') {
      camera.setPosition(7 + Math.sin(t * Math.PI) * 1.3, 2 + Math.sin(t * Math.PI * 2) * .45, 65 - t * 120);
      const p = camera.getPosition();
      target.set(p.x - 9, p.y - .8, p.z - 35);
      camera.lookAt(target);
      camera.rotateLocal(0, 0, Math.sin(t * Math.PI * 2) * 1.2);
      curtain.style.opacity = String(1 - smooth(0, .045, t) * smooth(1, .955, t));
      $('pass').textContent = t < .3 ? 'Approaching the cliff' : t < .6 ? 'Passing the painted face' : 'Leaving the cloud bank';
    } else {
      camera.setPosition(-18 + Math.sin(orbitYaw) * orbitDistance, orbitHeight, Math.cos(orbitYaw) * orbitDistance);
      camera.lookAt(-18, 0, 0);
      curtain.style.opacity = '0';
      $('pass').textContent = 'Drag to orbit · scroll to move closer';
    }
    const p = camera.getPosition();
    sky.entity.setPosition(p.x, p.y, p.z);
    flight.state.pos.copy(p);
    flight.state.altitude = p.y;
    flight.state.time += dt;
    const distance = delta.copy(p).sub(cliffs[variant].entity.getPosition()).length();
    for (const instance of cliffs[variant].instances) {
      instance.setParameter('cliff_haze', .045 + smooth(20, 110, distance) * .28);
    }
    wind.visibility = Number($('cover').value) / 100;
    wind.update(dt, flight, camera);
    air.update(dt, flight, camera);
  }
  setMode('inspect');
  update(0);
  scene.app.on('update', update);
  status.hidden = true;
  // Read-only diagnostics plus explicit review controls for local verification.
  window.__cliffDemo = {
    scene, assets, cliffs, wind, flight, setMode,
    stats: () => ({ ready: true, variant, mode, paused, clouds, ...wind.stats(), triangles: assets.variants[variant].triangles }),
  };
}

start().catch(error => {
  console.error('Cliff preview failed', error);
  status.querySelector('strong').textContent = 'Preview could not load';
  status.querySelector('span').textContent = `${error.message || error}. Reload to retry.`;
});
