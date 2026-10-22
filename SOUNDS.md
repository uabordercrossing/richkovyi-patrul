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

## "Game" sounds (synthesized/arcade) — switched to on 2026-10-22

Procedurally synthesized toy-style blips using the existing Web Audio `tn()` (tone) helper — no sample files involved. Originally introduced in commit `e0f22f0` ("Replace real gunshot and reload samples with synthesized toy sounds"), later reverted; restored again now.

```js
shot:(big)=>{const k=.94+Math.random()*.12;if(big){tn('square',1500*k,400,.06,.07);tn('triangle',700*k,200,.06,.14)}else{tn('square',1100*k,260,.11,.09);tn('sine',500*k,120,.08,.18)}},
reload:(total)=>{const b=Math.max(0,total-.68);tn('square',700,350,.05,.07,b);tn('square',560,280,.05,.07,b+.22);tn('triangle',520,1040,.22,.12,b+.46)}
```

- `shot`: rifle (`big`) is a higher-pitched square+triangle blip; pistol is a lower-pitched square+sine blip, with slight random pitch jitter each time.
- `reload`: three short blips timed against the end of the reload bar (`total` = reload duration in seconds).

The `sounds/pistol-shot.mp3`, `sounds/rifle-shot.mp3`, `sounds/reload.mp3` files and their `loadSample` calls are left in place (unused while game sounds are active) so switching back to real sounds is a one-line swap.
