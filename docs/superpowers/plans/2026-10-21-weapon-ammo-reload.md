# Магазин зброї, перезарядка та прокачка боєзапасу — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current infinite-ammo weapon with a magazine system: 5 starting rounds, auto-reload with a real gunshot-cock sample when the mag empties, a left-side HUD (weapon icon + ammo gauge) during gameplay, and a new shop skill that lets a player who already owns a weapon upgrade its maximum ammo capacity. A burst (pistol's single shot, rifle's existing 3–5 round burst) consumes exactly **1** round, never per-bullet.

**Architecture:** Everything lives in the single `index.html` file (no build step, static page) — same pattern as the existing shop/weapon system (`docs/superpowers/plans/2026-10-21-shop-and-equipment.md`). This plan adds: new ammo/reload state next to the existing `wcd`/`burstN` weapon state, a 4th `SHOP_TRACKS` entry (`ammo`) reusing the generic shop-row renderer with one small addition (a "locked until weapon owned" state), a new embedded base64 audio sample decoded the same way as `PISTOL_SHOT_B64`/`RIFLE_SHOT_B64`, and a new HUD block drawn in `draw()` mirroring the existing top-right score text.

**Tech Stack:** Vanilla JS, Canvas 2D, Firebase Firestore (client SDK) for upgrade persistence. No test framework in this repo — verify manually via `scripts/dev.sh` + browser, same as the existing shop plan.

**Design context:** No separate spec doc was written for this bounded change — the design was agreed in chat (see conversation). Summary: base mag = 5 rounds (free), ammo capacity is its own shop track (5 levels, locked until weapon level ≥ 1), reload is automatic when the mag hits 0, reload duration is a placeholder per weapon type (pistol 1.1s / rifle 1.5s), HUD appears top-left only once a weapon is owned.

## Global Constraints

- Never `git push`, `wrangler deploy`, or ship any change live without asking the user first and getting an explicit yes — per `CLAUDE.md`. Commit locally after each task; do not push.
- Commit as `igorpielog` (inline `GIT_AUTHOR_*`/`GIT_COMMITTER_*` override) and do NOT add a Claude `Co-Authored-By` trailer — repo-specific rule.
- All new prices/capacities/reload times are explicit placeholders — implement as data, balance later.
- No server-side anti-cheat for coin spending — matches the existing trust model.
- Reuse the existing `pistolImg`/`ak47Img` sprite images for the HUD icon — do not add new sprite assets.

---

## How verification works in this plan

Start `scripts/dev.sh` once before Task 1 and leave it running (serves `index.html` directly — edits take effect on reload, no restart needed). Verification happens in the browser tool: buy upgrades in the shop, play a round, watch console for errors, and visually confirm HUD/reload behavior.

---

### Task 1: Embed the reload sound sample

**Files:**
- Modify: `index.html` (audio constants + `sfx` object)

**Interfaces:**
- Produces: `RELOAD_B64` (base64 mp3 string), `reloadBuf` (decoded `AudioBuffer`, loaded in `initAudio()`), `sfx.reload()`. Task 2 calls `sfx.reload()` when a reload begins.

- [ ] **Step 1: Start the local dev stack**

```bash
./scripts/dev.sh
```

Open `http://localhost:8123` in the browser tool, play one round, confirm the current game (incl. weapon fire) still works before touching anything.

- [ ] **Step 2: Convert the source WAV to a small mono mp3**

Source file: `/Users/igor/Downloads/405538__nebulasnails__pistol-cock.wav` (0.78s, stereo float WAV, 282KB raw — matches the existing `PISTOL_SHOT_B64`/`RIFLE_SHOT_B64` pattern which are short mp3s, ~33KB of base64 each).

In the session scratchpad directory, run:

```bash
ffmpeg -y -i "/Users/igor/Downloads/405538__nebulasnails__pistol-cock.wav" -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k reload.mp3
base64 -i reload.mp3 -o reload_b64.txt
wc -c reload_b64.txt
```

