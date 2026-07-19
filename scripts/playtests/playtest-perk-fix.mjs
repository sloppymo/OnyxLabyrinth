import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
const BASE='http://127.0.0.1:5210/OnyxLabyrinth/?debug=1';
const OUT='playtest-screenshots/2026-07-14';
const log=(...a)=>console.log(...a);
async function wait(ms){await new Promise(r=>setTimeout(r,ms));}
async function press(page,k,n=1){for(let i=0;i<n;i++){await page.keyboard.press(k);await wait(70);}}
async function shot(page,n){await page.screenshot({path:path.join(OUT,n)});log('SHOT',n);}

const browser=await chromium.launch({headless:true});
const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
await page.goto(BASE,{waitUntil:'networkidle'}); await wait(400);
await press(page,'a'); await wait(250); await press(page,'Enter'); await wait(700);

const prep=await page.evaluate(()=>{
  const d=window.__onyxDebug;
  // Mutate COMBAT party xp (endCombat copies combat.party over state.party)
  for(const c of d.state.combat.party){ c.xp = 50000; c.perkIds=[]; }
  for(const c of d.state.party){ c.xp = 50000; c.perkIds=[]; }
  return {
    combatXp: d.state.combat.party.map(c=>({n:c.name,l:c.level,xp:c.xp})),
  };
});
log('prep', JSON.stringify(prep));
await page.evaluate(()=>window.__onyxDebug.exitDebugCombat('victory'));
await wait(1000);
await shot(page,'150-perk-overlay.png');
const after=await page.evaluate(()=>({
  mode: window.__onyxDebug.state.mode,
  party: window.__onyxDebug.state.party.map(c=>({n:c.name,l:c.level,xp:c.xp,perks:c.perkIds})),
  text: document.body.innerText.slice(0,1500),
  perk: [...document.querySelectorAll('[class*=perk]')].map(e=>({cls:e.className,t:e.textContent?.slice(0,80)})),
}));
log('AFTER', JSON.stringify(after));

if(after.perk.length || /perk|choose|Tier/i.test(after.text)){
  log('PERK OVERLAY OK — spam Enter');
  for(let i=0;i<10;i++) await press(page,'Enter');
  await wait(250);
  await shot(page,'151-perk-spam.png');
  const still=await page.evaluate(()=>({
    text: document.body.innerText.slice(0,600),
    perk: !!document.querySelector('[class*=perk]'),
    warn: document.body.innerText.match(/arrow|select|choose|pick/i)?.[0],
  }));
  log('spam result', JSON.stringify(still));
  if(!still.perk && !/perk|choose|Tier|◀|▶/i.test(still.text)){
    log('FINDING P0 Enter spam dismissed perk overlay');
  } else {
    log('Enter spam guarded OK');
    await press(page,'ArrowRight'); await wait(100);
    await press(page,'Enter'); await wait(500);
    await shot(page,'152-perk-first-pick.png');
    // may have more characters in queue
    for(let i=0;i<20;i++){
      const has=await page.evaluate(()=>!!document.querySelector('[class*=perk]')||/choose|Tier|perk/i.test(document.body.innerText));
      if(!has) break;
      await press(page,'ArrowLeft'); await wait(60);
      await press(page,'Enter'); await wait(250);
    }
    await shot(page,'153-perk-done.png');
    log('final', await page.evaluate(()=>({
      mode:window.__onyxDebug.state.mode,
      party:window.__onyxDebug.state.party.map(c=>({n:c.name,l:c.level,perks:c.perkIds})),
      text:document.body.innerText.slice(0,400),
    })));
  }
} else {
  log('FINDING P1 still no perk overlay', after.party);
}
await browser.close();
