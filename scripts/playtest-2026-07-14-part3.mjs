import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const BASE = 'http://127.0.0.1:5210/OnyxLabyrinth/?debug=1';
const OUT = 'playtest-screenshots/2026-07-14';
const log = (...a) => console.log(...a);
const findings = [];
const find = (sev, title, body) => { findings.push({sev,title,body}); log('FINDING', sev, title); };

async function wait(ms){ await new Promise(r=>setTimeout(r,ms)); }
async function press(page,key,n=1){ for(let i=0;i<n;i++){ await page.keyboard.press(key); await wait(70);} }
async function shot(page,name){ await page.screenshot({path:path.join(OUT,name)}); log('SHOT',name); }
async function dbg(page){
  return page.evaluate(()=>{
    const d=window.__onyxDebug; const cc=d?.getCombatController?.();
    return {
      mode:d?.state?.mode, phase:cc?.getPhase?.(),
      steps:d?.state?.stepsSinceEncounter,
      party:d?.state?.party?.map(c=>({name:c.name,level:c.level,xp:c.xp,perks:[...c.perkIds],hp:c.hp,maxHp:c.maxHp})),
      inspectId: (()=>{ try { return cc && Object.getOwnPropertyDescriptor(cc,'inspectCharacterId'); } catch{return null} })(),
    };
  });
}

const browser = await chromium.launch({headless:true});
const page = await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
const errors=[];
page.on('pageerror', e=>errors.push(String(e)));
page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });

// --- Inspect with render flush ---
await page.goto(BASE,{waitUntil:'networkidle'}); await wait(400);
await press(page,'a'); await wait(300); await press(page,'Enter'); await wait(700);
const insp = await page.evaluate(async () => {
  const cc = window.__onyxDebug.getCombatController();
  cc.handleInput({ kind:'press', button:'rt' });
  // wait two rAF for render loop
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 50));
  const row = document.querySelector('.ff6-party-row.inspect');
  const detail = document.querySelector('.ff6-party-inspect');
  return {
    phase: cc.getPhase(),
    row: row?.textContent?.replace(/\s+/g,' ').trim() ?? null,
    detail: detail?.textContent?.replace(/\s+/g,' ').trim() ?? null,
    htmlHasInspect: !!document.querySelector('.inspect'),
    partyHtml: document.querySelector('.ff6-party')?.innerHTML?.slice(0,800) ?? null,
  };
});
log('INSPECT', JSON.stringify(insp));
await shot(page,'100-inspect.png');
if(!insp.row && !insp.detail && !insp.htmlHasInspect) find('P1','Inspect highlight not rendered after LT/RT handleInput + rAF', JSON.stringify(insp));
else log('Inspect UI ok');