Expect roughly 10-15KB mp3 / ~14KB base64 text (verified during design: 10,425 bytes mp3 → 13,901 bytes base64).

- [ ] **Step 3: Add the `RELOAD_B64` constant**

Find (index.html, near line 183):

```js
const RIFLE_SHOT_B64='SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAxAAAAAAAAAAAAAAD/+3DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAA...'; // (full existing string, unchanged)
```

Add a new line immediately after it:

```js
const RELOAD_B64='<contents of reload_b64.txt>';
```

(Paste the full base64 string produced in Step 2 — do not truncate it.)

- [ ] **Step 4: Decode it in `initAudio()` and add `sfx.reload`**

Find (index.html, inside `initAudio()`):

```js
fetch('data:audio/mp3;base64,'+PISTOL_SHOT_B64).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(b=>{pistolShotBuf=b}).catch(()=>{});fetch('data:audio/mp3;base64,'+RIFLE_SHOT_B64).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(b=>{rifleShotBuf=b}).catch(()=>{});
```

Replace with:

```js
fetch('data:audio/mp3;base64,'+PISTOL_SHOT_B64).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(b=>{pistolShotBuf=b}).catch(()=>{});fetch('data:audio/mp3;base64,'+RIFLE_SHOT_B64).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(b=>{rifleShotBuf=b}).catch(()=>{});fetch('data:audio/mp3;base64,'+RELOAD_B64).then(r=>r.arrayBuffer()).then(b=>ac.decodeAudioData(b)).then(b=>{reloadBuf=b}).catch(()=>{});
```

Find the state line declaring `pistolShotBuf`/`rifleShotBuf` (index.html, near line 459):

```js
let ac=null,mg,nb,mo={},sndOn=true,vcOn=false,pd=0,cut=false,vk=0,vph=0,vo=null,pistolShotBuf=null,rifleShotBuf=null;
```

Replace with:

```js
let ac=null,mg,nb,mo={},sndOn=true,vcOn=false,pd=0,cut=false,vk=0,vph=0,vo=null,pistolShotBuf=null,rifleShotBuf=null,reloadBuf=null;
```

Find the `sfx` object's `shot` entry (index.html, near line 488 — it's the last key in the object, ends with `};`):

```js
shot:(big)=>{if(big){playBuf(rifleShotBuf,1)}else{playBuf(pistolShotBuf,1)}}};
```

Replace with:

```js
shot:(big)=>{if(big){playBuf(rifleShotBuf,1)}else{playBuf(pistolShotBuf,1)}},reload:()=>playBuf(reloadBuf,1)};
```

- [ ] **Step 5: Verify**

Reload the page, open devtools console, run `initAudio` by tapping to start a round, then in the console run `sfx.reload()` — confirm the pistol-cock sample plays with no errors. Commit this task on its own:

```
Add reload gunshot sample as embedded base64 audio
```

---

### Task 2: Ammo state, auto-reload, and burst-cost fix

**Files:**
- Modify: `index.html` (state declarations, `reset()`, weapon fire logic in `upd()`)

**Interfaces:**
- Produces: `ammo`, `maxAmmo`, `reloading`, `reloadT`, `needsReload` (state), `RELOAD_TIME` (const `{pistol, rifle}` lookup). Task 3's `applyUpgrades()` sets `maxAmmo`. Task 4's HUD reads `ammo`/`maxAmmo`/`reloading`/`reloadT`/`RELOAD_TIME`.

- [ ] **Step 1: Add ammo/reload state**

Find (index.html, near line 518):

```js
let boat,sw,fx,rp=[],bb=[],sp=[],dr=[],stn=[],score,esc,t,spawn,swing,cd,over,best=0,totalCoins=0,tx,ty,bl=[],wcd=0,burstN=0,burstT=0,burstTgt=null;
```

