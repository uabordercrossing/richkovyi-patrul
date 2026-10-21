# Магазин і прокачка екіпіровки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shop where players spend the existing `totalCoins` currency to permanently upgrade three equipment tracks (weapon, motor, belt), so invested players can keep up with the game's rising difficulty and rack up bigger scores.

**Architecture:** Everything lives in the single `index.html` file (no build step, no bundler — the project is a static page served directly, and splitting files now would add tooling risk for no real benefit). New game state (`upgrades`), three static level tables, and a small `applyUpgrades()` function translate upgrade levels into the existing gameplay constants (`DUR`, belt catch radius, boat speed, jar-cut timer) and a new weapon/bullet subsystem. The shop is a modal reusing the existing `#avModal`/`#lbModal` visual pattern. Upgrade levels persist in the same Firestore `progress/{uid}` document that already stores `coins`/`best`/`avatar`.

**Tech Stack:** Vanilla JS, Canvas 2D, Firebase Firestore (client SDK, compat build), Firebase Auth custom token (via the Cloudflare Worker in `worker/`). No test framework exists in this repo and none is being introduced — this is a hand-rolled `requestAnimationFrame` canvas game with no unit-testable seams. Every task is verified manually against the local dev stack (`scripts/dev.sh`, Firebase emulators) using the browser.

**Spec:** [docs/superpowers/specs/2026-10-21-shop-and-equipment-design.md](../specs/2026-10-21-shop-and-equipment-design.md)

## Global Constraints

- Never `git push`, `wrangler deploy`, or ship any change live without asking the user first and getting an explicit yes, even for changes that look low-risk — per `CLAUDE.md`. Commit locally after each task; do not push.
- End every commit message with: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- All prices/cooldowns/radii in the level tables are explicit placeholders (per the spec) — implement them as data, don't hand-wring over exact balance numbers.
- No server-side anti-cheat for coin spending — matches the existing trust model (`awardCoins` already lets the client dictate the amount).

---

## How verification works in this plan

There's no `npm test` here. "Run the test" steps mean: start the local stack with `scripts/dev.sh` (Firebase emulators + Worker + static file server on `http://localhost:8123`), open it in the browser tool, and check the specific behavior described — console errors, visual state, Firestore emulator data (via `http://localhost:4000` emulator UI, Firestore tab, `progress` collection). Each task says exactly what to look at.

Start the stack once before Task 1 and leave it running across all tasks (it serves static files directly, so edits to `index.html` take effect on page reload — no restart needed unless you touch `worker/` or Firestore rules).

---

### Task 1: Upgrade data model, persistence, and belt/motor gameplay wiring

**Files:**
- Modify: `index.html` (single file, multiple anchors — see steps)

**Interfaces:**
- Produces: `upgrades` (object `{weapon,motor,belt}`, levels 0-5), `WEAPON_LEVELS`/`MOTOR_LEVELS`/`BELT_LEVELS` (arrays of level-stat objects), `applyUpgrades()` (recomputes `DUR`/`BELT_RADIUS`/`BOAT_SPEED`/`CUT_TIME` from `upgrades`), `DUR`/`BELT_RADIUS`/`BOAT_SPEED`/`CUT_TIME` (now `let`, previously hardcoded literals). Task 3 (shop UI) reads `upgrades`/`*_LEVELS` and calls `applyUpgrades()`. Task 4 (weapon) reads `upgrades.weapon`/`WEAPON_LEVELS`.

- [ ] **Step 1: Start the local dev stack**

Run (background, leave it running for the rest of this plan):

```bash
./scripts/dev.sh
```

Open `http://localhost:8123` in the browser tool. Play one round manually (tap to start, tap to move+swing, let a couple of people escape) to confirm the baseline game works before touching anything.

- [ ] **Step 2: Add upgrade state, level tables, and `applyUpgrades()`**

In `index.html`, find this exact line:

```js
let cloudDisplayName='',cloudFirstName='',cloudLastName='',cloudAvatar='soldier_cap';
```

Replace it with:

```js
let cloudDisplayName='',cloudFirstName='',cloudLastName='',cloudAvatar='soldier_cap';
let upgrades={weapon:0,motor:0,belt:0};
const WEAPON_LEVELS=[null,
 {type:'pistol',cd:1.8,range:90,cost:50},
 {type:'pistol',cd:1.4,range:100,cost:120},
 {type:'pistol',cd:1.0,range:110,cost:250},
 {type:'rifle',cd:.5,range:130,cost:500},
 {type:'rifle',cd:.3,range:150,cost:900}
];
const MOTOR_LEVELS=[
 {speedMul:1,cutTime:.35,cost:0},
 {speedMul:1.12,cutTime:.31,cost:60},
 {speedMul:1.24,cutTime:.27,cost:140},
 {speedMul:1.36,cutTime:.23,cost:280},
 {speedMul:1.48,cutTime:.19,cost:550},
 {speedMul:1.60,cutTime:.15,cost:950}
];
const BELT_LEVELS=[
 {dur:.40,radius:52,cost:0},
 {dur:.368,radius:57,cost:50},
 {dur:.336,radius:62,cost:120},
 {dur:.304,radius:66,cost:250},
 {dur:.272,radius:71,cost:500},
 {dur:.24,radius:76,cost:900}
];
let DUR=.4,BELT_RADIUS=52,BOAT_SPEED=240,CUT_TIME=.35;
function applyUpgrades(){
 DUR=BELT_LEVELS[upgrades.belt].dur;
 BELT_RADIUS=BELT_LEVELS[upgrades.belt].radius;
 BOAT_SPEED=240*MOTOR_LEVELS[upgrades.motor].speedMul;
 CUT_TIME=MOTOR_LEVELS[upgrades.motor].cutTime;
}
applyUpgrades();
```

- [ ] **Step 3: Remove the now-duplicate `DUR` constant**

Find:

```js
const W=360,H=560,TOP=120,BOT=440,FY=BOT+52,DUR=.4;
```

Replace with:

```js
const W=360,H=560,TOP=120,BOT=440,FY=BOT+52;
```

(`DUR` is now the `let` declared in Step 2, which runs earlier in the same script.)

- [ ] **Step 4: Load persisted upgrades in `initCloudProgress`**

Find:

```js
   cloudAvatar=data.avatar||'soldier_cap';
  }
  docRef.set({firstName,lastName},{merge:true}).catch(()=>{});
```

Replace with:

```js
   cloudAvatar=data.avatar||'soldier_cap';
   if(data.upgrades)upgrades={weapon:data.upgrades.weapon||0,motor:data.upgrades.motor||0,belt:data.upgrades.belt||0};
  }
  applyUpgrades();
  docRef.set({firstName,lastName},{merge:true}).catch(()=>{});
```

- [ ] **Step 5: Wire belt catch radius into `aim()` and `catchNow()`**

Find:

```js
function aim(){let b=null,bd=52;
```

Replace with:

```js
function aim(){let b=null,bd=BELT_RADIUS;
```

Find:

```js
Math.hypot(s.x-boat.x,s.y-boat.y)<52
```

Replace with:

```js
Math.hypot(s.x-boat.x,s.y-boat.y)<BELT_RADIUS
```

- [ ] **Step 6: Wire boat speed into `upd(d)`**

Find:

```js
const v=Math.min(240*d,L);boat.x+=dx/L*v;boat.y+=dy/L*v
```

Replace with:

```js
const v=Math.min(BOAT_SPEED*d,L);boat.x+=dx/L*v;boat.y+=dy/L*v
```

- [ ] **Step 7: Turn the instant jar-cut into a timed cut using `CUT_TIME`**

Find this exact block:

```js
for(const s of sw)if(s.st==='swim'&&s.jar&&Math.hypot(s.x-(boat.x-40),s.y-boat.y)<24){s.jar=0;sfx.glass();stn.push({x:s.x,y:s.y,t:0,bits:Array.from({length:4},()=>({a:Math.random()*6.28,d:6+Math.random()*10,r:1.2+Math.random()*1.6}))});fx.push({x:s.x,y:s.y-10,t:.9,s:'Слава Україні!'});for(let k=0;k<2;k++)rp.push({x:s.x,y:s.y,r:3,t:.9,d:k*.15})}
```

Replace with:

