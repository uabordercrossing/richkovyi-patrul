# Weapon sounds: real vs. game (arcade) versions

The game can use two different sets of sounds for pistol shot, rifle shot, and reload.
Headshot sound is not part of this switch — it always uses `sounds/headshot.mp3`.

## "Real" sounds (recorded samples) — in use before 2026-10-22

Realistic sampled audio loaded from files in [sounds/](sounds/):

- Pistol shot → `sounds/pistol-shot.mp3`
- Rifle shot → `sounds/rifle-shot.mp3`
- Reload → `sounds/reload.mp3`

Relevant code in `index.html` (as of commit `c956c55`):

```js
let hsBuf=null,pistolShotBuf=null,rifleShotBuf=null,reloadBuf=null;
...
shot:(big)=>{if(big){playBuf(rifleShotBuf,.3)}else{playBuf(pistolShotBuf,.3)}},
reload:(total)=>playBuf(reloadBuf,.3,reloadBuf?Math.max(0,total-reloadBuf.duration):0)
...
function loadSample(url,set){fetch(url).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(set).catch(()=>{})}
function loadSamples(){loadSample('sounds/headshot.mp3',b=>{hsBuf=b});loadSample('sounds/pistol-shot.mp3',b=>{pistolShotBuf=b});loadSample('sounds/rifle-shot.mp3',b=>{rifleShotBuf=b});loadSample('sounds/reload.mp3',b=>{reloadBuf=b})}
function playBuf(buf,vol,delay){if(!ac||!sndOn||!buf)return;const s=ac.createBufferSource();s.buffer=buf;const gn=ac.createGain();gn.gain.value=vol==null?1:vol;s.connect(gn);gn.connect(mg);s.start(ac.currentTime+(delay||0))}
```

Volume is 30% (`.3`), reload sample is timed so its end lines up with the end of the reload bar.

To restore: put the `sfx.shot` / `sfx.reload` lines above back into the `const sfx={...}` object in `index.html`.

## "Game" sounds (synthesized/arcade) — in use since 2026-10-22, ✅ confirmed by user

Procedurally synthesized using the existing Web Audio `nz()` (filtered noise burst) and `tn()` (tone) helpers — no sample files involved.

First pass (commit `abed4ed`) reused the old toy-blip version from commit `e0f22f0` (square/triangle oscillator beeps) — sounded too cartoonish. Replaced same day with a noise-based version (commit `31cbe9a`) meant to read as an actual gunshot — **user confirmed this noise-based version sounds good ("заебись")**. This is the reference version to restore if asked to bring back "game"/"arcade" sounds in the future:

```js
shot:(big)=>{const k=.95+Math.random()*.1;if(big){nz('bandpass',2000*k,650*k,.035,.5,.9);nz('lowpass',950*k,140*k,.1,.55,.5);tn('sine',140*k,45*k,.11,.3)}else{nz('highpass',3400*k,1100*k,.03,.55,.8);nz('bandpass',1400*k,350*k,.08,.42,1.3);tn('sine',190*k,55*k,.1,.26)}},
reload:(total)=>{const b=Math.max(0,total-.68);tn('square',700,350,.05,.07,b);tn('square',560,280,.05,.07,b+.22);tn('triangle',520,1040,.22,.12,b+.46)}
```

- `shot`: each call layers a short filtered-noise "crack" + a filtered-noise "body" + a low sine "thump", with a small random pitch jitter `k` per shot.
  - Pistol (`!big`): higher/brighter crack (`highpass` 3400→1100 Hz) and body, shorter — meant to read as a sharper pop.
  - Rifle (`big`, fired in bursts every ~0.08s): duller/lower crack (`bandpass` 2000→650 Hz) and a bigger `lowpass`-filtered low-end body — meant to sound more muffled/percussive ("хлёсткий") so a burst reads as automatic fire rather than a toy beep.
- `reload`: unchanged — three short square/triangle blips timed against the end of the reload bar (`total` = reload duration in seconds).

The `sounds/pistol-shot.mp3`, `sounds/rifle-shot.mp3`, `sounds/reload.mp3` files and their `loadSample` calls are left in place (unused while game sounds are active) so switching back to real sounds is a one-line swap.