Replace with:

```js
let boat,sw,fx,rp=[],bb=[],sp=[],dr=[],stn=[],score,esc,t,spawn,swing,cd,over,best=0,totalCoins=0,tx,ty,bl=[],wcd=0,burstN=0,burstT=0,burstTgt=null,ammo=5,reloading=false,reloadT=0,needsReload=false;
```

Also declare `maxAmmo` early, because `applyUpgrades()` runs at load time (before this line) and would hit a temporal-dead-zone error otherwise. Right after `let upgrades={weapon:0,motor:0,belt:0,ammo:0};` (Task 3 Step 1) add:

```js
let maxAmmo=5;
const RELOAD_TIME={pistol:1.1,rifle:1.5};
```

- [ ] **Step 2: Reset ammo to full each round**

Find (index.html, `reset()`, near line 519):

```js
function reset(){boat={x:180,y:300};tx=180;ty=300;sw=[];fx=[];rp=[];bb=[];sp=[];dr=[];stn=[];bl=[];score=0;esc=0;t=0;spawn=0;swing=0;cd=0;wcd=0;burstN=0;burstT=0;burstTgt=null;over=false;updateLbBtn()}
```

Replace with:

```js
function reset(){boat={x:180,y:300};tx=180;ty=300;sw=[];fx=[];rp=[];bb=[];sp=[];dr=[];stn=[];bl=[];score=0;esc=0;t=0;spawn=0;swing=0;cd=0;wcd=0;burstN=0;burstT=0;burstTgt=null;ammo=maxAmmo;reloading=false;reloadT=0;needsReload=false;over=false;updateLbBtn()}
```

- [ ] **Step 3: Rewrite the weapon fire logic to spend 1 ammo per burst and auto-reload**

Find (index.html, near lines 538-539 — two adjacent lines, the `if(burstN>0){...}` block and the `else{...}` block right after it):

```js
 if(burstN>0){burstT-=d;if(burstT<=0){const wl=WEAPON_LEVELS[upgrades.weapon];if(burstTgt){const gx=boat.x-(wl.type==='rifle'?37:21),gy=(boat.y0||boat.y)-2,jit=(Math.random()-.5)*.12,ang=Math.atan2(burstTgt.y-gy,burstTgt.x-gx)+jit,dist=Math.hypot(burstTgt.x-gx,burstTgt.y-gy),spd=Math.max(80,dist/.12);bl.push({x:gx,y:gy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,target:burstTgt,life:.6});sfx.shot(wl.type==='rifle')}burstN--;burstT=.08}}
 else{wcd-=d;if(upgrades.weapon>0&&wcd<=0){const wl=WEAPON_LEVELS[upgrades.weapon],gx=boat.x-12,gy=(boat.y0||boat.y)-2;let tgt=null,bd=wl.range;for(const s of sw)if(s.st==='swim'){const dd=Math.hypot(s.x-gx,s.y-gy);if(dd<bd){bd=dd;tgt=s}}if(tgt){wcd=wl.cd;burstTgt=tgt;burstN=wl.type==='rifle'?3+(Math.random()*3|0):1;burstT=0}}}
```

Replace with:

```js
 if(burstN>0){burstT-=d;if(burstT<=0){const wl=WEAPON_LEVELS[upgrades.weapon];if(burstTgt){const gx=boat.x-(wl.type==='rifle'?37:21),gy=(boat.y0||boat.y)-2,jit=(Math.random()-.5)*.12,ang=Math.atan2(burstTgt.y-gy,burstTgt.x-gx)+jit,dist=Math.hypot(burstTgt.x-gx,burstTgt.y-gy),spd=Math.max(80,dist/.12);bl.push({x:gx,y:gy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,target:burstTgt,life:.6});sfx.shot(wl.type==='rifle')}burstN--;burstT=.08;if(burstN<=0&&needsReload){reloading=true;reloadT=RELOAD_TIME[wl.type];needsReload=false;sfx.reload()}}}
 else if(reloading){reloadT-=d;if(reloadT<=0){reloading=false;ammo=maxAmmo}}
 else{wcd-=d;if(upgrades.weapon>0&&wcd<=0&&ammo>0){const wl=WEAPON_LEVELS[upgrades.weapon],gx=boat.x-12,gy=(boat.y0||boat.y)-2;let tgt=null,bd=wl.range;for(const s of sw)if(s.st==='swim'){const dd=Math.hypot(s.x-gx,s.y-gy);if(dd<bd){bd=dd;tgt=s}}if(tgt){wcd=wl.cd;burstTgt=tgt;burstN=wl.type==='rifle'?3+(Math.random()*3|0):1;burstT=0;ammo--;if(ammo<=0)needsReload=true}}}
```

Key behavior: ammo decrements by 1 the instant a burst is triggered (not per bullet). If that was the last round, `needsReload` is set but reload doesn't start until the burst finishes firing its bullets (so a rifle's 3-5 round burst always completes before the mag visibly empties). While `reloading` is true, the `wcd`-cooldown branch is skipped entirely, so no new burst can start — matches "no shooting during reload".

- [ ] **Step 4: Verify**

Buy weapon level 1 (pistol) in the shop (dev coin seed button if needed), start a round, let the pistol fire 5 times, confirm: ammo depletes, reload sound plays after the 5th shot, weapon doesn't fire for ~1.1s, then resumes. Repeat buying up to rifle level (4-5) and confirm a burst only costs 1 round (count bullets vs. ammo decrements via a temporary `console.log(ammo)` if needed, then remove it). Commit:

```
Add magazine/ammo system with auto-reload, 1 ammo per burst
```

---

### Task 3: "Ammo capacity" shop track (locked until weapon owned)

**Files:**
- Modify: `index.html` (new icon, new level table, `SHOP_TRACKS`, `renderShop()`, `buyUpgrade()`, `applyUpgrades()`, cloud load, `upgrades` object)

**Interfaces:**
- Produces: `upgrades.ammo` (persisted level 0-5), `AMMO_LEVELS`, `ICON_MAG`. Depends on Task 2's `maxAmmo`/`ammo` state (this task is what actually changes `maxAmmo` via `applyUpgrades()`).

- [ ] **Step 1: Add the `upgrades.ammo` field**

Find (index.html, near line 184):

```js
let upgrades={weapon:0,motor:0,belt:0};
```

Replace with:

```js
let upgrades={weapon:0,motor:0,belt:0,ammo:0};
```

- [ ] **Step 2: Add `AMMO_LEVELS` and wire `maxAmmo` into `applyUpgrades()`**

Find (index.html, near line 209-210, right after `BELT_LEVELS` array closes and before the `let DUR=...` line):

```js
let DUR=.4,BELT_RADIUS=52,BOAT_SPEED=240,CUT_TIME=.35;
function applyUpgrades(){
 DUR=BELT_LEVELS[upgrades.belt].dur;
 BELT_RADIUS=BELT_LEVELS[upgrades.belt].radius;
 BOAT_SPEED=240*MOTOR_LEVELS[upgrades.motor].speedMul;
 CUT_TIME=MOTOR_LEVELS[upgrades.motor].cutTime;
}
```

Replace with:

```js
const AMMO_LEVELS=[
 {capacity:5,cost:0},
 {capacity:7,cost:70},
 {capacity:9,cost:150},
 {capacity:12,cost:300},
 {capacity:16,cost:550},
 {capacity:20,cost:900}
];
let DUR=.4,BELT_RADIUS=52,BOAT_SPEED=240,CUT_TIME=.35;
function applyUpgrades(){
 DUR=BELT_LEVELS[upgrades.belt].dur;
 BELT_RADIUS=BELT_LEVELS[upgrades.belt].radius;
 BOAT_SPEED=240*MOTOR_LEVELS[upgrades.motor].speedMul;
 CUT_TIME=MOTOR_LEVELS[upgrades.motor].cutTime;
 maxAmmo=AMMO_LEVELS[upgrades.ammo].capacity;
}
```