```js
for(const s of sw)if(s.st==='swim'&&s.jar){if(Math.hypot(s.x-(boat.x-40),s.y-boat.y)<24){s.cutT=(s.cutT||0)+d;if(s.cutT>=CUT_TIME){s.jar=0;sfx.glass();stn.push({x:s.x,y:s.y,t:0,bits:Array.from({length:4},()=>({a:Math.random()*6.28,d:6+Math.random()*10,r:1.2+Math.random()*1.6}))});fx.push({x:s.x,y:s.y-10,t:.9,s:'Слава Україні!'});for(let k=0;k<2;k++)rp.push({x:s.x,y:s.y,r:3,t:.9,d:k*.15})}}else s.cutT=0}
```

- [ ] **Step 8: Scale the belt swing's visual arm/arc length with `BELT_RADIUS`**

Find:

```js
beltAt(sx,sy,sdir+o,64);
```

Replace with:

```js
beltAt(sx,sy,sdir+o,BELT_RADIUS+12);
```

Find:

```js
g.arc(sx,sy,56,sdir+Math.max(-1.9,o-1.1),sdir+o);
```

Replace with:

```js
g.arc(sx,sy,BELT_RADIUS+4,sdir+Math.max(-1.9,o-1.1),sdir+o);
```

- [ ] **Step 9: Verify — baseline behavior is unchanged**

Reload `http://localhost:8123`. Open the browser console (`read_console_messages`) and confirm there are no errors. Play a round: belt swing timing/radius and boat speed should feel identical to before Step 2 (since `upgrades` defaults to `{weapon:0,motor:0,belt:0}`, which maps to the exact same numbers as the old hardcoded constants). Cutting a juice-pack floatie should now take a brief, barely-noticeable dwell (~0.35s) instead of being instant — confirm the "Слава Україні!" effect still fires when you hold the boat's wake over a floatie-carrying swimmer for a moment.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add upgrade data model and wire belt/motor stats to it

Introduces upgrades state + level tables for weapon/motor/belt and
routes the existing belt radius, swing duration, boat speed, and
juice-pack cut timer through them. All upgrades default to level 0,
which reproduces the previous hardcoded constants exactly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Dev-only test currency button

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `IS_DEV` (existing), `awardCoins(amount)` (existing), `totalCoins` (existing, declared later in the same script but only read inside a click handler, so no temporal-dead-zone issue).
- Produces: a visible `#devCoinsBtn` button when running on `localhost`/`127.0.0.1`, for seeding coins during local testing (this task exists so Task 3/4 can be tested without grinding score for an hour).

- [ ] **Step 1: Add the button to the HTML bar, hidden by default**

Find:

```html
<div id="bar"><button id="snd" class="iconBtn"></button></div>
```

Replace with:

```html
<div id="bar"><button id="snd" class="iconBtn"></button><button id="devCoinsBtn" class="devBtn" style="display:none">+5000 монет (тест)</button></div>
```

- [ ] **Step 2: Add minimal styling**

Find:

```css
#avClose{align-self:flex-end;font-size:14px}
```

Replace with:

```css
#avClose{align-self:flex-end;font-size:14px}
.devBtn{font-size:12px;padding:4px 8px}
```

- [ ] **Step 3: Wire it up, gated to `IS_DEV`**

Find:

```js
initCloudProgress();
```

Replace with:

```js
initCloudProgress();
if(IS_DEV){
 const devBtn=document.getElementById('devCoinsBtn');
 devBtn.style.display='inline-block';
 devBtn.onclick=()=>{totalCoins+=5000;if(cloudReady&&cloudUid)awardCoins(5000)};
}
```

- [ ] **Step 4: Verify**

Reload `http://localhost:8123` (served from `localhost`, so `IS_DEV` is true). Confirm the "+5000 монет (тест)" button is visible in the top bar. Click it a few times. Finish a round and check the coin total shown on the game-over screen increases accordingly. Open `http://localhost:4000`, Firestore tab, `progress` collection, find your dev user's document, confirm `coins` increased.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add dev-only button to seed test coins

Lets upgrades be tested locally without grinding score for coins.
Only rendered when IS_DEV is true (localhost/127.0.0.1); never
visible in production.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Shop modal UI and purchase flow

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `upgrades`, `WEAPON_LEVELS`/`MOTOR_LEVELS`/`BELT_LEVELS`, `applyUpgrades()` (Task 1); `totalCoins`, `cloudReady`, `cloudUid`, `db` (existing).
- Produces: `openShop()`, `renderShop()`, `buyUpgrade(track)`, `updateShopBtn()`, `SHOP_TRACKS` (array of `{key,name,icon,levels,desc(nextLevel)}`). `updateShopBtn()` is called at every point that flips `started`/`over` so the button only shows on the start screen and the result screen, never during an active round.