// cycle more
await page.evaluate(async () => {
  const cc = window.__onyxDebug.getCombatController();
  cc.handleInput({ kind:'press', button:'rt' });
  cc.handleInput({ kind:'press', button:'rt' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await wait(100);
await shot(page,'101-inspect-cycled.png');
log('inspect2', await page.evaluate(()=>({
  row: document.querySelector('.ff6-party-row.inspect')?.textContent?.trim(),
  detail: document.querySelector('.ff6-party-inspect')?.textContent?.trim(),
})));

// --- Perk: natural grind via giving XP then proper endCombat ---
// Check how exitDebugCombat works - read endCombat level up by awarding XP the normal way
await page.goto(BASE,{waitUntil:'networkidle'}); await wait(300);
await press(page,'a'); await wait(200); await press(page,'Enter'); await wait(500);
const perkPath = await page.evaluate(() => {
  const d = window.__onyxDebug;
  const s = d.state;
  // Give enough XP for level 2->3: look at character xp field semantics
  // After arena L1 party is level 1. Add large xp WITHOUT changing level; exitDebugCombat victory should level repeatedly.
  for (const c of s.party) {
    c.xp = 50000;
    c.perkIds = [];
  }
  return s.party.map(c => ({name:c.name, level:c.level, xp:c.xp}));
});
log('perk prep', JSON.stringify(perkPath));
await page.evaluate(() => window.__onyxDebug.exitDebugCombat('victory'));
await wait(1000);
await shot(page,'110-perk-attempt.png');
const afterPerk = await page.evaluate(() => ({
  mode: window.__onyxDebug.state.mode,
  text: document.body.innerText.slice(0,1200),
  perkEls: [...document.querySelectorAll('[class*=perk]')].map(e=>e.className),
  party: window.__onyxDebug.state.party.map(c=>({name:c.name,level:c.level,xp:c.xp,perks:c.perkIds})),
}));
log('AFTER PERK ATTEMPT', JSON.stringify(afterPerk));
if(!afterPerk.perkEls.length && !/perk|choose|tier/i.test(afterPerk.text)) {
  find('P1','Natural XP bank + exitDebugCombat victory still no perk overlay', JSON.stringify(afterPerk.party));
} else {
  log('Perk overlay appeared');
  // Enter spam
  for(let i=0;i<8;i++) await press(page,'Enter');
  await wait(200);
  await shot(page,'111-perk-spam.png');
  const still = await page.evaluate(()=>!!document.querySelector('[class*=perk]') || /choose|perk/i.test(document.body.innerText));
  log('still after spam', still);
  if(!still) find('P0','Perk overlay dismissed by Enter spam', '');
  else {
    await press(page,'ArrowLeft'); await wait(80); await press(page,'Enter'); await wait(400);
    await shot(page,'112-perk-pick.png');
  }
}

// --- Town dungeon path ---
await page.goto(BASE,{waitUntil:'networkidle'}); await wait(300);
await press(page,'n'); await wait(400); await press(page,'d'); await wait(500);
log('town', JSON.stringify(await dbg(page)));
await shot(page,'120-town.png');
// Jump with bracket letter - help says bracket letter jumps. Try '>' or key for dungeon?
// From town-ui icons [>] Enter Dungeon - try key?
await press(page, '>'); // maybe not
await wait(100);
// Navigate: Inn selected — Esc if submenu, then ArrowDown x5 to dungeon
for(let i=0;i<6;i++){ await press(page,'ArrowDown'); await wait(60); }
await shot(page,'121-town-dungeon-selected.png');
log('town text', (await page.evaluate(()=>document.body.innerText)).slice(0,500));
await press(page,'Enter'); await wait(500);
log('after enter dungeon', JSON.stringify(await dbg(page)));
await shot(page,'122-dungeon.png');

const enc=[];
if((await dbg(page)).mode==='dungeon'){
  for(let step=0; step<150; step++){
    await press(page,'ArrowUp'); await wait(55);
    const st=await dbg(page);
    if(st.mode==='combat'){
      enc.push({step, steps:st.steps});
      log('ENC', enc.length, 'at', step, 'stepsSince', st.steps);
      await shot(page, `130-enc-${enc.length}.png`);
      await page.evaluate(()=>window.__onyxDebug.exitDebugCombat('fled'));
      await wait(200);
      if(enc.length>=6) break;
    }
    if(step%10===9){ await press(page,'ArrowRight'); await wait(50); }
  }
  log('encounters', JSON.stringify(enc));
  if(enc.length===0) find('P1','No encounters in 150 steps', '');
  // camp
  await press(page,'c'); await wait(400);
  await shot(page,'140-camp.png');
  log('camp mode', (await dbg(page)).mode, (await page.evaluate(()=>document.body.innerText)).slice(0,400));
} else {
  find('P1','Failed to enter dungeon from town', JSON.stringify(await dbg(page)));
  // try letter jump - read town-ui for keys
}

fs.writeFileSync(path.join(OUT,'raw-report-3.json'), JSON.stringify({findings,enc,errors,afterPerk},null,2));
await browser.close();
log('DONE3');