Note: `applyUpgrades()` is already called once at load time (`applyUpgrades();` right after the function, per existing code) and again inside `initCloudProgress` after loading saved levels — both will now also set `maxAmmo`. `reset()` (Task 2) copies `maxAmmo` into `ammo` at the start of each round, so a capacity purchase takes effect on the next round, not retroactively mid-round — consistent with how belt/motor upgrades already apply.

- [ ] **Step 3: Add the `ICON_MAG` icon**

Find (index.html, near line 227, right after `ICON_BELT`):

```js
const ICON_BELT='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="8.5" width="4" height="7" rx="1" fill="currentColor"/></svg>';
```

Add immediately after it:

```js
const ICON_MAG='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="3" width="8" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="6" width="4" height="2.4" fill="currentColor"/><rect x="10" y="9.4" width="4" height="2.4" fill="currentColor"/><path d="M9 15l1 6h4l1-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
```

- [ ] **Step 4: Add the `ammo` track to `SHOP_TRACKS`, with a `lockedIf`/`lockedMsg`**

Find (index.html, near line 303-306):

```js
const SHOP_TRACKS=[
 {key:'weapon',name:'Зброя',icon:ICON_GUN,levels:WEAPON_LEVELS,desc:n=>(WEAPON_LEVELS[n].type==='pistol'?'Пістолет':'Автомат')+', радіус '+WEAPON_LEVELS[n].range+'px, кулдаун '+WEAPON_LEVELS[n].cd+'с'},
 {key:'motor',name:'Мотор',icon:ICON_MOTOR,levels:MOTOR_LEVELS,desc:n=>'Швидкість ×'+MOTOR_LEVELS[n].speedMul.toFixed(2)+', розрізання '+MOTOR_LEVELS[n].cutTime.toFixed(2)+'с'},
 {key:'belt',name:'Весло',icon:ICON_BELT,levels:BELT_LEVELS,desc:n=>'Замах '+BELT_LEVELS[n].dur.toFixed(2)+'с, радіус '+BELT_LEVELS[n].radius+'px'}
];
```

Replace with:

```js
const SHOP_TRACKS=[
 {key:'weapon',name:'Зброя',icon:ICON_GUN,levels:WEAPON_LEVELS,desc:n=>(WEAPON_LEVELS[n].type==='pistol'?'Пістолет':'Автомат')+', радіус '+WEAPON_LEVELS[n].range+'px, кулдаун '+WEAPON_LEVELS[n].cd+'с'},
 {key:'motor',name:'Мотор',icon:ICON_MOTOR,levels:MOTOR_LEVELS,desc:n=>'Швидкість ×'+MOTOR_LEVELS[n].speedMul.toFixed(2)+', розрізання '+MOTOR_LEVELS[n].cutTime.toFixed(2)+'с'},
 {key:'belt',name:'Весло',icon:ICON_BELT,levels:BELT_LEVELS,desc:n=>'Замах '+BELT_LEVELS[n].dur.toFixed(2)+'с, радіус '+BELT_LEVELS[n].radius+'px'},
 {key:'ammo',name:'Магазин',icon:ICON_MAG,levels:AMMO_LEVELS,desc:n=>'Магазин на '+AMMO_LEVELS[n].capacity+' патронів',lockedIf:()=>upgrades.weapon===0,lockedMsg:'Спочатку купіть зброю'}
];
```

- [ ] **Step 5: Teach `renderShop()`/`buyUpgrade()` about `lockedIf`**

Find (index.html, `renderShop()`, near lines 307-321):