- [ ] **Step 1: Add the shop button to the bar**

Find (this is the result of Task 2's Step 1 — make sure Task 2 landed first):

```html
<div id="bar"><button id="snd" class="iconBtn"></button><button id="devCoinsBtn" class="devBtn" style="display:none">+5000 монет (тест)</button></div>
```

Replace with:

```html
<div id="bar"><button id="snd" class="iconBtn"></button><button id="devCoinsBtn" class="devBtn" style="display:none">+5000 монет (тест)</button><button id="shopBtn" class="devBtn"></button></div>
```

- [ ] **Step 2: Add the shop modal markup**

Find:

```html
<div id="avModal"><div class="card">
 <h2>Вибір аватара</h2>
 <div id="avGrid"></div>
 <button id="avClose"><span class="btnIcon"></span> Закрити</button>
</div></div>
```

Replace with:

```html
<div id="avModal"><div class="card">
 <h2>Вибір аватара</h2>
 <div id="avGrid"></div>
 <button id="avClose"><span class="btnIcon"></span> Закрити</button>
</div></div>
<div id="shopModal"><div class="card">
 <div class="lbHead"><h2>Магазин</h2><button id="shopClose" class="closeX"></button></div>
 <div id="shopCoins"></div>
 <div id="shopList"></div>
</div></div>
```

- [ ] **Step 3: Add shop CSS**

Find:

```css
.devBtn{font-size:12px;padding:4px 8px}
```

Replace with:

```css
.devBtn{font-size:12px;padding:4px 8px}
#shopBtn{display:none}
#shopModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);align-items:center;justify-content:center;z-index:12}
#shopModal .card{background:linear-gradient(#1c2d4c,#131f36);color:#eef2f8;border:2px solid rgba(255,255,255,.22);box-shadow:0 14px 34px rgba(0,0,0,.5)}
#shopCoins{font-weight:700;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.15)}
.shopRow{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid rgba(255,255,255,.1)}
.shopRow:last-child{border-bottom:none}
.shopIcon{width:28px;height:28px;flex:none}
.shopIcon svg{width:100%;height:100%;display:block}
.shopInfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.shopInfo b{font-size:13px}
.shopInfo span{font-size:11px;opacity:.75}
.buyBtn{font-size:12px;padding:5px 9px;white-space:nowrap;color:inherit}
.buyBtn:disabled{opacity:.4}
```

- [ ] **Step 4: Add shop icons next to the existing `ICON_*` constants**

Find:

```js
const ICON_TRYZUB='<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg"><g fill="#f2c230"><path d="M30 8c-4 7-5 14-2 21 2-2 3-4 2-7 1 3 2 5 2 7 3-7 2-14-2-21Z"/><rect x="26" y="26" width="8" height="42" rx="1"/><rect x="19" y="34" width="22" height="7" rx="1.5"/><path d="M24 37C10 33 2 20 5 7c7 9 14 15 20 19-1 4-1 8-1 11Z"/><path d="M36 37C50 33 58 20 55 7c-7 9-14 15-20 19 1 4 1 8 1 11Z"/><path d="M23 68h14l-4 14H27Z"/></g></svg>';
```

Replace with:

```js
const ICON_TRYZUB='<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg"><g fill="#f2c230"><path d="M30 8c-4 7-5 14-2 21 2-2 3-4 2-7 1 3 2 5 2 7 3-7 2-14-2-21Z"/><rect x="26" y="26" width="8" height="42" rx="1"/><rect x="19" y="34" width="22" height="7" rx="1.5"/><path d="M24 37C10 33 2 20 5 7c7 9 14 15 20 19-1 4-1 8-1 11Z"/><path d="M36 37C50 33 58 20 55 7c-7 9-14 15-20 19 1 4 1 8 1 11Z"/><path d="M23 68h14l-4 14H27Z"/></g></svg>';
const ICON_SHOP='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_GUN='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 15h9v-3H9V9H5a2 2 0 0 0-2 2v4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12h8v2a1 1 0 0 1-1 1h-2l-1 4H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ICON_MOTOR='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 10h9l4 3v3H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 11.5h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_BELT='<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="8.5" width="4" height="7" rx="1" fill="currentColor"/></svg>';
```

- [ ] **Step 5: Add the shop logic functions**

Find:

```js
function awardCoins(amount){
 if(!cloudReady||!cloudUid||amount<=0)return;
 db.collection('progress').doc(cloudUid).set({coins:firebase.firestore.FieldValue.increment(amount)},{merge:true}).catch(()=>{});
}
```

Replace with:

```js
function awardCoins(amount){
 if(!cloudReady||!cloudUid||amount<=0)return;
 db.collection('progress').doc(cloudUid).set({coins:firebase.firestore.FieldValue.increment(amount)},{merge:true}).catch(()=>{});
}
const SHOP_TRACKS=[
 {key:'weapon',name:'Зброя',icon:ICON_GUN,levels:WEAPON_LEVELS,desc:n=>(WEAPON_LEVELS[n].type==='pistol'?'Пістолет':'Автомат')+', радіус '+WEAPON_LEVELS[n].range+'px, кулдаун '+WEAPON_LEVELS[n].cd+'с'},
 {key:'motor',name:'Мотор',icon:ICON_MOTOR,levels:MOTOR_LEVELS,desc:n=>'Швидкість ×'+MOTOR_LEVELS[n].speedMul.toFixed(2)+', розрізання '+MOTOR_LEVELS[n].cutTime.toFixed(2)+'с'},
 {key:'belt',name:'Ремінь',icon:ICON_BELT,levels:BELT_LEVELS,desc:n=>'Замах '+BELT_LEVELS[n].dur.toFixed(2)+'с, радіус '+BELT_LEVELS[n].radius+'px'}
];
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
function openShop(){document.getElementById('shopModal').style.display='flex';renderShop()}
function buyUpgrade(track){
 const tr=SHOP_TRACKS.find(t=>t.key===track),lvl=upgrades[track],next=lvl+1;
 if(next>=tr.levels.length)return;
 const cost=tr.levels[next].cost;
 if(totalCoins<cost)return;
 totalCoins-=cost;
 upgrades[track]=next;
 applyUpgrades();
 if(cloudReady&&cloudUid){
  const patch={coins:firebase.firestore.FieldValue.increment(-cost),upgrades:{[track]:next}};
  db.collection('progress').doc(cloudUid).set(patch,{merge:true}).catch(()=>{});
 }
 renderShop();
}
function updateShopBtn(){document.getElementById('shopBtn').style.display=(!started||over)?'inline-block':'none'}
```

- [ ] **Step 6: Wire the shop button and close button**

Find (note: this repo currently has an uncommitted, unrelated leaderboard-caching change in progress — `onclick` below is `()=>openLeaderboard()`, not the bare function reference; match exactly what's on disk, re-reading the file first if it doesn't match):

```js
document.getElementById('lbBtn').innerHTML=`<span class="btnIcon">${ICON_TROPHY}</span> Таблиця лідерів`;
document.getElementById('lbClose').innerHTML=ICON_CLOSE;
document.getElementById('avClose').querySelector('.btnIcon').innerHTML=ICON_CLOSE;
document.getElementById('lbBtn').onclick=()=>openLeaderboard();
document.getElementById('lbClose').onclick=()=>{document.getElementById('lbModal').style.display='none'};
document.getElementById('avClose').onclick=()=>{document.getElementById('avModal').style.display='none'};
```

Replace with:

```js
document.getElementById('lbBtn').innerHTML=`<span class="btnIcon">${ICON_TROPHY}</span> Таблиця лідерів`;
document.getElementById('lbClose').innerHTML=ICON_CLOSE;
document.getElementById('avClose').querySelector('.btnIcon').innerHTML=ICON_CLOSE;
document.getElementById('lbBtn').onclick=()=>openLeaderboard();
document.getElementById('lbClose').onclick=()=>{document.getElementById('lbModal').style.display='none'};
document.getElementById('avClose').onclick=()=>{document.getElementById('avModal').style.display='none'};
document.getElementById('shopBtn').innerHTML=`<span class="btnIcon">${ICON_SHOP}</span> Магазин`;
document.getElementById('shopClose').innerHTML=ICON_CLOSE;
document.getElementById('shopBtn').onclick=openShop;
document.getElementById('shopClose').onclick=()=>{document.getElementById('shopModal').style.display='none'};
```

- [ ] **Step 7: Show/hide the shop button at the right times**

Find:

```js
let started=false;
```

Replace with:

```js
let started=false;
updateShopBtn();
```

Find:

```js
c.addEventListener('pointerdown',e=>{initAudio();if(ac&&ac.state==='suspended')ac.resume();if(!started){started=true;reset();return}if(over&&t>0.6){reset();return}[tx,ty]=pos(e);hit()});
```

Replace with:

```js
c.addEventListener('pointerdown',e=>{initAudio();if(ac&&ac.state==='suspended')ac.resume();if(!started){started=true;reset();updateShopBtn();return}if(over&&t>0.6){reset();updateShopBtn();return}[tx,ty]=pos(e);hit()});
```

Find:

```js
esc++;if(esc>=5){over=true;updateLbBtn();totalCoins+=score;awardCoins(score);if(score>best){best=score;saveBestToCloud(best)}t=0}
```

Replace with:

```js
esc++;if(esc>=5){over=true;updateLbBtn();updateShopBtn();totalCoins+=score;awardCoins(score);if(score>best){best=score;saveBestToCloud(best)}t=0}
```

- [ ] **Step 8: Verify**

Reload `http://localhost:8123`. On the start screen (before the first tap), confirm a "Магазин" button is visible in the bar and a "Таблиця лідерів" button is NOT required to be visible (it only shows after `over`, unaffected by this change). Click "Магазин" — modal opens showing 3 rows (Зброя/Мотор/Ремінь), all at level 0/5, with next-level prices. Use the dev coins button from Task 2 to get enough coins, buy a Мотор level — the row updates to level 1/5 and a new price, coin total drops. Close the shop, start a round, confirm the boat visibly moves faster. Buy a Ремінь level, confirm the belt swings faster and the hit radius looks bigger. Reload the page entirely — confirm the levels you bought are still there (read from Firestore emulator). Note: buying Зброя levels right now only changes the number in the shop — it has no in-game effect until Task 4.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add shop modal for buying equipment upgrades

New shop button on the start/result screens opens a modal listing
weapon/motor/belt tracks with current level, next-level preview, and
price; purchases spend totalCoins and persist to Firestore.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Weapon system — guard figure, auto-fire, flying bullets

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `upgrades.weapon`, `WEAPON_LEVELS` (Task 1); `motorCatch(s)` (existing — reused as the generic "register a catch" handler, it already does exactly that: sets `s.st='done'`, increments `score`, plays the catch sound/particles/phrase).
- Produces: `bl` (array of in-flight bullets), `wcd` (weapon cooldown timer), `guard()` (draw function for the border-guard figure near the motor).

- [ ] **Step 1: Add bullet/cooldown state, reset them with the rest of the round**

Find:

```js
let boat,sw,fx,rp=[],bb=[],sp=[],dr=[],stn=[],score,esc,t,spawn,swing,cd,over,best=0,totalCoins=0,tx,ty;
function reset(){boat={x:180,y:300};tx=180;ty=300;sw=[];fx=[];rp=[];bb=[];sp=[];dr=[];stn=[];score=0;esc=0;t=0;spawn=0;swing=0;cd=0;over=false;updateLbBtn()}
```

Replace with:

```js
let boat,sw,fx,rp=[],bb=[],sp=[],dr=[],stn=[],score,esc,t,spawn,swing,cd,over,best=0,totalCoins=0,tx,ty,bl=[],wcd=0;
function reset(){boat={x:180,y:300};tx=180;ty=300;sw=[];fx=[];rp=[];bb=[];sp=[];dr=[];stn=[];bl=[];score=0;esc=0;t=0;spawn=0;swing=0;cd=0;wcd=0;over=false;updateLbBtn()}
```

- [ ] **Step 2: Add a gunshot sound**

Find:

```js
paddle:()=>nz('lowpass',1500,500,.12,.06),cry:(s,l)=>cry2(s.ph,l)};
```

Replace with:

```js
paddle:()=>nz('lowpass',1500,500,.12,.06),cry:(s,l)=>cry2(s.ph,l),shot:()=>{nz('highpass',3000,7000,.06,.35);tn('square',950,250,.07,.14)}};
```

- [ ] **Step 3: Add auto-fire and bullet-travel logic to `upd(d)`**

Find this exact block (the tail of `upd(d)`, right after the jar-cut loop from Task 1):

```js
for(const s of sw)if(s.st==='swim'&&s.jar){if(Math.hypot(s.x-(boat.x-40),s.y-boat.y)<24){s.cutT=(s.cutT||0)+d;if(s.cutT>=CUT_TIME){s.jar=0;sfx.glass();stn.push({x:s.x,y:s.y,t:0,bits:Array.from({length:4},()=>({a:Math.random()*6.28,d:6+Math.random()*10,r:1.2+Math.random()*1.6}))});fx.push({x:s.x,y:s.y-10,t:.9,s:'Слава Україні!'});for(let k=0;k<2;k++)rp.push({x:s.x,y:s.y,r:3,t:.9,d:k*.15})}}else s.cutT=0}pd-=d;if(pd<=0&&sw.some(s=>s.st==='swim')){pd=.35+Math.random()*.3;sfx.paddle()}for(const f of fx)if(!f.sp){f.sp=1;say(f.s)}stn.forEach(q=>q.t+=d);stn=stn.filter(q=>q.t<5);sp.forEach(q=>q.t+=d);sp=sp.filter(q=>q.t<q.L);dr.forEach(f=>{f.x+=f.vx*d;f.y+=f.vy*d;f.vy+=260*d;f.life-=d});dr=dr.filter(f=>f.life>0)}
```

Replace with:

```js
for(const s of sw)if(s.st==='swim'&&s.jar){if(Math.hypot(s.x-(boat.x-40),s.y-boat.y)<24){s.cutT=(s.cutT||0)+d;if(s.cutT>=CUT_TIME){s.jar=0;sfx.glass();stn.push({x:s.x,y:s.y,t:0,bits:Array.from({length:4},()=>({a:Math.random()*6.28,d:6+Math.random()*10,r:1.2+Math.random()*1.6}))});fx.push({x:s.x,y:s.y-10,t:.9,s:'Слава Україні!'});for(let k=0;k<2;k++)rp.push({x:s.x,y:s.y,r:3,t:.9,d:k*.15})}}else s.cutT=0}
 wcd-=d;if(upgrades.weapon>0&&wcd<=0){const wl=WEAPON_LEVELS[upgrades.weapon],gx=boat.x-40,gy=(boat.y0||boat.y)-14;let tgt=null,bd=wl.range;for(const s of sw)if(s.st==='swim'){const dd=Math.hypot(s.x-gx,s.y-gy);if(dd<bd){bd=dd;tgt=s}}if(tgt){wcd=wl.cd;const ang=Math.atan2(tgt.y-gy,tgt.x-gx),spd=Math.max(80,bd/.12);bl.push({x:gx,y:gy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,target:tgt,life:.6});sfx.shot()}}
 for(const b of bl){b.x+=b.vx*d;b.y+=b.vy*d;b.life-=d;if(!b.hit&&b.target&&b.target.st==='swim'&&Math.hypot(b.x-b.target.x,b.y-b.target.y)<10){b.hit=true;motorCatch(b.target)}}
 bl=bl.filter(b=>!b.hit&&b.life>0);
pd-=d;if(pd<=0&&sw.some(s=>s.st==='swim')){pd=.35+Math.random()*.3;sfx.paddle()}for(const f of fx)if(!f.sp){f.sp=1;say(f.s)}stn.forEach(q=>q.t+=d);stn=stn.filter(q=>q.t<5);sp.forEach(q=>q.t+=d);sp=sp.filter(q=>q.t<q.L);dr.forEach(f=>{f.x+=f.vx*d;f.y+=f.vy*d;f.vy+=260*d;f.life-=d});dr=dr.filter(f=>f.life>0)}
```

- [ ] **Step 4: Add the `guard()` draw function**

Find:

```js
 const a=Math.sin(t*9+s.ph)*4;g.beginPath();g.moveTo(s.x-8,s.y+7);g.lineTo(s.x-13,s.y+7+a);g.moveTo(s.x+8,s.y+7);g.lineTo(s.x+13,s.y+7-a);g.stroke()}
function tree(x,y,r){
```

Replace with:

```js
 const a=Math.sin(t*9+s.ph)*4;g.beginPath();g.moveTo(s.x-8,s.y+7);g.lineTo(s.x-13,s.y+7+a);g.moveTo(s.x+8,s.y+7);g.lineTo(s.x+13,s.y+7-a);g.stroke()}
function guard(){
 const gx=boat.x-40,gy=(boat.y0||boat.y)-14,wl=upgrades.weapon>0?WEAPON_LEVELS[upgrades.weapon]:null;
 g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(gx,gy+11,7,3,0,0,7);g.fill();
 g.fillStyle='#3b6fb6';g.fillRect(gx-5,gy-1,10,9);
 g.fillStyle='#d9b08c';g.beginPath();g.arc(gx,gy-7,6,0,7);g.fill();
 g.fillStyle='#222';g.beginPath();g.arc(gx-2,gy-8,.9,0,7);g.arc(gx+2,gy-8,.9,0,7);g.fill();
 if(wl){
  g.strokeStyle='#2a2a2a';g.lineCap='round';
  if(wl.type==='pistol'){g.lineWidth=3;g.beginPath();g.moveTo(gx+4,gy+1);g.lineTo(gx+13,gy+1);g.stroke()}
  else{g.lineWidth=4;g.beginPath();g.moveTo(gx+2,gy);g.lineTo(gx+18,gy-2);g.stroke();g.fillStyle='#4a4a4a';g.fillRect(gx+6,gy+1,4,6)}
 }
}
function tree(x,y,r){
```

- [ ] **Step 5: Draw the guard and bullets in `draw()`**

Find:

```js
 g.strokeStyle='#2a2f34';g.lineWidth=2;g.beginPath();g.moveTo(mx+5,my+16);g.lineTo(mx+13,my+9);g.stroke()}
 for(const o of[-12,12]){const x=boat.x+o,y=boat.y0||boat.y;
```

Replace with:

```js
 g.strokeStyle='#2a2f34';g.lineWidth=2;g.beginPath();g.moveTo(mx+5,my+16);g.lineTo(mx+13,my+9);g.stroke()}
 guard();
 for(const b of bl){g.save();g.translate(b.x,b.y);g.rotate(Math.atan2(b.vy,b.vx));g.fillStyle='#ffe066';g.beginPath();g.ellipse(0,0,4,1.4,0,0,7);g.fill();g.restore()}
 for(const o of[-12,12]){const x=boat.x+o,y=boat.y0||boat.y;
```

- [ ] **Step 6: Verify**

Reload `http://localhost:8123`. Use the dev coins button, open the shop, buy weapon level 1 (pistol). Start a round — confirm a small border-guard figure now sits near the motor holding a pistol silhouette, and that it periodically fires a visible fast-moving bullet at the nearest swimming target, which scores a catch on arrival (score increments, catch phrase appears). Buy up to weapon level 4 (rifle) and confirm the guard's weapon silhouette changes and it fires noticeably more often. Confirm belt and motor-ram catches still work alongside the gun (no double-scoring — catch a swimmer with the belt right as a bullet is mid-flight toward the same target, confirm score only increments once). Check the console for errors throughout.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add weapon system: guard figure, auto-fire, flying bullets

Border guard now appears at the motor once the weapon track is
purchased, auto-firing visible rubber-bullet projectiles at the
nearest swimmer in range; a hit registers as a catch the same way
the belt and motor-ram do.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (data/persistence) → Task 1 Steps 2+4, Task 3 Step 5 (`buyUpgrade` Firestore write). §2 (shop UI) → Task 3. §3 (weapon) → Task 1 (table), Task 3 (shop row), Task 4 (gameplay+visuals). §4 (motor) → Task 1 Steps 2,6,7. §5 (belt) → Task 1 Steps 2,5,8. §6 (balance) — no task needed, it's a statement about future tuning, not a build step. All covered.
- **Placeholder scan:** no TBDs; every step has literal code.
- **Type consistency:** `upgrades` keys (`weapon`/`motor`/`belt`) match across Task 1 (declaration), Task 3 (`SHOP_TRACKS` keys, `buyUpgrade` parameter), and Task 4 (`upgrades.weapon`). `WEAPON_LEVELS`/`MOTOR_LEVELS`/`BELT_LEVELS` field names (`type`,`cd`,`range`,`cost`,`speedMul`,`cutTime`,`dur`,`radius`) are used consistently everywhere they're read.
