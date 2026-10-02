/** Deterministic full-level bot evaluation under ordinary combat rules with unlimited playtest continues.
 * LEVELS=1,2,3,4,5,6,7 SEEDS=42,123 BOT_MODE=tactical|policy|raw
 * BOT_DEMOS=/tmp/demos saves v4 expert demonstrations for BC.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { bootControlledGame, suppressRendering } from './rl/controlled-play.mjs';
import { verifyServedRuntime } from './jev-runtime.mjs';
import { RUNTIME_PURE_PATH, runtime } from './rl/load-runtime.mjs';
const base=process.env.NOVAWING_URL||'http://127.0.0.1:4000/';
const levels=(process.env.LEVELS||'1,2,3,4,5,6,7').split(',').map(Number);
const seeds=(process.env.SEEDS||'42').split(',').map(Number);
const mode=process.env.BOT_MODE||'tactical';
if(!['tactical','policy','raw'].includes(mode)) throw new Error('Unknown BOT_MODE');
const policy=mode==='tactical'?null:JSON.parse(fs.readFileSync(process.env.POLICY||'rl/weights/bc-policy.json','utf8'));
const out=process.env.BOT_REPORT||'/tmp/novawing-bot-campaign.json';
const stepMs=Number(process.env.BOT_STEP_MS||64);
const maxMs=Number(process.env.BOT_MAX_MS||360000);
const bossOnly=process.env.BOT_BOSS_ONLY==='1';
if(!Number.isFinite(stepMs)||stepMs<16||!Number.isFinite(maxMs)||maxMs<=0) throw new Error('Invalid step or duration');
const hashes=await verifyServedRuntime(base);
const browser=await chromium.launch(defaultLaunchOptions(true));
const results=[];
try {
 for(const level of levels) for(const seed of seeds) {
  const context=await browser.newContext({viewport:{width:960,height:720}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({seed})=>{let s=seed>>>0;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};},{seed});
  await page.addInitScript({path:RUNTIME_PURE_PATH});
  await page.clock.install();
  await page.goto(`${base}?level=${level}&diff=normal&timescale=1&playtestContinues=unlimited`,{waitUntil:'load'});
  await bootControlledGame(page,level);
  await suppressRendering(page);
  if(bossOnly){await page.evaluate(()=>__novawingDebug.setSegment('finalBoss'));await page.clock.runFor(32);}
  await page.evaluate(policy=>{window.__botEvalPolicy=policy;window.__botEvalDemos=[];},policy);
  let snap=await page.evaluate(()=>__novawingDebug.getBotSnapshot());
  const started=snap.time, initialLives=snap.lives;
  const segments=new Set();let decisions=0,damageEvents=0,previousLives=snap.lives,lastLog=-1;
  const wallStarted=Date.now();
  while(snap.time-started<maxMs) {
   if(errors.length) throw new Error(errors.join("; "));
   if(Date.now()-wallStarted>180000) throw new Error("Simulation stalled or exceeded wall limit: "+JSON.stringify({decisions,time:snap.time,started,paused:snap.paused}));
   if(decisions%100===99)console.log("progress",decisions,snap.time,snap.elapsedMs,snap.paused);
   segments.add(snap.segment||snap.phase);
   if(snap.playtestBot||snap.timeScale!==1) throw new Error('Ordinary player-rule audit failed');
   if(snap.continuePending){
    await page.evaluate(()=>__novawingDebug.acceptContinue());
    snap=await page.evaluate(()=>__novawingDebug.getBotSnapshot());
    previousLives=snap.lives;
    continue;
   }
   if(snap.levelCompleted||snap.victoryPending||snap.awaitingNextLevel||snap.level>level||snap.levelEnded)break;
   if(snap.levelTransitioning){await page.clock.runFor(160);} else {
    await page.evaluate(({mode,stepMs,record})=>{
     const s=__novawingDebug.getBotSnapshot();
     let preferred=null;
     if(window.__botEvalPolicy){const y=NovaWingRL.forwardPolicy(window.__botEvalPolicy,NovaWingRL.encodeObservation(s));
      preferred=NovaWingRL.fromCanonicalAction(y,s);preferred.fire=true;}
     const action=mode==='raw'?preferred:NovaWingTactics.plan(s,Math.max(160,stepMs),preferred).input;
     if(record)window.__botEvalDemos.push({t:s.time,obs:Array.from(NovaWingRL.encodeObservation(s)),action:NovaWingRL.encodeAction(action,s),
      type:'step',meta:{level:s.level,segment:s.segment,phase:s.phase,canonicalAxes:true,expert:'tactical'}});
     __novawingDebug.setBotInput(action);
    },{mode,stepMs,record:Boolean(process.env.BOT_DEMOS)&&decisions%3===0});
    decisions++;
    await page.clock.runFor(stepMs);
   }
   snap=await page.evaluate(()=>__novawingDebug.getBotSnapshot());
   if(snap.lives<previousLives)damageEvents+=previousLives-snap.lives;
   previousLives=snap.lives;
   const log=Math.floor((snap.time-started)/20000);
   if(log!==lastLog){lastLog=log;console.log(`L${level} seed=${seed} ${snap.segment||snap.phase} ${Math.round((snap.time-started)/1000)}s lives=${snap.lives} boss=${snap.boss?.health??'-'}`);}
  }
  const won=Boolean(snap.levelCompleted||snap.victoryPending||snap.awaitingNextLevel||snap.level>level);
  const row={level,seed,mode,bossOnly,won,initialLives,lives:snap.lives,damageEvents,decisions,elapsedMs:snap.time-started,
   segment:snap.segment,phase:snap.phase,bossHealth:snap.boss?.health,segments:[...segments],errors,
   ordinaryCombatRules:!snap.playtestBot&&snap.timeScale===1,unlimitedContinues:snap.unlimitedContinues,continuesUsed:snap.continuesUsed};
  results.push(row);
  fs.writeFileSync(out,JSON.stringify({hashes,mode,results},null,2));
  if(process.env.BOT_DEMOS){
   fs.mkdirSync(process.env.BOT_DEMOS,{recursive:true});
   const demos=await page.evaluate(()=>window.__botEvalDemos);
   const header={type:'header',obsVersion:runtime.OBS_VERSION,obsSize:runtime.OBS_SIZE,actionSize:4,layout:runtime.OBS_LAYOUT,
    canonicalAxes:true,expert:'tactical',won,level,seed,ordinaryCombatRules:true,unlimitedContinues:true,continuesUsed:snap.continuesUsed};
   fs.writeFileSync(path.join(process.env.BOT_DEMOS,`demo-tactical-l${level}-s${seed}.jsonl`),[header,...demos].map(x=>JSON.stringify(x)).join('\n')+'\n');
  }
  console.log(JSON.stringify(row));
  await context.close();
 }
}finally{await browser.close();}
console.log(`Clears: ${results.filter(r=>r.won).length}/${results.length}. Report: ${out}`);
if(results.some(r=>!r.won||r.errors.length))process.exitCode=1;