```js
function renderShop(){
 document.getElementById('shopCoins').innerHTML='Монети: '+totalCoins;
 const list=document.getElementById('shopList');
 list.innerHTML='';
 for(const tr of SHOP_TRACKS){
  const lvl=upgrades[tr.key],max=tr.levels.length-1,next=lvl+1,maxed=lvl>=max;
  const price=maxed?0:tr.levels[next].cost;
  const descText=maxed?'Максимальний рівень':'Наступний рівень: '+tr.desc(next);
  const row=document.createElement('div');
  row.className='shopRow';
  row.innerHTML=`<span class="shopIcon">${tr.icon}</span><span class="shopInfo"><b>${tr.name} · рівень ${lvl}/${max}</b><span>${descText}</span></span><button class="buyBtn" ${maxed||totalCoins<price?'disabled':''}>${maxed?'Максимум':'+'+price}</button>`;
  if(!maxed)row.querySelector('.buyBtn').onclick=()=>buyUpgrade(tr.key);
  list.appendChild(row);
 }
}
```

Replace with:

```js
function renderShop(){
 document.getElementById('shopCoins').innerHTML='Монети: '+totalCoins;
 const list=document.getElementById('shopList');
 list.innerHTML='';
 for(const tr of SHOP_TRACKS){
  const locked=!!(tr.lockedIf&&tr.lockedIf());
  const lvl=upgrades[tr.key],max=tr.levels.length-1,next=lvl+1,maxed=lvl>=max;
  const price=maxed?0:tr.levels[next].cost;
  const descText=locked?tr.lockedMsg:(maxed?'Максимальний рівень':'Наступний рівень: '+tr.desc(next));
  const row=document.createElement('div');
  row.className='shopRow';
  row.innerHTML=`<span class="shopIcon">${tr.icon}</span><span class="shopInfo"><b>${tr.name} · рівень ${lvl}/${max}</b><span>${descText}</span></span><button class="buyBtn" ${locked||maxed||totalCoins<price?'disabled':''}>${locked?'—':maxed?'Максимум':'+'+price}</button>`;
  if(!locked&&!maxed)row.querySelector('.buyBtn').onclick=()=>buyUpgrade(tr.key);
  list.appendChild(row);
 }
}
```

`buyUpgrade()` (near lines 323-335) needs no change — it's only ever invoked from a click handler that Step 5 now withholds when `locked` is true, so a locked track can't be purchased around the UI.

- [ ] **Step 6: Load/save `upgrades.ammo` from Firestore**

Find (index.html, `initCloudProgress`, near line 282):

```js
if(data.upgrades)upgrades={weapon:data.upgrades.weapon||0,motor:data.upgrades.motor||0,belt:data.upgrades.belt||0};
```

Replace with:

```js
if(data.upgrades)upgrades={weapon:data.upgrades.weapon||0,motor:data.upgrades.motor||0,belt:data.upgrades.belt||0,ammo:data.upgrades.ammo||0};
```

(`buyUpgrade()`'s existing Firestore write already does `upgrades:{[track]:next}`, which works unchanged for `track==='ammo'` since it's generic over `track`.)

- [ ] **Step 7: Verify**

Reload the page. Confirm the shop shows 4 rows; "Магазин" (ammo) row is disabled with "Спочатку купіть зброю" before any weapon is bought. Buy weapon level 1, confirm the ammo row unlocks and shows a price. Buy ammo level 1-2, confirm `upgrades.ammo` persists after a page reload (check the Firestore emulator UI at `http://localhost:4000`, `progress` collection). Start a round and confirm `ammo`/`maxAmmo` reflect the new capacity (e.g. via temporary `console.log`, then remove). Commit:

```
Add ammo-capacity shop track, locked until a weapon is owned
```

---

### Task 4: Left-side HUD — weapon icon + ammo gauge / reload progress

**Files:**
- Modify: `index.html` (`draw()`)

**Interfaces:**
- Consumes: `upgrades.weapon`, `WEAPON_LEVELS`, `ammo`, `maxAmmo`, `reloading`, `reloadT`, `RELOAD_TIME`, `pistolImg`, `ak47Img` (all already produced by Tasks 1-3 and the existing weapon system).

- [ ] **Step 1: Add the HUD block to `draw()`**

Find (index.html, near lines 581-583 — right after the existing top-right score text):

```js
 g.textAlign='right';g.fillText('Врятувалось: '+esc+'/5   Рахунок: '+score,W-10,22);
```

Add immediately after it (keep `g.textAlign='right'` line above untouched, this is a new statement on its own):

```js
 if(upgrades.weapon>0){
  const wl=WEAPON_LEVELS[upgrades.weapon],hx=10,hy=8,iw=wl.type==='rifle'?34:20,ih=wl.type==='rifle'?13:11;
  g.save();if(wl.type==='pistol'){if(pistolImg.complete)g.drawImage(pistolImg,hx,hy,iw,ih)}else if(ak47Img.complete)g.drawImage(ak47Img,hx,hy,iw,ih);g.restore();
  const barX=hx+iw+6,barY=hy+1,barW=60,barH=9;
  g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.roundRect(barX,barY,barW,barH,3);g.fill();
  if(reloading){
   const p=Math.max(0,Math.min(1,1-reloadT/RELOAD_TIME[wl.type]));
   g.fillStyle='rgba(255,170,60,.9)';g.beginPath();g.roundRect(barX,barY,barW*p,barH,3);g.fill();
  }else{
   const p=ammo/maxAmmo;
   g.fillStyle='rgba(255,213,74,.95)';g.beginPath();g.roundRect(barX,barY,barW*p,barH,3);g.fill();
   if(maxAmmo<=10){g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;for(let i=1;i<maxAmmo;i++){const dx=barX+barW*(i/maxAmmo);g.beginPath();g.moveTo(dx,barY);g.lineTo(dx,barY+barH);g.stroke()}}
  }
  g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=1;g.beginPath();g.roundRect(barX,barY,barW,barH,3);g.stroke();
  g.textAlign='left';g.fillStyle='#fff';g.font='bold 11px system-ui';g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=3;
  g.fillText(reloading?'Перезарядка':(ammo+'/'+maxAmmo),barX,barY+barH+13);
 }
```

This runs every frame inside `draw()`, after shadow/font state is already set up by the score line above it, and resets `g.textAlign`/`g.font`/`g.shadowBlur` afterward are not needed since the next drawing statements in `draw()` (the `stn`/`rp`/`bb` particle loops) set their own `fillStyle`/`strokeStyle` and don't depend on `textAlign` or shadow being reset — matches the existing code's habit of not resetting state defensively between blocks (e.g. `g.shadowBlur=0` is explicitly set before the particle loops already).

- [ ] **Step 2: Verify visually**

With a pistol owned (ammo 5/5): confirm a small pistol icon + a full yellow bar with 4 tick marks appear top-left, label "5/5". Fire until empty: confirm bar drains per shot, then switches to an orange reload-progress bar with label "Перезарядка" for ~1.1s, then returns to a full yellow bar "5/5". Upgrade to rifle (level 4-5): confirm the icon switches to the AK-47 sprite and reload takes ~1.5s. Buy an ammo-capacity level ≥12 and confirm the bar drops the tick marks (smooth fill only) and the label shows the new max (e.g. "12/12"). Take a screenshot and share it. Commit:

```
Add left-side weapon/ammo HUD during gameplay
```

---

## Final check

- [ ] Play a full round start-to-finish with a rifle + maxed ammo capacity, confirm no console errors, confirm reload/HUD/shop all agree with each other, confirm belt/motor upgrades (untouched by this plan) still work.
- [ ] Re-read `CLAUDE.md`: do not `git push` — stop after the last commit and ask the user before pushing or deploying anything.
