
const $=id=>document.getElementById(id),cv=$('chart'),ctx=cv.getContext('2d');
let AUTH=sessionStorage.getItem('obsidian_token')||'';
const H=()=>AUTH?{'content-type':'application/json','authorization':'Bearer '+AUTH}:{'content-type':'application/json'};
function readableError(value){
  if(value==null)return 'Unknown error';
  if(value instanceof Error)return value.message||String(value);
  if(typeof value==='string')return value;
  if(typeof value==='object'){
    const direct=value.message||value.msg||value.error||value.detail||value.reason;
    if(direct!==undefined&&direct!==value)return readableError(direct);
    try{return JSON.stringify(value,null,2)}catch{return String(value)}
  }
  return String(value);
}
async function jsonFetch(url,opts={}){const r=await fetch(url,opts);const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error(`Server returned ${r.status} instead of JSON`)}if(r.status===401){try{sessionStorage.removeItem('obsidian_token')}catch{};AUTH=''}if(!r.ok&&data?.error)throw Error(readableError(data.error));return data}
async function ensureAuth(){try{let z=await jsonFetch('/api/auth/status');if(z.authenticated){return true}document.getElementById('authbar').style.display='flex';if(z.mode==='env'){document.getElementById('authmsg').textContent='Mode Vercel: Login memakai ADMIN_USERNAME/ADMIN_PASSWORD. Setup database dilewati.';document.getElementById('aset').disabled=true;document.getElementById('aset').title='Setup membutuhkan PostgreSQL';}return false}catch(e){document.getElementById('authmsg').textContent='API belum siap: '+e.message;document.getElementById('authbar').style.display='flex';return false}}
let AI_TREND={side:'WAIT',score:0,reason:[],lastNotified:null,sr:null};
let SR_STATE={support:null,resistance:null,context:'NO_LEVEL',distanceSupport:null,distanceResistance:null};
let SIGNALS=[];
const SIGNAL_KEY='obsidian_signal_drop_v4';
let ADAPTIVE_CACHE={key:'',upto:0,model:null};
let ADAPTIVE_INFO={samples:0,features:0,updatedAt:0};
let AUTO_ENTRY=localStorage.getItem('obsidian_auto_trade')==='1';
let AUTO_CONFIRM_SCORE=65;
let AUTO_CONFIRM_GAP=4;
let lastAutoSignalKey=localStorage.getItem('obsidian_auto_last_signal')||null;
let SHADOW_ENABLED=localStorage.getItem('obsidian_shadow_mode')==='1';
let SHADOW_ROWS=(()=>{try{return JSON.parse(localStorage.getItem('obsidian_shadow_rows')||'[]')}catch{return []}})();

const STRATEGY_VERSION='5.99.0';
const STRATEGY_FREEZE_KEY='obsidian_strategy_freeze_v585';
let STRATEGY_FREEZE=(()=>{try{return JSON.parse(localStorage.getItem(STRATEGY_FREEZE_KEY)||'null')}catch{return null}})();
let PAPER_ADAPTIVE_RISK=localStorage.getItem('obsidian_paper_adaptive_risk_v579')!=='0';
let PAPER_REPLAY_ID=localStorage.getItem('obsidian_paper_replay_v579')||'';
let DECISION_AUDIT=(()=>{try{return JSON.parse(localStorage.getItem('obsidian_decision_audit_v574')||'[]')}catch{return []}})();
let LAST_DECISION_AUDIT_FP='';
let LAST_LIVE_FINAL={};
const PAPER_KEY='obsidian_paper_trading_v576';
let PAPER_ENABLED=localStorage.getItem('obsidian_paper_enabled_v576')==='1';
let PAPER=(()=>{try{return JSON.parse(localStorage.getItem(PAPER_KEY)||'null')}catch{return null}})()||{initialBalance:1000,balance:1000,equity:1000,peak:1000,realized:0,fees:0,trades:[],position:null,pending:null,lastCandleTs:0};
const SIM_KEY='obsidian_full_sim_v586';
let SIM_ENABLED=localStorage.getItem('obsidian_full_sim_enabled_v586')==='1';
let SIM=(()=>{try{return JSON.parse(localStorage.getItem(SIM_KEY)||'null')}catch{return null}})()||{initialBalance:1000,balance:1000,equity:1000,peak:1000,realized:0,fees:0,funding:0,trades:[],positions:[],pending:[],lastCandleTs:0,dayKey:'',dayStart:1000,weekKey:'',weekStart:1000,blockedUntil:0};
function simPersist(){try{localStorage.setItem(SIM_KEY,JSON.stringify(SIM));localStorage.setItem('obsidian_full_sim_enabled_v586',SIM_ENABLED?'1':'0')}catch{}}
function simNum(id,def){const v=Number($(id)?.value);return Number.isFinite(v)?v:def}
function simRiskGate(){const dd=SIM.peak>0?Math.max(0,(SIM.peak-SIM.equity)/SIM.peak*100):0;const daily=SIM.dayStart>0?Math.max(0,(SIM.dayStart-SIM.equity)/SIM.dayStart*100):0;const weekly=SIM.weekStart>0?Math.max(0,(SIM.weekStart-SIM.equity)/SIM.weekStart*100):0;const maxDD=simNum('simMaxDD',8),dailyMax=simNum('simDailyLoss',3),weeklyMax=simNum('simWeeklyLoss',6);return {dd,daily,weekly,blocked:dd>=maxDD||daily>=dailyMax||weekly>=weeklyMax||Date.now()<Number(SIM.blockedUntil||0)}}
function simDateKeys(ts=Date.now()){const d=new Date(ts);const day=d.toISOString().slice(0,10);const wk=new Date(Date.UTC(d.getUTCFullYear(),0,1));const week=Math.floor(((d-wk)/86400000+wk.getUTCDay())/7);return {day,week:`${d.getUTCFullYear()}-W${week}`}}
function simReset(){const initial=Math.max(1,simNum('simInitial',1000));SIM={initialBalance:initial,balance:initial,equity:initial,peak:initial,realized:0,fees:0,funding:0,trades:[],positions:[],pending:[],lastCandleTs:0,dayKey:'',dayStart:initial,weekKey:'',weekStart:initial,blockedUntil:0};simPersist();renderFullSimulator()}
function simClose(p,c,reason,rawExit){const slip=Math.max(0,simNum('simSlip',.02))/100;const exit=p.side==='BUY'?Number(rawExit)*(1-slip):Number(rawExit)*(1+slip);const gross=p.side==='BUY'?(exit-p.entry)*p.qty:(p.entry-exit)*p.qty;const fee=(Math.abs(p.entry*p.qty)+Math.abs(exit*p.qty))*p.fee;const hours=Math.max(0,(Number(c?.t||Date.now())-Number(p.openedCandleTs||p.signalTs||Date.now()))/3600000);const fundingRate=Math.max(0,simNum('simFunding',.01))/100;const funding=Math.floor(hours/8)*Math.abs(p.entry*p.qty)*fundingRate;const net=gross-fee-funding;const r=p.riskUsd>0?net/p.riskUsd:0;SIM.balance+=net;SIM.realized+=net;SIM.fees+=fee;SIM.funding+=funding;SIM.trades.push({id:`S${Date.now()}_${Math.random().toString(36).slice(2,6)}`,ts:Date.now(),symbol:S.symbol,tf:S.tf,side:p.side,entry:p.entry,exit,qty:p.qty,grossPnl:gross,fee,funding,netPnl:net,realizedR:r,reason,signalTs:p.signalTs,openedCandleTs:p.openedCandleTs,regime:p.regime||'UNKNOWN',bars:p.bars||0});SIM.peak=Math.max(SIM.peak,SIM.balance);SIM.positions=SIM.positions.filter(x=>x!==p);if(net<0&&simNum('simCooldownBars',2)>0)SIM.blockedUntil=Date.now()+simNum('simCooldownBars',2)*60000;simPersist()}
function simResolve(c){if(!SIM_ENABLED||!c)return;const rows=[...SIM.positions];for(const p of rows){const hi=Number(c.h),lo=Number(c.l);let reason=null,exit=null;if(p.side==='BUY'){if(lo<=p.sl){reason='SL';exit=p.sl}else if(hi>=p.tp){reason='TP';exit=p.tp}}else{if(hi>=p.sl){reason='SL';exit=p.sl}else if(lo<=p.tp){reason='TP';exit=p.tp}}p.bars=(Number(p.bars)||0)+1;if(!reason&&p.bars>=p.maxBars){reason='TIMEOUT';exit=Number(c.c)}if(reason)simClose(p,c,reason,exit)}SIM.equity=SIM.balance;SIM.peak=Math.max(SIM.peak,SIM.equity);simPersist()}
function simEnterAtOpen(c){if(!SIM_ENABLED||!c)return;const q=SIM.pending?.shift?.();if(!q||Number(c.t)<=Number(q.signalTs)){if(q)SIM.pending.push(q);return}if(simRiskGate().blocked){simPersist();return}const maxPos=Math.max(1,Math.min(5,simNum('simMaxPositions',3)));if(SIM.positions.length>=maxPos){simPersist();return}const riskPct=Math.max(.05,Math.min(5,simNum('simRisk',1)))/100;const fee=Math.max(0,simNum('simFee',.04))/100;const slip=Math.max(0,simNum('simSlip',.02))/100;const maxLev=Math.max(1,Math.min(20,simNum('simLev',5)));const entry=q.side==='BUY'?Number(c.o)*(1+slip):Number(c.o)*(1-slip);const delta=entry-Number(q.plan.entry);const sl=q.side==='BUY'?Number(q.plan.sl)+delta:Number(q.plan.sl)+delta;const tp=q.side==='BUY'?Number(q.plan.tp2)+delta:Number(q.plan.tp2)+delta;const stopDist=Math.abs(entry-sl);if(!Number.isFinite(entry)||stopDist<=0)return;const riskUsd=SIM.balance*riskPct;const qty=Math.min(riskUsd/stopDist,(SIM.balance*maxLev)/Math.max(entry,1));if(!(qty>0))return;SIM.positions.push({side:q.side,entry,sl,tp,qty,riskUsd:qty*stopDist,fee,bars:0,maxBars:Math.max(2,Math.min(100,simNum('simBars',20))),signalTs:q.signalTs,openedCandleTs:Number(c.t),regime:q.regime||'UNKNOWN'});simPersist()}
function simQueue(c){if(!SIM_ENABLED||!c||Number(SIM.lastCandleTs)===Number(c.t))return;const keys=simDateKeys(c.t);if(SIM.dayKey!==keys.day){SIM.dayKey=keys.day;SIM.dayStart=SIM.equity}if(SIM.weekKey!==keys.week){SIM.weekKey=keys.week;SIM.weekStart=SIM.equity}if(simRiskGate().blocked){SIM.lastCandleTs=Number(c.t);simPersist();return}const pred=freezeNextCandlePrediction(c);const decision=pred?buildUnifiedDecision(pred):{state:'WAIT'};if(decision.state==='READY'&&pred?.side!=='WAIT'&&pred?.riskPlan?.valid){SIM.pending.push({signalTs:Number(c.t),side:pred.side,score:Number(pred.score||0),plan:{...pred.riskPlan},regime:decision?.regime?.current?.label||'UNKNOWN'});if(SIM.pending.length>5)SIM.pending=SIM.pending.slice(-5)}SIM.lastCandleTs=Number(c.t);simPersist();renderFullSimulator()}
function simStats(){const rows=SIM.trades||[],wins=rows.filter(x=>x.netPnl>0),losses=rows.filter(x=>x.netPnl<0);const grossWin=wins.reduce((a,x)=>a+x.netPnl,0),grossLoss=Math.abs(losses.reduce((a,x)=>a+x.netPnl,0));let streak=0,maxStreak=0;for(const x of rows){if(x.netPnl<0){streak++;maxStreak=Math.max(maxStreak,streak)}else if(x.netPnl>0)streak=0}return{n:rows.length,hit:rows.length?wins.length/rows.length*100:0,avgR:rows.length?rows.reduce((a,x)=>a+x.realizedR,0)/rows.length:0,expectancy:rows.length?rows.reduce((a,x)=>a+x.netPnl,0)/rows.length:0,pf:grossLoss?grossWin/grossLoss:null,maxStreak,dd:SIM.peak?Math.max(0,(SIM.peak-SIM.equity)/SIM.peak*100):0,daily:SIM.dayStart?Math.max(0,(SIM.dayStart-SIM.equity)/SIM.dayStart*100):0,weekly:SIM.weekStart?Math.max(0,(SIM.weekStart-SIM.equity)/SIM.weekStart*100):0}}

const STRESS_KEY='obsidian_stress_lab_v587';
let STRESS_ENABLED=localStorage.getItem(STRESS_KEY)==='1';
function stressRows(){return Array.isArray(SIM?.trades)?SIM.trades:[]}
function stressScenario(rows,mode){
  const feeBase=Math.max(0,simNum('simFee',.04))/100;
  const slipBase=Math.max(0,simNum('simSlip',.02))/100;
  return rows.map(x=>{
    const notional=Math.abs(Number(x.entry||0)*Number(x.qty||0));
    const extraFee=notional*feeBase*(mode==='cost2'?2:mode==='cost3'?3:1);
    const extraSlip=notional*slipBase*2*(mode==='exec2'?2:mode==='exec3'?3:1);
    let pnl=Number(x.netPnl||0)-extraFee-extraSlip;
    if(mode==='gap') pnl=pnl<0?pnl*1.5:pnl*0.9;
    if(mode==='funding2') pnl-=Math.abs(Number(x.funding||0));
    return {...x,stressPnl:pnl};
  });
}
function stressMetrics(rows,initial){
  let eq=Number(initial||1000),peak=eq,maxDD=0,lossStreak=0,maxStreak=0;
  let wins=0,losses=0,gain=0,loss=0;
  for(const x of rows){const pnl=Number(x.stressPnl||0);eq+=pnl;peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak?((peak-eq)/peak*100):0);if(pnl>0){wins++;gain+=pnl;lossStreak=0}else if(pnl<0){losses++;loss+=Math.abs(pnl);lossStreak++;maxStreak=Math.max(maxStreak,lossStreak)}}
  return {final:eq,returnPct:initial?((eq-initial)/initial*100):0,dd:maxDD,hit:rows.length?wins/rows.length*100:0,pf:loss?gain/loss:null,maxStreak,n:rows.length};
}
function stressWorstOrder(rows){return [...rows].sort((a,b)=>Number(a.stressPnl||0)-Number(b.stressPnl||0))}
function renderStressLab(){
  const h=$('stressLabV587');if(!h)return;
  const rows=stressRows(),initial=Number(SIM?.initialBalance||1000);
  const cases=[['BASELINE','base'],['COST ×2','cost2'],['COST ×3','cost3'],['EXECUTION SHOCK','exec3'],['GAP / SLIP SHOCK','gap'],['FUNDING ×2','funding2'],['WORST SEQUENCE','worst']];
  const out=cases.map(([name,key])=>{let r=key==='worst'?stressWorstOrder(stressScenario(rows,'exec2')):stressScenario(rows,key);return {name,key,...stressMetrics(r,initial)}});
  const severe=out.filter(x=>x.key!=='base').some(x=>x.dd>=Math.max(8,Number($('simMaxDD')?.value||8))||x.final<=0);
  const status=!rows.length?'COLLECTING':severe?'STRESS HIGH':'STRESS OK';
  h.innerHTML=`<div class="stressHead"><div><span class="label">V5.87 RISK STRESS LAB · SIMULATION ONLY</span><b>Uji ketahanan simulator tanpa mengubah akun Paper</b></div><span class="paperBadge ${status==='STRESS HIGH'?'bad':status==='COLLECTING'?'gold':'good'}">${status}</span></div><div class="paperSafe">🛡 Stress test memakai histori Simulator V5.86. Tidak membuat order, tidak mengubah saldo simulator, dan tidak menyatakan hasil masa depan.</div><div class="perfStats"><div><small>CLOSED TRADES</small><b>${rows.length}</b></div><div><small>BASE FINAL</small><b>${rows.length?out[0].final.toFixed(2):'—'}</b></div><div><small>WORST DD</small><b>${rows.length?Math.max(...out.map(x=>x.dd)).toFixed(2)+'%':'—'}</b></div><div><small>WORST FINAL</small><b>${rows.length?Math.min(...out.map(x=>x.final)).toFixed(2):'—'}</b></div></div><div class="stressTable"><div class="stressRow stressHeader"><span>SCENARIO</span><span>FINAL</span><span>RETURN</span><span>DD</span><span>HIT</span><span>PF</span></div>${out.map(x=>`<div class="stressRow"><span><b>${x.name}</b></span><span>${rows.length?x.final.toFixed(2):'—'}</span><span class="${x.returnPct>=0?'good':'bad'}">${rows.length?(x.returnPct>=0?'+':'')+x.returnPct.toFixed(2)+'%':'—'}</span><span>${rows.length?x.dd.toFixed(2)+'%':'—'}</span><span>${rows.length?x.hit.toFixed(1)+'%':'—'}</span><span>${x.pf==null?'—':x.pf.toFixed(2)}</span></div>`).join('')}</div><div class="stressNotes"><b>Interpretasi</b><div>• COST ×2/×3: biaya transaksi diperbesar.</div><div>• EXECUTION SHOCK: penalti slippage lebih besar.</div><div>• GAP / SLIP SHOCK: loss diperbesar dan win dikurangi.</div><div>• WORST SEQUENCE: trade diurutkan dari loss terbesar ke hasil terbaik untuk menguji drawdown urutan ekstrem.</div><div class="note">Stress test adalah analisis ketahanan, bukan prediksi profit.</div></div><button class="btn" id="stressExport">EXPORT STRESS REPORT</button>`;
  $('stressExport')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:'5.87.0',simulationOnly:true,generatedAt:new Date().toISOString(),scenarios:out},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`stress-lab-${S.symbol||'symbol'}-v5.87.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
}
const SCENARIO_KEY='obsidian_scenario_lab_v588';
function scenarioRows(){return Array.isArray(SIM?.trades)?SIM.trades:[]}
function scenarioBucket(x){
  const r=String(x?.regime||'').toUpperCase();
  if(r.includes('HIGH')&&r.includes('VOL')) return 'HIGH VOLATILITY';
  if(r.includes('LOW')&&r.includes('VOL')) return 'LOW VOLATILITY';
  if(r.includes('UP')||r.includes('BULL')) return 'BULL / UPTREND';
  if(r.includes('DOWN')||r.includes('BEAR')) return 'BEAR / DOWNTREND';
  if(r.includes('RANG')) return 'SIDEWAYS / RANGING';
  return 'OTHER / UNCLASSIFIED';
}
function scenarioStats(rows,initial){
  let eq=initial,peak=initial,maxDD=0,wins=0,losses=0,gain=0,loss=0;
  for(const x of rows){const pnl=Number(x.netPnl||0);eq+=pnl;peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak?((peak-eq)/peak*100):0);if(pnl>0){wins++;gain+=pnl}else if(pnl<0){losses++;loss+=Math.abs(pnl)}}
  const n=rows.length; return {n,final:eq,returnPct:initial?((eq-initial)/initial*100):0,dd:maxDD,hit:n?wins/n*100:0,expectancy:n?(eq-initial)/n:0,pf:loss?gain/loss:null};
}
function renderScenarioLab(){
  const h=$('scenarioLabV588'); if(!h)return;
  const rows=scenarioRows(), initial=Number(SIM?.initialBalance||1000);
  const defs=[['ALL TRADES','ALL'],['BULL / UPTREND','BULL / UPTREND'],['BEAR / DOWNTREND','BEAR / DOWNTREND'],['SIDEWAYS / RANGING','SIDEWAYS / RANGING'],['HIGH VOLATILITY','HIGH VOLATILITY'],['LOW VOLATILITY','LOW VOLATILITY'],['OTHER / UNCLASSIFIED','OTHER / UNCLASSIFIED']];
  const out=defs.map(([name,key])=>{const r=key==='ALL'?rows:rows.filter(x=>scenarioBucket(x)===key);return {name,key,...scenarioStats(r,initial)}});
  const usable=out.filter(x=>x.key!=='ALL'&&x.n>0), enough=rows.length>=20;
  h.innerHTML=`<div class="scenarioHead"><div><span class="label">V5.88 SCENARIO LAB · SIMULATION ANALYSIS</span><b>Performa Simulator menurut kondisi pasar</b></div><span class="paperBadge ${enough?'good':'gold'}">${enough?'REVIEWABLE':'COLLECTING'}</span></div><div class="paperSafe">🧪 Skenario hanya mengelompokkan trade yang sudah terjadi berdasarkan regime yang tersimpan. Tidak membuat trade sintetis, tidak mengubah saldo Simulator, dan bukan prediksi pasar.</div><div class="perfStats"><div><small>CLOSED TRADES</small><b>${rows.length}</b></div><div><small>SCENARIOS WITH DATA</small><b>${usable.length}</b></div><div><small>BEST SAMPLE</small><b>${usable.length?Math.max(...usable.map(x=>x.n)):'—'}</b></div><div><small>DATA QUALITY</small><b>${rows.length>=40?'GOOD':rows.length>=20?'LIMITED':'COLLECTING'}</b></div></div><div class="scenarioTable"><div class="scenarioRow scenarioHeader"><span>SCENARIO</span><span>N</span><span>FINAL</span><span>RETURN</span><span>DD</span><span>HIT</span><span>PF</span></div>${out.map(x=>`<div class="scenarioRow"><span><b>${x.name}</b></span><span>${x.n}</span><span>${x.n?x.final.toFixed(2):'—'}</span><span class="${x.returnPct>=0?'good':'bad'}">${x.n?(x.returnPct>=0?'+':'')+x.returnPct.toFixed(2)+'%':'—'}</span><span>${x.n?x.dd.toFixed(2)+'%':'—'}</span><span>${x.n?x.hit.toFixed(1)+'%':'—'}</span><span>${x.pf==null?'—':x.pf.toFixed(2)}</span></div>`).join('')}</div><div class="scenarioNotes"><b>Cara membaca</b><div>• <b>Bull/Bear/Sideways</b> memakai regime yang tercatat pada saat trade.</div><div>• <b>High/Low Volatility</b> hanya tersedia jika engine menyimpan label volatilitas pada regime.</div><div>• Sampel kecil tidak boleh dianggap sebagai bukti keunggulan strategi.</div><div class="note">Scenario Lab adalah analisis historis Simulator, bukan jaminan hasil pada kondisi pasar berikutnya.</div></div><button class="btn" id="scenarioExport">EXPORT SCENARIO REPORT</button>`;
  $('scenarioExport')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:'5.88.0',simulationOnly:true,generatedAt:new Date().toISOString(),rows:out},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`scenario-lab-${S.symbol||'symbol'}-v5.88.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
}


const SCENARIO_MATRIX_KEY='obsidian_scenario_matrix_v589';
function scenarioCurrentKey(pred){
  const r=String(pred?.regime?.current?.label||pred?.regime?.currentKey||pred?.regime?.label||'').toUpperCase();
  if(r.includes('HIGH')&&r.includes('VOL')) return 'HIGH VOLATILITY';
  if(r.includes('LOW')&&r.includes('VOL')) return 'LOW VOLATILITY';
  if(r.includes('UP')||r.includes('BULL')) return 'BULL / UPTREND';
  if(r.includes('DOWN')||r.includes('BEAR')) return 'BEAR / DOWNTREND';
  if(r.includes('RANG')) return 'SIDEWAYS / RANGING';
  return 'OTHER / UNCLASSIFIED';
}
function renderScenarioDecisionMatrix(pred){
  const h=$('scenarioDecisionMatrixV589'); if(!h)return;
  const rows=scenarioRows(), initial=Number(SIM?.initialBalance||1000), currentKey=scenarioCurrentKey(pred||LAST_LIVE_FINAL||{});
  const defs=[['BULL / UPTREND','BULL / UPTREND'],['BEAR / DOWNTREND','BEAR / DOWNTREND'],['SIDEWAYS / RANGING','SIDEWAYS / RANGING'],['HIGH VOLATILITY','HIGH VOLATILITY'],['LOW VOLATILITY','LOW VOLATILITY'],['OTHER / UNCLASSIFIED','OTHER / UNCLASSIFIED']];
  const out=defs.map(([name,key])=>{const r=rows.filter(x=>scenarioBucket(x)===key);const st=scenarioStats(r,initial);let status='DATA PENDING',tone='gold';if(st.n>=20){if(st.expectancy>0&&st.pf!=null&&st.pf>=1) {status='DATA SUPPORTS';tone='good'}else if(st.expectancy<=0||st.pf!=null&&st.pf<1){status='WEAK / WAIT';tone='bad'}else {status='MIXED';tone='gold'}} else if(st.n>=10){status='LIMITED';tone='gold'}return {name,key,...st,status,tone}});
  const cur=out.find(x=>x.key===currentKey)||out[out.length-1];
  const currentText=cur?.n>=20?`${cur.status} · ${cur.n} trades · Avg result ${cur.expectancy.toFixed(2)} USDT/trade`:cur?.n>=10?`LIMITED · ${cur.n} trades · perlu sample tambahan`:'DATA PENDING · belum cukup sample';
  const hardNo=cur?.n>=20&&cur.status==='WEAK / WAIT';
  h.innerHTML=`<div class="scenarioHead"><div><span class="label">V5.89 SCENARIO DECISION MATRIX · CONTEXT GUARD</span><b>Kondisi pasar saat ini vs bukti historis Simulator</b></div><span class="paperBadge ${cur?.tone||'gold'}">${cur?.status||'DATA PENDING'}</span></div><div class="paperSafe">🧭 Matrix ini hanya membaca histori Simulator. Ia tidak memprediksi harga dan <b>tidak otomatis mengubah order</b>. Sample kecil tetap dianggap belum cukup.</div><div class="perfStats"><div><small>CURRENT REGIME</small><b>${currentKey}</b></div><div><small>CURRENT STATUS</small><b>${currentText}</b></div><div><small>CLOSED TRADES</small><b>${rows.length}</b></div><div><small>ACTION CONTEXT</small><b>${hardNo?'WAIT / REVIEW':'CHECK OTHER GUARDS'}</b></div></div><div class="scenarioTable"><div class="scenarioRow scenarioHeader"><span>CONDITION</span><span>N</span><span>AVG/TRD</span><span>RETURN</span><span>DD</span><span>PF</span><span>STATUS</span></div>${out.map(x=>`<div class="scenarioRow ${x.key===currentKey?'scenarioCurrent':''}"><span><b>${x.name}</b>${x.key===currentKey?' · CURRENT':''}</span><span>${x.n}</span><span>${x.n?x.expectancy.toFixed(2):'—'}</span><span>${x.n?(x.returnPct>=0?'+':'')+x.returnPct.toFixed(2)+'%':'—'}</span><span>${x.n?x.dd.toFixed(2)+'%':'—'}</span><span>${x.pf==null?'—':x.pf.toFixed(2)}</span><span class="${x.tone}">${x.status}</span></div>`).join('')}</div><div class="scenarioNotes"><b>Decision context</b><div>• Regime saat ini: <b>${currentKey}</b>.</div><div>• ${currentText}.</div><div>• Jika status <b>DATA PENDING/LIMITED</b>, jangan menganggap kondisi tersebut tervalidasi.</div><div>• Jika status <b>WEAK / WAIT</b>, matrix menyarankan <b>WAIT / REVIEW</b> sebagai konteks tambahan; Decision Engine tetap menjadi sumber keputusan utama.</div><div class="note">V5.89 adalah context guard, bukan sistem prediksi atau jaminan profit.</div></div><button class="btn" id="scenarioMatrixExport">EXPORT DECISION MATRIX</button>`;
  $('scenarioMatrixExport')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:'5.89.0',simulationOnly:true,generatedAt:new Date().toISOString(),currentKey,rows:out},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`scenario-decision-matrix-${S.symbol||'symbol'}-v5.89.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
}

function renderFullSimulator(){const h=$('fullSimulatorV586');if(!h)return;const st=simStats(),g=simRiskGate(),tone=g.blocked?'bad':SIM_ENABLED?'good':'gold';h.innerHTML=`<div class="simHead"><div><span class="label">V5.86 FULL TRADING SIMULATOR · SAFE MODE</span><b>Multi-position paper simulation dengan biaya & protection</b></div><span class="paperBadge ${tone}">${SIM_ENABLED?'SIM SAFE':'OFF'}</span></div><div class="paperSafe">🛡 <b>NO REAL ORDERS:</b> simulator hanya memakai saldo virtual browser. Tidak memanggil endpoint live order dan tidak mengubah akun nyata.</div><div class="g3 paperCfg"><label class="field"><small>Modal awal USDT</small><input id="simInitial" type="number" min="10" step="10" value="${SIM.initialBalance}"></label><label class="field"><small>Risk / position %</small><input id="simRisk" type="number" min=".05" max="5" step=".05" value="${simNum('simRisk',1)}"></label><label class="field"><small>Max positions</small><input id="simMaxPositions" type="number" min="1" max="5" step="1" value="${simNum('simMaxPositions',3)}"></label><label class="field"><small>Virtual leverage cap</small><input id="simLev" type="number" min="1" max="20" step="1" value="${simNum('simLev',5)}"></label><label class="field"><small>Fee % / side</small><input id="simFee" type="number" min="0" max="1" step=".01" value="${simNum('simFee',.04)}"></label><label class="field"><small>Slippage % / side</small><input id="simSlip" type="number" min="0" max="1" step=".01" value="${simNum('simSlip',.02)}"></label><label class="field"><small>Funding % / 8h</small><input id="simFunding" type="number" min="0" max="1" step=".01" value="${simNum('simFunding',.01)}"></label><label class="field"><small>Max holding bars</small><input id="simBars" type="number" min="2" max="100" step="1" value="${simNum('simBars',20)}"></label><label class="field"><small>Daily loss limit %</small><input id="simDailyLoss" type="number" min=".5" max="20" step=".5" value="${simNum('simDailyLoss',3)}"></label><label class="field"><small>Weekly loss limit %</small><input id="simWeeklyLoss" type="number" min="1" max="30" step=".5" value="${simNum('simWeeklyLoss',6)}"></label><label class="field"><small>Max drawdown %</small><input id="simMaxDD" type="number" min="1" max="50" step=".5" value="${simNum('simMaxDD',8)}"></label><label class="field"><small>Cooldown minutes</small><input id="simCooldownBars" type="number" min="0" max="240" step="1" value="${simNum('simCooldownBars',2)}"></label></div><div class="g2" style="margin-top:8px"><button class="btn ${SIM_ENABLED?'active':''}" id="simToggle">${SIM_ENABLED?'SIM SAFE: ON':'SIM SAFE: OFF'}</button><button class="btn" id="simExport">EXPORT SIM JOURNAL</button><button class="btn danger" id="simReset">RESET SIMULATOR</button></div><div class="perfStats"><div><small>EQUITY</small><b>${SIM.equity.toFixed(2)}</b></div><div><small>REALIZED PNL</small><b class="${SIM.realized>=0?'good':'bad'}">${SIM.realized>=0?'+':''}${SIM.realized.toFixed(2)}</b></div><div><small>DD</small><b>${st.dd.toFixed(2)}%</b></div><div><small>DAILY</small><b>${st.daily.toFixed(2)}%</b></div><div><small>WEEKLY</small><b>${st.weekly.toFixed(2)}%</b></div><div><small>HIT RATE</small><b>${st.n?st.hit.toFixed(1):'—'}%</b></div><div><small>EXPECTANCY</small><b>${st.n?st.expectancy.toFixed(2):'—'}</b></div><div><small>PROFIT FACTOR</small><b>${st.pf==null?'—':st.pf.toFixed(2)}</b></div></div><div class="contextRows"><div><span>Open positions</span><b>${SIM.positions.length} / ${simNum('simMaxPositions',3)}</b></div><div><span>Pending signals</span><b>${SIM.pending.length}</b></div><div><span>Fees / Funding</span><b>${SIM.fees.toFixed(2)} / ${SIM.funding.toFixed(2)} USDT</b></div><div><span>Safety gate</span><b class="${g.blocked?'bad':'good'}">${g.blocked?'BLOCKED':'CLEAR'}</b></div><div><span>Sample</span><b>${st.n<20?'COLLECTING':'REVIEWABLE'} · ${st.n} closed</b></div></div><div class="paperRows">${SIM.positions.map((x,i)=>`<div class="paperRow"><div><b>${x.side}</b> · Position ${i+1}</div><div>Entry ${fmtIDR(x.entry)} · SL ${fmtIDR(x.sl)} · TP ${fmtIDR(x.tp)} · Qty ${x.qty.toFixed(6)}</div><div class="note">Risk ${x.riskUsd.toFixed(2)} USDT · ${x.bars}/${x.maxBars} bars · ${x.regime}</div></div>`).join('')||'<div class="note">Belum ada posisi simulator.</div>'}</div><div class="paperRows">${SIM.trades.slice().reverse().slice(0,8).map(x=>`<div class="paperRow"><div><b>${x.side}</b> · ${x.reason}</div><div>${x.netPnl>=0?'+':''}${x.netPnl.toFixed(2)} USDT · ${x.realizedR.toFixed(2)}R</div><div class="note">Fee ${x.fee.toFixed(3)} · Funding ${x.funding.toFixed(3)}</div></div>`).join('')||''}</div>`;
  ['simInitial','simRisk','simMaxPositions','simLev','simFee','simSlip','simFunding','simBars','simDailyLoss','simWeeklyLoss','simMaxDD','simCooldownBars'].forEach(id=>$(id)?.addEventListener('change',()=>{if(id==='simInitial'&&!SIM.trades.length&&!SIM.positions.length){const v=Math.max(1,simNum(id,1000));SIM.initialBalance=v;SIM.balance=v;SIM.equity=v;SIM.peak=v;SIM.dayStart=v;SIM.weekStart=v;simPersist()}renderFullSimulator()}));
  $('simToggle')?.addEventListener('click',()=>{SIM_ENABLED=!SIM_ENABLED;if(!SIM_ENABLED)SIM.pending=[];simPersist();renderFullSimulator()});$('simExport')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:'5.86.0',safeMode:true,account:SIM},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`full-sim-${S.symbol||'symbol'}-v5.86.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});$('simReset')?.addEventListener('click',()=>{if(confirm('Reset seluruh simulator virtual dan jurnal?'))simReset()})}

function paperPersist(){try{localStorage.setItem(PAPER_KEY,JSON.stringify(PAPER));localStorage.setItem('obsidian_paper_enabled_v576',PAPER_ENABLED?'1':'0');localStorage.setItem('obsidian_paper_adaptive_risk_v579',PAPER_ADAPTIVE_RISK?'1':'0');localStorage.setItem('obsidian_paper_replay_v579',PAPER_REPLAY_ID||'')}catch{}}
function paperEffectiveRiskPct(){
  const base=Math.max(.05,Math.min(5,paperNum('paperRisk',1)));
  if(!PAPER_ADAPTIVE_RISK)return {base,used:base,mult:1,reason:'ADAPTIVE OFF'};
  const st=paperStats(); let mult=1,reason='NORMAL';
  if(st.dd>=5||st.currentStreak>=3){mult=.25;reason='DEFENSIVE · DD ≥5% OR losing streak ≥3';}
  else if(st.dd>=3||st.currentStreak>=2){mult=.5;reason='CAUTION · DD ≥3% OR losing streak ≥2';}
  return {base,used:Math.max(.05,base*mult),mult,reason};
}
function paperNum(id,def){const v=Number($(id)?.value);return Number.isFinite(v)?v:def}
function paperStats(){
  const rows=Array.isArray(PAPER.trades)?PAPER.trades:[], wins=rows.filter(x=>Number(x.netPnl)>0).length, losses=rows.filter(x=>Number(x.netPnl)<0).length;
  const rs=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite), avgR=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0;
  let streak=0,maxStreak=0; for(const x of rows){if(Number(x.netPnl)<0){streak++;maxStreak=Math.max(maxStreak,streak)}else if(Number(x.netPnl)>0)streak=0}
  const dd=PAPER.peak>0?Math.max(0,(PAPER.peak-(Number(PAPER.equity)||0))/PAPER.peak*100):0;
  const hit=rows.length?wins/rows.length*100:0, expectancy=rows.length?rows.reduce((a,x)=>a+Number(x.netPnl||0),0)/rows.length:0;
  return {n:rows.length,wins,losses,hit,avgR,dd,maxStreak,currentStreak:streak,expectancy};
}
function paperReset(){
  const initial=Math.max(1,paperNum('paperInitial',1000));
  PAPER={initialBalance:initial,balance:initial,equity:initial,peak:initial,realized:0,fees:0,trades:[],position:null,pending:null,lastCandleTs:0};
  paperPersist(); renderPaperTrading();
}
function paperExport(){const blob=new Blob([JSON.stringify({version:'5.79.0',safeMode:true,modules:['V5.77 Trade Replay','V5.78 Paper vs Research','V5.79 Adaptive Risk'],enabled:PAPER_ENABLED,account:PAPER},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`paper-journal-${S.symbol||'symbol'}-v5.79.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function paperClosePosition(c,reason,exitPrice){
  const p=PAPER.position;if(!p)return;
  const rawExit=Number(exitPrice||c?.c||p.entry); const exit=p.side==='BUY'?rawExit*(1-p.slip):(rawExit*(1+p.slip));
  const gross=p.side==='BUY'?(exit-p.entry)*p.qty:(p.entry-exit)*p.qty;
  const fee=(Math.abs(p.entry*p.qty)+Math.abs(exit*p.qty))*p.fee;
  const net=gross-fee; const r=p.riskUsd>0?net/p.riskUsd:0;
  PAPER.balance+=net; PAPER.realized+=net; PAPER.fees+=fee; PAPER.equity=PAPER.balance; PAPER.peak=Math.max(PAPER.peak,PAPER.equity);
  PAPER.trades.push({id:`P${Date.now()}`,ts:Date.now(),symbol:S.symbol,tf:S.tf,side:p.side,entry:p.entry,exit,qty:p.qty,grossPnl:gross,fee,netPnl:net,realizedR:r,riskUsd:p.riskUsd,reason,candleTs:Number(c?.t||0),signalTs:p.signalTs,decisionScore:p.decisionScore,signalScore:p.signalScore,regime:p.regime||'UNKNOWN',openedTs:p.openedTs});
  if(PAPER.trades.length>200)PAPER.trades=PAPER.trades.slice(-200); PAPER.position=null; paperPersist(); renderPaperTrading();
}
function paperResolveClosedCandle(c){
  const p=PAPER.position;if(!p||!c)return;
  const hi=Number(c.h),lo=Number(c.l); let reason=null,exit=null;
  if(p.side==='BUY'){const hitSL=lo<=p.sl,hitTP=hi>=p.tp; if(hitSL){reason='SL';exit=p.sl}else if(hitTP){reason='TP';exit=p.tp}}
  else {const hitSL=hi>=p.sl,hitTP=lo<=p.tp; if(hitSL){reason='SL';exit=p.sl}else if(hitTP){reason='TP';exit=p.tp}}
  p.bars=Number(p.bars||0)+1;
  if(!reason && p.bars>=p.maxBars){reason='TIMEOUT';exit=Number(c.c)}
  if(reason)paperClosePosition(c,reason,exit); else {PAPER.equity=PAPER.balance;paperPersist()}
}
function paperTryEnterAtOpen(c){
  if(!PAPER_ENABLED||PAPER.position||!PAPER.pending||!c||S.kill)return;
  const q=PAPER.pending;if(Number(c.t)<=Number(q.signalTs))return;
  if(q.symbol!==S.symbol||q.tf!==S.tf){PAPER.pending=null;paperPersist();return}
  const decision=q.decision||{state:'BLOCK'};
  if(decision.state!=='READY'||q.side!=='BUY'&&q.side!=='SELL'||!q.plan?.valid){PAPER.pending=null;paperPersist();renderPaperTrading();return}
  const riskCtl=paperEffectiveRiskPct(), riskPct=riskCtl.used/100, fee=Math.max(0,paperNum('paperFee',0.04))/100, slip=Math.max(0,paperNum('paperSlip',0.02))/100, maxLev=Math.max(1,Math.min(10,paperNum('paperLev',3))), maxBars=Math.max(2,Math.min(100,paperNum('paperBars',20)));
  const rawOpen=Number(c.o),entry=q.side==='BUY'?rawOpen*(1+slip):rawOpen*(1-slip); const delta=entry-Number(q.plan.entry); const sl=q.side==='BUY'?Number(q.plan.sl)+delta:Number(q.plan.sl)+delta; const tp=q.side==='BUY'?Number(q.plan.tp2)+delta:Number(q.plan.tp2)+delta; const stopDist=Math.abs(entry-sl);
  if(!Number.isFinite(entry)||!Number.isFinite(stopDist)||stopDist<=0){PAPER.pending=null;paperPersist();return}
  const riskUsd=PAPER.balance*riskPct; const riskQty=riskUsd/stopDist; const maxQty=(PAPER.balance*maxLev)/Math.max(entry,1); const qty=Math.min(riskQty,maxQty);
  if(!(qty>0)){PAPER.pending=null;paperPersist();return}
  PAPER.position={side:q.side,entry,sl,tp,qty,riskUsd:qty*stopDist,fee,slip,bars:0,maxBars,signalTs:q.signalTs,signalScore:q.score,decisionScore:decision.score,regime:decision?.regime?.current?.label||decision?.regime?.currentKey||'UNKNOWN',openedTs:Date.now()}; PAPER.pending=null; PAPER.lastCandleTs=Number(c.t); PAPER.equity=PAPER.balance; paperPersist(); renderPaperTrading();
}
function paperQueueFromClosedCandle(c){
  if(!PAPER_ENABLED||!c||PAPER.position)return;
  if(Number(PAPER.lastCandleTs)===Number(c.t))return;
  const row=freezeNextCandlePrediction(c); const pred=row||null; const safety=(()=>{try{return buildKillSwitchIntelligence()}catch{return {state:S.kill?'PAUSE':'SAFE'}}})(); const decision=pred?buildUnifiedDecision(pred):{state:'WAIT',score:0,reasons:[]};
  if(decision.state==='READY'&&safety.state!=='PAUSE'&&!S.kill&&pred.side!=='WAIT'&&pred.riskPlan?.valid){PAPER.pending={symbol:S.symbol,tf:S.tf,signalTs:Number(c.t),side:pred.side,score:Number(pred.score||0),pred:{...pred},plan:{...pred.riskPlan},decision:{state:decision.state,score:Number(decision.score||0),reasons:[...(decision.reasons||[])]}}}else PAPER.pending=null;
  PAPER.lastCandleTs=Number(c.t);paperPersist();renderPaperTrading();
}

function paperPerformanceData(){
  const rows=(PAPER.trades||[]).filter(x=>Number.isFinite(Number(x.netPnl)));
  let equity=Number(PAPER.initialBalance||1000), peak=equity, maxDD=0, curve=[equity], wins=0, losses=0, grossWin=0, grossLoss=0;
  const rVals=[];
  for(const x of rows){const pnl=Number(x.netPnl||0); equity+=pnl; peak=Math.max(peak,equity); maxDD=Math.max(maxDD,peak?((peak-equity)/peak*100):0); curve.push(equity); if(pnl>0){wins++;grossWin+=pnl}else if(pnl<0){losses++;grossLoss+=Math.abs(pnl)} if(Number.isFinite(Number(x.realizedR)))rVals.push(Number(x.realizedR));}
  const avgR=rVals.length?rVals.reduce((a,b)=>a+b,0)/rVals.length:0;
  const expectancy=rows.length?rows.reduce((a,x)=>a+Number(x.netPnl||0),0)/rows.length:0;
  const profitFactor=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:null);
  const hit=rows.length?wins/rows.length*100:0;
  const avgWin=wins?grossWin/wins:0, avgLoss=losses?grossLoss/losses:0;
  const by=(keyFn)=>{const m={};for(const x of rows){const k=keyFn(x)||'UNKNOWN';(m[k]??=[]).push(x)}return Object.entries(m).map(([key,a])=>{const pnl=a.reduce((u,x)=>u+Number(x.netPnl||0),0),rs=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);return {key,n:a.length,pnl,hit:a.length?a.filter(x=>Number(x.netPnl)>0).length/a.length*100:0,avgR:rs.length?rs.reduce((u,v)=>u+v,0)/rs.length:0}}).sort((a,b)=>b.n-a.n)};
  const direction=by(x=>x.side), session=by(x=>marketSession(x.openedTs||x.ts)), timeframe=by(x=>x.tf), regime=by(x=>x.regime);
  const sorted=[...rVals].sort((a,b)=>a-b), q=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null;
  return {rows,equity,curve,maxDD,wins,losses,grossWin,grossLoss,avgR,expectancy,profitFactor,hit,avgWin,avgLoss,direction,session,timeframe,regime,rMin:q(0),rQ25:q(.25),rMed:q(.5),rQ75:q(.75),rMax:q(1)};
}
function performanceSparkline(vals){
  if(!vals||vals.length<2)return '<div class="perfEmpty">Belum cukup trade untuk equity curve.</div>';
  const w=760,h=180,p=12,min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const pts=vals.map((v,i)=>`${(p+i*(w-2*p)/(vals.length-1)).toFixed(1)},${(h-p-(v-min)*(h-2*p)/span).toFixed(1)}`).join(' ');
  return `<svg class="perfSvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Equity curve"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="currentColor" opacity=".12"/></svg>`;
}
function performanceRows(title,rows){
  return `<div class="perfBlock"><div class="perfBlockTitle">${title}</div>${rows.length?rows.map(x=>`<div class="perfRow"><span>${x.key}</span><b>${x.n}</b><span>${x.hit.toFixed(1)}% HIT</span><span>${x.avgR.toFixed(2)}R</span><b class="${x.pnl>=0?'good':'bad'}">${x.pnl>=0?'+':''}${x.pnl.toFixed(2)}</b></div>`).join(''):'<div class="note">Belum ada data.</div>'}</div>`;
}
function renderPerformanceDashboard(){
  const host=$('performanceDashboardV583'); if(!host)return;
  const d=paperPerformanceData(), tone=d.expectancy>0?'good':d.expectancy<0?'bad':'gold';
  host.innerHTML=`<div class="perfHead"><div><span class="label">V5.83 PERFORMANCE DASHBOARD</span><b>Paper Trading performance — read-only analytics</b></div><span class="paperBadge ${tone}">${d.rows.length<20?'COLLECTING':'ANALYSIS'}</span></div>
  <div class="paperSafe">Dashboard ini hanya membaca jurnal Paper. Tidak mengubah strategi, confidence, risiko, atau order. Angka PnL menggunakan hasil simulasi Paper yang sudah tercatat.</div>
  <div class="perfStats"><div><small>EQUITY</small><b>${d.equity.toFixed(2)} USDT</b></div><div><small>REALIZED PNL</small><b class="${d.equity>=Number(PAPER.initialBalance)?'good':'bad'}">${(d.equity-Number(PAPER.initialBalance||0)>=0?'+':'')}${(d.equity-Number(PAPER.initialBalance||0)).toFixed(2)}</b></div><div><small>MAX DD</small><b>${d.maxDD.toFixed(2)}%</b></div><div><small>HIT RATE</small><b>${d.hit.toFixed(1)}%</b></div><div><small>AVG R</small><b>${d.avgR.toFixed(2)}R</b></div><div><small>EXPECTANCY</small><b class="${tone}">${d.expectancy>=0?'+':''}${d.expectancy.toFixed(2)} USDT</b></div><div><small>PROFIT FACTOR</small><b>${d.profitFactor==null?'—':d.profitFactor===Infinity?'∞':d.profitFactor.toFixed(2)}</b></div><div><small>MAX LOSING STREAK</small><b>${paperStats().maxStreak}</b></div></div>
  <div class="perfCurve"><div class="perfBlockTitle">EQUITY CURVE · ${d.rows.length} CLOSED</div>${performanceSparkline(d.curve)}</div>
  <div class="perfR"><div class="perfBlockTitle">R DISTRIBUTION</div><div class="rGrid"><span>MIN <b>${d.rMin==null?'—':d.rMin.toFixed(2)}R</b></span><span>Q25 <b>${d.rQ25==null?'—':d.rQ25.toFixed(2)}R</b></span><span>MEDIAN <b>${d.rMed==null?'—':d.rMed.toFixed(2)}R</b></span><span>Q75 <b>${d.rQ75==null?'—':d.rQ75.toFixed(2)}R</b></span><span>MAX <b>${d.rMax==null?'—':d.rMax.toFixed(2)}R</b></span></div></div>
  <div class="perfGrid">${performanceRows('BY SESSION',d.session)}${performanceRows('BY TIMEFRAME',d.timeframe)}${performanceRows('BY DIRECTION',d.direction)}${performanceRows('BY REGIME',d.regime)}</div>
  <div class="adaptiveGuard"><b>SAMPLE GUARD:</b> ${d.rows.length<20?'Kurang dari 20 closed trade — gunakan hanya sebagai monitoring awal.':'Sample sudah melewati ambang monitoring awal, tetapi tetap evaluasi OOS/Walk-Forward dan drawdown sebelum mempertimbangkan perubahan strategi.'} Avg win ${d.avgWin.toFixed(2)} · Avg loss ${d.avgLoss.toFixed(2)} USDT.</div>`;
}

function renderPaperTrading(){
  const host=$('paperTradingV576');if(!host)return; const st=paperStats(),p=PAPER.position,pend=PAPER.pending;
  const tone=!PAPER_ENABLED?'gold':p?'good':pend?'gold':'good';
  host.innerHTML=`<div class="paperHead"><div><span class="label">V5.76 LIVE PAPER TRADING · SAFE MODE</span><b>Simulasi penuh Decision Engine tanpa order nyata</b></div><span class="paperBadge ${tone}">${PAPER_ENABLED?'SAFE PAPER':'OFF'}</span></div>
  <div class="paperSafe">🛡 <b>SAFE MODE:</b> modul ini hanya memakai saldo virtual di browser. Tidak memanggil endpoint order Binance dan tidak mengubah posisi akun nyata.</div>
  <div class="g3 paperCfg"><label class="field"><small>Saldo awal USDT</small><input id="paperInitial" type="number" min="10" step="10" value="${Number(PAPER.initialBalance||1000)}"></label><label class="field"><small>Risk / trade %</small><input id="paperRisk" type="number" min="0.05" max="5" step="0.05" value="${paperNum('paperRisk',1)}"></label><label class="field"><small>Leverage cap virtual</small><input id="paperLev" type="number" min="1" max="10" step="1" value="${paperNum('paperLev',3)}"></label><label class="field"><small>Fee % / side</small><input id="paperFee" type="number" min="0" max="1" step="0.01" value="${paperNum('paperFee',0.04)}"></label><label class="field"><small>Slippage % / side</small><input id="paperSlip" type="number" min="0" max="1" step="0.01" value="${paperNum('paperSlip',0.02)}"></label><label class="field"><small>Max holding bars</small><input id="paperBars" type="number" min="2" max="100" step="1" value="${paperNum('paperBars',20)}"></label></div>
  <div class="g2" style="margin-top:8px"><button class="btn ${PAPER_ENABLED?'active':''}" id="paperToggle">${PAPER_ENABLED?'SAFE PAPER: ON':'SAFE PAPER: OFF'}</button><button class="btn ${PAPER_ADAPTIVE_RISK?'active':''}" id="paperAdaptiveRisk">${PAPER_ADAPTIVE_RISK?'ADAPTIVE RISK: ON':'ADAPTIVE RISK: OFF'}</button><button class="btn" id="paperExport">EXPORT PAPER JOURNAL</button><button class="btn danger" id="paperReset">RESET PAPER ACCOUNT</button></div>
  <div class="paperStats"><div><small>EQUITY</small><b>${Number(PAPER.equity||0).toFixed(2)} USDT</b></div><div><small>REALIZED PNL</small><b class="${PAPER.realized>=0?'good':'bad'}">${PAPER.realized>=0?'+':''}${Number(PAPER.realized||0).toFixed(2)}</b></div><div><small>DRAW DOWN</small><b class="${st.dd>8?'bad':st.dd>5?'gold':'good'}">${st.dd.toFixed(2)}%</b></div><div><small>HIT RATE</small><b>${st.n?st.hit.toFixed(1):'—'}%</b></div><div><small>AVG R</small><b>${st.n?st.avgR.toFixed(2):'—'}</b></div><div><small>EXPECTANCY</small><b>${st.n?st.expectancy.toFixed(2):'—'} USDT</b></div><div><small>TRADES</small><b>${st.n}</b></div><div><small>LOSS STREAK</small><b>${st.maxStreak}</b></div></div>
  <div class="contextRows"><div><span>Adaptive risk</span><b>${paperEffectiveRiskPct().used.toFixed(2)}% · ${paperEffectiveRiskPct().reason}</b></div><div><span>Virtual position</span><b>${p?`${p.side} · Entry ${fmtIDR(p.entry)} · SL ${fmtIDR(p.sl)} · TP ${fmtIDR(p.tp)}`:'FLAT'}</b></div><div><span>Pending next open</span><b>${pend?`${pend.side} · score ${pend.score}/100 · signal ${signalTime(pend.signalTs)}`:'NONE'}</b></div><div><span>Sample quality</span><b>${st.n<20?'COLLECTING · minimal 20 trades for meaningful review':st.n<40?'WATCH · 20+ trades, continue collecting':'REVIEWABLE · 40+ paper trades'}</b></div></div>
  <div class="paperRows">${PAPER.trades.slice().reverse().slice(0,10).map(x=>`<div class="paperRow"><div><b class="${x.side==='BUY'?'good':'bad'}">${x.side}</b> · ${x.reason}</div><div>${new Date(x.ts).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · ${x.netPnl>=0?'+':''}${Number(x.netPnl).toFixed(2)} USDT · ${Number(x.realizedR).toFixed(2)}R</div><div class="note">Entry ${fmtIDR(x.entry)} → Exit ${fmtIDR(x.exit)} · fee ${Number(x.fee).toFixed(3)}</div></div>`).join('')||'<div class="note">Belum ada paper trade. Aktifkan SAFE PAPER dan biarkan market data realtime berjalan.</div>'}</div><div id="paperIntelligenceV579"></div>`;
  renderPaperIntelligence();
  ['paperInitial','paperRisk','paperLev','paperFee','paperSlip','paperBars'].forEach(id=>$(id)?.addEventListener('change',()=>{if(id==='paperInitial'&&!PAPER.trades.length&&!PAPER.position){PAPER.initialBalance=paperNum(id,1000);PAPER.balance=PAPER.initialBalance;PAPER.equity=PAPER.balance;PAPER.peak=PAPER.balance;paperPersist()}renderPaperTrading()}));
  $('paperToggle')?.addEventListener('click',()=>{PAPER_ENABLED=!PAPER_ENABLED;if(!PAPER_ENABLED)PAPER.pending=null;paperPersist();renderPaperTrading()}); $('paperAdaptiveRisk')?.addEventListener('click',()=>{PAPER_ADAPTIVE_RISK=!PAPER_ADAPTIVE_RISK;paperPersist();renderPaperTrading()}); $('paperExport')?.addEventListener('click',paperExport); $('paperReset')?.addEventListener('click',()=>{if(confirm('Reset seluruh saldo dan jurnal Paper Trading?'))paperReset()});
}

function paperReplayRows(){
  return (PAPER.trades||[]).map(x=>({trade:x,signal:SIGNALS.find(s=>s.symbol===x.symbol&&s.tf===x.tf&&Number(s.ts)===Number(x.signalTs))||SIGNALS.find(s=>s.symbol===x.symbol&&s.tf===x.tf&&Number(s.targetTs)===Number(x.signalTs))}));
}
function renderPaperReplay(host){
  const rows=paperReplayRows();
  if(!rows.length){host.innerHTML='<div class="note">Replay menunggu paper trade yang sudah CLOSED.</div>';return;}
  if(!rows.some(x=>x.trade.id===PAPER_REPLAY_ID))PAPER_REPLAY_ID=rows[0].trade.id;
  const selected=rows.find(x=>x.trade.id===PAPER_REPLAY_ID)||rows[0], t=selected.trade, sig=selected.signal;
  host.innerHTML=`<div class="sxeIntelTitle">V5.77 TRADE REPLAY · ${t.id}</div><div class="g2"><label class="field"><small>Pilih paper trade</small><select id="paperReplaySelect">${rows.slice(0,40).map(x=>`<option value="${x.trade.id}" ${x.trade.id===PAPER_REPLAY_ID?'selected':''}>${x.trade.side} · ${signalTime(x.trade.signalTs)} · ${Number(x.trade.netPnl).toFixed(2)} USDT</option>`).join('')}</select></label><div class="contextRows"><div><span>Sequence</span><b>SIGNAL → NEXT OPEN → ${t.reason} → CLOSED</b></div><div><span>Result</span><b class="${t.netPnl>=0?'good':'bad'}">${t.netPnl>=0?'+':''}${Number(t.netPnl).toFixed(2)} USDT · ${Number(t.realizedR).toFixed(2)}R</b></div></div></div><div class="contextRows" style="margin-top:8px"><div><span>Signal</span><b>${sig?`${sig.side} · score ${sig.score}/100 · ${sig.strength||'—'}`:'snapshot signal tidak tersimpan'}</b></div><div><span>Entry</span><b>${fmtIDR(t.entry)} · ${signalTime(t.openedTs)}</b></div><div><span>Exit</span><b>${fmtIDR(t.exit)} · ${t.reason}</b></div><div><span>Risk</span><b>${Number(t.riskUsd||0).toFixed(2)} USDT · ${Number(t.realizedR).toFixed(2)}R</b></div></div><div class="adaptiveGuard" style="margin-top:8px"><b>REPLAY:</b> ${sig?.reason||'Tidak ada alasan signal tersimpan.'} ${sig?.readiness?.label?` · readiness ${sig.readiness.label}.`:''} Replay memakai snapshot historis yang tersimpan; tidak mengubah hasil trade.</div>`;
  $('paperReplaySelect')?.addEventListener('change',e=>{PAPER_REPLAY_ID=e.target.value;paperPersist();renderPaperIntelligence()});
}
function renderPaperComparison(host){
  const p=paperStats(), r=getAnalyticsStats(), closed=r.decided||0, rAvg=Number(r.avgR||0), paperAvg=Number(p.avgR||0), rHit=r.rate==null?null:r.rate*100;
  const enough=p.n>=20&&closed>=20;
  host.innerHTML=`<div class="sxeIntelTitle">V5.78 PAPER vs RESEARCH</div><div class="paperCompare"><div><small>PAPER TRADES</small><b>${p.n}</b></div><div><small>RESEARCH CLOSED</small><b>${closed}</b></div><div><small>PAPER AVG R</small><b>${p.n?paperAvg.toFixed(2):'—'}</b></div><div><small>RESEARCH AVG R</small><b>${closed?rAvg.toFixed(2):'—'}</b></div><div><small>PAPER HIT</small><b>${p.n?p.hit.toFixed(1)+'%':'—'}</b></div><div><small>RESEARCH HIT</small><b>${rHit==null?'—':rHit.toFixed(1)+'%'}</b></div></div><div class="adaptiveGuard"><b>GAP:</b> ${p.n&&closed?`Paper vs research Avg R = ${(paperAvg-rAvg>=0?'+':'')+(paperAvg-rAvg).toFixed(2)}R; hit-rate gap = ${(p.hit-(rHit||0)>=0?'+':'')+(p.hit-(rHit||0)).toFixed(1)}pp.`:'Belum cukup sample untuk perbandingan.'} ${enough?'Sample sudah melewati 20+20, tetapi tetap perlu melihat stabilitas dan biaya.':'Kumpulkan minimal 20 paper dan 20 research closed sebelum menarik kesimpulan.'}</div>`;
}
function renderAdaptiveRiskPanel(host){
  const c=paperEffectiveRiskPct(), st=paperStats();
  host.innerHTML=`<div class="sxeIntelTitle">V5.79 ADAPTIVE RISK</div><div class="paperCompare"><div><small>BASE RISK</small><b>${c.base.toFixed(2)}%</b></div><div><small>ACTIVE RISK</small><b>${c.used.toFixed(2)}%</b></div><div><small>MULTIPLIER</small><b>${c.mult.toFixed(2)}×</b></div><div><small>DRAWDOWN</small><b>${st.dd.toFixed(2)}%</b></div><div><small>LOSS STREAK</small><b>${st.maxStreak}</b></div></div><div class="adaptiveGuard"><b>GUARD:</b> ${c.reason}. Risk hanya bisa turun: normal 1×, caution 0.5×, defensive 0.25×. Tidak ada mekanisme untuk menaikkan risk setelah profit dan tidak mengubah leverage cap.</div>`;
}
function renderPaperIntelligence(){
  const host=$('paperIntelligenceV579');if(!host)return;
  host.innerHTML='<div class="paperIntelligence"><div id="paperReplayV577"></div><div id="paperCompareV578"></div><div id="paperAdaptiveV579"></div><div id="sessionIntelligenceV580"></div><div id="eventFilterV581"></div><div id="confidenceCalibration2V582"></div></div>';
  renderPaperReplay($('paperReplayV577'));renderPaperComparison($('paperCompareV578'));renderAdaptiveRiskPanel($('paperAdaptiveV579'));renderPerformanceDashboard();renderMarketExtensions();
}


// V5.80–V5.82 Market Intelligence Extensions
function marketSession(ts){
  const h=new Date(Number(ts)||Date.now()).getUTCHours();
  if(h>=0&&h<7)return 'ASIA';
  if(h>=7&&h<13)return 'LONDON';
  if(h>=13&&h<21)return 'NEW YORK';
  return 'OFF-HOURS';
}
function buildSessionIntelligence(){
  const rows=(PAPER.trades||[]).filter(x=>Number.isFinite(Number(x.netPnl)));
  const map={};
  for(const x of rows){const k=marketSession(x.openedTs||x.ts);(map[k]??=[]).push(x)}
  return Object.entries(map).map(([session,a])=>{const rs=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);const wins=a.filter(x=>Number(x.netPnl)>0).length;return {session,n:a.length,hit:a.length?wins/a.length*100:0,avgR:rs.length?rs.reduce((u,v)=>u+v,0)/rs.length:0,pnl:a.reduce((u,x)=>u+Number(x.netPnl||0),0)}}).sort((a,b)=>b.n-a.n);
}
function buildVolatilityEventFilter(){
  const a=Array.isArray(S.c)?S.c:[];
  if(a.length<30)return {state:'DATA PENDING',score:0,atrRatio:null,rangeRatio:null,reason:'Minimal 30 candle diperlukan untuk baseline volatilitas.'};
  const atrs=ATR(a,14), curAtr=Number(atrs.at(-1)||0), base=atrs.slice(-31,-1).filter(Number.isFinite); const med=[...base].sort((x,y)=>x-y)[Math.floor(base.length/2)]||curAtr;
  const ranges=a.slice(-21,-1).map(x=>Number(x.h)-Number(x.l)).filter(Number.isFinite); const cur=a.at(-1), curRange=Number(cur.h)-Number(cur.l); const avg=ranges.length?ranges.reduce((u,v)=>u+v,0)/ranges.length:curRange;
  const atrRatio=med>0?curAtr/med:1, rangeRatio=avg>0?curRange/avg:1;
  const score=Math.max(0,Math.min(100,100-Math.max(0,atrRatio-1)*45-Math.max(0,rangeRatio-1)*35));
  const extreme=atrRatio>=2||rangeRatio>=2.5, elevated=atrRatio>=1.5||rangeRatio>=1.75;
  return {state:extreme?'HIGH VOLATILITY':elevated?'ELEVATED':'NORMAL',score,atrRatio,rangeRatio,reason:extreme?'Range/ATR jauh di atas baseline; filter menyarankan WAIT dan tidak membuka risiko baru secara agresif.':elevated?'Volatilitas meningkat dibanding baseline; periksa spread, slippage dan safety sebelum entry.':'Volatilitas berada dekat baseline.',candleTs:Number(cur.t||Date.now())};
}
function buildConfidenceCalibration2(){
  const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'));
  const buckets=Array.from({length:5},(_,i)=>({label:`${i*20}-${i*20+19}`,n:0,actual:0,error:0}));
  for(const x of rows){const sc=Math.max(0,Math.min(99,Number(x.score)||0));const b=buckets[Math.floor(sc/20)];b.n++;b.actual+=(x.outcome==='HIT'?1:0)}
  for(const b of buckets){b.actual=b.n?b.actual/b.n:null;const lo=Number(b.label.split('-')[0]);b.expected=(lo+10)/100;b.error=b.actual==null?null:Math.abs(b.actual-b.expected)}
  const valid=buckets.filter(x=>x.n>=5&&x.error!=null); const mae=valid.length?valid.reduce((u,x)=>u+x.error,0)/valid.length:null;
  const brier=rows.length?rows.reduce((u,x)=>{const p=Math.max(0,Math.min(1,Number(x.score||0)/100)),y=x.outcome==='HIT'?1:0;return u+(p-y)**2},0)/rows.length:null;
  const status=rows.length<25?'COLLECTING':mae!=null&&mae<=.10?'WELL CALIBRATED':mae!=null&&mae<=.18?'WATCH':'MISALIGNED';
  return {rows,buckets,mae,brier,status};
}
function renderMarketExtensions(){
  const sessionHost=$('sessionIntelligenceV580'), eventHost=$('eventFilterV581'), calHost=$('confidenceCalibration2V582');
  if(sessionHost){const rows=buildSessionIntelligence();sessionHost.innerHTML=`<div class="sxeIntelTitle">V5.80 SESSION INTELLIGENCE</div>${rows.length?rows.map(x=>`<div class="ljRow"><span>${x.session}</span><b>${x.n} trade · ${x.hit.toFixed(1)}% HIT</b><small>${x.avgR.toFixed(2)}R · ${x.pnl>=0?'+':''}${x.pnl.toFixed(2)} USDT</small></div>`).join(''):'<div class="note">Belum ada paper trade yang cukup untuk statistik sesi.</div>'}<div class="adaptiveGuard">Sesi hanya digunakan untuk observasi historis. Sample kecil tidak dianggap sebagai bukti bahwa satu sesi lebih menguntungkan.</div>`}
  if(eventHost){const o=buildVolatilityEventFilter();const tone=o.state==='HIGH VOLATILITY'?'bad':o.state==='ELEVATED'?'gold':'good';eventHost.innerHTML=`<div class="sxeIntelTitle">V5.81 VOLATILITY / EVENT FILTER</div><div class="ljSummary"><div><small>STATE</small><b class="${tone}">${o.state}</b></div><div><small>FILTER SCORE</small><b>${o.score}/100</b></div><div><small>ATR RATIO</small><b>${o.atrRatio==null?'—':o.atrRatio.toFixed(2)}×</b></div><div><small>RANGE RATIO</small><b>${o.rangeRatio==null?'—':o.rangeRatio.toFixed(2)}×</b></div></div><div class="adaptiveGuard"><b>FILTER:</b> ${o.reason} Ini adalah filter volatilitas berbasis market data, bukan feed berita dan tidak mengklaim mengetahui jadwal news.</div>`}
  if(calHost){const a=buildConfidenceCalibration2();const tone=a.status==='WELL CALIBRATED'?'good':a.status==='WATCH'?'gold':'bad';calHost.innerHTML=`<div class="sxeIntelTitle">V5.82 CONFIDENCE CALIBRATION 2.0</div><div class="ljSummary"><div><small>STATUS</small><b class="${tone}">${a.status}</b></div><div><small>CLOSED SAMPLE</small><b>${a.rows.length}</b></div><div><small>MAE</small><b>${a.mae==null?'—':(a.mae*100).toFixed(1)+'pp'}</b></div><div><small>BRIER</small><b>${a.brier==null?'—':a.brier.toFixed(3)}</b></div></div><div class="calTable"><div class="calHead"><span>SCORE</span><span>N</span><span>ACTUAL</span><span>EXPECTED</span><span>ERROR</span></div>${a.buckets.map(x=>`<div class="calRow"><span>${x.label}</span><span>${x.n}</span><b>${x.actual==null?'—':Math.round(x.actual*100)+'%'}</b><span>${Math.round(x.expected*100)}%</span><span>${x.error==null?'—':Math.round(x.error*100)+'pp'}</span></div>`).join('')}</div><div class="adaptiveGuard">Calibration hanya mengukur kesesuaian confidence historis dengan outcome. Tidak mengubah confidence atau membuka order secara otomatis.</div>`}
}

function persistDecisionAudit(){try{localStorage.setItem('obsidian_decision_audit_v574',JSON.stringify(DECISION_AUDIT.slice(-100)))}catch{}}
function decisionAuditSnapshot(pred,o){
  const price=Number(S.market?.mark||S.market?.price||S.c.at(-1)?.c||0);
  return {ts:Date.now(),symbol:S.symbol,timeframe:S.tf,price,side:pred?.side||'WAIT',signalScore:Number(pred?.score||0),decision:o?.state||'WAIT',decisionScore:Number(o?.score||0),reasons:(o?.reasons||[]).slice(0,8),base:o?.base?.state||'WAIT',edge:o?.edge?.state||'WAIT',edgeScore:Number(o?.edge?.score||0),regime:o?.regime?.current?.label||o?.regime?.currentKey||'—',regimeState:o?.regime?.state||'WAIT',capital:o?.capital?.ok?'CLEAR':'BLOCKED',portfolio:o?.portfolio?.state||'—',validation:o?.validation?.state||'—',dataQuality:o?.dataQuality?.state||'—',dataQualityScore:Number(o?.dataQuality?.score||0),strategyVersion:STRATEGY_VERSION,auto:!!AUTO_ENTRY,kill:!!S.kill};
}
function recordDecisionAudit(pred,o){
  const x=decisionAuditSnapshot(pred,o);
  const fp=[x.symbol,x.timeframe,x.side,x.signalScore,x.decision,x.decisionScore,x.base,x.edge,x.regime,x.regimeState,x.capital,x.portfolio,x.validation,x.dataQuality,x.dataQualityScore,x.strategyVersion,x.auto,x.kill].join('|');
  if(fp===LAST_DECISION_AUDIT_FP)return; LAST_DECISION_AUDIT_FP=fp;
  DECISION_AUDIT.push(x); if(DECISION_AUDIT.length>100)DECISION_AUDIT=DECISION_AUDIT.slice(-100); persistDecisionAudit();
}
function clearDecisionAudit(){DECISION_AUDIT=[];LAST_DECISION_AUDIT_FP='';persistDecisionAudit();renderDecisionAudit();}
function exportDecisionAudit(){
  const blob=new Blob([JSON.stringify(DECISION_AUDIT,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`decision-audit-${S.symbol||'symbol'}-v5.74.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function renderTradingOperatingSystem(pred){
  LAST_LIVE_FINAL=pred||{};
  const host=$('tradingOperatingSystemV575'); if(!host)return;
  const o=buildUnifiedDecision(pred||{});
  const label=o.state==='READY'?'TRADE':o.state==='BLOCK'?'BLOCK':'WAIT';
  const tone=label==='TRADE'?'good':label==='BLOCK'?'bad':'gold';
  const checks=[
    ['SIGNAL',o.base?.state||'WAIT'],
    ['EDGE',o.edge?.state||'WAIT'],
    ['REGIME',o.regime?.state||'WAIT'],
    ['CAPITAL',o.capital?.ok?'CLEAR':'BLOCKED'],
    ['PORTFOLIO',o.portfolio?.state||'—'],
    ['VALIDATION',o.validation?.state||'—'],
    ['DATA',o.dataQuality?.state||'—'],
    ['SAFETY',o.kill?.state||'—']
  ];
  const blockers=(o.reasons||[]).filter(Boolean).slice(0,5);
  host.innerHTML=`<div class="tosHead"><div><span class="label">V5.75 TRADING OPERATING SYSTEM</span><b>Satu tampilan untuk seluruh decision stack</b></div><span class="tosDecision ${tone}">${label} · ${Number(o.score||0)}/100</span></div>
  <div class="tosGrid"><div class="tosHero"><small>DECISION</small><strong class="${tone}">${label}</strong><span>${S.symbol||'—'} · ${S.tf||'—'} · ${pred?.side||'WAIT'}</span></div>${checks.map(([k,v])=>`<div class="tosCheck"><small>${k}</small><b>${String(v)}</b></div>`).join('')}</div>
  <div class="tosBottom"><div><small>ALASAN UTAMA</small><div class="note">${blockers.join(' · ')||'Semua layer utama belum memberikan blocker.'}</div></div><div><small>MODE</small><div class="note">AUTO ${AUTO_ENTRY?'ON':'OFF'} · KILL ${S.kill?'ON':'OFF'} · PAPER ${PAPER_ENABLED?'ON':'OFF'} · STRATEGY ${STRATEGY_VERSION}</div></div></div>`;
}

function renderDecisionAudit(){
  const host=$('decisionAuditV574'); if(!host)return;
  const rows=DECISION_AUDIT.slice().reverse().slice(0,12);
  const counts=DECISION_AUDIT.reduce((m,x)=>(m[x.decision]=(m[x.decision]||0)+1,m),{});
  const last=rows[0];
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.74 FULL DECISION AUDIT</span><b>Jejak lengkap setiap perubahan keputusan</b></div><span class="sxeBadge gold">${DECISION_AUDIT.length} RECORD</span></div>
  <div class="ljSummary"><div><small>TRADE</small><b class="good">${counts.TRADE||0}</b></div><div><small>WAIT</small><b>${counts.WAIT||0}</b></div><div><small>BLOCK</small><b class="bad">${counts.BLOCK||0}</b></div><div><small>LAST</small><b>${last?.decision||'—'}</b></div></div>
  <div class="contextRows"><div><span>Last signal</span><b>${last?.side||'—'} · ${last?.signalScore??'—'}/100</b></div><div><span>Last score</span><b>${last?.decisionScore??'—'}/100</b></div><div><span>Strategy</span><b>${last?.strategyVersion||STRATEGY_VERSION}</b></div><div><span>Safety</span><b>${last?.capital||'—'} · ${last?.dataQuality||'—'}</b></div></div>
  <div style="display:flex;gap:6px;margin-top:8px"><button class="btn" id="auditExport574">EXPORT JSON</button><button class="btn" id="auditClear574">CLEAR AUDIT</button></div>
  <div class="auditRows">${rows.map(x=>`<div class="auditRow"><div><b class="${x.decision==='TRADE'?'good':x.decision==='BLOCK'?'bad':'gold'}">${x.decision}</b> · ${x.side} · ${x.symbol}</div><div>${new Date(x.ts).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · ${x.price?fmtIDR(x.price):'—'}</div><div>Score ${x.decisionScore}/100 · Edge ${x.edge} · Regime ${x.regimeState} · Capital ${x.capital} · DQ ${x.dataQuality}</div><div class="note">${(x.reasons||[]).slice(0,3).join(' · ')||'Konfirmasi utama selaras.'}</div></div>`).join('')||'<div class="note">Belum ada perubahan keputusan yang tercatat.</div>'}</div>
  <div class="note">Audit menyimpan snapshot alasan dan kondisi aplikasi saat keputusan berubah. Ini adalah catatan sistem, bukan jaminan hasil trading.</div>`;
  $('auditExport574')?.addEventListener('click',exportDecisionAudit); $('auditClear574')?.addEventListener('click',()=>{if(confirm('Hapus seluruh Decision Audit?'))clearDecisionAudit()});
}

const STRATEGY_VERSION_KEY='obsidian_strategy_version_572';
const STRATEGY_HISTORY_KEY='obsidian_strategy_history_572';
function getStrategyConfig(){
  const num=id=>Number($(id)?.value);
  return {codeVersion:STRATEGY_VERSION,symbol:S.symbol,tf:S.tf,risk:num('risk'),leverage:num('lev'),sizingMode:$('sizingMode')?.value||'',atrMult:num('atrMult'),rr:num('rr'),noTp:!!$('noTp')?.checked,entryGuard:!!$('entryGuard')?.checked,capitalProtection:{...CAPITAL_PROTECTION}};
}
function stableStrategyFingerprint(cfg){
  const raw=JSON.stringify(cfg,Object.keys(cfg).sort());
  let h=2166136261; for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)} return (h>>>0).toString(16);
}
function loadStrategyHistory(){try{return JSON.parse(localStorage.getItem(STRATEGY_HISTORY_KEY)||'[]')}catch{return []}}
function persistStrategyHistory(rows){try{localStorage.setItem(STRATEGY_HISTORY_KEY,JSON.stringify(rows.slice(-30)))}catch{}}
function captureStrategyVersion(){
  const cfg=getStrategyConfig(), fingerprint=stableStrategyFingerprint(cfg), current={id:`${STRATEGY_VERSION}-${fingerprint}`,fingerprint,at:Date.now(),config:cfg};
  let history=loadStrategyHistory(), previous=history.at(-1);
  if(!previous||previous.fingerprint!==fingerprint||previous.config?.codeVersion!==cfg.codeVersion){history.push(current);persistStrategyHistory(history);previous=history.at(-2)||null;}
  try{localStorage.setItem(STRATEGY_VERSION_KEY,JSON.stringify(current))}catch{}
  return {current,previous,history};
}
function strategyFreezeConfig(){
  const v=captureStrategyVersion();
  return {version:v.current.id,fingerprint:v.current.fingerprint,codeVersion:STRATEGY_VERSION,at:Date.now(),config:v.current.config};
}
function strategyFreezePersist(){try{localStorage.setItem(STRATEGY_FREEZE_KEY,JSON.stringify(STRATEGY_FREEZE||null))}catch{}}
function strategyFreezeIds(){return ['tf','risk','lev','sizingMode','noTp','atrMult','rr','entryGuard']}
function applyStrategyFreezeUI(){
  const frozen=!!STRATEGY_FREEZE?.enabled;
  strategyFreezeIds().forEach(id=>{const el=$(id);if(el)el.disabled=frozen;});
  const b=$('strategyFreezeToggle');
  if(b){b.textContent=frozen?'🔒 STRATEGY FROZEN · UNFREEZE':'🔐 FREEZE CURRENT STRATEGY';b.classList.toggle('active',frozen);}
  const st=$('strategyFreezeStatus');
  if(st){
    if(!STRATEGY_FREEZE) st.innerHTML='<b>UNFROZEN</b> · perubahan parameter akan membuat snapshot/version baru.';
    else st.innerHTML=`<b>FROZEN</b> · ${STRATEGY_FREEZE.version} · fingerprint ${STRATEGY_FREEZE.fingerprint} · ${signalTime(STRATEGY_FREEZE.at)}`;
  }
}
function strategyFreezeToggle(){
  if(STRATEGY_FREEZE?.enabled){
    STRATEGY_FREEZE=null; strategyFreezePersist(); applyStrategyFreezeUI(); renderStrategyFreeze(); return;
  }
  const snap=strategyFreezeConfig(); STRATEGY_FREEZE={...snap,enabled:true}; strategyFreezePersist(); applyStrategyFreezeUI(); renderStrategyFreeze();
}
function renderStrategyFreeze(){
  const host=$('strategyFreezeV585'); if(!host)return;
  const v=captureStrategyVersion(), f=STRATEGY_FREEZE;
  const mismatch=f&&f.codeVersion!==STRATEGY_VERSION;
  host.innerHTML=`<div class="freezeHead"><div><span class="label">V5.85 STRATEGY FREEZE</span><b>Lock konfigurasi untuk eksperimen yang konsisten</b></div><span class="sxeBadge ${f?'good':'gold'}">${f?'FROZEN':'UNFROZEN'}</span></div>
  <div class="freezeStatus" id="strategyFreezeStatus">${f?`<b>FROZEN</b> · ${f.version} · fingerprint ${f.fingerprint} · ${signalTime(f.at)}`:'<b>UNFROZEN</b> · perubahan parameter akan membuat snapshot/version baru.'}</div>
  <div class="freezeGrid"><div><small>CURRENT VERSION</small><b>${v.current.id}</b></div><div><small>FINGERPRINT</small><b>${v.current.fingerprint}</b></div><div><small>CODE</small><b>${STRATEGY_VERSION}</b></div><div><small>LOCKED PARAMS</small><b>8</b></div></div>
  ${mismatch?'<div class="adaptiveGuard"><b>RE-FREEZE REQUIRED:</b> kode strategi berubah sejak snapshot. Jangan gunakan freeze lama sebagai pembanding langsung.</div>':''}
  <button class="btn ${f?'active':''}" id="strategyFreezeToggle">${f?'🔒 STRATEGY FROZEN · UNFREEZE':'🔐 FREEZE CURRENT STRATEGY'}</button>
  <div class="note" style="margin-top:7px">Freeze mengunci timeframe, risiko acuan, leverage, sizing, TP mode, ATR SL, RR, dan entry guard. Unfreeze harus dilakukan manual; sistem tidak menaikkan risiko atau mengubah parameter diam-diam.</div>`;
  $('strategyFreezeToggle')?.addEventListener('click',strategyFreezeToggle);
  applyStrategyFreezeUI();
}
function strategyConfigDiff(a,b){
  if(!a||!b)return [];
  const keys=['tf','risk','leverage','sizingMode','atrMult','rr','noTp','entryGuard'];
  return keys.filter(k=>JSON.stringify(a.config?.[k])!==JSON.stringify(b.config?.[k])).map(k=>({key:k,from:a.config?.[k],to:b.config?.[k]}));
}
function getStrategyVersionStats(){
  const rows=SIGNALS.filter(x=>x&&x.status==='CLOSED'&&x.strategyVersion);
  const map={}; for(const x of rows){(map[x.strategyVersion]??=[]).push(x)}
  return Object.entries(map).map(([version,a])=>{const r=a.map(x=>Number(x.realizedR)).filter(Number.isFinite),wins=a.filter(x=>x.outcome==='HIT'||Number(x.realizedR)>0).length;return {version,n:a.length,avgR:r.length?r.reduce((s,v)=>s+v,0)/r.length:0,hit:a.length?wins/a.length*100:0}}).sort((a,b)=>b.n-a.n);
}
function renderStrategyVersioning(){
  const host=$('strategyVersioningV572');if(!host)return; const v=captureStrategyVersion(), rows=getStrategyVersionStats(), diff=strategyConfigDiff(v.previous,v.current);
  const history=v.history.slice().reverse().slice(0,6);
  const statRows=rows.slice(0,6).map(x=>`<div class="contextRows"><span>${x.version}</span><b>${x.n} closed · ${x.hit.toFixed(1)}% HIT · ${x.avgR.toFixed(2)}R</b></div>`).join('')||'<div class="note">Belum ada closed signal yang menyimpan strategy version.</div>';
  const changes=diff.length?diff.map(x=>`<div class="contextRows"><span>${x.key}</span><b>${String(x.from)} → ${String(x.to)}</b></div>`).join(''):'<div class="note">Tidak ada perubahan parameter inti dibanding snapshot sebelumnya.</div>';
  const hist=history.map(x=>`<div class="contextRows"><span>${x.id}</span><b>${signalTime(x.at)}</b></div>`).join('')||'<div class="note">Snapshot pertama akan dibuat saat panel aktif.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.72 STRATEGY VERSIONING</span><b>Jejak perubahan strategi &amp; parameter</b></div><span class="sxeBadge good">${v.current.id}</span></div>
  <div class="ljSummary"><div><small>CODE</small><b>${STRATEGY_VERSION}</b></div><div><small>FINGERPRINT</small><b>${v.current.fingerprint}</b></div><div><small>VERSIONS</small><b>${v.history.length}</b></div><div><small>TRACKING</small><b>ACTIVE</b></div></div>
  <div class="sxeIntelTitle">PERUBAHAN DARI SNAPSHOT SEBELUMNYA</div>${changes}
  <div class="sxeIntelTitle" style="margin-top:10px">PERFORMANCE PER STRATEGY VERSION</div>${statRows}
  <div class="sxeIntelTitle" style="margin-top:10px">VERSION HISTORY</div>${hist}
  <div class="adaptiveGuard"><b>AUDIT:</b> setiap signal baru diberi strategy version agar hasil setelah perubahan dapat dibandingkan. Versioning tidak mengklaim bahwa versi terbaru lebih profitable.</div>`;
}
let CAPITAL_PROTECTION=(()=>{try{return JSON.parse(localStorage.getItem('obsidian_capital_protection')||'null')}catch{return null}})()||{enabled:true,dailyLossPct:3,weeklyLossPct:6,maxDrawdownPct:8,maxLosingStreak:4,cooldownMin:60};
let CAPITAL_GUARD_CACHE={at:0,data:null};
let LAST_ORDER_DIAGNOSTIC={at:0,html:'',keepMs:12000};
let AUTO_COOLDOWN_UNTIL=Number(localStorage.getItem('obsidian_auto_cooldown')||0);
let autoBusy=false;
let AUTO_PROFIT_ARM_IDR=5000;
let AUTO_PROFIT_GIVEBACK_PCT=25;
let AUTO_REENTRY_SCORE=60;
let AUTO_REENTRY_GAP=4;
// Simple risk controls: close a losing position quickly; let profitable positions run.
let AUTO_LOSS_CUT_IDR=700;
let AUTO_PROTECT_COOLDOWN_MS=15000;
let AUTO_PROTECT={key:null,side:null,peak:0,armed:false,lastActionAt:0};
let AUTO_LAST_ATTEMPT={key:null,at:0};
let AUTO_RETRY_MS=5000;
let autoProtectBusy=false;
let lastSignalSlot=null,lastSignalSide=null;
try{SIGNALS=JSON.parse(localStorage.getItem(SIGNAL_KEY)||'[]')}catch{SIGNALS=[]}
let wsMarket=null,wsPublic=null,oiTimer=null,pollTimer=null,accountTimer=null,clockTimer=null;
let marketWsRetry=0,marketWsRetryTimer=null,publicWsRetry=0,publicWsRetryTimer=null;
let marketWsConnected=false,publicWsConnected=false,lastMarketWsDataAt=0;
let depthSyncBusy=false,depthResyncTimer=null;
let fallbackPollBusy=false;
let PINCH=null;
let drawRAF=0;
let ENTRY_GUARD=true;
let MANUAL_ENTRY_STOP=false;
let deferredInstallPrompt=null;
let lastLivePriceTs=0;

function scheduleDraw(){if(drawRAF)return;drawRAF=requestAnimationFrame(()=>{drawRAF=0;safeDraw()})}
function currentLiveSide(){const c=S.c.at(-1); if(!c)return 'WAIT'; const pred=AI_TREND?.side||'WAIT'; const candle=c.c>c.o?'BUY':c.c<c.o?'SELL':'WAIT'; if(pred!=='WAIT')return pred; return candle;}
function entryGuard(side){if(MANUAL_ENTRY_STOP)return {ok:false,live:currentLiveSide(),reason:'STOP ENTRY aktif secara manual.'}; /* Manual BUY/SELL must never be blocked by WAIT or opposite live signal. ENTRY_GUARD is informational for manual trading; automatic entry remains disabled. */ return {ok:true,live:currentLiveSide()};}
function updateEntryButtons(){const live=currentLiveSide(),stopped=MANUAL_ENTRY_STOP,guard=ENTRY_GUARD;const lb=$('long'),sb=$('short'),ql=$('quickLong'),qs=$('quickShort');[[lb,'BUY'],[ql,'BUY'],[sb,'SELL'],[qs,'SELL']].forEach(([b,side])=>{if(b){const blocked=stopped;b.disabled=blocked;b.classList.toggle('entryStopped',blocked);b.title=stopped?'STOP ENTRY aktif.':'Manual entry bebas; signal realtime hanya informasi.';}});const st=$('entryGuardStatus');if(st)st.textContent=stopped?'STOP ENTRY AKTIF · order baru dihentikan':'MANUAL ENTRY BEBAS · BUY/SELL dikirim sesuai tombol; AUTO tetap memakai guard realtime';if(st)st.className='note '+(stopped?'bad':'good');}


let MARKET_WS_BASE='wss://fstream.binance.com/market';
let PUBLIC_WS_BASE='wss://fstream.binance.com/public';
let USER_WS_BASE='wss://fstream.binance.com/private';
let USER_WS_MODE='private-routed';
let wsAccount=null,accountWsConnected=false,accountWsRetry=0,accountWsKeepalive=null,lastAccountWsDataAt=0,accountWsConnecting=false;
let USDT_IDR_RATE=16500;
let ORDER_FILTERS={stepSize:0.001,minQty:0,maxQty:0,tickSize:0.01};
const fmtIDR=n=>{n=+n;if(!Number.isFinite(n))return '—';return 'Rp '+Math.round(n*USDT_IDR_RATE).toLocaleString('id-ID')};
const fmtUSDT=n=>{n=+n;if(!Number.isFinite(n))return '—';return '$ '+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});};
const fmIDR=fmtIDR;
const toUSDT=idr=>(+idr||0)/Math.max(1,USDT_IDR_RATE);
const floorStep=(v,step)=>{v=Number(v);step=Number(step);if(!Number.isFinite(v)||!Number.isFinite(step)||step<=0)return 0;const d=Math.max(0,(String(step).split('.')[1]||'').length),f=10**d;return Math.floor((v*f+1e-9)/(step*f))*step};
async function loadOrderConstraints(){try{const x=await jsonFetch(`/api/order/constraints?symbol=${encodeURIComponent(S.symbol)}`);if(x?.lotSize)ORDER_FILTERS=x.lotSize; if(x?.priceFilter?.tickSize)ORDER_FILTERS.tickSize=x.priceFilter.tickSize;}catch{}}
async function serverOrderPreview(side){
  const z=S.smart?.[side.toLowerCase()]; if(!z)throw Error('SL/TP belum siap');
  const capitalIdr=+$('capital').value||0, riskPct=+$('risk').value||0, leverage=+$('lev').value||1;
  const entryType=String($('entryType')?.value||'MARKET').toUpperCase();
  const entryIdr=Number($('entryPrice')?.value||0); const entryInput=entryType==='LIMIT'?toUSDT(entryIdr):Number(S.c.at(-1)?.c||0);
  const body={symbol:S.symbol,side,entryType,entry:entryInput,entryPrice:entryInput,stopLoss:z.sl,takeProfit:$('noTp').checked?0:z.tp,capital:toUSDT(capitalIdr),riskPct,leverage,marginType:String($('margin')?.value||'Cross').toUpperCase(),sizingMode:String($('sizingMode')?.value||'MARGIN').toUpperCase()};
  return jsonFetch('/api/order/preview',{method:'POST',headers:H(),body:JSON.stringify(body)});
}
let S={symbol:'BTCUSDT',tf:'5m',c:[],view:{span:140,offset:0},ema:true,bb:false,macd:false,vwap:false,adx:false,atr:false,tool:null,lines:[],fib:null,sr:[],swings:[],drag:null,book:{bids:[],asks:[],lastUpdateId:0,ready:false,buffer:[],bid:null,ask:null},market:{},account:{},accountPosition:null,positions:[],mtf:{},kill:false};
let LIVE_POS_TRACK={key:null,detectedAt:0};

const fmt=n=>{n=+n;if(!Number.isFinite(n))return '—';return Math.abs(n)>=1000?n.toLocaleString(undefined,{maximumFractionDigits:2}):n.toFixed(Math.abs(n)<1?6:2)};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function EMA(a,n){if(!a.length)return[];let k=2/(n+1),e=a[0];return a.map((v,i)=>i?(e=v*k+e*(1-k)):e)}
function SMA(a,n){return a.map((_,i)=>{let z=a.slice(Math.max(0,i-n+1),i+1);return z.reduce((p,q)=>p+q,0)/z.length})}
function RSI(a,n=14){let g=0,l=0,o=Array(a.length).fill(null);for(let i=1;i<a.length;i++){let d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;if(i>=n)o[i]=100-100/(1+g/(l||1e-9))}return o}
function ATR(a,n=14){let tr=a.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-a[i-1].c),Math.abs(x.l-a[i-1].c)):x.h-x.l);return EMA(tr,n)}
function MACD(a){let f=EMA(a,12),s=EMA(a,26),m=f.map((x,i)=>x-s[i]),sig=EMA(m,9);return{m,sig,h:m.map((x,i)=>x-sig[i])}}
function VWAP(a){let pv=0,v=0;return a.map(x=>{pv+=((x.h+x.l+x.c)/3)*x.v;v+=x.v;return pv/(v||1)})}
function ADX(a,n=14){let tr=[],pdm=[],mdm=[];for(let i=0;i<a.length;i++){if(!i){tr.push(a[i].h-a[i].l);pdm.push(0);mdm.push(0);continue}const up=a[i].h-a[i-1].h,dn=a[i-1].l-a[i].l;tr.push(Math.max(a[i].h-a[i].l,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c)));pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0)}const atr=EMA(tr,n),p=EMA(pdm,n),m=EMA(mdm,n),dx=a.map((_,i)=>100*Math.abs((p[i]/(atr[i]||1e-9))-(m[i]/(atr[i]||1e-9)))/(((p[i]+m[i])/(atr[i]||1e-9))||1e-9));return EMA(dx,n)}
function swings(a,depth=3){let hi=[],lo=[];for(let i=depth;i<a.length-depth;i++){let H=true,L=true;for(let j=1;j<=depth;j++){H&&=(a[i].h>a[i-j].h&&a[i].h>=a[i+j].h);L&&=(a[i].l<a[i-j].l&&a[i].l<=a[i+j].l)}if(H)hi.push(i);if(L)lo.push(i)}return{hi,lo}}
function resize(){const r=cv.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height)),d=Math.max(1,Math.min(3,window.devicePixelRatio||1));cv.width=Math.floor(w*d);cv.height=Math.floor(h*d);cv.style.width=w+'px';cv.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);safeDraw()}addEventListener('resize',()=>requestAnimationFrame(resize));
function chartStatus(message,show=true){const el=$('chartStatus');if(!el)return;el.textContent=message;el.style.display=show?'flex':'none'}
function safeDraw(){
  try{
    if(!cv||!ctx||!cv.clientWidth||!cv.clientHeight)return;
    draw();
    if(S.c.length)chartStatus('',false);
  }catch(e){
    const msg=String(e?.message||e||'Unknown chart error');
    const el=$('conn');
    if(el){el.textContent='CHART ERROR';el.title=msg;}
    chartStatus('Chart error: '+msg);
    try{
      ctx.clearRect(0,0,cv.clientWidth,cv.clientHeight);
      ctx.fillStyle='#070b11';ctx.fillRect(0,0,cv.clientWidth,cv.clientHeight);
      ctx.fillStyle='#ff7189';ctx.font='bold 13px system-ui';ctx.fillText('Chart gagal dirender',16,28);
      ctx.fillStyle='#9aa8b8';ctx.font='11px system-ui';ctx.fillText('Memulihkan chart realtime…',16,48);
    }catch{}
  }
}
function draw(){
  if(!cv||!ctx)return;
  const r=priceMap();
  const {w,h,a,dx,py,start,hi,lo}=r;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#070b11';ctx.fillRect(0,0,w,h);
  if(!a.length){ctx.fillStyle='#718096';ctx.font='12px system-ui';ctx.fillText('Menunggu data market…',16,24);return;}

  // Grid + price scale
  ctx.strokeStyle='#16202c';ctx.lineWidth=1;
  for(let i=0;i<5;i++){const y=20+i*(h-52)/4;ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(w-8,y);ctx.stroke();}
  ctx.font='9px system-ui';ctx.fillStyle='#718096';
  for(let i=0;i<5;i++){const price=lo+(hi-lo)*(1-i/4),y=20+i*(h-52)/4;ctx.fillText(fmtIDR(price),4,y+3);}

  // Candles
  const bw=Math.max(2,Math.min(10,dx*.62));
  a.forEach((c,i)=>{
    const x=45+i*dx,yo=py(c.o),yc=py(c.c),yh=py(c.h),yl=py(c.l),up=c.c>=c.o;
    if(![x,yo,yc,yh,yl].every(Number.isFinite))return;
    ctx.strokeStyle=up?'#19d39b':'#ff5b7c';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
    ctx.fillStyle=up?'#19d39b':'#ff5b7c';
    const top=Math.min(yo,yc),bh=Math.max(1,Math.abs(yc-yo));ctx.fillRect(x-bw/2,top,bw,bh);
  });

  // SINGLE INDICATOR ONLY: Supertrend + B/S flips.
  const st=supertrend(S.c,10,3);
  if(Array.isArray(st.line)&&st.line.length){
    ctx.save();ctx.lineWidth=1.7;
    let prevX=null,prevY=null,prevDir=null;
    for(let i=start;i<start+a.length;i++){
      const v=Number(st.line[i]);
      if(!Number.isFinite(v))continue;
      const x=45+(i-start)*dx,y=py(v),dir=Number(st.trend?.[i]||0);
      if(prevX!==null&&prevDir===dir){ctx.strokeStyle=dir>0?'#19d39b':'#ff5b7c';ctx.beginPath();ctx.moveTo(prevX,prevY);ctx.lineTo(x,y);ctx.stroke();}
      ctx.fillStyle=dir>0?'#19d39b':'#ff5b7c';ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();
      prevX=x;prevY=y;prevDir=dir;
    }
    ctx.font='bold 10px system-ui';ctx.textAlign='center';
    (st.flips||[]).forEach(f=>{
      const i=Number(f.i);if(!Number.isInteger(i)||i<start||i>=start+a.length)return;
      const c=S.c[i];if(!c)return;const x=45+(i-start)*dx;
      const y=f.side==='BUY'?Math.max(14,py(c.l)-18):Math.min(h-42,py(c.h)+18);
      ctx.fillStyle=f.side==='BUY'?'#19d39b':'#ff5b7c';ctx.fillText(f.side==='BUY'?'B':'S',x,y);
    });
    ctx.restore();ctx.textAlign='start';
  }

  // H/L markers remain visible.
  ctx.textAlign='center';ctx.font='bold 10px system-ui';
  (S.swings?.hi||[]).forEach(i=>{
    if(i<start||i>=start+a.length)return;const c=S.c[i];if(!c)return;
    const x=45+(i-start)*dx,y=Math.max(12,py(c.h)-10);ctx.fillStyle='#ffb35c';ctx.fillText('H',x,y);
  });
  (S.swings?.lo||[]).forEach(i=>{
    if(i<start||i>=start+a.length)return;const c=S.c[i];if(!c)return;
    const x=45+(i-start)*dx,y=Math.min(h-38,py(c.l)+18);ctx.fillStyle='#6ee7c8';ctx.fillText('L',x,y);
  });
  ctx.textAlign='start';


  // Real Binance entry price.
  const ep=S.accountPosition,entry=Number(ep?.entryPrice||0);
  if(ep&&Math.abs(Number(ep.positionAmt||0))>0&&entry>0&&entry>=lo&&entry<=hi){
    const ey=py(entry),isLong=Number(ep.positionAmt)>0;
    ctx.save();ctx.strokeStyle=isLong?'#19d39b':'#ff5b7c';ctx.lineWidth=1.4;ctx.setLineDash([7,4]);
    ctx.beginPath();ctx.moveTo(45,ey);ctx.lineTo(w-8,ey);ctx.stroke();ctx.setLineDash([]);
    const label=(isLong?'ENTRY LONG':'ENTRY SHORT')+' · '+fmtIDR(entry);ctx.font='bold 10px system-ui';
    const tw=ctx.measureText(label).width+12,bx=Math.max(48,Math.min(w-tw-8,w-10-tw)),by=Math.max(18,Math.min(h-30,ey-15));
    ctx.fillStyle=isLong?'#12372d':'#3b1825';ctx.fillRect(bx,by,tw,18);ctx.fillStyle=isLong?'#7ff2cc':'#ff9ab0';ctx.fillText(label,bx+6,by+12);ctx.restore();
  }

  const last=a.at(-1);if(last){const x=45+(a.length-1)*dx;ctx.fillStyle='#e7edf5';ctx.font='10px system-ui';ctx.fillText('LIVE',Math.min(w-34,x+5),Math.max(12,py(last.c)-8));}
  ctx.fillStyle='#566579';ctx.font='9px system-ui';ctx.fillText('BINANCE FUTURES · LIVE',Math.max(8,w-145),14);
}
function priceMap(){let w=Math.max(1,cv.clientWidth),h=Math.max(1,cv.clientHeight);const end=Math.max(1,S.c.length-(S.view?.offset||0)),span=Math.max(40,Math.min(300,S.view?.span||140)),start=Math.max(0,end-span),a=S.c.slice(start,end);if(!a.length)return{w,h,a,hi:1,lo:0,dx:1,py:p=>h/2,start,end};const levels=(Array.isArray(S.sr)?S.sr:[]).filter(Number.isFinite),hi0=Math.max(...a.map(x=>x.h),...(levels.length?levels:[-Infinity])),lo0=Math.min(...a.map(x=>x.l),...(levels.length?levels:[Infinity]));let hi=Number.isFinite(hi0)?hi0:a[0].h,lo=Number.isFinite(lo0)?lo0:a[0].l;if(S.fib&&Number.isFinite(S.fib.a)&&Number.isFinite(S.fib.b)){hi=Math.max(hi,S.fib.a,S.fib.b);lo=Math.min(lo,S.fib.a,S.fib.b)}if(!(hi>lo)){const mid=Number(a.at(-1)?.c)||0;hi=mid+1;lo=mid-1}return{w,h,a,hi,lo,dx:Math.max(1,(w-58)/Math.max(1,a.length)),py:p=>h-32-(p-lo)/(hi-lo)*(h-62),start,end}}
function line(a,v,py,dx,col){ctx.strokeStyle=col||'#d9b56c';ctx.beginPath();v.forEach((z,i)=>{let x=45+i*dx,y=py(z);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
function hline(p,py,w,col){ctx.strokeStyle=col;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(45,py(p));ctx.lineTo(w,py(p));ctx.stroke();ctx.setLineDash([])}
function dot(i,p,dx,py,col,t){let x=45+i*dx,y=py(p);ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillText(t,x+4,y-4)}
async function load(){chartStatus('Mengambil data candlestick…');try{stopPolling();closeMarketWS();closePublicWS();try{const rt=await jsonFetch('/api/runtime');MARKET_WS_BASE=rt.marketWs||MARKET_WS_BASE;PUBLIC_WS_BASE=rt.publicWs||PUBLIC_WS_BASE;USER_WS_BASE=rt.userWs||rt.binanceWs||USER_WS_BASE;USER_WS_MODE=rt.userWsMode||USER_WS_MODE;USDT_IDR_RATE=Number(rt.usdtIdrRate||USDT_IDR_RATE);updateModeUI(rt);await loadOrderConstraints()}catch{}let r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`,{cache:'no-store'}),source=r.headers.get('X-Market-Data-Source')||'binance';let d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);S.c=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));$('price').textContent=fmtIDR(S.c.at(-1)?.c);$('conn').textContent=source==='bybit-fallback'?'MARKET DATA FALLBACK':'CONNECTING REALTIME…';$('conn').title=source==='bybit-fallback'?'Binance REST unavailable; chart history is using Bybit fallback.':'Connecting directly to Binance Futures WebSocket';S.swings=swings(S.c);smart();safeDraw();calc();connect();connectPublic();connectAccountWS();if($('signalTf'))$('signalTf').value=S.tf;mtf();refreshSignalFromCurrent();updateAITrend();updateLiveSignal();}catch(e){$('conn').textContent='MARKET DATA ERROR';$('conn').title=e.message;chartStatus('Data chart gagal dimuat: '+e.message+' — periksa /api/klines dan konfigurasi Vercel.');startPolling()}}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
async function pollKlines(){if(marketWsConnected)return;try{const r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`,{cache:'no-store'});const d=await r.json();if(marketWsConnected)return;if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);const rows=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));if(!rows.length)return;S.c=rows;const source=r.headers.get('X-Market-Data-Source')||'binance';$('price').textContent=fmtIDR(S.c.at(-1).c);$('conn').textContent=source==='bybit-fallback'?'REST FALLBACK · BYBIT':'REST FALLBACK · BINANCE';S.swings=swings(S.c);smart();calc();safeDraw()}catch(e){$('conn').title=e.message}}
async function pollLive(){if(marketWsConnected)return;try{const r=await fetch(`/api/market/ticker?symbol=${S.symbol}&interval=${S.tf}`,{cache:'no-store'});const d=await r.json();if(marketWsConnected)return;if(!r.ok||d.error)throw Error(d.error||`Market ticker HTTP ${r.status}`);if(d.candle){const c={t:+d.candle.t,o:+d.candle.o,h:+d.candle.h,l:+d.candle.l,c:+d.candle.c,v:+d.candle.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else if(!q||c.t>q.t){S.c.push(c);if(PAPER_ENABLED)paperTryEnterAtOpen(c); if(SIM_ENABLED)simEnterAtOpen(c);}if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);$('mark').textContent=fmtIDR(d.markPrice);$('index').textContent=fmtIDR(d.indexPrice);$('funding').textContent=(+d.fundingRate*100).toFixed(4)+'%';S.market.mark=+d.markPrice;S.market.index=+d.indexPrice;S.market.funding=+d.fundingRate;updateLiveSignal();S.swings=swings(S.c);smart();calc();safeDraw()}}catch(e){$('conn').title='REST fallback: '+e.message}}
function startPolling(){if(pollTimer)return;pollKlines();pollLive();pollTimer=setInterval(()=>{pollKlines();pollLive()},2000)}
function scheduleMarketReconnect(){if(marketWsRetryTimer)return;const delay=Math.min(30000,Math.max(1000,2**marketWsRetry*1000));marketWsRetry=Math.min(marketWsRetry+1,5);marketWsRetryTimer=setTimeout(()=>{marketWsRetryTimer=null;connect()},delay)}
function schedulePublicReconnect(){if(publicWsRetryTimer)return;const delay=Math.min(30000,Math.max(1000,2**publicWsRetry*1000));publicWsRetry=Math.min(publicWsRetry+1,5);publicWsRetryTimer=setTimeout(()=>{publicWsRetryTimer=null;connectPublic()},delay)}
function closeMarketWS(){marketWsConnected=false;if(marketWsRetryTimer){clearTimeout(marketWsRetryTimer);marketWsRetryTimer=null}if(wsMarket){try{wsMarket.close()}catch{};wsMarket=null}}
function closePublicWS(){publicWsConnected=false;if(publicWsRetryTimer){clearTimeout(publicWsRetryTimer);publicWsRetryTimer=null}if(wsPublic){try{wsPublic.close()}catch{};wsPublic=null}}
function applyDepthUpdate(d){if(!S.book.ready)return;if(Number(d.u)<=Number(S.book.lastUpdateId))return;if(Number(d.U)>Number(S.book.lastUpdateId)+1){S.book.ready=false;S.book.buffer=[];scheduleDepthResync();return}const merge=(current,updates,descending)=>{const m=new Map((current||[]).map(x=>[String(x[0]),[String(x[0]),String(x[1])]]));for(const x of (updates||[])){const k=String(x[0]),q=Number(x[1]);if(q===0)m.delete(k);else m.set(k,[k,String(x[1])]);}return [...m.values()].sort((a,b)=>descending?Number(b[0])-Number(a[0]):Number(a[0])-Number(b[0])).slice(0,100);};S.book.bids=merge(S.book.bids,d.b,true);S.book.asks=merge(S.book.asks,d.a,false);S.book.lastUpdateId=Number(d.u);renderBook()}
function scheduleDepthResync(){if(depthResyncTimer)return;depthResyncTimer=setTimeout(()=>{depthResyncTimer=null;syncDepthSnapshot()},250)}
async function syncDepthSnapshot(){if(depthSyncBusy)return;depthSyncBusy=true;try{const r=await jsonFetch(`/api/depth?symbol=${S.symbol}`);if(r?.lastUpdateId==null)throw Error('Depth snapshot tidak memiliki lastUpdateId');S.book.bids=r.bids||[];S.book.asks=r.asks||[];S.book.lastUpdateId=Number(r.lastUpdateId);S.book.ready=false;const buffered=S.book.buffer.splice(0);let start=-1;for(let i=0;i<buffered.length;i++){const d=buffered[i];if(Number(d.u)<=S.book.lastUpdateId)continue;if(Number(d.U)<=S.book.lastUpdateId+1&&Number(d.u)>=S.book.lastUpdateId+1){start=i;break}if(Number(d.U)>S.book.lastUpdateId+1)break}if(start>=0){S.book.ready=true;for(let i=start;i<buffered.length;i++)applyDepthUpdate(buffered[i])}else if(buffered.length){const d=buffered[buffered.length-1];if(Number(d.u)>S.book.lastUpdateId)S.book.ready=true;for(const x of buffered)if(S.book.ready)applyDepthUpdate(x)}else S.book.ready=true;renderBook()}catch{S.book.ready=false;scheduleDepthResync()}finally{depthSyncBusy=false}}

function closeAccountWS(){accountWsConnecting=false;if(accountWsRetryTimer){clearTimeout(accountWsRetryTimer);accountWsRetryTimer=null}if(accountWsKeepalive){clearInterval(accountWsKeepalive);accountWsKeepalive=null;}try{wsAccount?.close()}catch{}wsAccount=null;accountWsConnected=false;}
let accountWsRetryTimer=null;
function scheduleAccountReconnect(){if(accountWsRetryTimer)return;const delay=Math.min(15000,1000*Math.pow(1.6,accountWsRetry++));accountWsRetryTimer=setTimeout(()=>{accountWsRetryTimer=null;connectAccountWS()},delay);}
async function connectAccountWS(){
  if(accountWsConnecting||accountWsConnected)return;
  accountWsConnecting=true;
  try{
    const x=await jsonFetch('/api/user-stream',{headers:H()});
    if(!x?.listenKey)throw Error(x?.error||'ListenKey tidak tersedia');
    const base=String(x.userWs||USER_WS_BASE).replace(/\/$/,'');
    const mode=x.userWsMode||USER_WS_MODE;
    const url=mode==='private-routed'?`${base}/ws/${encodeURIComponent(x.listenKey)}`:`${base}/ws/${encodeURIComponent(x.listenKey)}`;
    const socket=new WebSocket(url); wsAccount=socket;
    socket.onopen=()=>{if(wsAccount!==socket)return;accountWsConnecting=false;accountWsConnected=true;accountWsRetry=0;lastAccountWsDataAt=Date.now();
      if(accountWsKeepalive)clearInterval(accountWsKeepalive);
      accountWsKeepalive=setInterval(()=>jsonFetch('/api/user-stream',{method:'PUT',headers:H()}).catch(()=>{}),30*60*1000);
      setAccountRealtimeStatus('ACCOUNT WS · REALTIME','good');
    };
    socket.onerror=()=>{if(wsAccount!==socket)return;accountWsConnected=false;setAccountRealtimeStatus('ACCOUNT WS · RECONNECTING…','wait');scheduleAccountReconnect();};
    socket.onclose=()=>{if(wsAccount!==socket)return;accountWsConnected=false;accountWsConnecting=false;if(accountWsKeepalive){clearInterval(accountWsKeepalive);accountWsKeepalive=null;}setAccountRealtimeStatus('ACCOUNT WS · RECONNECTING…','wait');scheduleAccountReconnect();};
    socket.onmessage=e=>{if(wsAccount!==socket)return;try{const d=JSON.parse(e.data);lastAccountWsDataAt=Date.now();handleAccountStreamEvent(d);}catch{}};
  }catch(e){accountWsConnecting=false;setAccountRealtimeStatus('ACCOUNT WS · FALLBACK REST','wait');scheduleAccountReconnect();}
}
function setAccountRealtimeStatus(text,cls='wait'){const el=$('accountRealtimeStatus');if(el){el.textContent=text;el.className='note '+cls;}}
function applyAccountPositionEvent(p){
  if(!p||String(p.s||'').toUpperCase()!==S.symbol)return;
  const qty=Number(p.pa||0), up=Number(p.up||0), ep=Number(p.ep||0), bep=Number(p.bep||ep||0);
  if(!qty){S.accountPosition=null;updateLivePositionHero(null);scheduleDraw();return;}
  const old=S.accountPosition||{};
  S.accountPosition={...old,symbol:S.symbol,positionAmt:qty,entryPrice:ep,breakEvenPrice:bep,unRealizedProfit:up,markPrice:Number(S.market.mark||0),leverage:Number(old.leverage||$('lev')?.value||1),positionSide:p.ps||'BOTH',updatedAt:Date.now()};
  updateLivePositionHero(S.accountPosition);scheduleDraw();
}
function handleAccountStreamEvent(d){
  if(d.e==='listenKeyExpired'){closeAccountWS();scheduleAccountReconnect();return;}
  if(d.e==='ACCOUNT_UPDATE'){
    const ps=Array.isArray(d.a?.P)?d.a.P:[];const p=ps.find(x=>String(x.s||'').toUpperCase()===S.symbol);if(p)applyAccountPositionEvent(p);
    const b=Array.isArray(d.a?.B)?d.a.B.find(x=>x.a==='USDT'):null;if(b){const bal=Number(b.wb||0);if(Number.isFinite(bal)&&bal>0)$('dockBalance').textContent=fmtIDR(bal);}
    renderAccountRealtimeSnapshot();
  } else if(d.e==='ORDER_TRADE_UPDATE'){
    const o=d.o||{};if(String(o.s||'').toUpperCase()!==S.symbol)return;
    const st=String(o.X||o.x||'').toUpperCase(),side=String(o.S||'').toUpperCase();
    const msg=`${side||'ORDER'} ${st||'UPDATE'} · Qty ${o.z||o.q||'0'} · Harga ${o.ap||o.L||o.p||'market'}`;
    if(st==='FILLED'||st==='PARTIALLY_FILLED')setAutoStatus(`BINANCE REALTIME: ${msg}`,st==='FILLED'?'good':'wait');
    if(st==='FILLED'||st==='CANCELED'||st==='EXPIRED'||st==='REJECTED')refreshAccount().catch(()=>{});
  }
}
function renderAccountRealtimeSnapshot(){
  const p=S.accountPosition, up=Number(p?.unRealizedProfit||0), entry=Number(p?.entryPrice||0), mark=Number(p?.markPrice||S.market.mark||0), qty=Number(p?.positionAmt||0), notional=Math.abs(entry*qty), lev=Number(p?.leverage||$('lev')?.value||1), roe=notional?up/Math.max(1,Math.abs(notional)/Math.max(1,lev))*100:0;
  $('dockPositionStatus').textContent=p?'OPEN POSITION · REALTIME WS':'NO OPEN POSITION';
  $('dockArah').textContent=p?(qty>0?'LONG':'SHORT'):'—'; $('dockArah').className=p?(qty>0?'good':'bad'):'';
  $('dockHargaMasuk').textContent=p?fmtIDR(entry):'—'; $('dockHargaMark').textContent=p?fmtIDR(mark):fmtIDR(Number(S.market.mark||0)); $('dockJumlah').textContent=p?fmt(Math.abs(qty)):'—';
  $('dockPnl').textContent=p?fmtIDR(up):'—'; $('dockPnl').className=p?(up>=0?'pnlProfit':'pnlLoss'):''; $('dockRoe').textContent=p?fmt(roe)+'%':'—';
  const btn=$('closePosition'); if(btn){btn.disabled=!p;btn.style.opacity=p?'1':'.45';}
  updateLivePositionHero(p);
}

function connect(){closeMarketWS();const s=S.symbol.toLowerCase(),tf=S.tf;const streams=[`${s}@kline_${tf}`,`${s}@markPrice@1s`,`${s}@forceOrder`,`${s}@aggTrade`].join('/');const url=`${MARKET_WS_BASE.replace(/\/$/,'')}/stream?streams=${streams}`;let socket;try{socket=new WebSocket(url);wsMarket=socket}catch(e){$('conn').textContent='REST FALLBACK';startPolling();scheduleMarketReconnect();return}socket.onopen=()=>{if(wsMarket!==socket)return;marketWsConnected=true;lastMarketWsDataAt=Date.now();marketWsRetry=0;stopPolling();$('conn').textContent=publicWsConnected?'REALTIME · WS':'REALTIME · WS (MARKET)';$('conn').title='Binance Futures market WebSocket';safeDraw();chartStatus('REALTIME · Binance Futures WebSocket')};socket.onerror=()=>{if(wsMarket!==socket)return;marketWsConnected=false;$('conn').textContent='RECONNECTING…';$('conn').title='Market WebSocket error; REST fallback active'};socket.onclose=()=>{if(wsMarket!==socket)return;marketWsConnected=false;$('conn').textContent='RECONNECTING…';startPolling();scheduleMarketReconnect()};socket.onmessage=e=>{if(wsMarket!==socket)return;try{lastMarketWsDataAt=Date.now();const z=JSON.parse(e.data),d=z.data||z;if(!d)return;if(d.e==='kline'){const k=d.k,c={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v},q=S.c.at(-1);if(q?.t===c.t){if(lastLivePriceTs>Date.now()-1500){c.c=q.c;c.h=Math.max(c.h,q.h);c.l=Math.min(c.l,q.l)}S.c[S.c.length-1]=c}else {S.c.push(c);if(PAPER_ENABLED)paperTryEnterAtOpen(c); if(SIM_ENABLED)simEnterAtOpen(c);}if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);S.swings=swings(S.c);smart();calc();updateLiveSignal();scheduleDraw();if(k.x)recordClosedSignal(c)}else if(d.e==='markPriceUpdate'){S.market.mark=+d.p;S.market.index=+d.i;S.market.funding=+d.r;$('mark').textContent=fmtIDR(d.p);$('index').textContent=fmtIDR(d.i);$('funding').textContent=(+d.r*100).toFixed(4)+'%';scheduleDraw()}else if(d.e==='aggTrade'){const price=+d.p;if(Number.isFinite(price)){const q=S.c.at(-1);if(q){q.c=price;q.h=Math.max(q.h,price);q.l=Math.min(q.l,price);lastLivePriceTs=Date.now();$('price').textContent=fmtIDR(price);S.market.last=price;updateLiveSignal();scheduleDraw()}}}else if(d.e==='forceOrder'){$('liq').textContent=`${d.o?.S||''} ${fmt(+d.o?.p||0)} × ${fmt(+d.o?.q||0)}`;S.market.liq=d.o?.q||0}}catch{}}}
function connectPublic(){closePublicWS();const s=S.symbol.toLowerCase();const streams=[`${s}@bookTicker`,`${s}@depth@100ms`].join('/');const url=`${PUBLIC_WS_BASE.replace(/\/$/,'')}/stream?streams=${streams}`;let socket;try{socket=new WebSocket(url);wsPublic=socket}catch{schedulePublicReconnect();return}socket.onopen=()=>{if(wsPublic!==socket)return;publicWsConnected=true;publicWsRetry=0;S.book.ready=false;S.book.buffer=[];syncDepthSnapshot();$('conn').textContent=marketWsConnected?'REALTIME · WS':'REALTIME · PUBLIC WS'};socket.onerror=()=>{if(wsPublic!==socket)return;publicWsConnected=false;$('conn').title='Public WebSocket error; reconnecting'};socket.onclose=()=>{if(wsPublic!==socket)return;publicWsConnected=false;S.book.ready=false;$('conn').textContent=marketWsConnected?'REALTIME · MARKET WS':'RECONNECTING…';schedulePublicReconnect()};socket.onmessage=e=>{if(wsPublic!==socket)return;try{const z=JSON.parse(e.data),d=z.data||z;if(!d)return;if(d.e==='bookTicker'){S.book.bid=+d.b;S.book.ask=+d.a;$('spread').textContent=fmt(+d.a-+d.b);scheduleDraw()}else if(d.e==='depthUpdate'){if(!S.book.ready){S.book.buffer.push(d);if(S.book.buffer.length>2000)S.book.buffer.shift()}else applyDepthUpdate(d)} }catch{}}}
function tfMillis(tf){const m={1:60000,3:180000,5:300000,15:900000,30:1800000,1.0:3600000};if(tf.endsWith('m'))return Number(tf.slice(0,-1))*60000;if(tf.endsWith('h'))return Number(tf.slice(0,-1))*3600000;if(tf.endsWith('d'))return Number(tf.slice(0,-1))*86400000;return 300000}
function syncPendingFinalSignal(){
  if(!S.c.length)return;
  const t=getFinalSignal();
  if(!t.targetTs)return;
  const idx=SIGNALS.findIndex(x=>x.symbol===S.symbol&&x.tf===S.tf&&Number(x.targetTs)===Number(t.targetTs)&&x.status==='PENDING');
  if(idx<0)return;
  const row=SIGNALS[idx];
  const next={...row,side:t.side,score:Number(t.score||0),gap:Number(t.gap||0),strength:t.strength||'LOW',reason:Array.isArray(t.reason)?t.reason.slice(-8):[String(t.reason||'—')],context:t.sr?.context||row.context,support:t.sr?.support??row.support,resistance:t.sr?.resistance??row.resistance,updatedAt:Date.now()};
  const changed=row.side!==next.side||Number(row.score)!==next.score||Number(row.gap)!==next.gap||row.strength!==next.strength||JSON.stringify(row.reason)!==JSON.stringify(next.reason);
  if(changed){SIGNALS[idx]=next;persistSignals();renderSignalDrop();renderFutureForecast();}
}
function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),t=getFinalSignal(),m=t.momentum||getRealtimeMomentum(),lc=liveCandleEngine(S.c);const dir=c.c>c.o?'NAIK · B':c.c<c.o?'TURUN · S':'DATAR';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta'),msig=$('liveMomentumSignal'),mscore=$('liveMomentumScore'),mbox=$('liveMomentumBox');const entryState=(t.side==='BUY'||t.side==='SELL')?entryTimingGuard(t.side,t):{ok:false,status:'WAIT',trendSide:'WAIT',reason:'Menunggu arah Supertrend.'};if(sig){sig.textContent=t.side==='BUY'?'BUY':t.side==='SELL'?'SELL':'WAIT';sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`TREND ${t.side} · ${entryState.ok?'ENTRY '+t.side:'ENTRY TUNGGU'} · ${t.score||0}/100 · ${entryState.reason||'Menunggu konfirmasi'}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(msig){msig.textContent=m.side==='BUY'?'BUY ↑':m.side==='SELL'?'SELL ↓':'WAIT •';msig.className='signal '+(m.side==='BUY'?'good':m.side==='SELL'?'bad':'wait')}if(mscore)mscore.textContent=`CANDLE LIVE · ${lc.side} · ${lc.score}/100 · ${(lc.reason||['Menunggu candle']).slice(0,3).join(' · ')}`;if(mbox)mbox.className='liveBox '+(m.side==='BUY'?'signalBuy':m.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('NAIK')?'good':dir.startsWith('TURUN')?'bad':'wait')}if(cprice)cprice.textContent=`LIVE ${lc.side} · body ${lc.bodyPct.toFixed(0)}% · wick ↑${lc.upperWickPct.toFixed(0)}% ↓${lc.lowerWickPct.toFixed(0)}% · close ${lc.closePos.toFixed(0)}%`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'BUY ↑':t.side==='SELL'?'SELL ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`TREND ${t.side} · CANDLE LIVE ${lc.side} ${lc.score}/100 · ${dir} · ${(lc.reason||['—']).slice(0,3).join(' / ')}`;AI_TREND=t;
  const one=$('singleIndicatorSignal'), oneMeta=$('singleIndicatorMeta');
  if(one){const trendSide=t.side; one.textContent=trendSide==='BUY'?'BUY · B':trendSide==='SELL'?'SELL · S':'WAIT'; one.className='signal '+(trendSide==='BUY'?'good':trendSide==='SELL'?'bad':'wait');}
  if(oneMeta)oneMeta.textContent=`SUPERTREND 10/3 · TREND ${t.side} ${t.score||0}/100 · ENTRY ${entryState.ok?t.side:'TUNGGU'} · Realtime ${m?.side||'WAIT'} ${m?.score||0}/100`;
  syncPendingFinalSignal(); updateEntryButtons()}
function fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return '—';const sec=Math.floor(ms/1000),d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),ss=sec%60;return (d?d+'h ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')}
function updateLivePositionHero(p){
  const hero=$('livePositionHero'),badge=$('liveHeroBadge'); if(!hero||!badge)return;
  const t=getFinalSignal();
  const now=Date.now(), has=!!(p&&Math.abs(Number(p.positionAmt||0))>0), side=has?(Number(p.positionAmt)>0?'LONG':'SHORT'):null;
  if(has){
    const key=[S.symbol,side,Number(p.entryPrice||0).toFixed(8),Math.abs(Number(p.positionAmt||0)).toFixed(8)].join('|');
    if(LIVE_POS_TRACK.key!==key){LIVE_POS_TRACK={key,detectedAt:now};try{localStorage.setItem('obsidian_live_pos_track',JSON.stringify(LIVE_POS_TRACK))}catch{}}
  }else if(LIVE_POS_TRACK.key){LIVE_POS_TRACK={key:null,detectedAt:0};try{localStorage.removeItem('obsidian_live_pos_track')}catch{}}
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('obsidian_live_pos_track')||'null')}catch{return null}})();
  if(!has && saved?.key===null) LIVE_POS_TRACK=saved;
  badge.textContent=has?(side==='LONG'?'● LONG AKTIF':'● SHORT AKTIF'):'○ FLAT'; badge.className='liveHeroBadge '+(has?'open '+(side==='LONG'?'long':'short'):'');
  const up=has?Number(p.unRealizedProfit||0):0, entry=Number(p?.entryPrice||0), mark=Number(p?.markPrice||S.market.mark||0), qty=Math.abs(Number(p?.positionAmt||0)), lev=Number(p?.leverage||$('lev')?.value||1), notional=Math.abs(entry*qty), roe=notional?up/Math.max(1,notional/Math.max(1,lev))*100:0;
  const pnl=$('liveHeroPnl'); if(pnl){pnl.textContent=has?fmtIDR(up):'—';pnl.className=has?(up>=0?'pnlProfit':'pnlLoss'):''}
  $('liveHeroPnlSub').textContent=has?`${side==='LONG'?'BUY / LONG':'SELL / SHORT'} · Binance UPNL ${fmtUSDT(up)} · ${up>=0?'PROFIT berjalan':'LOSS berjalan'}`:'Tidak ada posisi terbuka di Binance';
  $('liveHeroSide').textContent=has?side:'—';$('liveHeroSide').className=has?(side==='LONG'?'good':'bad'):'';
  $('liveHeroEntry').textContent=has?fmtIDR(entry):'—';$('liveHeroMark').textContent=has?fmtIDR(mark):fmtIDR(Number(S.market.mark||0));$('liveHeroRoe').textContent=has?fmt(roe)+'%':'—';$('liveHeroRoe').className=has?(roe>=0?'pnlProfit':'pnlLoss'):'';
  $('liveHeroQty').textContent=has?fmt(qty)+' BTC':'—';$('liveHeroLiq').textContent=has&&Number(p.liquidationPrice)>0?fmtIDR(Number(p.liquidationPrice)):'—';
  $('liveHeroDuration').textContent=has?fmtDuration(now-(LIVE_POS_TRACK.detectedAt||now)):'—';
  $('liveHeroSignal').textContent=t.side==='BUY'?'BUY ↑':t.side==='SELL'?'SELL ↓':'WAIT •';$('liveHeroSignal').className=t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait';
  $('liveHeroClock').textContent=new Date(now).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});$('liveHeroUpdated').textContent=new Date(now).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function tickLivePositionHero(){updateLivePositionHero(S.accountPosition);}
function captureExecutionQualityFromPosition(p){
  if(!p || !S.symbol) return;
  const side=Number(p.positionAmt||0)>0?'BUY':'SELL';
  const candidates=SIGNALS.filter(x=>x.symbol===S.symbol&&x.side===side&&['PENDING','CLOSED'].includes(x.status)).sort((a,b)=>Number(b.ts||b.targetTs||0)-Number(a.ts||a.targetTs||0));
  const row=candidates.find(x=>!Number.isFinite(Number(x.executedEntry)))||candidates[0];
  if(!row) return;
  const actual=Number(p.entryPrice||0), planned=Number(row.entry||row.entryPrice||0), signalTs=Number(row.ts||row.targetTs||0), at=Number(p.updatedAt||Date.now());
  if(!(actual>0)) return;
  const next={...row,executedEntry:actual,executedAt:at,executedQty:Math.abs(Number(p.positionAmt||0))};
  if(planned>0){
    next.executionSlippagePct=(actual-planned)/planned*100*(side==='BUY'?1:-1);
    next.executionSlippageBps=next.executionSlippagePct*100;
    next.executionPriceDelta=actual-planned;
  }
  if(signalTs>0)next.executionLatencySec=Math.max(0,(at-signalTs)/1000);
  const idx=SIGNALS.indexOf(row); if(idx>=0){SIGNALS[idx]=next;persistSignals();}
}
function executionQualityRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&Number.isFinite(Number(x.executedEntry))&&Number.isFinite(Number(x.entry||x.entryPrice))).sort((a,b)=>Number(a.executedAt||0)-Number(b.executedAt||0));
}
function executionQualityStats(rows){
  const slip=rows.map(x=>Number(x.executionSlippageBps)).filter(Number.isFinite);
  const latency=rows.map(x=>Number(x.executionLatencySec)).filter(Number.isFinite);
  const chase=rows.filter(x=>Number(x.executionSlippageBps)>20).length;
  const fast=latency.filter(x=>x<=60).length;
  const avg=a=>a.length?a.reduce((u,v)=>u+v,0)/a.length:null;
  const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.floor((b.length-1)/2)];};
  return {n:rows.length,avgSlip:avg(slip),medianSlip:median(slip),avgLatency:avg(latency),medianLatency:median(latency),chase,fast,goodSlip:slip.filter(x=>x<=20).length};
}
function buildExecutionQuality(){
  const rows=executionQualityRows(), s=executionQualityStats(rows), recent=executionQualityStats(rows.slice(-20));
  let state='WAIT',score=50,reason='Belum ada execution record yang terhubung dengan signal.';
  if(s.n>=5){
    const slip=s.avgSlip==null?0:s.avgSlip, lat=s.avgLatency==null?0:s.avgLatency;
    score=70-(Math.max(0,slip-10)*1.2)-(Math.max(0,lat-60)/12)-(s.chase/s.n*20);
    score=Math.max(0,Math.min(100,Math.round(score)));
    state=score>=75?'GOOD':score>=55?'WATCH':'POOR';
    reason=`${s.n} execution tercatat · rata-rata slippage ${s.avgSlip==null?'—':s.avgSlip.toFixed(1)+' bps'} · latency ${s.avgLatency==null?'—':s.avgLatency.toFixed(0)+' detik'} · chase ${s.chase}.`;
  } else if(s.n>0) reason=`Baru ${s.n} execution record. Minimal 5 sample sebelum kualitas eksekusi dinilai.`;
  return {state,score,rows,s,recent,reason};
}
function renderExecutionQuality(){
  const host=$('executionQuality'); if(!host)return;
  const o=buildExecutionQuality(), tone=o.state==='GOOD'?'good':o.state==='POOR'?'bad':'gold', s=o.s;
  const recent=o.recent;
  const recentText=recent.n?`Recent ${recent.n}: ${recent.avgSlip==null?'—':recent.avgSlip.toFixed(1)+' bps'} slippage · ${recent.avgLatency==null?'—':recent.avgLatency.toFixed(0)+'s'} latency.`:'Belum ada recent execution.';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.63 EXECUTION QUALITY</span><b>Apakah eksekusi mengikuti trade plan?</b></div><span class="sxeBadge ${tone}">${o.state}${o.n?' · '+o.score+'/100':''}</span></div>
  <div class="ljSummary"><div><small>EXECUTIONS</small><b>${s.n}</b></div><div><small>AVG SLIPPAGE</small><b>${s.avgSlip==null?'—':s.avgSlip.toFixed(1)+' bps'}</b></div><div><small>AVG LATENCY</small><b>${s.avgLatency==null?'—':s.avgLatency.toFixed(0)+'s'}</b></div><div><small>CHASE</small><b>${s.chase}</b></div></div>
  <div class="ljFeedback">${o.reason}</div>
  <div class="contextRows"><div><span>≤20 bps</span><b>${s.n?s.goodSlip+'/'+s.n:'—'}</b></div><div><span>≤60s latency</span><b>${s.n? s.fast+'/'+s.n:'—'}</b></div><div><span>Recent</span><b>${recentText}</b></div></div>
  <div class="note">Slippage positif berarti harga aktual lebih buruk dari harga rencana sesuai arah BUY/SELL. Chase ditandai jika slippage &gt;20 bps. Data hanya dinilai bila actual entry dari posisi tersedia; tidak mengarang fill yang tidak tercatat.</div>`;
}

let COST_FUNDING_DATA={rows:[],at:0};
async function renderCostFundingEngine(){
  const host=$('costFundingEngine'); if(!host)return;
  let rows=[];
  try{
    const cached=COST_FUNDING_DATA;
    if(cached.at && Date.now()-cached.at<15000) rows=cached.rows||[];
    else {
      const r=await jsonFetch('/api/journal',{headers:H()});
      rows=Array.isArray(r)?r:[];
      COST_FUNDING_DATA={rows,at:Date.now()};
    }
  }catch{rows=[]}
  const own=rows.filter(x=>!x.symbol||x.symbol===S.symbol);
  const n=own.length;
  const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
  const gross=own.reduce((a,x)=>a+num(x.pnl),0);
  const fees=own.reduce((a,x)=>a+Math.abs(num(x.fee)),0);
  const funding=own.reduce((a,x)=>a+Math.abs(num(x.funding)),0);
  const net=gross-fees-funding;
  const avgFee=n?fees/n:0, avgFunding=n?funding/n:0;
  const positive=own.filter(x=>num(x.pnl)-Math.abs(num(x.fee))-Math.abs(num(x.funding))>0).length;
  const netHit=n?positive/n:0;
  const feeInput=Math.max(0,num($('fee')?.value))/100;
  const slipInput=Math.max(0,num($('slip')?.value))/100;
  const fundInput=Math.max(0,num($('fund')?.value))/100;
  const sideCost=feeInput*2+slipInput*2;
  const tone=n<5?'gold':net>=0?'good':'bad';
  const state=n<5?'COLLECTING DATA':net>0?'NET POSITIVE':'NET NEGATIVE';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.64 COST & FUNDING ENGINE</span><b>Gross vs biaya nyata</b></div><span class="sxeBadge ${tone}">${state}</span></div>
  <div class="ljSummary"><div><small>CLOSED</small><b>${n}</b></div><div><small>GROSS PNL</small><b>${fmtIDR(gross)}</b></div><div><small>FEE</small><b>${fmtIDR(fees)}</b></div><div><small>FUNDING</small><b>${fmtIDR(funding)}</b></div></div>
  <div class="contextRows"><div><span>NET PNL</span><b class="${net>=0?'good':'bad'}">${fmtIDR(net)}</b></div><div><span>Net hit rate</span><b>${n?(netHit*100).toFixed(1)+'%':'—'}</b></div><div><span>Avg fee/trade</span><b>${n?fmtIDR(avgFee):'—'}</b></div><div><span>Avg funding/trade</span><b>${n?fmtIDR(avgFunding):'—'}</b></div></div>
  <div class="ljFeedback">Model backtest saat ini: fee ${ (feeInput*100).toFixed(3) }%/side · slippage ${(slipInput*100).toFixed(3)}% · funding ${(fundInput*100).toFixed(3)}%/8h · estimated round-trip cost ${(sideCost*100).toFixed(3)}% sebelum funding. Angka model tidak dianggap sebagai biaya aktual Binance.</div>
  <div class="note">Biaya aktual diambil dari journal bila tersedia. Funding dijumlahkan sebagai biaya absolut agar hasil net tidak terlihat lebih baik hanya karena funding menguntungkan satu periode. Untuk backtest candle historis, funding per-candle belum tersedia sehingga tetap berupa parameter estimasi.</div>`;
}

function renderAccountDock(x){if(!x)return; S.accountSnapshot=x; captureExecutionQualityFromPosition(x.binancePositions?.find?.(z=>z.symbol===S.symbol&&Math.abs(Number(z.positionAmt||0))>0)||null);const b=x.balances?.find(z=>z.asset==='USDT'),p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol&&Math.abs(Number(z.positionAmt||0))>0);S.accountPosition=p||null;scheduleDraw();renderCapitalProtection();const bal=Number(b?.balance||0),av=Number(b?.availableBalance||0),up=Number(p?.unRealizedProfit||0),entry=Number(p?.entryPrice||0),mark=Number(p?.markPrice||S.market.mark||0),qty=Number(p?.positionAmt||0),notional=Math.abs(entry*qty),roe=notional?up/Math.max(1,Math.abs(notional)/Math.max(1,Number(p?.leverage||+$('lev').value||1)))*100:0,rp=Number(x.lastRealizedPnL);$('dockBalance').textContent=fmtIDR(bal);$('dockDanaTersedia').textContent=fmtIDR(av);$('dockUpnl').textContent=fmtIDR(up);$('dockUpnl').className=up>0?'pnlProfit':up<0?'pnlLoss':'';$('dockDD').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';if($('dockRealized')){$('dockRealized').textContent=Number.isFinite(rp)?fmtIDR(rp):'—';$('dockRealized').className=Number.isFinite(rp)?(rp>=0?'pnlProfit':'pnlLoss'):''}const rt=Number(x.realizedPnlTotal);if($('dockRealizedTotal')){$('dockRealizedTotal').textContent=Number.isFinite(rt)?fmtIDR(rt):'—';$('dockRealizedTotal').className=Number.isFinite(rt)?(rt>=0?'pnlProfit':'pnlLoss'):''}$('accountDockMode').textContent=x.accountType||'ACCOUNT';$('dockPositionStatus').textContent=p?'OPEN POSITION · TERDETEKSI DI BINANCE':'NO OPEN POSITION';$('dockArah').textContent=p?(Number(p.positionAmt)>0?'LONG':'SHORT'):'—';$('dockArah').className=p?(Number(p.positionAmt)>0?'good':'bad'):'';$('dockHargaMasuk').textContent=p?fmtIDR(entry):'—';$('dockHargaMark').textContent=p?fmtIDR(mark):fmtIDR(S.market.mark);$('dockJumlah').textContent=p?fmt(Math.abs(qty)):'—';$('dockPnl').textContent=p?fmtIDR(up):'—';$('dockPnl').className=p?(up>=0?'pnlProfit':'pnlLoss'):'';$('dockRoe').textContent=p?fmt(roe)+'%':'—';$('balance').textContent=fmtIDR(bal);$('availableBalance').textContent=fmtIDR(av);$('upnl').textContent=fmtIDR(up);$('liqPrice').textContent=p?fmtIDR(p.liquidationPrice):'—';$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';const closeBtn=$('closePosition'),entryBtns=[$('long'),$('short'),$('quickLong'),$('quickShort')].filter(Boolean);if(closeBtn){closeBtn.disabled=!p;closeBtn.style.opacity=p?'1':'.45'}entryBtns.forEach(btn=>{btn.disabled=!!p;btn.style.opacity=p?'.45':'1';btn.title=p?'Tutup posisi aktif terlebih dahulu sebelum entry baru.':''});if(p){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${up>=0?'good':'bad'}">${up>=0?'PROFIT':'LOSS'} ${fmtIDR(up)} · OPEN</b><div class="note">${Number(p.positionAmt)>0?'BUY / LONG':'SELL / SHORT'} · Masuk ${fmtIDR(entry)} · Mark ${fmtIDR(mark)} · Jumlah ${fmt(Math.abs(qty))} · ROE ${fmt(roe)}%</div><div class="note bad">PnL/posisi bersumber dari Binance positionRisk. Membuka halaman tidak membuat order baru. Tutup posisi ini sebelum entry berikutnya.</div>`}else if(LAST_ORDER_DIAGNOSTIC.html&&Date.now()-LAST_ORDER_DIAGNOSTIC.at<LAST_ORDER_DIAGNOSTIC.keepMs){$('orderResult').style.display='block';$('orderResult').innerHTML=LAST_ORDER_DIAGNOSTIC.html}else if(Number.isFinite(rp)){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${rp>=0?'good':'bad'}">LAST REALIZED: ${rp>=0?'PROFIT':'LOSS'} ${fmtIDR(rp)}</b><div class="note">LIVE POSITION: <b>CLOSED / 0 BTC</b> · Saldo diambil langsung dari Binance.</div>`}else{$('orderResult').style.display='none'};updateLivePositionHero(p)}

function updateModeUI(rt){if(!rt)return;const mode=String(rt.tradingMode||'paper').toUpperCase();$('mode').textContent=mode;$('accountMode').textContent=mode==='DEMO'?'BINANCE DEMO':mode==='LIVE'?'BINANCE LIVE':'PAPER';const note=$('executionNote');if(note)note.textContent=mode==='DEMO'?'BUY/SELL akan mengirim order ke Binance Futures DEMO (virtual funds).':mode==='LIVE'?'BUY/SELL akan mengirim order ke Binance Futures LIVE. Periksa API permission sebelum entry.':'BUY/SELL hanya membuat posisi PAPER lokal.';}
async function depth(){try{let o=await jsonFetch(`/api/open-interest?symbol=${S.symbol}`);if(!o.error)$('oi').textContent=fmt(o.openInterest)}catch{}}
function renderBook(){let b=(S.book.bids||[]).slice(0,10),a=(S.book.asks||[]).slice(0,10),sum=(z)=>z.reduce((p,x)=>p+ +x[1],0),sb=sum(b),sa=sum(a);$('bids').innerHTML=b.map(x=>`<div class="obrow"><span class="good">${fmt(+x[0])}</span><span>${fmt(+x[1])}</span></div>`).join('');$('asks').innerHTML=a.map(x=>`<div class="obrow"><span class="bad">${fmt(+x[0])}</span><span>${fmt(+x[1])}</span></div>`).join('');$('imbalance').textContent=((sb-sa)/(sb+sa||1)*100).toFixed(1)+'%'}
function smart(){if(!S.c.length)return;let c=S.c.at(-1),at=ATR(S.c).at(-1),sw=S.swings,low=sw.lo.length?S.c[sw.lo.at(-1)].l:c.l,high=sw.hi.length?S.c[sw.hi.at(-1)].h:c.h,am=+$('atrMult').value||1.5,rr=+$('rr').value||2;let slL=Math.min(low,c.c-at*am),tpL=c.c+(c.c-slL)*rr,slS=Math.max(high,c.c+at*am),tpS=c.c-(slS-c.c)*rr;S.smart={long:{sl:slL,tp:tpL},short:{sl:slS,tp:tpS},atr:at};$('smartSL').textContent=`B ${fmtIDR(slL)} · J ${fmtIDR(slS)}`;$('smartTP').textContent=`B ${fmtIDR(tpL)} · J ${fmtIDR(tpS)}`}
function calc(){if(!S.c.length)return;let a=S.c.map(x=>x.c),c=S.c.at(-1),m=MACD(a),at=ATR(S.c),r=RSI(a),v=VWAP(S.c),adx=ADX(S.c),sd=SMA(a,20).map((x,i)=>{let z=a.slice(Math.max(0,i-19),i+1),av=x;return Math.sqrt(z.reduce((p,q)=>p+(q-av)**2,0)/z.length)});$('macd').textContent=fmt(m.m.at(-1))+' / '+fmt(m.sig.at(-1));$('vwap').textContent=fmtIDR(v.at(-1));$('adx').textContent=fmt(adx.at(-1));$('atr').textContent=fmt(at.at(-1));$('rsi').textContent=fmt(r.at(-1));$('bbw').textContent=((4*sd.at(-1))/(SMA(a,20).at(-1)||1)*100).toFixed(2)+'%';$('riskMeter').style.width=Math.min(100,(+$('risk').value||0)/2*100)+'%';let side=$('long').dataset.side||'LONG',z=S.smart?.[side.toLowerCase()];if(z){const capitalIdr=+$('capital').value||0,lev=+$('lev').value||1,capitalUsdt=toUSDT(capitalIdr),entry=c.c,sizing=String($('sizingMode')?.value||'MARGIN').toUpperCase(),riskPct=+$('risk').value||0,riskUsdt=capitalUsdt*riskPct/100,slDist=Math.abs(entry-z.sl),marginQty=capitalUsdt*lev/entry,riskQty=slDist>0?riskUsdt/slDist:marginQty,qty=sizing==='RISK'?Math.min(riskQty,marginQty):marginQty,notionalUsdt=qty*entry,marginUsdt=notionalUsdt/lev,slLossUsdt=qty*slDist;const exchangeQty=floorStep(qty,ORDER_FILTERS.stepSize||0.001);const exchangeNotional=exchangeQty*entry;const exchangeMargin=exchangeNotional/lev;const pnl=(pct)=>exchangeNotional*pct/100; $('qty').textContent=exchangeQty.toFixed(6)+' BTC'; if($('calcSync'))$('calcSync').textContent='Sinkron dengan filter Binance · order server menghitung ulang Qty';$('riskUsd').textContent=fmtIDR(riskUsdt);if($('calcNotional'))$('calcNotional').textContent=fmtIDR(exchangeNotional);if($('calcQty'))$('calcQty').textContent=exchangeQty.toFixed(6)+' BTC';if($('calcMargin'))$('calcMargin').textContent=fmtIDR(exchangeMargin);if($('calcSlRisk'))$('calcSlRisk').textContent=fmtIDR(exchangeQty*slDist)+' '+((exchangeQty*slDist)>riskUsdt?'⚠ di atas risiko acuan':'');if($('pnl05'))$('pnl05').textContent='+ '+fmtIDR(pnl(.5));if($('pnl1'))$('pnl1').textContent='+ '+fmtIDR(pnl(1));if($('pnl2'))$('pnl2').textContent='+ '+fmtIDR(pnl(2));if($('loss05'))$('loss05').textContent='- '+fmtIDR(pnl(.5));if($('loss1'))$('loss1').textContent='- '+fmtIDR(pnl(1));if($('loss2'))$('loss2').textContent='- '+fmtIDR(pnl(2));}}

function detectSR(c){
  if(!c||c.length<40)return {support:null,resistance:null,context:'NO_LEVEL',distanceSupport:null,distanceResistance:null};
  const look=Math.min(120,c.length-5), a=c.slice(-look), last=a[a.length-1];
  const atrVals=[];
  for(let i=1;i<a.length;i++)atrVals.push(Math.max(a[i].h-a[i].l,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c)));
  const atr=atrVals.slice(-20).reduce((x,y)=>x+y,0)/Math.max(1,Math.min(20,atrVals.length));
  const piv=[];
  for(let i=2;i<a.length-2;i++){
    const x=a[i];
    if(x.h>=a[i-1].h&&x.h>=a[i-2].h&&x.h>=a[i+1].h&&x.h>=a[i+2].h)piv.push({p:x.h,type:'R',i});
    if(x.l<=a[i-1].l&&x.l<=a[i-2].l&&x.l<=a[i+1].l&&x.l<=a[i+2].l)piv.push({p:x.l,type:'S',i});
  }
  const tol=Math.max(atr*0.45,last.c*0.0007);
  const clusters=[];
  for(const x of piv){let g=clusters.find(z=>Math.abs(z.p-x.p)<=tol);if(!g){g={p:x.p,n:0,type:x.type,tests:0,last:x.i};clusters.push(g)}g.n++;g.tests++;g.p=(g.p*(g.n-1)+x.p)/g.n;g.last=Math.max(g.last,x.i);}
  const supports=clusters.filter(x=>x.p<last.c).sort((a,b)=>b.p-a.p);
  const resistances=clusters.filter(x=>x.p>last.c).sort((a,b)=>a.p-b.p);
  const support=supports[0]||null,resistance=resistances[0]||null;
  const ds=support?((last.c-support.p)/last.c*100):null, dr=resistance?((resistance.p-last.c)/last.c*100):null;
  const nearS=support&&last.c-support.p<=Math.max(atr*0.9,last.c*0.0015), nearR=resistance&&resistance.p-last.c<=Math.max(atr*0.9,last.c*0.0015);
  let context=nearS?'NEAR_SUPPORT':nearR?'NEAR_RESISTANCE':'BETWEEN_LEVELS';
  if(last.l<(support?.p||-Infinity)&&last.c>(support?.p||Infinity))context='SUPPORT_REJECTION';
  if(last.h>(resistance?.p||Infinity)&&last.c<(resistance?.p||-Infinity))context='RESISTANCE_REJECTION';
  return {support:support?.p||null,resistance:resistance?.p||null,context,distanceSupport:ds,distanceResistance:dr,atr};
}
function supertrend(a, period=10, multiplier=3){
  if(!a||a.length<period+2)return {trend:[],upper:[],lower:[],line:[],flips:[]};
  const atr=ATR(a,period), upper=[], lower=[], line=[], trend=[], flips=[];
  for(let i=0;i<a.length;i++){
    const hl2=(a[i].h+a[i].l)/2, av=Number(atr[i]||0), bu=hl2+multiplier*av, bl=hl2-multiplier*av;
    if(i===0){upper[i]=bu;lower[i]=bl;trend[i]=1;line[i]=bl;continue;}
    upper[i]=(bu<upper[i-1]||a[i-1].c>upper[i-1])?bu:upper[i-1];
    lower[i]=(bl>lower[i-1]||a[i-1].c<lower[i-1])?bl:lower[i-1];
    trend[i]=trend[i-1];
    if(trend[i-1]<0 && a[i].c>upper[i-1])trend[i]=1;
    else if(trend[i-1]>0 && a[i].c<lower[i-1])trend[i]=-1;
    line[i]=trend[i]>0?lower[i]:upper[i];
    if(trend[i]!==trend[i-1])flips.push({i,side:trend[i]>0?'BUY':'SELL',price:a[i].c});
  }
  return {trend,upper,lower,line,flips,atr};
}
function supertrendSignal(a, liveMode=false){
  if(!a||a.length<30)return {side:'WAIT',score:0,bull:0,bear:0,gap:0,strength:'LOW',confirmations:0,reason:['Menunggu minimal 30 candle'],indicator:'SUPER-TREND'};
  const st=supertrend(a,10,3), i=a.length-1, dir=st.trend[i];
  if(!dir)return {side:'WAIT',score:0,bull:0,bear:0,gap:0,strength:'LOW',confirmations:0,reason:['Supertrend belum siap'],indicator:'SUPER-TREND'};
  const x=a[i], prev=a[Math.max(0,i-1)], atr=Number(st.atr?.[i]||Math.abs(x.c-x.o)||1);
  const dist=Math.abs(x.c-(st.line[i]||x.c))/Math.max(atr,1e-12);
  const slope=(st.line[i]||x.c)-(st.line[Math.max(0,i-3)]||x.c);
  const body=Math.abs(x.c-x.o)/Math.max(1e-12,x.h-x.l);
  let score=60+Math.min(20,Math.round(dist*12));
  if(dir>0 && x.c>x.o)score+=8;
  if(dir<0 && x.c<x.o)score+=8;
  if(dir>0 && slope>0)score+=5;
  if(dir<0 && slope<0)score+=5;
  score=Math.max(50,Math.min(95,score));
  const side=dir>0?'BUY':'SELL';
  const flip=st.flips.find(f=>f.i===i);
  const reason=flip
    ? `${side} · Supertrend berbalik realtime${liveMode?'':' pada candle close'}`
    : `${side} · harga ${side==='BUY'?'di atas':'di bawah'} garis Supertrend`;
  const gap=Math.max(8,score-48);
  return {side,score,bull:side==='BUY'?score:100-score,bear:side==='SELL'?score:100-score,gap,strength:score>=78?'HIGH':score>=65?'MEDIUM':'LOW',confirmations:1,confirmationsBull:side==='BUY'?1:0,confirmationsBear:side==='SELL'?1:0,reason:[reason],indicator:'SUPER-TREND',supertrend:st,atr};
}
function liveCandleEngine(candles=S.c){
  const c=candles?.at?.(-1);
  if(!c) return {side:'WAIT',score:0,bodyPct:0,upperWickPct:0,lowerWickPct:0,closePos:50,reason:'Menunggu candle realtime'};
  const o=Number(c.o||0), h=Number(c.h||o), l=Number(c.l||o), close=Number(c.c||o);
  const range=Math.max(h-l,Math.abs(close-o),1e-9);
  const body=Math.abs(close-o), bodyPct=body/range*100;
  const upper=Math.max(0,h-Math.max(o,close)), lower=Math.max(0,Math.min(o,close)-l);
  const upperPct=upper/range*100, lowerPct=lower/range*100;
  const closePos=((close-l)/range)*100;
  const recent=candles.slice(-4).map(x=>Number(x.c||0)).filter(Boolean);
  let micro=0;
  if(recent.length>=2){
    let up=0,down=0;
    for(let i=1;i<recent.length;i++){if(recent[i]>recent[i-1])up++;else if(recent[i]<recent[i-1])down++;}
    micro=up>down?1:down>up?-1:0;
  }
  let bull=0,bear=0;
  if(close>o) bull+=28; else if(close<o) bear+=28;
  if(closePos>=65) bull+=24; else if(closePos<=35) bear+=24;
  if(lowerPct>=upperPct+8) bull+=22;
  if(upperPct>=lowerPct+8) bear+=22;
  if(bodyPct>=55){ if(close>o)bull+=12; else if(close<o)bear+=12; }
  if(micro>0)bull+=14; else if(micro<0)bear+=14;
  const side=bull>=bear+10?'BUY':bear>=bull+10?'SELL':'WAIT';
  const score=Math.max(bull,bear,side==='WAIT'?Math.max(bull,bear):0);
  const reasons=[];
  if(close>o)reasons.push('body naik'); else if(close<o)reasons.push('body turun'); else reasons.push('body datar');
  if(lowerPct>=upperPct+8)reasons.push('lower wick ditolak');
  else if(upperPct>=lowerPct+8)reasons.push('upper wick ditolak');
  else reasons.push('wick seimbang');
  if(closePos>=65)reasons.push('close dekat high'); else if(closePos<=35)reasons.push('close dekat low');
  return {side,score:Math.min(100,Math.round(score)),bodyPct,upperWickPct:upperPct,lowerWickPct:lowerPct,closePos,micro,reason:reasons};
}
function nextCandlePrediction(a){
  if(!a||a.length<35)return {side:'WAIT',score:0,bull:0,bear:0,gap:0,strength:'LOW',reason:['Menunggu minimal 35 candle untuk membaca body/wick + struktur'],candle:null,sr:null};
  const x=a.at(-1), prev=a.at(-2), prev2=a.at(-3), sr=detectSR(a), lc=liveCandleEngine(a);
  const range=Math.max(1e-9,x.h-x.l), body=x.c-x.o, bodyPct=Math.abs(body)/range*100;
  const upper=Math.max(0,x.h-Math.max(x.o,x.c))/range*100;
  const lower=Math.max(0,Math.min(x.o,x.c)-x.l)/range*100;
  const closePos=(x.c-x.l)/range*100;
  let bull=0,bear=0;
  // Current candle structure: body + close position + wick rejection.
  if(body>0)bull+=18; else if(body<0)bear+=18;
  if(closePos>=68)bull+=18; else if(closePos<=32)bear+=18;
  if(lower>=upper+8)bull+=18;
  if(upper>=lower+8)bear+=18;
  if(bodyPct>=55){if(body>0)bull+=10;else if(body<0)bear+=10;}
  // Previous candles give short-term continuation/reversal context.
  const p1=prev.c-prev.o,p2=prev2.c-prev2.o;
  if(body>0&&p1>0)bull+=8; if(body<0&&p1<0)bear+=8;
  if(body>0&&p1<0&&lower>upper+10)bull+=7;
  if(body<0&&p1>0&&upper>lower+10)bear+=7;
  // Live engine is a second candle-structure vote, capped to avoid double counting.
  if(lc.side==='BUY')bull+=Math.min(12,Math.round(lc.score*.12));
  if(lc.side==='SELL')bear+=Math.min(12,Math.round(lc.score*.12));
  // S/R reaction: rejection supports the bounce; a clean close through a level supports breakout.
  if(sr.context==='SUPPORT_REJECTION')bull+=14;
  if(sr.context==='RESISTANCE_REJECTION')bear+=14;
  if(sr.support){const d=(x.c-sr.support)/Math.max(sr.atr||ATR(a).at(-1)||1,1);if(d>=0&&d<0.8)bull+=8;}
  if(sr.resistance){const d=(sr.resistance-x.c)/Math.max(sr.atr||ATR(a).at(-1)||1,1);if(d>=0&&d<0.8)bear+=8;}
  // Small momentum vote from the last 4 closes.
  const closes=a.slice(-4).map(z=>z.c);
  let up=0,down=0; for(let i=1;i<closes.length;i++){if(closes[i]>closes[i-1])up++;else if(closes[i]<closes[i-1])down++;}
  if(up>down)bull+=6; else if(down>up)bear+=6;
  bull=Math.min(100,Math.round(bull)); bear=Math.min(100,Math.round(bear));
  const gap=Math.abs(bull-bear),score=Math.max(bull,bear);
  const side=(bull>=bear+10&&bull>=52)?'BUY':(bear>=bull+10&&bear>=52)?'SELL':'WAIT';
  const strength=score>=78?'HIGH':score>=64?'MEDIUM':'LOW';
  const reason=[];
  if(body>0)reason.push(`body naik ${bodyPct.toFixed(0)}%`); else if(body<0)reason.push(`body turun ${bodyPct.toFixed(0)}%`); else reason.push('body netral');
  if(lower>=upper+8)reason.push(`lower wick ditolak ${lower.toFixed(0)}%`);
  else if(upper>=lower+8)reason.push(`upper wick ditolak ${upper.toFixed(0)}%`);
  else reason.push(`wick seimbang ↑${upper.toFixed(0)}% ↓${lower.toFixed(0)}%`);
  if(closePos>=68)reason.push(`close dekat high ${closePos.toFixed(0)}%`);
  else if(closePos<=32)reason.push(`close dekat low ${closePos.toFixed(0)}%`);
  if(sr.context&&sr.context!=='BETWEEN_LEVELS')reason.push(`S/R: ${sr.context.replaceAll('_',' ')}`);
  if(side==='WAIT')reason.push(gap<10?'tekanan BUY/SELL belum cukup berbeda':'menunggu konfirmasi struktur');
  return {side,score,bull,bear,gap,strength,reason,candle:{bodyPct,upperWickPct:upper,lowerWickPct:lower,closePos},sr,lc};
}
function predictiveCandle(c){
  const st=supertrendSignal(c,false);
  const cp=nextCandlePrediction(c);
  if(cp.side==='WAIT'&&st.side==='WAIT')return {...st,candlePrediction:cp,sr:cp.sr};
  // Final direction is a fusion: confirmed Supertrend provides trend context,
  // while body/wick + S/R decide whether the next candle has enough pressure.
  let bull=(st.side==='BUY'?st.score:100-st.score)*0.42 + cp.bull*0.43;
  let bear=(st.side==='SELL'?st.score:100-st.score)*0.42 + cp.bear*0.43;
  if(cp.sr?.context==='SUPPORT_REJECTION')bull+=10;
  if(cp.sr?.context==='RESISTANCE_REJECTION')bear+=10;
  const score=Math.max(0,Math.min(100,Math.round(Math.max(bull,bear))));
  const gap=Math.abs(bull-bear);
  const side=bull>=bear+9&&bull>=52?'BUY':bear>=bull+9&&bear>=52?'SELL':'WAIT';
  const reasons=[...(st.reason||[]),...(cp.reason||[]).slice(0,3)];
  if(cp.sr?.support)reasons.push(`Support ${fmt(cp.sr.support)} · ${cp.sr.distanceSupport?.toFixed?.(2)||'—'}%`);
  if(cp.sr?.resistance)reasons.push(`Resistance ${fmt(cp.sr.resistance)} · ${cp.sr.distanceResistance?.toFixed?.(2)||'—'}%`);
  return {...st,side,score,gap,strength:score>=78?'HIGH':score>=64?'MEDIUM':'LOW',bull:Math.round(bull),bear:Math.round(bear),reason:reasons.slice(0,8),sr:cp.sr,candlePrediction:cp};
}
function learningFeatureKey(pred){
  const cp=pred?.candlePrediction?.candle||pred?.candle||{};
  const wick=Number(cp.lowerWickPct||0)>=Number(cp.upperWickPct||0)+8?'LOWER_WICK':Number(cp.upperWickPct||0)>=Number(cp.lowerWickPct||0)+8?'UPPER_WICK':'BALANCED_WICK';
  const close=Number(cp.closePos||50)>=68?'CLOSE_HIGH':Number(cp.closePos||50)<=32?'CLOSE_LOW':'CLOSE_MID';
  const score=Number(pred?.score||0)>=80?'S80':Number(pred?.score||0)>=70?'S70':Number(pred?.score||0)>=60?'S60':'S50';
  const ctx=String(pred?.sr?.context||'NO_LEVEL');
  return [pred?.side||'WAIT',wick,close,score,ctx].join('|');
}
function buildAdaptiveModel(a){
  const arr=a||[], key=`${S.symbol}|${S.tf}|${arr.length}|${arr.at(-1)?.t||0}`;
  if(ADAPTIVE_CACHE.key===key&&ADAPTIVE_CACHE.model)return ADAPTIVE_CACHE.model;
  const model={version:1,features:{},side:{BUY:{n:0,hit:0},SELL:{n:0,hit:0}},samples:0,updatedAt:Date.now()};
  // Strict walk-forward learning: prediction at i is generated only from candles <= i,
  // then the immediately following candle supplies the label. No future candle is used.
  for(let i=40;i<arr.length-1;i++){
    const hist=arr.slice(0,i+1), pred=predictiveCandle(hist), next=arr[i+1];
    if(pred.side==='WAIT')continue;
    const move=(Number(next.c)-Number(next.o))/Math.max(1e-12,Number(next.o));
    const hit=(pred.side==='BUY'&&move>0)||(pred.side==='SELL'&&move<0);
    const k=learningFeatureKey(pred);
    const z=model.features[k]||(model.features[k]={n:0,hit:0,move:0});
    z.n++;z.hit+=hit?1:0;z.move+=(pred.side==='BUY'?move:-move);
    model.side[pred.side].n++;model.side[pred.side].hit+=hit?1:0;model.samples++;
  }
  ADAPTIVE_CACHE={key,upto:arr.at(-1)?.t||0,model};
  ADAPTIVE_INFO={samples:model.samples,features:Object.keys(model.features).length,updatedAt:model.updatedAt};
  return model;
}
function adaptivePredictiveCandle(a){
  const base=predictiveCandle(a), model=buildAdaptiveModel(a);
  if(base.side==='WAIT'||model.samples<20)return {...base,learning:{samples:model.samples,adjustment:0,hitRate:null,featureSamples:0}};
  const k=learningFeatureKey(base), z=model.features[k], sideStats=model.side[base.side];
  let rate=null, featureSamples=0;
  if(z&&z.n>=8){rate=z.hit/z.n;featureSamples=z.n;}
  else if(sideStats?.n>=15){rate=sideStats.hit/sideStats.n;featureSamples=sideStats.n;}
  if(rate==null)return {...base,learning:{samples:model.samples,adjustment:0,hitRate:null,featureSamples:0}};
  // Historical hit rate nudges confidence only; it cannot manufacture a direction.
  const adjustment=Math.round(clamp((rate-.5)*24,-8,8));
  const score=clamp(Number(base.score||0)+adjustment,0,100);
  const side=score<52?'WAIT':base.side;
  const reason=[...(base.reason||[]),`Learning ${Math.round(rate*100)}%/${featureSamples} sample`];
  return {...base,side,score,strength:score>=78?'HIGH':score>=64?'MEDIUM':'LOW',reason:reason.slice(0,8),learning:{samples:model.samples,adjustment,hitRate:rate,featureSamples}};
}
function aiCandleTrend(c){return nextCandlePrediction(c)}
function getRealtimeMomentum(){return liveCandleEngine(S.c)}
function getConfirmedSignal(){const closed=S.c.slice(0,-1);return adaptivePredictiveCandle(closed.length?closed:S.c)}
function entryTimingGuard(side,trendSignal=null){
  const c=S.c.at(-1);
  if(!c||S.c.length<25)return {ok:false,status:'WAIT',reason:'Data entry belum cukup untuk mengecek timing.'};
  // Confirmed Supertrend is the trend authority. The candle that is still
  // forming may retrace without invalidating an established BUY/SELL trend.
  const trend=trendSignal||getFinalSignal();
  if(trend.side!==side){
    return {ok:false,status:side==='LONG'?'SELL':'BUY',trendSide:trend.side,reason:`Arah trend sudah ${trend.side}. Entry ${side} ditahan sampai Supertrend kembali searah.`};
  }
  const live=liveCandleEngine(S.c);
  const recent=S.c.slice(-21,-1);
  // Live candle decides ENTRY timing, while confirmed Supertrend remains the TREND authority.
  // A temporary opposite candle does not flip the trend; it only changes ENTRY to WAIT.
  if((side==='LONG'&&live.side==='SELL')||(side==='SHORT'&&live.side==='BUY')){
    return {ok:false,status:'WAIT',trendSide:trend.side,reason:`TREND ${trend.side} masih aktif · candle live sedang ${live.side}. Tunggu candle kembali searah sebelum entry.`};
  }
  if(live.side==='WAIT'){
    return {ok:false,status:'WAIT',trendSide:trend.side,reason:`TREND ${trend.side} masih aktif · body/wick candle live belum memberi tekanan ${trend.side} yang cukup.`};
  }
  const hi=Math.max(...recent.map(x=>Number(x.h)||0));
  const lo=Math.min(...recent.map(x=>Number(x.l)||Infinity));
  const range=Math.max(1,hi-lo), price=Number(c.c||0);
  const pos=(price-lo)/range;
  const liveOpposite=live.side!==side;
  // A confirmed trend remains BUY/SELL even when realtime momentum briefly
  // disagrees. Only pause a new AUTO entry when price is truly at an extreme
  // AND realtime momentum is pulling back. This creates TREND vs ENTRY states.
  if(side==='LONG' && pos>=0.96 && liveOpposite){
    return {ok:false,status:'WAIT',trendSide:'BUY',reason:'TREND BUY masih aktif · harga dekat puncak dan momentum sedang retrace. Tunggu entry lebih aman.'};
  }
  if(side==='SHORT' && pos<=0.04 && liveOpposite){
    return {ok:false,status:'WAIT',trendSide:'SELL',reason:'TREND SELL masih aktif · harga dekat dasar dan momentum sedang retrace. Tunggu entry lebih aman.'};
  }
  return {ok:true,status:side,trendSide:trend.side,reason:`TREND ${trend.side} masih aktif · entry ${side} valid.`};
}

function getEntryReadiness(pred){
  const side=pred?.side||'WAIT';
  if(side==='WAIT') return {ready:false,score:0,checks:{direction:false,learning:false,sr:false,mtf:false},label:'WAIT',reason:'Arah candle belum cukup kuat.'};
  const learning=pred?.learning;
  const learningOk=learning?.hitRate==null ? true : Number(learning.hitRate)>=0.55;
  const srCtx=pred?.sr?.context||'NO_LEVEL';
  const srOk=side==='BUY' ? ['SUPPORT_REJECTION','BETWEEN_LEVELS'].includes(srCtx) : ['RESISTANCE_REJECTION','BETWEEN_LEVELS'].includes(srCtx);
  const mtfRows=Object.values(S.mtf||{});
  const mtfSide=side==='BUY'?'BULL':'BEAR';
  const mtfMatches=mtfRows.filter(x=>x.dir===mtfSide).length;
  const mtfOk=mtfRows.length<3 ? true : mtfMatches>=Math.ceil(mtfRows.length*0.6);
  const scoreOk=Number(pred.score||0)>=65 && Number(pred.gap||0)>=4;
  const checks={direction:scoreOk,learning:learningOk,sr:srOk,mtf:mtfOk};
  const passed=Object.values(checks).filter(Boolean).length;
  const score=Math.round(passed/4*100);
  const ready=passed>=3 && scoreOk;
  const reasons=[scoreOk?'score/gap OK':'score/gap belum cukup',learningOk?'learning mendukung':'learning belum mendukung',srOk?'S/R searah':'S/R belum ideal',mtfOk?`MTF ${mtfMatches}/${mtfRows.length} searah`:`MTF ${mtfMatches}/${mtfRows.length} searah`];
  return {ready,score,checks,label:ready?'READY':'WAIT',reason:reasons.join(' · '),mtfMatches,mtfTotal:mtfRows.length};
}
function getSignalQuality(pred, readiness, riskPlan){
  if(!pred || !['BUY','SELL'].includes(pred.side)) return {score:0,label:'WAIT',components:{},reason:'Arah belum confirmed'};
  const r=readiness||getEntryReadiness(pred);
  const rp=riskPlan||buildSmartRiskPlan(pred);
  const candle=Math.max(0,Math.min(100,Number(pred.score||0)));
  const readinessScore=Math.max(0,Math.min(100,Number(r.score||0)));
  const learningRate=pred.learning?.hitRate;
  const learning=learningRate==null?55:Math.max(0,Math.min(100,Number(learningRate)*100));
  const ctx=pred.sr?.context||'NO_LEVEL';
  const sr=ctx==='SUPPORT_REJECTION'||ctx==='RESISTANCE_REJECTION'?100:ctx==='BETWEEN_LEVELS'?72:40;
  const mtfRows=Object.values(S.mtf||{});
  const wanted=pred.side==='BUY'?'BULL':'BEAR';
  const aligned=mtfRows.length?mtfRows.filter(x=>x.dir===wanted).length/mtfRows.length:0.5;
  const mtf=Math.round(Math.max(0,Math.min(1,aligned))*100);
  const rr=Number(rp?.rr1||0);
  const risk=rr>=2.5?100:rr>=2?90:rr>=1.5?75:rr>0?45:0;
  const score=Math.round(candle*.25+readinessScore*.25+learning*.15+sr*.15+mtf*.10+risk*.10);
  const label=score>=80?'A':score>=65?'B':score>=50?'C':'WAIT';
  const reason=`Candle ${Math.round(candle)} · Readiness ${Math.round(readinessScore)} · Learning ${Math.round(learning)} · S/R ${Math.round(sr)} · MTF ${Math.round(mtf)} · Risk ${Math.round(risk)}`;
  return {score,label,components:{candle,readiness:readinessScore,learning,sr,mtf,risk},reason};
}
function signalQualityText(q){return q?.score?`QUALITY ${q.label} ${q.score}/100`:'QUALITY WAIT';}
function buildSmartRiskPlan(pred){
  const a=(pred?.closed&&pred.closed.length?pred.closed:S.c.slice(0,-1).length?S.c.slice(0,-1):S.c);
  if(!a.length||!pred||!['BUY','SELL'].includes(pred.side)) return {valid:false,side:'WAIT'};
  const entry=Number(pred.last?.c||a.at(-1)?.c||0);
  const atr=Number(pred.atr||ATR(a).at(-1)||0);
  if(!entry||!atr) return {valid:false,side:pred.side};
  const sr=pred.sr||detectSR(a);
  const buffer=Math.max(atr*0.18,entry*0.00035);
  const zone=Math.max(atr*0.22,entry*0.00045);
  const rrTarget=Math.max(1.5,Number($('rr')?.value||2));
  let sl,tp1,tp2,entryLow,entryHigh;
  if(pred.side==='BUY'){
    const support=Number(sr?.support||0);
    sl=(support>0&&support<entry)?Math.min(entry-atr*0.75,support-buffer):entry-atr*1.25;
    const risk=Math.max(entry-sl,atr*0.55);
    sl=entry-risk;
    entryLow=entry-zone; entryHigh=entry+zone;
    const resistance=Number(sr?.resistance||0);
    const rr1=entry+risk*1.5, rr2=entry+risk*rrTarget;
    tp1=resistance>entry ? Math.max(rr1,Math.min(resistance,entry+risk*1.15)) : rr1;
    tp2=Math.max(rr2,tp1+risk*0.5);
  }else{
    const resistance=Number(sr?.resistance||0);
    sl=(resistance>entry)?Math.max(entry+atr*0.75,resistance+buffer):entry+atr*1.25;
    const risk=Math.max(sl-entry,atr*0.55);
    sl=entry+risk;
    entryLow=entry-zone; entryHigh=entry+zone;
    const support=Number(sr?.support||0);
    const rr1=entry-risk*1.5, rr2=entry-risk*rrTarget;
    tp1=support>0&&support<entry ? Math.min(rr1,Math.max(support,entry-risk*1.15)) : rr1;
    tp2=Math.min(rr2,tp1-risk*0.5);
  }
  const riskDist=Math.abs(entry-sl), rr1=Math.abs(tp1-entry)/Math.max(riskDist,1e-12), rr2=Math.abs(tp2-entry)/Math.max(riskDist,1e-12);
  const valid=Number.isFinite(sl)&&Number.isFinite(tp1)&&Number.isFinite(tp2)&&riskDist>0&&((pred.side==='BUY'&&sl<entry&&tp1>entry&&tp2>entry)||(pred.side==='SELL'&&sl>entry&&tp1<entry&&tp2<entry));
  return {valid,side:pred.side,entry,entryLow,entryHigh,sl,tp1,tp2,atr,riskDistance:riskDist,rr1,rr2,context:sr?.context||'NO_LEVEL',support:sr?.support||null,resistance:sr?.resistance||null};
}
function riskPlanText(r){
  if(!r?.valid)return 'RISK PLAN WAIT';
  return `ENTRY ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)} · SL ${fmtIDR(r.sl)} · TP1 ${fmtIDR(r.tp1)} · TP2 ${fmtIDR(r.tp2)} · R:R ${r.rr1.toFixed(1)} / ${r.rr2.toFixed(1)}`;
}


function buildSignalFeatureSnapshot(pred){
  const cp=pred?.candlePrediction?.candle||pred?.candle||{};
  const mtfRows=Object.values(S.mtf||{});
  const wanted=pred?.side==='BUY'?'BULL':'BEAR';
  const mtfAligned=mtfRows.filter(x=>x.dir===wanted).length;
  const mtfTotal=mtfRows.length;
  const learningRate=pred?.learning?.hitRate;
  return {
    side:pred?.side||'WAIT', score:Number(pred?.score||0), gap:Number(pred?.gap||0),
    context:String(pred?.sr?.context||'NO_LEVEL'),
    mtfAligned, mtfTotal,
    bodyPct:Number(cp.bodyPct||0), upperWickPct:Number(cp.upperWickPct||0), lowerWickPct:Number(cp.lowerWickPct||0), closePos:Number(cp.closePos??50),
    momentumSide:String(pred?.momentum?.side||'WAIT'), momentumScore:Number(pred?.momentum?.score||0),
    learningRate:learningRate==null?null:Number(learningRate), capturedAt:Date.now()
  };
}
function signalFeatureDistance(a,b){
  if(!a||!b)return 999;
  let d=0,n=0;
  const add=(x,y,scale=100)=>{if(Number.isFinite(Number(x))&&Number.isFinite(Number(y))){d+=Math.min(1,Math.abs(Number(x)-Number(y))/scale);n++;}};
  if(a.side&&b.side){d+=(a.side===b.side?0:0.8);n++;}
  if(a.context&&b.context){d+=(a.context===b.context?0:0.35);n++;}
  add(a.score,b.score,40); add(a.gap,b.gap,25); add(a.bodyPct,b.bodyPct,50); add(a.upperWickPct,b.upperWickPct,50); add(a.lowerWickPct,b.lowerWickPct,50); add(a.closePos,b.closePos,50); add(a.momentumScore,b.momentumScore,50);
  if(a.mtfTotal&&b.mtfTotal){d+=Math.min(1,Math.abs((a.mtfAligned/a.mtfTotal)-(b.mtfAligned/b.mtfTotal))*1.5);n++;}
  return n?d/n:999;
}
function findHistoricalSimilarSetups(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side))return {count:0,hit:0,miss:0,neutral:0,rate:null,partial:false,items:[]};
  const current=buildSignalFeatureSnapshot(pred);
  const pool=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===S.tf&&x.status==='CLOSED'&&['BUY','SELL'].includes(x.side)&&x.side===pred.side);
  const scored=pool.map(x=>({row:x,distance:signalFeatureDistance(current,x.featureSnapshot||{side:x.side,score:x.score,gap:x.gap,context:x.context,mtfAligned:Object.values(x.mtf||{}).filter(v=>v.dir===(x.side==='BUY'?'BULL':'BEAR')).length,mtfTotal:Object.values(x.mtf||{}).length})})).sort((a,b)=>a.distance-b.distance).slice(0,8);
  const close=scored.filter(x=>x.distance<=0.42);
  const use=close.length>=3?close:scored.slice(0,Math.min(5,scored.length));
  const hit=use.filter(x=>x.row.outcome==='HIT').length,miss=use.filter(x=>x.row.outcome==='MISS').length,neutral=use.filter(x=>x.row.outcome==='NEUTRAL').length;
  const decided=hit+miss;
  return {count:use.length,hit,miss,neutral,rate:decided?hit/decided:null,partial:close.length<3,items:use};
}
function getSignalLifecycle(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side))return {state:'WAIT',detail:'Menunggu BUY/SELL terkonfirmasi.'};
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf), anchorTs=Number(pred.anchorTs||pred.targetTs||S.c.at(-1)?.t||0), targetTs=Number(pred.targetTs||anchorTs+ms);
  const row=SIGNALS.find(x=>x.symbol===S.symbol&&x.tf===tf&&Number(x.targetTs)===targetTs);
  if(row?.status==='CLOSED')return {state:row.outcome==='HIT'?'TP / HIT':row.outcome==='MISS'?'SL / MISS':'CLOSED',detail:`Signal ${row.outcome||'selesai'} pada candle target ${signalTime(targetTs)}.`,row};
  const now=Date.now();
  if(now<targetTs)return {state:'FORMING',detail:`Setup dibentuk pada ${signalTime(anchorTs)} dan menunggu candle target ${signalTime(targetTs)}.`};
  const risk=pred.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0);
  if(risk?.valid){
    const invalid=pred.side==='BUY'?price<=risk.sl:price>=risk.sl;
    const tp=pred.side==='BUY'?price>=risk.tp1:price<=risk.tp1;
    if(invalid)return {state:'INVALIDATED',detail:`Harga ${fmtIDR(price)} sudah melewati batas invalidation/SL ${fmtIDR(risk.sl)}.`,row};
    if(tp)return {state:'TP1 REACHED',detail:`Harga ${fmtIDR(price)} sudah mencapai zona TP1 ${fmtIDR(risk.tp1)}.`,row};
  }
  return {state:'ACTIVE',detail:`Signal ${pred.side} masih aktif; belum mencapai invalidation maupun TP1.`,row};
}
function getAntiChase(pred){
  const r=pred?.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0);
  if(!r?.valid||!price)return {level:'WAIT',text:'Entry zone belum tersedia.'};
  const half=Math.max(1e-12,Math.abs(r.entryHigh-r.entryLow)/2), center=(r.entryLow+r.entryHigh)/2;
  const dist=Math.abs(price-center), pct=dist/Math.max(1e-12,half)*100;
  if((pred.side==='BUY'&&price>r.entryHigh)||(pred.side==='SELL'&&price<r.entryLow)){
    return {level:'CHASE',text:`Harga ${fmtIDR(price)} sudah berada di luar entry zone ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)}. Jangan mengejar signal; tunggu harga kembali ke zona atau setup baru.`};
  }
  if(pct>65)return {level:'CAUTION',text:`Harga mulai menjauh dari pusat entry zone (${Math.round(pct)}% dari lebar acuan). Entry sekarang kurang ideal dibanding area ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)}.`};
  return {level:'OK',text:`Harga masih berada dalam entry zone ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)}; jarak dari pusat zona sekitar ${Math.round(pct)}%.`};
}
function getSignalInvalidation(pred){
  const r=pred?.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0);
  if(!r?.valid)return {level:'WAIT',text:'Belum dapat menentukan invalidation karena risk plan belum valid.'};
  const invalid=pred.side==='BUY'?price<=r.sl:price>=r.sl;
  const near=pred.side==='BUY'?price<=r.sl+(r.entry-(r.sl))*0.2:price>=r.sl-(r.sl-r.entry)*0.2;
  if(invalid)return {level:'INVALID',text:`Signal invalid jika/karena harga berada di ${fmtIDR(price)}, melewati batas ${fmtIDR(r.sl)}.`};
  return {level:near?'NEAR':'CLEAR',text:`Batas invalidation: ${fmtIDR(r.sl)}. ${near?'Harga sudah mendekati batas ini; konfirmasi berikutnya perlu lebih ketat.':'Selama struktur dan harga tidak menembus batas ini, setup belum dianggap invalid.'}`};
}


/* Signal Explanation Engine
   Uses the exact FINAL SIGNAL inputs already used by the app. It explains
   WHY BUY/SELL appeared; it does not create or override the signal. */
function buildSignalExplanation(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side)){
    return {side:'WAIT',title:'Belum ada BUY/SELL yang terkonfirmasi',
      summary:'Signal Explanation Engine menunggu arah yang cukup kuat sebelum menjelaskan setup.',
      sections:[]};
  }
  const side=pred.side, bull=side==='BUY';
  const cp=pred.candlePrediction?.candle||pred.candle||{};
  const body=Number(cp.bodyPct||0), upper=Number(cp.upperWickPct||0), lower=Number(cp.lowerWickPct||0);
  const closePos=Number(cp.closePos??50);
  const momentum=pred.momentum||getRealtimeMomentum()||{};
  const sr=pred.sr||{};
  const learning=pred.learning||{};
  const readiness=pred.readiness||getEntryReadiness(pred);
  const risk=pred.riskPlan||buildSmartRiskPlan(pred);
  const mtfRows=Object.values(S.mtf||{});
  const wanted=side==='BUY'?'BULL':'BEAR';
  const mtfAligned=mtfRows.filter(x=>x.dir===wanted).length;
  const mtfTotal=mtfRows.length;
  const fmtPct=x=>`${Math.round(Number(x)||0)}%`;
  const directionWord=side==='BUY'?'bullish':'bearish';

  let candleText;
  if(bull){
    if(lower>=upper+8) candleText=`Body ${fmtPct(body)} dengan lower wick ${fmtPct(lower)} menunjukkan rejection dari bawah; buyer merespons area harga rendah.`;
    else if(body>=55&&closePos>=68) candleText=`Body relatif kuat (${fmtPct(body)}) dan close berada tinggi (${fmtPct(closePos)} dari range), sehingga tekanan buyer lebih dominan.`;
    else candleText=`Struktur candle masih condong bullish: body ${fmtPct(body)}, lower wick ${fmtPct(lower)}, upper wick ${fmtPct(upper)}, close-position ${fmtPct(closePos)}.`;
  }else{
    if(upper>=lower+8) candleText=`Body ${fmtPct(body)} dengan upper wick ${fmtPct(upper)} menunjukkan rejection dari atas; seller merespons area harga tinggi.`;
    else if(body>=55&&closePos<=32) candleText=`Body relatif kuat (${fmtPct(body)}) dan close berada rendah (${fmtPct(closePos)} dari range), sehingga tekanan seller lebih dominan.`;
    else candleText=`Struktur candle masih condong bearish: body ${fmtPct(body)}, upper wick ${fmtPct(upper)}, lower wick ${fmtPct(lower)}, close-position ${fmtPct(closePos)}.`;
  }

  let srText;
  const ctx=String(sr.context||'NO_LEVEL');
  if(ctx==='SUPPORT_REJECTION') srText=`Harga bereaksi di support ${sr.support?fmt(sr.support):'—'} dan wick menembus area lalu close kembali di atasnya; ini mendukung BUY.`;
  else if(ctx==='RESISTANCE_REJECTION') srText=`Harga bereaksi di resistance ${sr.resistance?fmt(sr.resistance):'—'} dan wick menembus area lalu close kembali di bawahnya; ini mendukung SELL.`;
  else if(ctx==='NEAR_SUPPORT') srText=`Harga sedang dekat support ${sr.support?fmt(sr.support):'—'}; area ini menjadi acuan apakah buyer mampu mempertahankan harga.`;
  else if(ctx==='NEAR_RESISTANCE') srText=`Harga sedang dekat resistance ${sr.resistance?fmt(sr.resistance):'—'}; area ini menjadi acuan apakah seller mampu menahan harga.`;
  else srText=`Harga berada di antara level S/R utama${sr.support||sr.resistance?' · support '+(sr.support?fmt(sr.support):'—')+' · resistance '+(sr.resistance?fmt(sr.resistance):'—'):''}.`;

  const momSide=momentum.side||'WAIT', momScore=Number(momentum.score||0);
  const momentumText=momSide===side
    ? `Momentum realtime searah ${side} (${momScore}/100): tekanan ${directionWord} masih terlihat pada candle yang sedang berjalan.`
    : momSide==='WAIT'
      ? `Momentum realtime belum kuat (${momScore}/100), jadi timing entry tetap perlu menunggu konfirmasi.`
      : `Momentum realtime sedang ${momSide} (${momScore}/100), berlawanan dengan signal ${side}; ini menjadi faktor kehati-hatian, bukan pembatal otomatis.`;

  const learningText=learning.hitRate!=null
    ? `Learning menemukan hit rate historis ${Math.round(Number(learning.hitRate)*100)}% dari ${Number(learning.featureSamples||learning.samples||0)} sample pola; adjustment confidence ${Number(learning.adjustment||0)>=0?'+':''}${Number(learning.adjustment||0)}.`
    : `Learning belum punya sample pola yang cukup untuk memberi hit rate spesifik; model tidak menambah arah baru dan confidence learning dinetralkan.`;

  const mtfText=mtfTotal
    ? `MTF searah ${mtfAligned}/${mtfTotal} timeframe (${Math.round(mtfAligned/mtfTotal*100)}%).`
    : 'MTF belum tersedia, sehingga konfirmasi antar-timeframe belum dapat dihitung.';

  const riskText=risk?.valid
    ? `Risk plan: entry ${fmtIDR(risk.entryLow)}–${fmtIDR(risk.entryHigh)}, SL ${fmtIDR(risk.sl)}, TP1 ${fmtIDR(risk.tp1)}, TP2 ${fmtIDR(risk.tp2)}, R:R ${Number(risk.rr1||0).toFixed(1)} / ${Number(risk.rr2||0).toFixed(1)}. Jika struktur/SL invalid, setup dianggap batal.`
    : 'Risk plan belum valid; jangan menganggap BUY/SELL sebagai setup entry lengkap sebelum Entry, SL, dan TP tersedia.';

  const summary=`${side} muncul karena struktur candle ${directionWord}, reaksi S/R, konteks MTF, dan adaptive learning membentuk konfluensi yang cukup. ${momentum.side===side?'Momentum realtime ikut mendukung.':'Momentum realtime belum sepenuhnya mendukung, jadi timing perlu diperhatikan.'}`;
  const quality=pred.quality||getSignalQuality(pred,readiness,risk);
  const confidence=quality.components||{};
  const lifecycle=getSignalLifecycle(pred);
  const antiChase=getAntiChase(pred);
  const invalidation=getSignalInvalidation(pred);
  const similar=findHistoricalSimilarSetups(pred);
  const conflict=getSignalConflict(pred);
  const decision=getDecisionGate(pred,readiness,quality,risk);
  const entryZone=getEntryZoneIntelligence(pred);
  const similarText=similar.count
    ? `${similar.count} setup historis ${side} yang paling mirip ditemukan: ${similar.hit} HIT, ${similar.miss} MISS${similar.neutral?`, ${similar.neutral} netral`:''}. ${similar.rate!=null?`Hit rate pada sample mirip ${Math.round(similar.rate*100)}%.`:''}${similar.partial?' Match fitur terbatas karena sebagian riwayat lama belum menyimpan snapshot fitur.':''}`
    : 'Belum ada sample historis yang cukup mirip pada pair dan timeframe ini.';
  return {
    side,title:`KENAPA MUNCUL ${side}?`,
    summary,
    confidence,quality,lifecycle,antiChase,invalidation,similar,similarText,conflict,decision,entryZone,
    sections:[
      {key:'candle',label:'WICK + BODY',text:candleText,tag:`Body ${fmtPct(body)} · Upper ${fmtPct(upper)} · Lower ${fmtPct(lower)}`},
      {key:'sr',label:'S/R REACTION',text:srText,tag:ctx.replaceAll('_',' ')},
      {key:'mtf',label:'MTF',text:mtfText,tag:`${mtfAligned}/${mtfTotal || 0} searah`},
      {key:'learning',label:'LEARNING',text:learningText,tag:learning.hitRate!=null?`${Math.round(Number(learning.hitRate)*100)}% hit`:'WAIT'},
      {key:'momentum',label:'MOMENTUM',text:momentumText,tag:`${momSide} ${momScore}/100`},
      {key:'risk',label:'RISK PLAN',text:riskText,tag:risk?.valid?`R:R ${Number(risk.rr1||0).toFixed(1)}`:'WAIT'}
    ],
    readiness
  };
}
function getSignalConflict(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side)) return {level:'WAIT',count:0,items:[],text:'Belum ada signal untuk dianalisis.'};
  const side=pred.side, wanted=side==='BUY'?'BULL':'BEAR';
  const mtf=Object.values(S.mtf||{});
  const items=[];
  const opposite=mtf.filter(x=>x?.dir && x.dir!==wanted && x.dir!=='NEUTRAL').length;
  if(mtf.length && opposite) items.push(`MTF ${opposite}/${mtf.length} timeframe berlawanan`);
  const mom=pred.momentum||getRealtimeMomentum()||{};
  if(mom.side && mom.side!=='WAIT' && mom.side!==side) items.push(`momentum ${mom.side} ${Number(mom.score||0)}/100`);
  const ctx=String(pred.sr?.context||'NO_LEVEL');
  const srOpp=(side==='BUY'&&ctx==='RESISTANCE_REJECTION')||(side==='SELL'&&ctx==='SUPPORT_REJECTION');
  if(srOpp) items.push(`reaksi S/R saat ini cenderung ${ctx.replaceAll('_',' ').toLowerCase()}`);
  const score=Number(pred.score||0), gap=Number(pred.gap||0);
  if(score<60 || gap<8) items.push(`score/gap belum lebar (${score}/${gap})`);
  const level=items.length>=2?'MAJOR CONFLICT':items.length===1?'MINOR CONFLICT':'ALIGNED';
  const text=items.length?`${items.length} konflik terdeteksi: ${items.join(' · ')}.`:'Tidak ditemukan konflik utama antara MTF, momentum, S/R, dan score.';
  return {level,count:items.length,items,text};
}
function getDecisionGate(pred, readiness, quality, risk){
  if(!pred||!['BUY','SELL'].includes(pred.side)) return {state:'WAIT',reasons:['Belum ada BUY/SELL terkonfirmasi.'],hard:0};
  const r=readiness||getEntryReadiness(pred), q=quality||getSignalQuality(pred,r,risk), rp=risk||buildSmartRiskPlan(pred), conflict=getSignalConflict(pred);
  const reasons=[]; let hard=0;
  if(!rp?.valid){reasons.push('Risk plan belum valid');hard++;}
  if(Number(r.score||0)<50){reasons.push(`readiness rendah (${Math.round(Number(r.score||0))}%)`);hard++;}
  if(Number(q.score||0)<50){reasons.push(`quality rendah (${Math.round(Number(q.score||0))}/100)`);hard++;}
  if(conflict.level==='MAJOR CONFLICT'){reasons.push('terdapat konflik utama antar konfirmasi');hard++;}
  if(rp?.valid && Number(rp.rr1||0)<1.5){reasons.push(`R:R TP1 hanya ${Number(rp.rr1||0).toFixed(1)}`);hard++;}
  if(hard) return {state:'NO-TRADE',reasons,hard,conflict};
  if(conflict.level==='MINOR CONFLICT' || Number(q.score||0)<65) return {state:'CAUTION',reasons:[...reasons,'setup masih membutuhkan kehati-hatian'],hard,conflict};
  return {state:'READY',reasons:['Konfirmasi utama cukup selaras untuk dipantau'],hard,conflict};
}
function buildUnifiedDecision(pred){
  const p=pred||{};
  const base=getDecisionGate(p,p.readiness,p.quality,p.riskPlan);
  const edge=getProfitabilityGate(p);
  const regime=buildRegimeStrategy();
  const capital=capitalProtectionCheck();
  const portfolio=buildPortfolioRisk();
  const validation=buildCombinedValidationV566();
  const dataQuality=buildDataQuality();
  const reasons=[...(base.reasons||[])];
  let hard=Number(base.hard||0);
  if(edge.state==='NO-TRADE'){reasons.push('historical edge negatif pada scope signal');hard++;}
  else if(edge.state==='CAUTION')reasons.push('historical edge belum cukup kuat');
  if(regime.state==='WEAK'){reasons.push(`regime ${regime.current?.label||regime.currentKey||'aktif'} lemah pada histori`);hard++;}
  else if(regime.state==='MIXED'||regime.state==='WAIT')reasons.push('kinerja regime belum cukup konsisten');
  if(capital.blocked){reasons.push(capital.reason||'capital protection aktif');hard++;}
  if(portfolio.state==='HIGH EXPOSURE'){reasons.push('portfolio exposure terlalu tinggi');hard++;}
  else if(portfolio.state==='WATCH')reasons.push('portfolio exposure perlu diperhatikan');
  if(validation.state==='HOLD' && validation.sample>=40)reasons.push('walk-forward + Monte Carlo belum lolos');
  if(dataQuality.state==='CRITICAL'){reasons.push('data quality critical: learning/decision ditahan');hard++;}
  else if(dataQuality.state==='WATCH')reasons.push('data quality memiliki warning yang perlu dipantau');
  let state='READY';
  if(!['BUY','SELL'].includes(p.side)) state='WAIT';
  else if(hard>0) state='BLOCK';
  else if(base.state==='NO-TRADE'||edge.state!=='READY'||base.state==='CAUTION'||regime.state==='MIXED'||regime.state==='WAIT'||portfolio.state==='WATCH'||(validation.state==='HOLD'&&validation.sample>=40)) state='WAIT';
  const score=Math.max(0,Math.min(100,Math.round((Number(base.score||base.quality?.score||50)+Number(edge.score||50)+(regime.score||50)+((100-(portfolio.state==='HIGH EXPOSURE'?60:portfolio.state==='WATCH'?25:0))||0))/4)));
  return {state,score,reasons,hard,base,edge,regime,capital,portfolio,validation,dataQuality};
}
function buildLiveResearchMonitor(){
  const closed=Array.isArray(SIGNALS)?SIGNALS.filter(x=>x&&x.status==='CLOSED'&&x.side&&x.side!=='WAIT'):[];
  const shadow=Array.isArray(SHADOW_ROWS)?SHADOW_ROWS.filter(x=>x&&x.side&&x.side!=='WAIT'):[];
  const metric=(rows)=>{
    const rs=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite);
    const wins=rows.filter(x=>x.outcome==='HIT'||Number(x.realizedR)>0).length;
    return {n:rows.length,avgR:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0,hit:rows.length?wins/rows.length*100:0};
  };
  const recent=shadow.slice().sort((a,b)=>Number(a.signalTs||a.ts||0)-Number(b.signalTs||b.ts||0)).slice(-20);
  const researchBase=closed.slice().sort((a,b)=>Number(a.t||a.ts||0)-Number(b.t||b.ts||0)).slice(0,-20);
  const allResearch=metric(researchBase.length>=20?researchBase:closed);
  const live=metric(recent);
  const avgGap=live.avgR-allResearch.avgR;
  const hitGap=live.hit-allResearch.hit;
  let state='DATA PENDING',level='gold',reason='Belum cukup data live/shadow untuk membandingkan dengan research baseline.';
  if(recent.length>=20 && (researchBase.length>=20||closed.length>=20)){
    if(avgGap<=-0.35 || hitGap<=-15){state='DEGRADED';level='bad';reason=`Live shadow tertinggal dari baseline: ΔR ${avgGap.toFixed(2)} · ΔHit ${hitGap.toFixed(1)}pp.`;}
    else if(avgGap<=-0.15 || hitGap<=-8){state='WATCH';level='gold';reason=`Ada pelemahan yang perlu dipantau: ΔR ${avgGap.toFixed(2)} · ΔHit ${hitGap.toFixed(1)}pp.`;}
    else {state='ALIGNED';level='good';reason=`Live shadow masih searah dengan baseline: ΔR ${avgGap.toFixed(2)} · ΔHit ${hitGap.toFixed(1)}pp.`;}
  }
  const out={state,level,reason,recent,live,research:allResearch,avgGap,hitGap};
  try{window.__liveResearchState=out}catch{}
  return out;
}
function renderLiveResearchMonitor(){
  const host=$('liveResearchV570'); if(!host)return;
  const o=buildLiveResearchMonitor();
  const tone=o.level==='good'?'good':o.level==='bad'?'bad':'gold';
  const auto=o.state==='DEGRADED'?'AUTO WATCH / PAUSE REVIEW':o.state==='WATCH'?'AUTO WATCH':'NORMAL MONITORING';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.70 LIVE-vs-RESEARCH MONITOR</span><b>Deteksi strategy degradation sebelum risiko dinaikkan</b></div><span class="sxeBadge ${tone}">${o.state}</span></div>
  <div class="ljSummary"><div><small>SHADOW N</small><b>${o.live.n}</b></div><div><small>SHADOW AVG R</small><b>${o.live.n?o.live.avgR.toFixed(2):'—'}</b></div><div><small>RESEARCH AVG R</small><b>${o.research.n?o.research.avgR.toFixed(2):'—'}</b></div><div><small>AUTO MONITOR</small><b>${auto}</b></div></div>
  <div class="contextRows"><div><span>Shadow Hit Rate</span><b>${o.live.n?o.live.hit.toFixed(1)+'%':'—'}</b></div><div><span>Research Hit Rate</span><b>${o.research.n?o.research.hit.toFixed(1)+'%':'—'}</b></div><div><span>Δ Average R</span><b>${o.live.n&&o.research.n?(o.avgGap>=0?'+':'')+o.avgGap.toFixed(2):'—'}</b></div><div><span>Δ Hit Rate</span><b>${o.live.n&&o.research.n?(o.hitGap>=0?'+':'')+o.hitGap.toFixed(1)+'pp':'—'}</b></div></div>
  <div class="adaptiveGuard"><b>${auto}:</b> ${o.reason}<br><span class="note">V5.70 adalah monitor, bukan prediksi. Shadow memakai proxy yang tersedia; keputusan risiko tetap mengikuti Capital Protection dan Decision Engine.</span></div>`;
}
function buildDataQuality(){
  const candles=Array.isArray(S.c?.slice?.(-600))?S.c.slice(-600):[];
  const closedCandles=candles.length>1?candles.slice(0,-1):candles;
  const issues=[];
  const add=(code,label,count,severity='WARN')=>{if(count>0)issues.push({code,label,count,severity})};
  let invalid=0,duplicate=0,nonMonotonic=0,gaps=0,badOHLC=0,badVolume=0;
  const expected=tfMillis(S.tf)||0;
  const seen=new Set(); let prevT=null;
  for(const c of closedCandles){
    const t=Number(c?.t),o=Number(c?.o),h=Number(c?.h),l=Number(c?.l),cl=Number(c?.c),v=Number(c?.v||0);
    if(![t,o,h,l,cl].every(Number.isFinite)) invalid++;
    if(seen.has(t)) duplicate++; else seen.add(t);
    if(prevT!=null){
      const d=t-prevT;
      if(!(d>0)) nonMonotonic++;
      else if(expected>0 && d>expected*1.5) gaps++;
    }
    if([o,h,l,cl].every(Number.isFinite) && (h<Math.max(o,cl)||l>Math.min(o,cl)||h<l||l<=0)) badOHLC++;
    if(Number.isFinite(v)&&v<0) badVolume++;
    prevT=t;
  }
  add('CANDLE_INVALID','Candle OHLC/timestamp tidak valid',invalid,'CRITICAL');
  add('CANDLE_DUPLICATE','Timestamp candle duplikat',duplicate,'CRITICAL');
  add('CANDLE_ORDER','Urutan timestamp candle bermasalah',nonMonotonic,'CRITICAL');
  add('CANDLE_GAP','Gap data candle terdeteksi',gaps,'WARN');
  add('CANDLE_OHLC','Relasi OHLC tidak valid',badOHLC,'CRITICAL');
  add('CANDLE_VOLUME','Volume negatif',badVolume,'WARN');

  const signals=Array.isArray(SIGNALS)?SIGNALS:[];
  const keys=new Set(), duplicateSignals=signals.length-signals.filter(x=>{const k=String(x?.key||'');if(!k||keys.has(k))return false;keys.add(k);return true}).length;
  const pendingStale=signals.filter(x=>x?.status==='PENDING' && Number.isFinite(Number(x.targetTs)) && Number(x.targetTs)<Date.now()-Math.max(tfMillis(x.tf||S.tf)*3,900000)).length;
  const closedMissingR=signals.filter(x=>x?.status==='CLOSED' && !Number.isFinite(Number(x.realizedR))).length;
  const malformedSignals=signals.filter(x=>!['BUY','SELL','WAIT'].includes(x?.side)||!Number.isFinite(Number(x.ts||x.signalTs||x.anchorTs))).length;
  add('SIGNAL_DUPLICATE','Signal key duplikat',duplicateSignals,'CRITICAL');
  add('SIGNAL_STALE','Signal PENDING terlalu lama',pendingStale,'WARN');
  add('SIGNAL_MISSING_R','Signal CLOSED tanpa realized-R',closedMissingR,'WARN');
  add('SIGNAL_MALFORMED','Record signal tidak lengkap',malformedSignals,'CRITICAL');

  const shadow=Array.isArray(SHADOW_ROWS)?SHADOW_ROWS:[];
  const shadowKeys=new Set(); let shadowDup=0;
  for(const x of shadow){const k=String(x?.key||'');if(k&&shadowKeys.has(k))shadowDup++;if(k)shadowKeys.add(k)}
  const shadowStale=shadow.filter(x=>x?.outcome==='PENDING'&&Number(x.targetTs)>0&&Number(x.targetTs)<Date.now()-Math.max(tfMillis(x.tf||S.tf)*3,900000)).length;
  const shadowBadOutcome=shadow.filter(x=>x?.outcome!=='PENDING'&&!['HIT','MISS','NEUTRAL'].includes(x?.outcome)).length;
  add('SHADOW_DUPLICATE','Shadow record duplikat',shadowDup,'CRITICAL');
  add('SHADOW_STALE','Shadow outcome tertunda terlalu lama',shadowStale,'WARN');
  add('SHADOW_OUTCOME','Shadow outcome tidak dikenal',shadowBadOutcome,'CRITICAL');

  const critical=issues.filter(x=>x.severity==='CRITICAL').reduce((a,x)=>a+x.count,0);
  const warn=issues.filter(x=>x.severity==='WARN').reduce((a,x)=>a+x.count,0);
  const coverage=closedCandles.length>=50?'GOOD':closedCandles.length>=20?'LIMITED':'LOW';
  let state=critical>0?'CRITICAL':warn>0?'WATCH':coverage==='LOW'?'DATA LOW':'HEALTHY';
  const score=Math.max(0,Math.min(100,100-Math.min(60,critical*12)-Math.min(30,warn*3)-(coverage==='LIMITED'?10:coverage==='LOW'?25:0)));
  const usable=state!=='CRITICAL';
  return {state,score,usable,coverage,candles:closedCandles.length,signals:signals.length,shadow:shadow.length,issues,critical,warn};
}
function renderDataQuality(){
  const host=$('dataQualityV571');if(!host)return;
  const q=buildDataQuality();
  const tone=q.state==='HEALTHY'?'good':q.state==='CRITICAL'?'bad':'gold';
  const rows=q.issues.map(x=>`<div class="contextRows"><span>${x.severity==='CRITICAL'?'🔴':'🟡'} ${x.label}</span><b>${x.count}</b></div>`).join('')||'<div class="note">Tidak ditemukan anomali pada data yang diperiksa.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.71 DATA QUALITY ENGINE</span><b>Validasi data sebelum dipakai untuk learning &amp; decision</b></div><span class="sxeBadge ${tone}">${q.state} · ${q.score}/100</span></div>
  <div class="ljSummary"><div><small>CLOSED CANDLES</small><b>${q.candles}</b></div><div><small>SIGNALS</small><b>${q.signals}</b></div><div><small>SHADOW</small><b>${q.shadow}</b></div><div><small>COVERAGE</small><b>${q.coverage}</b></div></div>
  <div class="contextRows"><div><span>Critical issues</span><b class="${q.critical?'bad':'good'}">${q.critical}</b></div><div><span>Warnings</span><b class="${q.warn?'gold':'good'}">${q.warn}</b></div><div><span>Learning data</span><b>${q.usable?'USABLE':'HOLD'}</b></div></div>
  <div class="adaptiveGuard"><b>DATA CHECK:</b> ${q.state==='CRITICAL'?'Learning/decision sebaiknya ditahan sampai data kritis diperbaiki.':q.state==='WATCH'?'Data masih dapat dibaca, tetapi beberapa warning perlu diperiksa.':q.coverage==='LOW'?'Sample candle masih terlalu sedikit untuk kesimpulan kuat.':'Data utama lolos pemeriksaan struktur.'}</div>
  <div style="margin-top:8px">${rows}</div>
  <div class="note">V5.71 memeriksa struktur data yang tersedia di browser. Ia tidak mengklaim bahwa feed Binance bebas dari kesalahan di luar data yang diterima aplikasi.</div>`;
}


function buildPreTradeChecklist(pred,decision){
  const p=pred||{}, d=decision||buildUnifiedDecision(p), plan=p.riskPlan||buildSmartRiskPlan(p), dq=d.dataQuality||buildDataQuality();
  const vol=(()=>{try{return buildMarketVolatilityFilter()}catch{return {state:'NORMAL',reason:'Volatility filter belum tersedia'}}})();
  const checks=[];
  const add=(key,label,ok,status,detail,critical=false)=>checks.push({key,label,ok,status,detail,critical});
  const signalOk=['BUY','SELL'].includes(p.side);
  add('DATA','DATA',dq.state!=='CRITICAL',dq.state,dq.state==='CRITICAL'?'Data quality critical':`Quality ${dq.score}/100`,true);
  const regimeOk=!['WAIT','WEAK'].includes(d.regime?.state||'WAIT');
  add('REGIME','REGIME',regimeOk,d.regime?.state||'WAIT',d.regime?.current?.label||d.regime?.currentKey||'—',true);
  const edgeOk=d.edge?.state==='READY';
  add('EDGE','EDGE',edgeOk,d.edge?.state||'WAIT',`Score ${Number(d.edge?.score||0)}/100`,true);
  const rrOk=!!plan?.valid && Number(plan?.rr1||0)>=1.5;
  add('RR','R/R',rrOk,rrOk?'PASS':'HOLD',plan?.valid?`RR1 ${Number(plan.rr1||0).toFixed(2)}`:'Risk plan belum valid',true);
  const riskOk=!d.capital?.blocked && d.portfolio?.state!=='HIGH EXPOSURE';
  add('RISK','RISK',riskOk,riskOk?'CLEAR':'BLOCKED',d.capital?.blocked?(d.capital.reason||'Capital protection aktif'):(d.portfolio?.state||'—'),true);
  const portfolioOk=d.portfolio?.state!=='HIGH EXPOSURE';
  add('PORTFOLIO','PORTFOLIO',portfolioOk,d.portfolio?.state||'—',portfolioOk?'Exposure dalam guard':'Exposure terlalu tinggi',true);
  const valOk=d.validation?.state!=='HOLD' || Number(d.validation?.sample||0)<40;
  add('VALIDATION','VALIDATION',valOk,d.validation?.state||'WAIT',d.validation?.sample!=null?`${d.validation.sample} sample`:'—',false);
  const safety=buildKillSwitchIntelligence();
  const safetyOk=safety.state!=='PAUSE' && !S.kill;
  add('SAFETY','SAFETY',safetyOk,safety.state,safety.issues?.[0]?.reason||'No critical pause',true);
  const execOk=signalOk && p.readiness?.ready===true && Number(p.quality?.score||0)>=70 && Number(p.gap||0)>=AUTO_CONFIRM_GAP;
  add('EXECUTION','EXECUTION',execOk,execOk?'READY':'WAIT',signalOk?`Entry ${p.readiness?.label||'WAIT'} · quality ${Number(p.quality?.score||0)}/100 · gap ${Number(p.gap||0)}`:'Signal bukan BUY/SELL',true);
  const criticalFail=checks.filter(x=>x.critical&&!x.ok);
  const fail=checks.filter(x=>!x.ok);
  let state=criticalFail.length?'BLOCK':fail.length?'WAIT':'READY';
  if(vol.state==='HIGH') state=state==='READY'?'WAIT':state;
  return {state,checks,criticalFail,fail,vol,decision:d,plan,checkedAt:Date.now()};
}
function renderPreTradeChecklist(pred){
  const host=$('preTradeChecklistV584');if(!host)return;
  const o=buildPreTradeChecklist(pred||LAST_LIVE_FINAL?.pred||{},LAST_LIVE_FINAL?.decision||null);
  const tone=o.state==='READY'?'good':o.state==='BLOCK'?'bad':'gold';
  const label=o.state==='READY'?'READY · TRADE':o.state==='BLOCK'?'BLOCK':'WAIT';
  const rows=o.checks.map(x=>`<div class="ptcRow"><span><b class="${x.ok?'good':'bad'}">${x.ok?'✓':'×'}</b> ${x.label}</span><b class="${x.ok?'good':'bad'}">${x.status}</b><span>${x.detail}</span></div>`).join('');
  host.innerHTML=`<div class="ptcHead"><div><span class="label">V5.84 PRE-TRADE CHECKLIST</span><b>Semua guard diperiksa sebelum Paper/AUTO</b></div><span class="paperBadge ${tone}">${label}</span></div>
  <div class="ptcSummary"><div><small>CHECKS</small><b>${o.checks.filter(x=>x.ok).length}/${o.checks.length}</b></div><div><small>CRITICAL FAIL</small><b>${o.criticalFail.length}</b></div><div><small>VOLATILITY</small><b>${o.vol.state}</b></div><div><small>TIME</small><b>${new Date(o.checkedAt).toLocaleTimeString('id-ID')}</b></div></div>
  <div class="ptcRows">${rows}</div>
  <div class="adaptiveGuard"><b>GATE:</b> ${o.state==='READY'?'Checklist lengkap. Paper/AUTO boleh melanjutkan evaluasi signal.':o.state==='BLOCK'?'Ada guard kritis yang gagal. Entry baru harus diblokir.':'Belum semua syarat terpenuhi. Sistem menunggu konfirmasi berikutnya.'}<br><span class="note">Volatility HIGH menurunkan status READY menjadi WAIT sebagai guard tambahan. Checklist ini bukan prediksi harga dan tidak menjamin profit.</span></div>`;
}

function renderDecisionEngine(pred){
  const host=$('decisionEngineV569'); if(!host)return;
  const o=buildUnifiedDecision(pred||{});
  recordDecisionAudit(pred||{},o);
  renderDecisionAudit();
  const tone=o.state==='READY'?'good':o.state==='BLOCK'?'bad':'gold';
  const label=o.state==='READY'?'TRADE':o.state==='BLOCK'?'BLOCK':'WAIT';
  const v=o.validation;
  const validationText=v.state==='VALIDATED'?'VALIDATED':v.sample>=40?'HOLD':'DATA PENDING';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.69 DECISION ENGINE</span><b>Satu gerbang untuk signal, edge, regime &amp; risk</b></div><span class="sxeBadge ${tone}">${label} · ${o.score}/100</span></div>
  <div class="ljSummary"><div><small>FINAL</small><b>${label}</b></div><div><small>BASE GATE</small><b>${o.base.state||'WAIT'}</b></div><div><small>EDGE</small><b>${o.edge.state}</b></div><div><small>CAPITAL</small><b>${o.capital.ok?'CLEAR':'BLOCKED'}</b></div></div>
  <div class="contextRows"><div><span>Regime</span><b>${o.regime.current?.label||o.regime.currentKey||'—'} · ${o.regime.state}</b></div><div><span>Portfolio</span><b>${o.portfolio.state}</b></div><div><span>Research validation</span><b>${validationText}</b></div><div><span>Data quality</span><b>${o.dataQuality.state} · ${o.dataQuality.score}/100</b></div><div><span>Decision reasons</span><b>${o.reasons.length?o.reasons.join(' · '):'Konfirmasi utama selaras.'}</b></div></div>
  <div class="adaptiveGuard"><b>AUTO GATE:</b> ${o.state==='READY'?'Semua guard utama lolos untuk evaluasi AUTO.':o.state==='BLOCK'?'Entry baru diblokir oleh hard guard.':'Belum cukup selaras; AUTO menunggu.'} <br><span class="note">Decision Engine tidak menjamin profit dan tidak memprediksi harga. Manual BUY/SELL tetap merupakan keputusan pengguna.</span></div>`;
}
function buildKillSwitchIntelligence(){
  const now=Date.now(), issues=[];
  if(S.kill) issues.push({level:'CRITICAL',reason:'Kill switch aktif'});
  const marketAge=lastMarketWsDataAt?now-lastMarketWsDataAt:Infinity;
  const marketStale=marketAge>12000;
  if(marketStale) issues.push({level:'CRITICAL',reason:marketAge===Infinity?'Market feed belum terhubung':`Market feed stale ${Math.round(marketAge/1000)}s`});
  const accountRequired=!!AUTH;
  const accountAge=lastAccountWsDataAt?now-lastAccountWsDataAt:Infinity;
  const accountStale=accountRequired&&accountAge>20000;
  if(accountStale) issues.push({level:'CRITICAL',reason:accountAge===Infinity?'Account stream belum terhubung':`Account feed stale ${Math.round(accountAge/1000)}s`});
  const dq=buildDataQuality();
  if(dq.state==='CRITICAL') issues.push({level:'CRITICAL',reason:'Data Quality CRITICAL'});
  const cp=CAPITAL_GUARD_CACHE.data;
  if(cp&&!cp.ok) issues.push({level:'CRITICAL',reason:`Capital Protection: ${(cp.reasons||[]).slice(0,2).join(' · ')||'blocked'}`});
  const lr=(()=>{try{return window.__liveResearchState||null}catch{return null}})();
  if(lr?.state==='DEGRADED') issues.push({level:'WARN',reason:'Live-vs-Research DEGRADED'});
  const state=issues.some(x=>x.level==='CRITICAL')?'PAUSE':issues.length?'WARNING':'SAFE';
  return {state,issues,marketAge,accountAge,checkedAt:now};
}
function renderKillSwitchIntelligence(){
  const host=$('killSwitchIntelligenceV573');if(!host)return;
  const o=buildKillSwitchIntelligence();
  const tone=o.state==='SAFE'?'good':o.state==='PAUSE'?'bad':'gold';
  const rows=o.issues.length?o.issues.map(x=>`<div class="contextRows"><span>${x.level==='CRITICAL'?'🔴':'🟡'} ${x.reason}</span><b>${x.level}</b></div>`).join(''):'<div class="note">Tidak ada kondisi pause/warning terdeteksi.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.73 KILL-SWITCH INTELLIGENCE</span><b>Deteksi kondisi yang membuat AUTO harus berhenti</b></div><span class="sxeBadge ${tone}">${o.state}</span></div>
  <div class="ljSummary"><div><small>SAFETY</small><b>${o.state}</b></div><div><small>MARKET FEED</small><b>${Number.isFinite(o.marketAge)?Math.round(o.marketAge/1000)+'s':'—'}</b></div><div><small>ACCOUNT FEED</small><b>${Number.isFinite(o.accountAge)?Math.round(o.accountAge/1000)+'s':'—'}</b></div><div><small>CHECK</small><b>${new Date(o.checkedAt).toLocaleTimeString()}</b></div></div>
  <div style="margin-top:8px">${rows}</div>
  <div class="adaptiveGuard"><b>AUTO SAFETY:</b> ${o.state==='SAFE'?'Kondisi dasar aman untuk melanjutkan evaluasi Decision Engine.':o.state==='PAUSE'?'AUTO entry harus berhenti sampai kondisi kritis hilang.':'AUTO tidak diblokir oleh warning ini, tetapi kondisi perlu dipantau.'}<br><span class="note">V5.73 adalah circuit breaker berbasis kondisi aplikasi; tidak memprediksi harga dan tidak menjamin profit.</span></div>`;
}

function getEntryZoneIntelligence(pred){
  const r=pred?.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0);
  if(!r?.valid||!price)return {state:'WAIT',text:'Entry zone belum tersedia.'};
  const width=Math.max(1e-12,Math.abs(r.entryHigh-r.entryLow));
  const inside=price>=r.entryLow&&price<=r.entryHigh;
  const late=pred.side==='BUY'?price>r.entryHigh:price<r.entryLow;
  const adverse=pred.side==='BUY'?price<r.entryLow:price>r.entryHigh;
  let state='IDEAL',text=`Harga ${fmtIDR(price)} berada dalam zona entry ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)}.`;
  if(late){state='LATE';text=`Harga ${fmtIDR(price)} sudah melewati sisi entry yang ideal. Zona acuan ${fmtIDR(r.entryLow)}–${fmtIDR(r.entryHigh)}; hindari mengejar harga.`;}
  else if(adverse){state='WAIT-PULLBACK';text=`Harga ${fmtIDR(price)} berada di luar sisi entry yang diharapkan. Tunggu struktur kembali valid sebelum mempertimbangkan entry.`;}
  else if(inside){const pos=Math.round(((price-r.entryLow)/width)*100);text+=` Posisi dalam zona sekitar ${pos}%.`;}
  return {state,text,low:r.entryLow,high:r.entryHigh,price};
}
function getMarketRegime(){
  const a=S.c||[];
  if(a.length<30)return {regime:'UNKNOWN',label:'DATA INSUFFICIENT',score:0,text:'Data candle belum cukup untuk menentukan regime pasar.'};
  const closes=a.map(x=>Number(x.c)||0), last=closes.at(-1), e20=EMA(closes,20).at(-1), e50=EMA(closes,50).at(-1), adx=ADX(a).at(-1)||0, atr=ATR(a).at(-1)||0;
  const recent=a.slice(-20), range=Math.max(...recent.map(x=>x.h))-Math.min(...recent.map(x=>x.l));
  const avgBody=recent.reduce((n,x)=>n+Math.abs(x.c-x.o),0)/recent.length;
  const atrPct=last?atr/last*100:0, slope=e50?((e20-e50)/e50*100):0;
  let regime='RANGE',label='RANGING',score=55;
  if(adx>=25 && Math.abs(slope)>=0.25){regime=slope>0?'TREND_UP':'TREND_DOWN';label=slope>0?'UPTREND':'DOWNTREND';score=Math.min(100,65+Math.round(adx));}
  else if(atrPct>=1.2 && range/last*100>=2.5){regime='HIGH_VOLATILITY';label='HIGH VOLATILITY';score=70;}
  else if(Math.abs(slope)<0.12 && adx<20){regime='RANGE';label='RANGING';score=72;}
  else if(adx>=22){regime=slope>=0?'TREND_UP':'TREND_DOWN';label=slope>=0?'MILD UPTREND':'MILD DOWNTREND';score=62;}
  const detail=`EMA20/50 gap ${slope.toFixed(2)}% · ADX ${Number(adx).toFixed(1)} · ATR ${atrPct.toFixed(2)}% · range 20 candle ${(range/last*100).toFixed(2)}%.`;
  return {regime,label,score,text:`Market saat ini terdeteksi ${label.toLowerCase()}. ${detail}`};
}
function getStrategyMatch(pred){
  const r=getMarketRegime();
  if(!pred||!['BUY','SELL'].includes(pred.side))return {state:'WAIT',score:0,text:'Menunggu BUY/SELL untuk mencocokkan strategi dengan regime.'};
  const side=pred.side;
  let score=60, reasons=[];
  if(r.regime==='TREND_UP'){score+=side==='BUY'?25:-20;reasons.push(side==='BUY'?'arah BUY sejalan dengan uptrend':'SELL melawan uptrend');}
  else if(r.regime==='TREND_DOWN'){score+=side==='SELL'?25:-20;reasons.push(side==='SELL'?'arah SELL sejalan dengan downtrend':'BUY melawan downtrend');}
  else if(r.regime==='RANGE'){score+=15;reasons.push('range cocok untuk reaction S/R, tetapi breakout perlu diwaspadai');}
  else if(r.regime==='HIGH_VOLATILITY'){score-=5;reasons.push('volatility tinggi meningkatkan risiko false break dan SL cepat tersentuh');}
  const conflict=getSignalConflict(pred); if(conflict.level==='MAJOR CONFLICT')score-=15; else if(conflict.level==='MINOR CONFLICT')score-=5;
  score=Math.max(0,Math.min(100,score));
  const state=score>=75?'MATCH':score>=55?'CAUTION':'MISMATCH';
  return {state,score,regime:r.regime,text:`${state}: ${reasons.join(' · ')}. ${r.text}`};
}
function getDynamicRiskMonitor(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side))return {state:'WAIT',items:[],text:'Menunggu signal aktif.'};
  const r=pred.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0), mom=pred.momentum||getRealtimeMomentum()||{};
  if(!r?.valid||!price)return {state:'WAIT',items:[],text:'Risk plan belum valid.'};
  const items=[]; let danger=0;
  const adverse=pred.side==='BUY'?(r.entry-r.sl):(r.sl-r.entry);
  const dist=pred.side==='BUY'?price-r.sl:r.sl-price;
  const proximity=adverse>0?dist/adverse:0;
  if(proximity<0.25){items.push('Harga mendekati SL/invalidation');danger+=2;} else if(proximity<0.5){items.push('buffer ke SL mulai menipis');danger++;}
  if(mom.side && mom.side!==pred.side && mom.side!=='WAIT'){items.push(`momentum ${mom.side} berlawanan`);danger++;}
  const regime=getMarketRegime();
  if(regime.regime==='HIGH_VOLATILITY'){items.push('volatility tinggi');danger++;}
  const tp=pred.side==='BUY'?price>=r.tp1:price<=r.tp1;
  if(tp)items.push('TP1 sudah tersentuh');
  const state=danger>=2?'DANGER':danger===1?'CAUTION':'STABLE';
  return {state,items,text:items.length?items.join(' · '):'Tidak ada perubahan risiko utama yang terdeteksi; tetap pantau invalidation dan momentum.'};
}
function buildMarketContext(){
  const a=S.c||[]; const c=a.at(-1); const closed=a.slice(0,-1); if(!c||closed.length<25)return {state:'WAIT',trend:'WAIT',volatility:'LOW DATA',breakout:'NONE',rejection:'NONE',choppy:'LOW DATA',liquidity:'LOW DATA',score:0,notes:['Menunggu minimal 25 candle untuk membaca konteks pasar.']};
  const n=Math.min(60,closed.length), x=closed.slice(-n);
  const avg=(v)=>v.length?v.reduce((q,z)=>q+z,0)/v.length:0;
  const ranges=x.map(z=>Math.max(0,Number(z.h)-Number(z.l))); const atr=avg(ranges.slice(-14));
  const atrPct=Number(c.c)>0?atr/Number(c.c)*100:0;
  const priorRanges=x.slice(0,-14).map(z=>Math.max(0,Number(z.h)-Number(z.l)));
  const priorAtr=avg(priorRanges.slice(-20));
  const volRatio=priorAtr>0?atr/priorAtr:1;
  const highs=[], lows=[];
  for(let i=Math.max(1,x.length-25);i<x.length-1;i++){if(Number(x[i].h)>=Number(x[i-1].h)&&Number(x[i].h)>=Number(x[i+1].h))highs.push(Number(x[i].h));if(Number(x[i].l)<=Number(x[i-1].l)&&Number(x[i].l)<=Number(x[i+1].l))lows.push(Number(x[i].l));}
  const hh=highs.length>=2?highs.at(-1)>highs.at(-2):false, lh=highs.length>=2?highs.at(-1)<highs.at(-2):false;
  const hl=lows.length>=2?lows.at(-1)>lows.at(-2):false, ll=lows.length>=2?lows.at(-1)<lows.at(-2):false;
  const trend=hh&&hl?'UP STRUCTURE':lh&&ll?'DOWN STRUCTURE':(hh||hl)&&!(lh||ll)?'UP BIAS':(lh||ll)&&!(hh||hl)?'DOWN BIAS':'NEUTRAL STRUCTURE';
  const hi20=Math.max(...x.slice(-20).map(z=>Number(z.h))), lo20=Math.min(...x.slice(-20).map(z=>Number(z.l)));
  const range=Number(c.h)-Number(c.l), body=Math.abs(Number(c.c)-Number(c.o));
  const upper=Number(c.h)-Math.max(Number(c.o),Number(c.c)), lower=Math.min(Number(c.o),Number(c.c))-Number(c.l);
  const nearHigh=hi20>0?(hi20-Number(c.c))/hi20:1, nearLow=lo20>0?(Number(c.c)-lo20)/lo20:1;
  const breakout=Number(c.c)>hi20 && body>=range*.45?'UPSIDE BREAKOUT':Number(c.c)<lo20 && body>=range*.45?'DOWNSIDE BREAKOUT':'NO CONFIRMED BREAKOUT';
  const rejection=upper>=Math.max(body,range*.25)&&nearHigh<.004?'UPPER-WICK REJECTION':lower>=Math.max(body,range*.25)&&nearLow<.004?'LOWER-WICK REJECTION':'NO STRONG REJECTION';
  const dirs=x.slice(-12).map(z=>Math.sign(Number(z.c)-Number(z.o))).filter(Boolean); let flips=0; for(let i=1;i<dirs.length;i++)if(dirs[i]!==dirs[i-1])flips++;
  const choppy=dirs.length>=6&&flips/Math.max(1,dirs.length-1)>=.62?'HIGH CHOP':dirs.length>=6&&flips/Math.max(1,dirs.length-1)>=.45?'MODERATE CHOP':'LOW CHOP';
  const vols=x.slice(-20).map(z=>Number(z.v)||0), av=avg(vols), currentVol=Number(c.v)||0, vr=av>0?currentVol/av:1;
  const liquidity=vr>=1.5?'HIGH ACTIVITY':vr>=.75?'NORMAL ACTIVITY':'LOW ACTIVITY';
  const volatility=volRatio>=1.45?'HIGH VOLATILITY':volRatio>=1.15?'ELEVATED VOLATILITY':volRatio<=.75?'LOW VOLATILITY':'NORMAL VOLATILITY';
  let score=50; if(trend.includes('UP')||trend.includes('DOWN'))score+=10; if(trend==='UP STRUCTURE'||trend==='DOWN STRUCTURE')score+=8; if(choppy==='HIGH CHOP')score-=18; else if(choppy==='MODERATE CHOP')score-=8; if(volatility==='HIGH VOLATILITY')score-=8; if(breakout!=='NO CONFIRMED BREAKOUT')score+=8; if(rejection!=='NO STRONG REJECTION')score+=4; score=Math.max(0,Math.min(100,Math.round(score)));
  const state=score>=72?'CLEAR':score>=55?'MIXED':'UNCLEAR';
  const notes=[]; notes.push(`Structure ${trend.toLowerCase()}.`); notes.push(`${volatility.toLowerCase()} · ATR ${atrPct.toFixed(2)}%.`); notes.push(`${breakout.toLowerCase()}.`); if(rejection!=='NO STRONG REJECTION')notes.push(`${rejection.toLowerCase()}.`); if(choppy!=='LOW CHOP')notes.push(`${choppy.toLowerCase()} detected.`); notes.push(`Activity ${liquidity.toLowerCase()} (${vr.toFixed(2)}× avg volume).`);
  return {state,score,trend,volatility,breakout,rejection,choppy,liquidity,atrPct,volRatio,volumeRatio:vr,notes};
}
function getProfitabilityRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function profitabilityStats(rows){
  const rs=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  const wins=rs.filter(x=>x>0), losses=rs.filter(x=>x<0);
  const hit=rows.filter(x=>x.outcome==='HIT').length;
  const avgR=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null;
  const grossWin=wins.reduce((a,b)=>a+b,0), grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
  const profitFactor=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:null);
  return {n:rows.length,hit,rate:rows.length?hit/rows.length:null,avgR,profitFactor,wins:wins.length,losses:losses.length};
}
function getProfitabilityGate(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side))return {state:'WAIT',score:0,reason:'Menunggu BUY/SELL.'};
  const all=getProfitabilityRows();
  const sideRows=all.filter(x=>x.side===pred.side);
  const regime=pred.marketRegime?.regime||pred.marketRegime?.label||getMarketRegime()?.regime||'UNKNOWN';
  const context=pred.sr?.context||pred.context||'NO_LEVEL';
  const scoped=sideRows.filter(x=>String(x.marketRegime?.regime||x.marketRegime?.label||'UNKNOWN')===String(regime)&&String(x.context||'NO_LEVEL')===String(context));
  const fallback=sideRows.filter(x=>String(x.marketRegime?.regime||x.marketRegime?.label||'UNKNOWN')===String(regime));
  const sample=scoped.length>=12?scoped:(fallback.length>=12?fallback:sideRows);
  const label=scoped.length>=12?'SIDE + REGIME + S/R':fallback.length>=12?'SIDE + REGIME':'SIDE';
  const st=profitabilityStats(sample), recent=profitabilityStats(sample.slice(-Math.min(12,sample.length)));
  const enough=st.n>=12&&recent.n>=6&&st.avgR!=null&&recent.avgR!=null;
  if(!enough)return {state:'CAUTION',score:50,reason:`Data edge belum cukup (${st.n} sample ${label}); AUTO tidak memakai histori sebagai jaminan.`,stats:st,recent,label};
  let score=50;
  if(st.avgR>0)score+=15; else if(st.avgR<0)score-=20;
  if(recent.avgR>0)score+=15; else if(recent.avgR<0)score-=20;
  if(st.rate>=.55)score+=8; else if(st.rate<.45)score-=8;
  if(st.profitFactor!=null){if(st.profitFactor>=1.25)score+=7; else if(st.profitFactor<1)score-=10;}
  score=Math.max(0,Math.min(100,Math.round(score)));
  const state=(st.avgR>0&&recent.avgR>0&&(st.profitFactor==null||st.profitFactor>=1))?'READY':(st.avgR<0&&recent.avgR<0?'NO-TRADE':'CAUTION');
  const reason=state==='READY'
    ?`Edge historis mendukung ${pred.side}: ${st.n} sample, avg ${st.avgR.toFixed(2)}R, recent ${recent.avgR.toFixed(2)}R, hit ${Math.round(st.rate*100)}%.`
    :state==='NO-TRADE'
      ?`Edge historis melemah untuk ${pred.side}: avg ${st.avgR.toFixed(2)}R dan recent ${recent.avgR.toFixed(2)}R. AUTO ditahan.`
      :`Edge campuran untuk ${pred.side}: histori ${st.avgR.toFixed(2)}R, recent ${recent.avgR.toFixed(2)}R. AUTO ditahan sampai konfirmasi lebih baik.`;
  return {state,score,reason,stats:st,recent,label,regime,context};
}

function getRegimeStrategyRows(){
  return getProfitabilityRows().filter(x=>Number.isFinite(Number(x.realizedR))).sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function regimeStrategyStats(rows){
  const rs=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  const wins=rs.filter(r=>r>0), losses=rs.filter(r=>r<0);
  const hit=rows.filter(x=>x.outcome==='HIT').length;
  const grossWin=wins.reduce((a,b)=>a+b,0), grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
  return {n:rs.length,hit,rate:rs.length?hit/rs.length:null,avgR:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null,pf:grossLoss?grossWin/grossLoss:(grossWin?Infinity:null),sumR:rs.reduce((a,b)=>a+b,0)};
}
function buildRegimeStrategy(){
  const rows=getRegimeStrategyRows();
  const current=getMarketRegime();
  if(rows.length<20)return {state:'WAIT',current,rows:[],reason:`Minimal 20 CLOSED outcome untuk analisis regime. Saat ini ${rows.length}.`};
  const keys=['TREND_UP','TREND_DOWN','RANGE','HIGH_VOLATILITY'];
  const groups=keys.map(key=>{
    const r=rows.filter(x=>String(x.marketRegime?.regime||x.marketRegime?.label||'UNKNOWN')===key);
    const st=regimeStrategyStats(r);
    return {key, ...st};
  });
  const currentKey=String(current?.regime||'UNKNOWN');
  const cur=groups.find(g=>g.key===currentKey)||null;
  const recent=rows.slice(-20);
  const recentCurrent=recent.filter(x=>String(x.marketRegime?.regime||x.marketRegime?.label||'UNKNOWN')===currentKey);
  const recentSt=regimeStrategyStats(recentCurrent);
  const enough=cur?.n>=8;
  let state='CAUTION',score=50,recommendation='WAIT / COLLECT DATA';
  if(enough && cur.avgR>0 && recentSt.n>=4 && recentSt.avgR>0){score=78;state='SUPPORTED';recommendation=currentKey==='RANGE'?'REACTION / S&R FOCUS':currentKey==='HIGH_VOLATILITY'?'REDUCE RISK / WAIT CLEAN BREAK':currentKey==='TREND_UP'?'TREND-FOLLOW BUY BIAS':'TREND-FOLLOW SELL BIAS';}
  else if(enough && cur.avgR<0 && recentSt.n>=4 && recentSt.avgR<0){score=28;state='WEAK';recommendation='WAIT / BLOCK THIS REGIME FOR AUTO';}
  else if(enough){score=55;state='MIXED';recommendation='SELECTIVE / WAIT FOR EXTRA CONFIRMATION';}
  const tested=groups.filter(g=>g.n>=8), positive=tested.filter(g=>g.avgR>0).length;
  const consistency=tested.length?positive/tested.length:0;
  const confidence=rows.length>=100&&tested.length>=3?'HIGH':rows.length>=50&&tested.length>=2?'MEDIUM':'LOW';
  return {state,score,current,currentKey,cur,recent:recentSt,groups,consistency,confidence,recommendation,reason: enough?`Regime aktif ${current.label||currentKey}: ${cur.n} sample, avg ${cur.avgR?.toFixed(2)}R; recent ${recentSt.n} sample, avg ${recentSt.avgR?.toFixed(2)??'—'}R.`:`Belum cukup sample untuk regime ${current.label||currentKey}.`};
}
function buildCombinedValidationV566(){
  const rows=researchRows().filter(x=>Number.isFinite(Number(x.realizedR))).sort((a,b)=>new Date(a.closedAt||a.closed_at||a.updatedAt||a.openedAt||0)-new Date(b.closedAt||b.closed_at||b.updatedAt||b.openedAt||0));
  const rs=rows.map(x=>Number(x.realizedR));
  const riskPct=Math.max(.05,Math.min(5,Number($('risk')?.value||1)));
  if(rs.length<40)return {state:'WAIT',sample:rs.length,reason:`Minimal 40 CLOSED outcomes diperlukan untuk validasi gabungan. Saat ini ${rs.length}.`};
  const folds=[];
  const windows=5;
  for(let k=0;k<windows;k++){
    const start=Math.floor(k*rs.length/windows), end=Math.floor((k+1)*rs.length/windows);
    const test=rs.slice(start,end);
    if(test.length<6)continue;
    const avg=test.reduce((a,b)=>a+b,0)/test.length;
    const hit=test.filter(x=>x>0).length/test.length;
    let eq=1,peak=1,maxDD=0;
    for(const r of test){eq*=Math.max(.01,1+r*(riskPct/100));peak=Math.max(peak,eq);maxDD=Math.max(maxDD,(peak-eq)/peak);}
    const mcRuns=400, finals=[], dds=[];
    const rng=seededRandom((k+1)*0x45d9f3b^test.length);
    for(let run=0;run<mcRuns;run++){
      let e=1,pk=1,dd=0;
      for(let i=0;i<test.length;i++){
        const r=test[Math.floor(rng()*test.length)];
        e*=Math.max(.01,1+r*(riskPct/100)); pk=Math.max(pk,e); dd=Math.max(dd,(pk-e)/Math.max(pk,1e-9));
      }
      finals.push((e-1)*100);dds.push(dd*100);
    }
    finals.sort((a,b)=>a-b);dds.sort((a,b)=>a-b);
    folds.push({k:k+1,n:test.length,avgR:avg,hit,dd:maxDD*100,mcP05:percentile(finals,.05),mcP95DD:percentile(dds,.95)});
  }
  const positive=folds.filter(f=>f.avgR>0).length;
  const avgOOS=folds.length?folds.reduce((a,f)=>a+f.avgR,0)/folds.length:null;
  const worstDD=folds.length?Math.max(...folds.map(f=>f.mcP95DD)):null;
  const guard=folds.length>=5&&positive>=4&&avgOOS>0&&worstDD<30?'PASS':'HOLD';
  const confidence=rs.length>=120&&positive>=4?'HIGH':rs.length>=70&&positive>=3?'MEDIUM':'LOW';
  return {state:guard==='PASS'?'VALIDATED':'HOLD',sample:rs.length,riskPct,folds,positive,avgOOS,worstDD,guard,confidence};
}
function renderCombinedValidationV566(){
  const host=$('combinedValidationV566');if(!host)return;
  const o=buildCombinedValidationV566();
  if(o.state==='WAIT'){
    host.innerHTML=`<div class="ljHead"><div><span class="label">V5.66 WALK-FORWARD + MONTE CARLO</span><b>Validasi gabungan ketahanan strategi</b></div><span class="sxeBadge gold">WAIT</span></div><div class="ljFeedback">${o.reason}</div><div class="note">Belum cukup closed outcomes. Sistem menahan kesimpulan agar tidak mengoptimalkan dari sample kecil.</div>`;return;
  }
  const tone=o.state==='VALIDATED'?'good':'bad';
  const foldRows=o.folds.map(f=>`<div class="ljRow"><span>Window ${f.k} · ${f.n} trades</span><b class="${f.avgR>0?'good':'bad'}">${f.avgR.toFixed(2)}R</b><small>Hit ${Math.round(f.hit*100)}% · DD ${f.dd.toFixed(1)}% · MC 95% DD ${f.mcP95DD.toFixed(1)}%</small></div>`).join('');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.66 WALK-FORWARD + MONTE CARLO</span><b>OOS windows + stress test urutan outcome</b></div><span class="sxeBadge ${tone}">${o.state} · ${o.guard} · ${o.confidence}</span></div>
  <div class="ljSummary"><div><small>CLOSED SAMPLE</small><b>${o.sample}</b></div><div><small>POSITIVE WINDOWS</small><b>${o.positive}/${o.folds.length}</b></div><div><small>AVG WINDOW R</small><b>${o.avgOOS==null?'—':o.avgOOS.toFixed(2)+'R'}</b></div><div><small>WORST MC 95% DD</small><b>${o.worstDD==null?'—':o.worstDD.toFixed(1)+'%'}</b></div></div>
  <div class="adaptiveGuard"><b>COMBINED GUARD:</b> strategi harus bertahan pada beberapa periode kronologis dan tetap berada dalam batas drawdown pada stress test Monte Carlo. Tidak ada parameter live yang diterapkan otomatis.</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">WINDOW RESULTS</div>${foldRows}</div><div><div class="sxeIntelTitle">DECISION</div><div class="note"><b>${o.guard==='PASS'?'VALIDASI LULUS UNTUK DITELITI LEBIH LANJUT':'JANGAN NAIKKAN RISIKO'}</b><br>${o.guard==='PASS'?'Hasil historis cukup konsisten untuk masuk tahap shadow/live validation, tetapi bukan jaminan profit.':'Satu atau lebih guard belum terpenuhi. Pertahankan risk konservatif dan kumpulkan data tambahan.'}</div></div></div>
  <div class="note">V5.66 menggabungkan validasi kronologis dengan Monte Carlo atas realized-R yang sudah tercatat. Ini bukan probabilitas profit masa depan dan bukan pengganti paper/shadow trading.</div>`;
}

function buildPortfolioRisk(){
  const x=S.accountSnapshot||{};
  const positions=(x.binancePositions||x.positions||[]).filter(p=>Math.abs(Number(p.positionAmt||p.qty||0))>0);
  const bal=Number((x.balances||[]).find(b=>b.asset==='USDT')?.balance||x.balance||0);
  const rows=positions.map(p=>{
    const qty=Math.abs(Number(p.positionAmt||p.qty||0)), entry=Number(p.entryPrice||p.entry||0), mark=Number(p.markPrice||p.mark||S.market.mark||0);
    const notional=Math.abs(Number(p.notional||0))||Math.abs(mark*qty)||Math.abs(entry*qty);
    const pnl=Number(p.unRealizedProfit||p.unrealizedPnl||0);
    return {symbol:p.symbol||p.instrument||'UNKNOWN',side:Number(p.positionAmt||0)>=0?'LONG':'SHORT',qty,notional,pnl,leverage:Number(p.leverage||0)};
  }).sort((a,b)=>b.notional-a.notional);
  const total=rows.reduce((a,r)=>a+r.notional,0), long=rows.filter(r=>r.side==='LONG').reduce((a,r)=>a+r.notional,0), short=rows.filter(r=>r.side==='SHORT').reduce((a,r)=>a+r.notional,0);
  const grossLev=bal>0?total/bal:null, concentration=total>0?rows[0].notional/total:0;
  const netBias=total?(long-short)/total:0;
  const sameSide=Math.max(long,short)/(total||1);
  let state='NO POSITIONS', score=100, reason='Tidak ada posisi terbuka yang terdeteksi.';
  if(rows.length){
    score=100;
    if(grossLev!=null){if(grossLev>10)score-=35;else if(grossLev>5)score-=20;else if(grossLev>3)score-=10;}
    if(concentration>.7)score-=20;else if(concentration>.5)score-=10;
    if(sameSide>.9&&rows.length>1)score-=10;
    score=Math.max(0,Math.round(score));
    state=score>=75?'CONTROLLED':score>=50?'WATCH':'HIGH EXPOSURE';
    reason=`${rows.length} posisi · gross exposure ${fmtIDR(total)}${bal?' · '+grossLev.toFixed(2)+'× balance':''} · konsentrasi terbesar ${(concentration*100).toFixed(0)}%.`;
  }
  return {rows,bal,total,long,short,grossLev,concentration,netBias,state,score,reason};
}
function renderPortfolioRisk(){
  const host=$('portfolioRisk'); if(!host)return;
  const o=buildPortfolioRisk(), tone=o.state==='HIGH EXPOSURE'?'bad':o.state==='WATCH'?'gold':'good';
  const rows=o.rows.slice(0,8).map(r=>`<div class="ljRow"><span>${r.symbol} · ${r.side}</span><b>${fmtIDR(r.notional)}</b><small>${r.leverage?r.leverage.toFixed(1)+'× · ':''}${fmtIDR(r.pnl)} UPNL</small></div>`).join('');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.65 PORTFOLIO RISK ENGINE</span><b>Apakah posisi saling menumpuk risikonya?</b></div><span class="sxeBadge ${tone}">${o.state}${o.rows.length?' · '+o.score+'/100':''}</span></div>
  <div class="ljSummary"><div><small>OPEN POSITIONS</small><b>${o.rows.length}</b></div><div><small>GROSS EXPOSURE</small><b>${fmtIDR(o.total)}</b></div><div><small>LONG</small><b>${fmtIDR(o.long)}</b></div><div><small>SHORT</small><b>${fmtIDR(o.short)}</b></div></div>
  <div class="ljFeedback">${o.reason}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">EXPOSURE PER SYMBOL</div>${rows||'<div class="note">Belum ada posisi terbuka.</div>'}</div><div><div class="sxeIntelTitle">RISK FLAGS</div><div class="note">Net directional bias: <b>${(o.netBias*100).toFixed(0)}%</b><br>Largest concentration: <b>${(o.concentration*100).toFixed(0)}%</b><br>Gross leverage vs balance: <b>${o.grossLev==null?'—':o.grossLev.toFixed(2)+'×'}</b></div></div></div>
  <div class="note">V5.65 memonitor exposure yang benar-benar terdeteksi dari account snapshot. Korelasi antar-pair tidak diasumsikan tanpa data historis yang memadai. Engine ini memberi peringatan risiko, bukan jaminan profit, dan tidak otomatis menutup atau membuka posisi.</div>`;
}

function renderRegimeStrategy(){
  const host=$('regimeStrategy'); if(!host)return;
  const o=buildRegimeStrategy();
  if(o.state==='WAIT'){
    host.innerHTML=`<div class="ljHead"><div><span class="label">V5.62 REGIME-SPECIFIC STRATEGY</span><b>Strategi berdasarkan kondisi pasar</b></div><span class="sxeBadge gold">WAIT</span></div><div class="ljFeedback">${o.reason}</div><div class="note">Sistem tidak memaksakan satu strategi untuk semua regime. Minimum sample mencegah kesimpulan dari histori yang terlalu kecil.</div>`;
    return;
  }
  const tone=o.state==='SUPPORTED'?'good':o.state==='WEAK'?'bad':'gold';
  const rows=o.groups.map(g=>`<div class="ljRow"><span>${g.key.replaceAll('_',' ')}</span><b class="${g.avgR!=null&&g.avgR>0?'good':g.avgR!=null&&g.avgR<0?'bad':''}">${g.avgR==null?'—':g.avgR.toFixed(2)+'R'}</b><small>${g.n} · ${g.rate==null?'—':Math.round(g.rate*100)+'% hit'}</small></div>`).join('');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.62 REGIME-SPECIFIC STRATEGY</span><b>Jangan pakai satu strategi untuk semua market</b></div><span class="sxeBadge ${tone}">${o.state} · ${o.score}/100</span></div>
  <div class="ljSummary"><div><small>REGIME AKTIF</small><b>${(o.current.label||o.currentKey).replaceAll('_',' ')}</b></div><div><small>AVG R</small><b>${o.cur?.avgR==null?'—':o.cur.avgR.toFixed(2)+'R'}</b></div><div><small>RECENT R</small><b>${o.recent?.avgR==null?'—':o.recent.avgR.toFixed(2)+'R'}</b></div><div><small>CONFIDENCE</small><b>${o.confidence}</b></div></div>
  <div class="ljFeedback">${o.reason}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">PERFORMANCE PER REGIME</div>${rows}</div><div><div class="sxeIntelTitle">CURRENT STRATEGY</div><div class="note" style="margin-top:6px"><b>${o.recommendation}</b><br>Consistency antar regime: ${Math.round(o.consistency*100)}% dari regime dengan sample cukup menghasilkan avg R positif.</div></div></div>
  <div class="note">V5.62 adalah filter penelitian. Ia tidak menjamin arah harga dan tidak mengubah BUY/SELL secara otomatis. Untuk AUTO, gunakan hanya sebagai salah satu lapisan risk/edge.</div>`;
}

function renderProfitabilityGate(pred){
  const host=$('profitabilityGate'); if(!host)return;
  const g=getProfitabilityGate(pred);
  const tone=g.state==='READY'?'good':g.state==='NO-TRADE'?'bad':'gold';
  const s=g.stats||{};
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.53 EDGE / PROFITABILITY GATE</span><b>Filter kualitas berdasarkan hasil historis</b></div><span class="sxeBadge ${tone}">${g.state}${g.score!=null?' · '+g.score+'/100':''}</span></div>
  <div class="ljSummary"><div><small>SAMPLE</small><b>${s.n||0}</b></div><div><small>HIT RATE</small><b>${s.rate==null?'—':Math.round(s.rate*100)+'%'}</b></div><div><small>AVG R</small><b>${s.avgR==null?'—':s.avgR.toFixed(2)+'R'}</b></div><div><small>PROFIT FACTOR</small><b>${s.profitFactor==null?'—':s.profitFactor===Infinity?'∞':s.profitFactor.toFixed(2)}</b></div></div>
  <div class="ljFeedback">${g.reason}</div>
  <div class="contextRows"><div><span>Scope</span><b>${g.label||'—'}</b></div><div><span>Recent Avg R</span><b>${g.recent?.avgR==null?'—':g.recent.avgR.toFixed(2)+'R'}</b></div><div><span>AUTO effect</span><b>${g.state==='NO-TRADE'?'DITAHAN':g.state==='READY'?'BOLEH DIEVALUASI':'MENUNGGU DATA'}</b></div></div>
  <div class="note">Gate ini hanya memfilter AUTO berdasarkan histori yang sudah CLOSED. Ia tidak menjanjikan profit dan tidak memblokir manual BUY/SELL.</div>`;
}
function riskOptimizerRows(){
  return getProfitabilityRows().filter(x=>Number.isFinite(Number(x.realizedR))).sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function simulateRiskPath(rows,riskPct){
  let equity=1, peak=1, maxDD=0, losing=0, maxLosing=0;
  for(const row of rows){
    const r=Number(row.realizedR);
    equity*=Math.max(0.05,1+(r*(riskPct/100)));
    peak=Math.max(peak,equity);
    const dd=peak>0?(peak-equity)/peak:0;
    maxDD=Math.max(maxDD,dd);
    if(r<0){losing++;maxLosing=Math.max(maxLosing,losing)}else if(r>0)losing=0;
  }
  return {equity,returnPct:(equity-1)*100,maxDD:maxDD*100,maxLosing};
}
function buildRiskOptimizer(){
  const rows=riskOptimizerRows(), n=rows.length;
  if(n<20)return {state:'LOW SAMPLE',n,reason:`Butuh minimal 20 outcome CLOSED untuk simulasi risiko yang lebih bermakna. Saat ini ${n}.`,candidates:[]};
  const risks=[0.25,0.5,0.75,1,1.25,1.5];
  const candidates=risks.map(risk=>({risk,...simulateRiskPath(rows,risk)}));
  const baseline=candidates.find(x=>x.risk===1)||candidates[0];
  const oosStart=Math.max(12,Math.floor(n*.7));
  const train=rows.slice(0,oosStart),oos=rows.slice(oosStart);
  const trainStats=profitabilityStats(train),oosStats=profitabilityStats(oos);
  const stable=trainStats.avgR!=null&&oosStats.avgR!=null&&trainStats.avgR>0&&oosStats.avgR>0;
  const best=candidates.filter(x=>x.maxDD<=12&&x.maxLosing<=8).sort((a,b)=>b.returnPct-a.returnPct)[0]||baseline;
  const conservative=candidates.filter(x=>x.maxDD<=8&&x.maxLosing<=6).sort((a,b)=>a.risk-b.risk)[0]||candidates[0];
  const confidence=stable&&oos.length>=6?'MEDIUM':(stable?'LOW':'LOW');
  const state=stable?'STABLE EDGE':'CAUTION';
  return {state,n,reason:stable?`Expectancy positif di train dan OOS: train ${trainStats.avgR.toFixed(2)}R · OOS ${oosStats.avgR.toFixed(2)}R.`:`Edge belum konsisten out-of-sample: train ${trainStats.avgR==null?'—':trainStats.avgR.toFixed(2)+'R'} · OOS ${oosStats.avgR==null?'—':oosStats.avgR.toFixed(2)+'R'}.`,candidates,baseline,best,conservative,trainStats,oosStats,confidence};
}
function renderRiskOptimizer(){
  const host=$('riskOptimizer'); if(!host)return;
  const o=buildRiskOptimizer();
  const tone=o.state==='STABLE EDGE'?'good':o.state==='CAUTION'?'gold':'bad';
  if(!o.candidates?.length){host.innerHTML=`<div class="ljHead"><div><span class="label">V5.54 RISK / REWARD OPTIMIZER</span><b>Optimasi risiko berbasis hasil historis</b></div><span class="sxeBadge ${tone}">${o.state}</span></div><div class="ljFeedback">${o.reason}</div><div class="note">Optimizer menunggu sample CLOSED yang cukup. Tidak ada parameter live yang diubah otomatis.</div>`;return;}
  const b=o.baseline,c=o.conservative,be=o.best;
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.54 RISK / REWARD OPTIMIZER</span><b>Simulasi risiko dan stabilitas edge</b></div><span class="sxeBadge ${tone}">${o.state}</span></div>
  <div class="ljSummary"><div><small>SAMPLE</small><b>${o.n}</b></div><div><small>TRAIN AVG R</small><b>${o.trainStats.avgR.toFixed(2)}R</b></div><div><small>OOS AVG R</small><b>${o.oosStats.avgR.toFixed(2)}R</b></div><div><small>LEARNING</small><b>${o.confidence}</b></div></div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">RISK SCENARIOS</div><div class="contextRows">${o.candidates.map(x=>`<div><span>${x.risk.toFixed(2)}% risk/trade</span><b>${x.returnPct>=0?'+':''}${x.returnPct.toFixed(1)}% · DD ${x.maxDD.toFixed(1)}% · L${x.maxLosing}</b></div>`).join('')}</div></div>
  <div><div class="sxeIntelTitle">RECOMMENDATION — MANUAL</div><div class="contextRows"><div><span>Conservative candidate</span><b>${c.risk.toFixed(2)}%</b></div><div><span>Best simulated candidate</span><b>${be.risk.toFixed(2)}%</b></div><div><span>Baseline 1%</span><b>${b.returnPct>=0?'+':''}${b.returnPct.toFixed(1)}% · DD ${b.maxDD.toFixed(1)}%</b></div></div></div></div>
  <div class="ljFeedback">${o.reason}</div><div class="note">Simulasi memakai realized-R historis dan compounding sederhana; bukan backtest candle-level untuk TP/SL. Kandidat hanya rekomendasi. Terapkan perubahan risiko secara manual setelah mempertimbangkan modal dan toleransi drawdown.</div>`;
}
function renderMarketContext(){
  const host=$('marketContext'); if(!host)return; const m=buildMarketContext();
  const tone=x=>['HIGH VOLATILITY','HIGH CHOP','LOW ACTIVITY','UNCLEAR'].includes(x)?'bad':(['MIXED','ELEVATED VOLATILITY','MODERATE CHOP'].includes(x)?'gold':'good');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.52 MARKET CONTEXT ENGINE</span><b>Struktur pasar sebelum keputusan</b></div><span class="sxeBadge ${tone(m.state)}">${m.state} · ${m.score}/100</span></div>
  <div class="ljSummary"><div><small>STRUCTURE</small><b>${m.trend}</b></div><div><small>VOLATILITY</small><b>${m.volatility}</b></div><div><small>BREAKOUT</small><b>${m.breakout}</b></div><div><small>CHOP</small><b>${m.choppy}</b></div></div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">MARKET STRUCTURE</div><div class="contextRows"><div><span>Trend structure</span><b>${m.trend}</b></div><div><span>Breakout</span><b>${m.breakout}</b></div><div><span>Rejection</span><b>${m.rejection}</b></div></div></div><div><div class="sxeIntelTitle">VOLATILITY &amp; ACTIVITY</div><div class="contextRows"><div><span>ATR</span><b>${m.atrPct.toFixed(2)}%</b></div><div><span>Volatility shift</span><b>${m.volRatio.toFixed(2)}×</b></div><div><span>Volume activity</span><b>${m.liquidity}</b></div></div></div></div>
  <div class="ljFeedback">${m.notes.map(x=>`• ${x}`).join(' ')}</div>
  <div class="note">Market Context adalah pembacaan kondisi saat ini. Ini bukan prediksi arah harga dan tidak mengubah signal BUY/SELL secara otomatis.</div>`;
}
function renderMarketIntelligence(pred){
  const host=$('marketIntelligence'); if(!host)return;
  const regime=getMarketRegime(), match=getStrategyMatch(pred), risk=getDynamicRiskMonitor(pred);
  const tone=x=>x==='DANGER'||x==='MISMATCH'?'bad':x==='CAUTION'?'gold':'good';
  host.innerHTML=`<div class="sxeIntelGrid marketIntelGrid">
    <div class="sxeIntel sxeWide"><div class="sxeIntelTitle">MARKET REGIME</div><b class="sxeState ${tone(regime.label)}">${regime.label}</b><div class="sxeIntelText">${regime.text}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">STRATEGY MATCH</div><b class="sxeState ${tone(match.state)}">${match.state} · ${match.score}/100</b><div class="sxeIntelText">${match.text}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">DYNAMIC RISK MONITOR</div><b class="sxeState ${tone(risk.state)}">${risk.state}</b><div class="sxeIntelText">${risk.text}</div></div>
  </div>`;
}

function renderSignalExplanation(pred){
  const el=$('signalExplanation');
  if(!el)return;
  const ex=buildSignalExplanation(pred);
  if(ex.side==='WAIT'){
    el.innerHTML=`<div class="sxeHead"><div><span class="label">SIGNAL EXPLANATION ENGINE</span><b>${ex.title}</b></div></div><div class="sxeSummary">${ex.summary}</div>`;
    return;
  }
  const tone=ex.side==='BUY'?'buy':'sell';
  el.innerHTML=`<div class="sxeHead"><div><span class="label">SIGNAL EXPLANATION ENGINE</span><b class="${tone}">${ex.title}</b></div><span class="sxeBadge ${tone}">${pred.score}/100 · ${pred.strength}</span></div>
  <div class="sxeSummary">${ex.summary}</div>
  <div class="sxeGrid">${ex.sections.map(s=>`<div class="sxeItem"><div class="sxeItemHead"><b>${s.label}</b><span>${s.tag}</span></div><div>${s.text}</div></div>`).join('')}</div>
  <div class="sxeIntelGrid">
    <div class="sxeIntel"><div class="sxeIntelTitle">CONFIDENCE BREAKDOWN</div>${Object.entries(ex.confidence||{}).map(([k,v])=>`<div class="sxeBarRow"><span>${k.toUpperCase()}</span><b>${Math.round(Number(v)||0)}</b><i><em style="width:${Math.max(0,Math.min(100,Number(v)||0))}%"></em></i></div>`).join('')}</div>
    <div class="sxeIntel"><div class="sxeIntelTitle">SIGNAL LIFECYCLE</div><b class="sxeState ${String(ex.lifecycle.state).includes('INVALID')?'bad':String(ex.lifecycle.state).includes('HIT')||String(ex.lifecycle.state).includes('TP')?'good':'gold'}">${ex.lifecycle.state}</b><div class="sxeIntelText">${ex.lifecycle.detail}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">ANTI-CHASE</div><b class="sxeState ${ex.antiChase.level==='CHASE'?'bad':ex.antiChase.level==='CAUTION'?'gold':'good'}">${ex.antiChase.level}</b><div class="sxeIntelText">${ex.antiChase.text}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">INVALIDATION</div><b class="sxeState ${ex.invalidation.level==='INVALID'?'bad':ex.invalidation.level==='NEAR'?'gold':'good'}">${ex.invalidation.level}</b><div class="sxeIntelText">${ex.invalidation.text}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">CONFLICT DETECTOR</div><b class="sxeState ${ex.conflict.level==='MAJOR CONFLICT'?'bad':ex.conflict.level==='MINOR CONFLICT'?'gold':'good'}">${ex.conflict.level}</b><div class="sxeIntelText">${ex.conflict.text}</div></div>
    <div class="sxeIntel"><div class="sxeIntelTitle">ENTRY ZONE</div><b class="sxeState ${ex.entryZone.state==='LATE'||ex.entryZone.state==='WAIT-PULLBACK'?'gold':'good'}">${ex.entryZone.state}</b><div class="sxeIntelText">${ex.entryZone.text}</div></div>
    <div class="sxeIntel sxeWide"><div class="sxeIntelTitle">DECISION QUALITY GATE</div><b class="sxeState ${ex.decision.state==='NO-TRADE'?'bad':ex.decision.state==='CAUTION'?'gold':'good'}">${ex.decision.state}</b><div class="sxeIntelText">${ex.decision.reasons.join(' · ')}</div></div>
    <div class="sxeIntel sxeWide"><div class="sxeIntelTitle">HISTORICAL SIMILAR SETUP</div><div class="sxeIntelText">${ex.similarText}</div></div>
  </div>
  <div class="sxeFooter">Entry readiness: <b>${ex.readiness?.label||'WAIT'} ${ex.readiness?.score||0}%</b> · Quality <b>${ex.quality?.label||'WAIT'} ${ex.quality?.score||0}/100</b> · Penjelasan ini membaca data signal yang sama; tidak mengubah BUY/SELL.</div>`;
}
function getFinalSignal(){
  const c=S.c.at(-1); if(!c)return {side:'WAIT',score:0,gap:0,strength:'LOW',reason:['Menunggu data candle'],final:true,readiness:{ready:false,score:0,label:'WAIT'}};
  const t=getConfirmedSignal(); const ms=tfMillis(S.tf), live=Date.now()>=Number(c.t)&&Date.now()<Number(c.t)+ms;
  const anchor=live&&S.c.length>1?S.c.at(-2):c;
  const readiness=getEntryReadiness(t); const riskPlan=buildSmartRiskPlan(t); const quality=getSignalQuality(t,readiness,riskPlan); return {...t,final:true,targetTs:Number(anchor.t)+ms,anchorTs:Number(anchor.t),live,momentum:live?getRealtimeMomentum():null,readiness,riskPlan,quality};
}
function updateAITrend(){
  const t=getFinalSignal();
  recordShadowSignal(t); resolveShadowRows();
  const prev=AI_TREND.side; AI_TREND=t;
  const el=$('aiSignal'); if(el){
    el.textContent=t.side;
    el.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait');
  }
  const sc=$('aiScore'); if(sc)sc.textContent=`${t.score}/100 · ${t.strength} · ENTRY ${t.readiness?.label||'WAIT'} ${t.readiness?.score||0}% · ${signalQualityText(t.quality)}`;
  const rs=$('aiReason'); if(rs)rs.innerHTML=t.reason.map(x=>`<div>• ${x}</div>`).join(''); const closed=S.c.slice(0,-1); const sr=t.sr||detectSR(closed.length?closed:S.c); SR_STATE=sr; const ss=$('srSupport'),rr=$('srResistance'),scx=$('srContext'),pb=$('predictBox'); if(ss)ss.textContent=sr.support?fmt(sr.support):'—'; if(rr)rr.textContent=sr.resistance?fmt(sr.resistance):'—'; if(scx)scx.textContent=`Context: ${sr.context||'—'} · Support ${sr.distanceSupport!=null?sr.distanceSupport.toFixed(2)+'%':'—'} · Resistance ${sr.distanceResistance!=null?sr.distanceResistance.toFixed(2)+'%':'—'}`; if(pb)pb.innerHTML=`Predictive: <b>${t.side}</b> · wick/body + momentum + S/R reaction`; renderSignalExplanation(t); renderMarketIntelligence(t); renderMarketContext(); renderProfitabilityGate(t); renderSignalLifecycle2(t); renderPreTradeChecklist(t); const li=$('learningInfo'); if(li){const l=t.learning;li.textContent=l?.hitRate!=null?`CANDLE LEARNING: ${Math.round(l.hitRate*100)}% historical hit · ${l.featureSamples} sample · adjustment ${l.adjustment>=0?'+':''}${l.adjustment} · model ${l.samples} labeled candles`:`CANDLE LEARNING: ${l?.samples||ADAPTIVE_INFO.samples||0} labeled candles · menunggu sample pola yang cukup`; } 
  if(prev!==t.side && t.side!=='WAIT'){
    const msg=`AI Trend: ${t.side} ${S.symbol} · score ${t.score}/100`;
    if(AI_TREND.lastNotified!==msg){
      AI_TREND.lastNotified=msg;
      try{if('Notification' in window && Notification.permission==='granted')new Notification('Obsidian Futures',{body:msg})}catch{}
    }
  }
  const lb=$('aiLong'),sb=$('aiShort');
  updateEntryButtons();
}
function signalTime(ts){return new Date(ts||Date.now()).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})+' WIB'}
function nextCandleTime(ts){const ms=tfMillis(S.tf);return new Date(Math.floor((ts+ms)/ms)*ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})+' WIB'}
function forecastClock(ts){
  return new Date(ts).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).replace(':','.');
}
function forecastLabel(ts){return `${forecastClock(ts)} WIB`;}
function buildProjectionModel(c){
  if(!c||c.length<36)return null;
  const closed=c.slice(0,-1), last=closed.at(-1), prev=closed.at(-2), sr=detectSR(closed);
  const base=predictiveCandle(closed), trend=aiCandleTrend(closed);
  const closes=closed.map(x=>x.c), e9=EMA(closes,9), e21=EMA(closes,21), atr=ATR(closed).at(-1)||Math.abs(last.c-prev.c)||1;
  const ret=[]; for(let i=Math.max(1,closed.length-12);i<closed.length;i++)ret.push(closes[i]-closes[i-1]);
  const avgRet=ret.length?ret.reduce((a,b)=>a+b,0)/ret.length:0;
  const avgAbs=ret.length?ret.reduce((a,b)=>a+Math.abs(b),0)/ret.length:atr*.35;
  const emaBias=clamp(((e9.at(-1)-e21.at(-1))/Math.max(atr,1))*8,-20,20);
  const wickRange=Math.max(1e-12,last.h-last.l), body=last.c-last.o;
  const rejection=clamp(((Math.min(last.o,last.c)-last.l)-(last.h-Math.max(last.o,last.c)))/wickRange*18,-18,18);
  return {closed,last,prev,sr,base,trend,atr,avgRet,avgAbs,emaBias,rejection};
}
function projectFutureSignals(){
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf), model=buildProjectionModel(S.c);
  if(!model)return [];
  const {last,sr,base,trend,atr,avgRet,avgAbs,emaBias,rejection}=model;
  const out=[];
  let virtual=last.c;
  let pressure=clamp(avgRet/Math.max(atr,1),-0.75,0.75);

  // Project one candle at a time. The virtual path reacts to momentum and
  // reverses/softens around S/R instead of copying one global BUY/SELL bias.
  for(let h=1;h<=26;h++){
    const decay=Math.max(.12,1-(h-1)*.055);
    const prevVirtual=virtual;

    // Momentum decays with horizon; this is not a 20-candle commitment.
    const trendPush=trend.side==='BUY'?0.18:trend.side==='SELL'?-0.18:0;
    const candlePush=clamp(((base.bull-base.bear)/40)*.22,-.22,.22);
    const meanRevert=-pressure*0.10;
    let step=atr*(pressure*0.32*decay+trendPush*decay+candlePush*decay+meanRevert);
    step=clamp(step,-atr*.55,atr*.55);

    // Resistance creates upward friction and possible rejection.
    if(sr.resistance){
      const d=sr.resistance-virtual;
      if(d>0&&d<atr*1.25) step-=atr*.24*(1-d/(atr*1.25));
      if(virtual>=sr.resistance){
        step=-Math.abs(step||atr*.12);
        pressure=-Math.abs(pressure)*0.65;
      }
    }
    // Support creates downward friction and possible bounce.
    if(sr.support){
      const d=virtual-sr.support;
      if(d>0&&d<atr*1.25) step+=atr*.24*(1-d/(atr*1.25));
      if(virtual<=sr.support){
        step=Math.abs(step||atr*.12);
        pressure=Math.abs(pressure)*0.65;
      }
    }

    virtual+=step;
    const pathDir=virtual>prevVirtual?1:virtual<prevVirtual?-1:0;

    // Start from current candle evidence but progressively reduce it.
    let bull=base.bull*decay;
    let bear=base.bear*decay;

    // Projected path itself is evidence for this candle.
    if(pathDir>0)bull+=18*decay;
    if(pathDir<0)bear+=18*decay;

    // Keep MTF/trend as context, capped and decaying.
    if(trend.side==='BUY')bull+=8*decay;
    if(trend.side==='SELL')bear+=8*decay;
    if(base.mtfBull>base.mtfBear+4)bull+=Math.min(10,base.mtfBull*.30)*decay;
    if(base.mtfBear>base.mtfBull+4)bear+=Math.min(10,base.mtfBear*.30)*decay;
    if(emaBias>2)bull+=Math.min(7,emaBias)*decay;
    if(emaBias<-2)bear+=Math.min(7,-emaBias)*decay;

    // Rejection evidence decays quickly; it should influence the next few
    // candles, not dictate the whole forecast.
    if(rejection>3)bull+=Math.min(7,rejection)*Math.max(.15,decay);
    if(rejection<-3)bear+=Math.min(7,-rejection)*Math.max(.15,decay);

    // Dynamic S/R is allowed to flip the projection.
    let srConflict=false;
    if(sr.resistance){
      const d=(sr.resistance-virtual)/Math.max(atr,1);
      if(d>=0&&d<0.80){bear+=22;bull-=12;srConflict=true;}
      if(virtual>=sr.resistance){bear+=26;bull-=14;srConflict=true;}
    }
    if(sr.support){
      const d=(virtual-sr.support)/Math.max(atr,1);
      if(d>=0&&d<0.80){bull+=22;bear-=12;srConflict=true;}
      if(virtual<=sr.support){bull+=26;bear-=14;srConflict=true;}
    }

    // A projected move directly into resistance/support is a conflict unless
    // there is enough breakout/breakdown evidence.
    if(sr.resistance&&virtual<sr.resistance&&pathDir>0&&(sr.resistance-virtual)<atr*.35){
      bear+=10; bull-=8; srConflict=true;
    }
    if(sr.support&&virtual>sr.support&&pathDir<0&&(virtual-sr.support)<atr*.35){
      bull+=10; bear-=8; srConflict=true;
    }

    bull=clamp(Math.round(bull),0,100);
    bear=clamp(Math.round(bear),0,100);
    const gap=Math.abs(bull-bear),score=Math.max(bull,bear);
    let side='WAIT';

    const twoSidedConflict = bull>=48 && bear>=48 && gap<5;
    if(!srConflict&&!twoSidedConflict&&bull>=50&&gap>=4)side='BUY';
    else if(!srConflict&&!twoSidedConflict&&bear>=50&&gap>=4)side='SELL';
    else if(srConflict&&!twoSidedConflict&&bull>=55&&gap>=6)side='BUY';
    else if(srConflict&&!twoSidedConflict&&bear>=55&&gap>=6)side='SELL';

    const strength=score>=78?'HIGH':score>=62?'MEDIUM':'LOW';
    const reason=side==='BUY'
      ? (srConflict?'support/breakout + projected path':h<=2?'next-candle momentum + structure':'projected bullish path')
      : side==='SELL'
        ? (srConflict?'resistance/rejection + projected path':h<=2?'next-candle momentum + structure':'projected bearish path')
        : (srConflict?'S/R conflict → WAIT':'Skor di bawah threshold 50 atau gap < 4 → WAIT');

    const ts=Math.floor((last.t+ms*h)/ms)*ms;
    out.push({ts,side,score,strength,horizon:h,reason,virtual,bull,bear,gap});

    // The next projected candle starts from the path just produced.
    pressure=clamp((step/Math.max(atr,1))*.72,-0.8,0.8);
  }
  return out;
}
function signalCountdown(ts){
  const remain=Math.max(0,Number(ts||0)-Date.now());
  const sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');
  return `${mm}:${ss}`;
}

function persistShadowRows(){try{localStorage.setItem('obsidian_shadow_rows',JSON.stringify(SHADOW_ROWS.slice(-500)))}catch{}}
function shadowKey(t){return `${S.symbol}|${S.tf}|${Number(t.targetTs||0)}|${t.side}`}
function recordShadowSignal(t){
  if(!SHADOW_ENABLED||!t||t.side==='WAIT'||!Number(t.targetTs))return;
  const key=shadowKey(t);
  if(SHADOW_ROWS.some(x=>x.key===key))return;
  const rp=t.riskPlan||{};
  SHADOW_ROWS.push({key,symbol:S.symbol,tf:S.tf,side:t.side,score:Number(t.score||0),gap:Number(t.gap||0),strength:t.strength||'LOW',readiness:t.readiness?.label||'WAIT',quality:Number(t.quality?.score||0),regime:t.marketRegime||t.regime||'',sr:t.sr?.context||'',signalTs:Number(t.anchorTs||Date.now()),targetTs:Number(t.targetTs),entry:null,exit:null,realizedR:null,outcome:'PENDING',reason:(t.reason||[]).slice?.(0,4)||[]});
  persistShadowRows();
}
function resolveShadowRows(){
  if(!SHADOW_ROWS.length||!S.c?.length)return;
  let changed=false;
  const candles=S.c;
  for(const r of SHADOW_ROWS){
    if(r.outcome!=='PENDING')continue;
    const c=candles.find(x=>Number(x.t)===Number(r.targetTs));
    if(!c||!Number.isFinite(Number(c.o))||!Number.isFinite(Number(c.c)))continue;
    const entry=Number(c.o), exit=Number(c.c);
    const move=r.side==='BUY'?(exit-entry)/Math.max(entry,1e-12):(entry-exit)/Math.max(entry,1e-12);
    r.entry=entry;r.exit=exit;r.realizedR=move;r.outcome=move>0?'HIT':move<0?'MISS':'NEUTRAL';r.resolvedTs=Number(c.t);changed=true;
  }
  if(changed)persistShadowRows();
}
function clearShadowRows(){SHADOW_ROWS=[];persistShadowRows();renderShadowMode()}
function persistCapitalProtection(){try{localStorage.setItem('obsidian_capital_protection',JSON.stringify(CAPITAL_PROTECTION))}catch{}}
function capitalProtectionStats(){
  const now=Date.now(), dayStart=new Date(); dayStart.setHours(0,0,0,0); const weekStart=now-7*86400000;
  const income=Array.isArray(S.accountSnapshot?.recentRealizedIncome)?S.accountSnapshot.recentRealizedIncome:[];
  const closed=income.filter(x=>Number(x.time||0)>weekStart).map(x=>({time:Number(x.time||0),pnl:Number(x.income||0)}));
  const daily=closed.filter(x=>x.time>=dayStart.getTime()).reduce((a,x)=>a+x.pnl,0);
  const weekly=closed.reduce((a,x)=>a+x.pnl,0);
  let streak=0; for(const x of closed.slice().sort((a,b)=>b.time-a.time)){if(x.pnl<0)streak++;else if(x.pnl>0)break;}
  const equity=Number(S.accountSnapshot?.equity||S.accountSnapshot?.walletBalance||0); const dd=Number(S.accountSnapshot?.guard?.dd||0);
  const dailyPct=equity>0?Math.max(0,-daily/equity*100):0, weeklyPct=equity>0?Math.max(0,-weekly/equity*100):0;
  const cooldownUntil=Number(localStorage.getItem('obsidian_capital_cooldown_until')||0);
  const triggers=[];
  if(CAPITAL_PROTECTION.enabled){if(dailyPct>=CAPITAL_PROTECTION.dailyLossPct)triggers.push(`daily loss ${dailyPct.toFixed(2)}%`);if(weeklyPct>=CAPITAL_PROTECTION.weeklyLossPct)triggers.push(`weekly loss ${weeklyPct.toFixed(2)}%`);if(dd>=CAPITAL_PROTECTION.maxDrawdownPct)triggers.push(`drawdown ${dd.toFixed(2)}%`);if(streak>=CAPITAL_PROTECTION.maxLosingStreak)triggers.push(`losing streak ${streak}`);if(cooldownUntil>now)triggers.push(`cooldown ${Math.ceil((cooldownUntil-now)/60000)}m`);}
  return {daily,weekly,dailyPct,weeklyPct,streak,dd,cooldownUntil,triggers,blocked:triggers.length>0,equity};
}
function capitalProtectionCheck(){const s=capitalProtectionStats();return {ok:!CAPITAL_PROTECTION.enabled||!s.blocked,stats:s,reason:s.triggers.length?`CAPITAL PROTECTION: ${s.triggers.join(' · ')}`:''};}
function armCapitalCooldown(reason='loss streak'){const until=Date.now()+Math.max(5,Number(CAPITAL_PROTECTION.cooldownMin)||60)*60000;localStorage.setItem('obsidian_capital_cooldown_until',String(until));return until;}
function renderCapitalProtection(){
  const host=$('capitalProtectionV568');if(!host)return; const s=capitalProtectionStats(); const tone=s.blocked?'bad':s.streak>=Math.max(2,Number(CAPITAL_PROTECTION.maxLosingStreak)-1)?'gold':'good';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.68 CAPITAL PROTECTION</span><b>Modal dijaga sebelum mengejar profit</b></div><span class="sxeBadge ${tone}">${s.blocked?'BLOCKED':'PROTECTED'}</span></div>
  <div class="g2"><button class="btn ${CAPITAL_PROTECTION.enabled?'long':''}" id="capitalProtectionToggle">${CAPITAL_PROTECTION.enabled?'PROTECTION: ON':'PROTECTION: OFF'}</button><button class="btn" id="capitalCooldownReset">RESET COOLDOWN</button></div>
  <div class="ljSummary"><div><small>DAILY LOSS</small><b>${s.dailyPct.toFixed(2)}%</b></div><div><small>WEEKLY LOSS</small><b>${s.weeklyPct.toFixed(2)}%</b></div><div><small>LOSING STREAK</small><b>${s.streak}</b></div><div><small>DRAWDOWN</small><b>${s.dd.toFixed(2)}%</b></div></div>
  <div class="g2"><label class="field">Daily loss %<input id="cpDaily" type="number" min="0.5" max="20" step="0.25" value="${CAPITAL_PROTECTION.dailyLossPct}"></label><label class="field">Weekly loss %<input id="cpWeekly" type="number" min="1" max="30" step="0.5" value="${CAPITAL_PROTECTION.weeklyLossPct}"></label><label class="field">Max DD %<input id="cpDD" type="number" min="1" max="50" step="0.5" value="${CAPITAL_PROTECTION.maxDrawdownPct}"></label><label class="field">Max losing streak<input id="cpStreak" type="number" min="2" max="20" step="1" value="${CAPITAL_PROTECTION.maxLosingStreak}"></label></div>
  <div class="adaptiveGuard"><b>ENTRY GUARD:</b> ${s.blocked?`ENTRY BARU DIBLOKIR · ${s.triggers.join(' · ')}`:'Belum melewati batas proteksi.'} <br><span class="note">Proteksi hanya menghentikan entry baru. Posisi terbuka tidak ditutup otomatis oleh V5.68.</span></div>
  <div class="note">Batas ini adalah guard operasional, bukan jaminan profit. Data realized dari account digunakan bila tersedia; jika data belum tersedia, sistem tidak mengarang angka.</div>`;
  $('capitalProtectionToggle')?.addEventListener('click',()=>{CAPITAL_PROTECTION.enabled=!CAPITAL_PROTECTION.enabled;persistCapitalProtection();renderCapitalProtection();updateEntryButtons()});
  $('capitalCooldownReset')?.addEventListener('click',()=>{localStorage.removeItem('obsidian_capital_cooldown_until');renderCapitalProtection();updateEntryButtons()});
  [['cpDaily','dailyLossPct'],['cpWeekly','weeklyLossPct'],['cpDD','maxDrawdownPct'],['cpStreak','maxLosingStreak']].forEach(([id,k])=>$(id)?.addEventListener('change',e=>{CAPITAL_PROTECTION[k]=Math.max(0,Number(e.target.value)||0);persistCapitalProtection();renderCapitalProtection();updateEntryButtons()}));
}

function renderShadowMode(){
  const host=$('shadowModeV567');if(!host)return;
  resolveShadowRows();
  const closed=SHADOW_ROWS.filter(x=>x.outcome!=='PENDING'), wins=closed.filter(x=>x.outcome==='HIT').length, misses=closed.filter(x=>x.outcome==='MISS').length;
  const avg=closed.length?closed.reduce((a,x)=>a+Number(x.realizedR||0),0)/closed.length:0;
  const recent=closed.slice(-20),recentAvg=recent.length?recent.reduce((a,x)=>a+Number(x.realizedR||0),0)/recent.length:0;
  const quality=closed.length>=20?(avg>0&&recentAvg>0?'ALIGNED':avg<0&&recentAvg<0?'DEGRADED':'MIXED'):'COLLECTING';
  const tone=quality==='ALIGNED'?'good':quality==='DEGRADED'?'bad':'gold';
  const rows=SHADOW_ROWS.slice(-12).reverse().map(x=>`<div class="ljRow"><span>${signalTime(x.targetTs)} · ${x.side}</span><b class="${x.outcome==='HIT'?'good':x.outcome==='MISS'?'bad':''}">${x.outcome}</b><small>Score ${x.score} · Q ${x.quality||0} · R ${x.realizedR==null?'—':Number(x.realizedR).toFixed(3)}</small></div>`).join('');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.67 LIVE SHADOW MODE</span><b>Simulasi live tanpa mengirim order</b></div><span class="sxeBadge ${SHADOW_ENABLED?'good':'gold'}">${SHADOW_ENABLED?'ON':'OFF'}</span></div>
  <div class="g2"><button class="btn ${SHADOW_ENABLED?'long':''}" id="shadowToggle">${SHADOW_ENABLED?'SHADOW: ON':'SHADOW: OFF'}</button><button class="btn" id="shadowClear">CLEAR SHADOW DATA</button></div>
  <div class="ljSummary"><div><small>CLOSED SHADOW</small><b>${closed.length}</b></div><div><small>HIT RATE</small><b>${closed.length?Math.round(wins/closed.length*100)+'%':'—'}</b></div><div><small>AVG R</small><b>${closed.length?avg.toFixed(3):'—'}</b></div><div><small>RECENT 20 R</small><b>${recent.length?recentAvg.toFixed(3):'—'}</b></div></div>
  <div class="adaptiveGuard"><b>SHADOW GUARD:</b> tidak memanggil endpoint order dan tidak mengubah posisi Binance. Hanya mencatat apa yang terjadi seandainya signal dieksekusi pada open candle berikutnya.</div>
  <div class="note"><b>STATUS:</b> <span class="${tone}">${quality}</span> · ${closed.length<20?'Minimal 20 outcome untuk membandingkan performa recent vs keseluruhan.':quality==='ALIGNED'?'Hasil shadow saat ini searah dengan histori; tetap perlu sample lebih besar sebelum AUTO.':quality==='DEGRADED'?'Shadow memburuk dibanding histori; jangan menaikkan risiko.':'Hasil masih campuran; lanjutkan pengumpulan data.'}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">RECENT SHADOW</div>${rows||'<div class="note">Belum ada shadow signal. Aktifkan Shadow lalu tunggu signal baru.</div>'}</div><div><div class="sxeIntelTitle">EXECUTION NOTE</div><div class="note">V5.67 menggunakan open → close candle sebagai proxy hasil. Ini <b>bukan fill Binance aktual</b>, tidak memasukkan fee/funding/slippage aktual, dan bukan jaminan hasil live.</div></div></div>`;
  $('shadowToggle')?.addEventListener('click',()=>{SHADOW_ENABLED=!SHADOW_ENABLED;localStorage.setItem('obsidian_shadow_mode',SHADOW_ENABLED?'1':'0');renderShadowMode()});
  $('shadowClear')?.addEventListener('click',()=>{if(confirm('Hapus seluruh data Shadow Mode di browser ini?'))clearShadowRows()});
}

function renderFutureForecast(){
  const el=$('forecastFeed');if(!el)return;
  const tf=$('signalTf')?.value||S.tf,ms=tfMillis(tf),now=Date.now(),last=S.c.at(-1);
  const live=last&&now>=Number(last.t)&&now<Number(last.t)+ms;
  const anchor=live?S.c.at(-2):last;
  const next=anchor?SIGNALS.find(x=>x.symbol===S.symbol&&x.tf===tf&&Number(x.targetTs)===Number(anchor.t)+ms):null;
  const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===tf&&x.status==='CLOSED').slice(0,16);
  const liveFinal=getFinalSignal();
  renderSignalExplanation(liveFinal); renderMarketIntelligence(liveFinal); renderMarketContext(); renderLearningJournal(); renderAnalytics(); renderSignalReplay(); renderAdaptiveOptimization(); renderConfidenceCalibration(); renderStrategyIntelligence(); renderTradePlanIntelligence(); renderRiskOptimizer(); renderStrategyResearch(); renderMonteCarloV561(); renderRegimeStrategy(); renderExecutionQuality(); renderCostFundingEngine(); renderPortfolioRisk(); renderCombinedValidationV566(); renderShadowMode(); renderCapitalProtection(); renderDecisionEngine(liveFinal); renderTradingOperatingSystem(liveFinal); LAST_LIVE_FINAL=liveFinal||{}; renderPaperTrading(); renderFullSimulator(); renderStressLab(); renderScenarioLab(); renderScenarioDecisionMatrix(liveFinal); renderResearchLab(); renderMarketExtensions(); renderLiveResearchMonitor(); renderDataQuality(); renderStrategyVersioning(); renderStrategyFreeze(); renderKillSwitchIntelligence(); renderDecisionAudit(); renderControlCenter(); renderSignalLifecycle2(t);
  const nextSide=next?.side||liveFinal.side||'WAIT';
  const target=next?.targetTs||(last?Number(last.t)+ms:Date.now()+ms);
  const label=nextSide==='BUY'?'BUY ↑':nextSide==='SELL'?'SELL ↓':'WAIT •';
  const cp=liveFinal.candlePrediction; const sr=liveFinal.sr; const ready=next?.readiness||liveFinal.readiness||{ready:false,score:0,label:'WAIT'}; const meta=next?`${next.score}/100 · ${next.strength} · ENTRY ${next.readiness?.label||'WAIT'} ${next.readiness?.score||0}% · ${signalQualityText(next.quality)} · ${riskPlanText(next.riskPlan)} · ${(next.reason||'').slice(0,70)}`:`Realtime ${liveFinal.score||0}/100 · ${liveFinal.strength||'LOW'} · ENTRY ${ready.label} ${ready.score}% · ${signalQualityText(liveFinal.quality)} · ${riskPlanText(liveFinal.riskPlan)} · wick ${cp?.lowerWickPct?.toFixed?.(0)||cp?.candle?.lowerWickPct?.toFixed?.(0)||0}% · S/R ${sr?.context||'—'}`;
  const rowsHtml=rows.map(x=>{
    const b=x.side==='BUY',s=x.side==='SELL',dir=b?'B':s?'S':'W',cls=b?'buy':s?'sell':'wait';
    const outcome=x.outcome==='HIT'?'✓ HIT':x.outcome==='MISS'?'✕ MISS':x.outcome==='NEUTRAL'?'• NETRAL':'… PENDING';
    const oc=x.outcome==='HIT'?'hit':x.outcome==='MISS'?'miss':x.status==='PENDING'?'pending':'neutral';
    const action=b?'MASUK LONG':s?'MASUK SHORT':'SKIP'; const rd=x.readiness?.label||'WAIT', rdScore=x.readiness?.score||0;
    return `<div class="sdRow"><span class="sdTime">${signalTime(x.targetTs||x.ts).replace(' WIB','')}</span><b class="sdDir ${cls}">${dir}</b><span class="sdLabel">${action} · ${outcome} · ${rd} ${rdScore}% · ${signalQualityText(x.quality)}${x.riskPlan?.valid?` · R:R ${x.riskPlan.rr1.toFixed(1)}/${x.riskPlan.rr2.toFixed(1)}`:''}</span><span class="sdScore">${x.score}/100</span></div>`;
  }).join('');
  el.innerHTML=`<div class="sdNext"><div class="sdNextTitle">NEXT CANDLE · ${signalTime(target)}</div><div class="sdNextMain"><b class="sdNextSide ${nextSide==='BUY'?'buy':nextSide==='SELL'?'sell':'wait'}">${label}</b><b id="signalCountdown" class="sdCountdown">${signalCountdown(target)}</b></div><div class="sdNextMeta">${meta}</div></div><div class="sdRowsTitle">SIGNAL HISTORY · ${tf}</div>${rowsHtml||'<div class="note">Belum ada histori signal. Menunggu candle close.</div>'}`;
  renderSignalDropLiveOnly();
}
function renderSignalDropLiveOnly(){
  const liveFinal=getFinalSignal(),side=liveFinal.side==='BUY'?'BUY ↑':liveFinal.side==='SELL'?'SELL ↓':'WAIT •';
  const el=$('signalLiveSide');if(el){el.textContent=`LIVE · ${side}`;el.className=liveFinal.side==='BUY'?'good':liveFinal.side==='SELL'?'bad':'wait'}
  const meta=$('signalLiveMeta');if(meta)meta.textContent=`${liveFinal.score||0}/100 · ${liveFinal.strength||'LOW'} · ENTRY ${liveFinal.readiness?.label||'WAIT'} ${liveFinal.readiness?.score||0}% · ${signalQualityText(liveFinal.quality)} · ${S.tf}`;
}
function updateSignalDropCountdown(){
  const el=$('signalCountdown');if(!el)return;
  const tf=$('signalTf')?.value||S.tf,ms=tfMillis(tf),now=Date.now(),last=S.c.at(-1);
  const live=last&&now>=Number(last.t)&&now<Number(last.t)+ms,anchor=live?S.c.at(-2):last;
  const target=anchor?Number(anchor.t)+ms:now+ms;
  el.textContent=signalCountdown(target);
  if(target<=now)renderFutureForecast();
}
function renderSignalDrop(){
  const el=$('signalFeed');
  const tf=$('signalTf')?.value||S.tf;
  if(el){
    const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===tf).slice(0,80);
    const done=rows.filter(x=>x.status&&x.status!=='PENDING');
    const hit=done.filter(x=>x.outcome==='HIT').length,miss=done.filter(x=>x.outcome==='MISS').length;
    const rate=hit+miss?Math.round(hit/(hit+miss)*100):null;
    if($('signalCount'))$('signalCount').textContent=`${rows.length} sinyal${rate!=null?' · '+rate+'% HIT':''}`;
    el.innerHTML='';
  }
  renderFutureForecast();
}
function actualCandleSide(c){
  if(!c)return 'NEUTRAL';
  const body=Number(c.c)-Number(c.o), range=Math.max(1e-12,Number(c.h)-Number(c.l));
  if(Math.abs(body)<=range*0.08)return 'NEUTRAL';
  return body>0?'BUY':'SELL';
}
function outcomeForPrediction(pred,actual){
  if(!pred||pred==='WAIT'||actual==='NEUTRAL')return 'NEUTRAL';
  return pred===actual?'HIT':'MISS';
}
function persistSignals(){try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(SIGNALS.slice(0,300)))}catch{}}
function getLearningJournalStats(){
  const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.status==='CLOSED'&&['BUY','SELL'].includes(x.side));
  const decided=rows.filter(x=>x.outcome==='HIT'||x.outcome==='MISS');
  const hit=decided.filter(x=>x.outcome==='HIT').length, miss=decided.filter(x=>x.outcome==='MISS').length;
  const avgR=rows.filter(x=>Number.isFinite(Number(x.realizedR))).reduce((a,x)=>a+Number(x.realizedR),0)/(rows.filter(x=>Number.isFinite(Number(x.realizedR))).length||1);
  const groups=(keyFn)=>{const m={}; for(const x of decided){const k=keyFn(x)||'UNKNOWN';(m[k]??=[]).push(x)} return Object.entries(m).map(([key,a])=>({key,n:a.length,hit:a.filter(x=>x.outcome==='HIT').length,rate:a.length?a.filter(x=>x.outcome==='HIT').length/a.length:0})).sort((a,b)=>b.n-a.n)};
  const regimes=groups(x=>x.marketRegime?.label||x.marketRegime?.regime||'UNKNOWN');
  const contexts=groups(x=>x.context||'NO_LEVEL');
  const sides=groups(x=>x.side);
  return {total:rows.length,decided:decided.length,hit,miss,rate:decided.length?hit/decided.length:null,avgR,regimes,contexts,sides,recent:rows.slice(0,12)};
}
function learningFeedbackText(stats){
  if(!stats.decided)return 'Belum ada outcome cukup untuk feedback learning. Signal akan dicatat dan dianalisis setelah candle target selesai.';
  const parts=[];
  const weak=stats.regimes.filter(x=>x.n>=3).sort((a,b)=>a.rate-b.rate)[0];
  const strong=stats.regimes.filter(x=>x.n>=3).sort((a,b)=>b.rate-a.rate)[0];
  if(strong)parts.push(`Regime paling konsisten sejauh ini: ${strong.key} (${Math.round(strong.rate*100)}% HIT dari ${strong.n} sample).`);
  if(weak && (!strong||weak.key!==strong.key))parts.push(`Regime yang perlu perhatian: ${weak.key} (${Math.round(weak.rate*100)}% HIT dari ${weak.n} sample).`);
  const ctx=stats.contexts.filter(x=>x.n>=3).sort((a,b)=>a.rate-b.rate)[0];
  if(ctx)parts.push(`Pola S/R ${ctx.key} memiliki ${Math.round(ctx.rate*100)}% HIT pada ${ctx.n} sample.`);
  return parts.join(' ')||'Data learning masih bertambah; belum ada pola dengan sample minimum yang cukup.';
}
function getAnalyticsStats(){
  const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side));
  const closed=rows.filter(x=>x.status==='CLOSED');
  const decided=closed.filter(x=>x.outcome==='HIT'||x.outcome==='MISS');
  const rRows=closed.filter(x=>Number.isFinite(Number(x.realizedR)));
  const avgR=rRows.length?rRows.reduce((a,x)=>a+Number(x.realizedR),0)/rRows.length:0;
  let equityR=0,peakR=0,maxDD=0,losing=0,maxLosing=0;
  const ordered=[...rRows].sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
  ordered.forEach(x=>{const r=Number(x.realizedR)||0; equityR+=r; peakR=Math.max(peakR,equityR); maxDD=Math.max(maxDD,peakR-equityR); if(r<0){losing++;maxLosing=Math.max(maxLosing,losing)}else if(r>0)losing=0;});
  const groups=(fn)=>{const m={}; for(const x of decided){const k=fn(x)||'UNKNOWN';(m[k]??=[]).push(x)} return Object.entries(m).map(([key,a])=>{const hit=a.filter(x=>x.outcome==='HIT').length;return {key,n:a.length,hit,rate:a.length?hit/a.length:0}}).sort((a,b)=>b.n-a.n)};
  const byTf=groups(x=>x.tf), byRegime=groups(x=>x.marketRegime?.label||x.marketRegime?.regime), bySide=groups(x=>x.side);
  const conf=closed.map(x=>Number(x.score)).filter(Number.isFinite); const avgConf=conf.length?conf.reduce((a,b)=>a+b,0)/conf.length:null;
  const tp1=closed.filter(x=>x.outcome==='HIT').length;
  const tpRate=decided.length?tp1/decided.length:null;
  return {total:rows.length,closed:closed.length,decided:decided.length,hit:decided.filter(x=>x.outcome==='HIT').length,miss:decided.filter(x=>x.outcome==='MISS').length,avgR,maxDD,maxLosing,equityR,avgConf,tpRate,byTf,byRegime,bySide,recent:ordered.slice(-20).reverse()};
}

function replayCandleContext(row, reveal=0){
  const stored=Array.isArray(row?.replayCandles)?row.replayCandles:[];
  if(stored.length){
    const targetIndex=Math.max(0, stored.findIndex(c=>Number(c.t)===Number(row.targetTs)));
    const signalIndex=targetIndex>=0?targetIndex:Math.min(stored.length-1,Number(row?.replaySignalIndex||stored.length-1));
    const before=stored.slice(0,signalIndex);
    const signal=stored[signalIndex]||null;
    const future=stored.slice(signalIndex+1);
    const shownFuture=Math.max(0,Math.min(future.length,Number(reveal)||0));
    return {before:before.slice(-5),signal,after:future.slice(0,shownFuture),futureTotal:future.length,source:'stored'};
  }
  const candles=Array.isArray(S.c)?S.c:[];
  if(!candles.length)return {before:[],signal:null,after:[],futureTotal:0,source:'none'};
  const ts=Number(row?.anchorTs||row?.ts||0);
  let idx=-1;
  for(let i=0;i<candles.length;i++){if(Number(candles[i].t)<=ts)idx=i;else break;}
  if(idx<0)return {before:[],signal:null,after:[],futureTotal:0,source:'none'};
  const future=candles.slice(idx+1);
  const shownFuture=Math.max(0,Math.min(future.length,Number(reveal)||0));
  return {before:candles.slice(Math.max(0,idx-5),idx),signal:candles[idx],after:future.slice(0,shownFuture),futureTotal:future.length,source:'live-fallback'};
}
function replayGrade(row, reveal){
  const ctx=replayCandleContext(row,reveal);
  if(!ctx.signal)return {grade:'NO DATA',detail:'Tidak ada candle snapshot tersimpan untuk signal ini.'};
  const f=row.featureSnapshot||{};
  const body=Number(f.bodyPct||0), mom=Number(f.momentumScore||0), gap=Number(row.gap||f.gap||0);
  const mtf=Number(f.mtfTotal)>0?Number(f.mtfAligned)/Number(f.mtfTotal):null;
  let score=50;
  if(body>=45)score+=10; if(mom>=55)score+=10; if(mtf!=null&&mtf>=.5)score+=10; if(gap>=8)score+=10;
  if(row.outcome==='HIT')score+=10; if(row.outcome==='MISS')score-=10;
  const grade=score>=80?'A':score>=70?'B':score>=60?'C':score>=50?'D':'E';
  return {grade,score,detail:row.outcome==='HIT'?'Keputusan memiliki dukungan fitur dan outcome historis HIT.':row.outcome==='MISS'?'Keputusan perlu ditinjau terhadap faktor konflik dan outcome MISS.':'Outcome belum tersedia.'};
}
function replayFailureInsight(row){
  if(!row)return 'Pilih signal closed untuk melihat replay.';
  const f=row.featureSnapshot||{};
  const parts=[];
  const mtfRatio=Number(f.mtfTotal)>0?Number(f.mtfAligned)/Number(f.mtfTotal):null;
  if(row.outcome==='MISS'){
    if(mtfRatio!=null&&mtfRatio<.5)parts.push('MTF alignment rendah pada saat signal.');
    if(Number(f.momentumScore)<45)parts.push('Momentum relatif lemah.');
    if(Number(f.gap)<8)parts.push('Gap konfirmasi tipis sehingga signal lebih rentan gagal.');
    if(String(row.marketRegime?.regime||'').toUpperCase().includes('RANGE'))parts.push('Signal terbentuk dalam kondisi ranging.');
    if(!parts.length)parts.push('Belum ada faktor kegagalan dominan yang dapat diisolasi dari snapshot tersimpan.');
    return 'Pola kegagalan: '+parts.join(' ');
  }
  if(row.outcome==='HIT'){
    if(mtfRatio!=null&&mtfRatio>=.5)parts.push('MTF cukup selaras.');
    if(Number(f.momentumScore)>=55)parts.push('Momentum mendukung arah signal.');
    if(Number(f.bodyPct)>=45)parts.push('Body candle cukup dominan.');
    return 'Pola yang mendukung: '+(parts.join(' ')||'setup mencapai outcome HIT tanpa satu faktor dominan yang tersimpan.');
  }
  return 'Outcome belum cukup untuk menyimpulkan pola.';
}
function getReplayRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED').sort((a,b)=>Number(b.targetTs||b.ts)-Number(a.targetTs||a.ts));
}
function getAdaptiveOptimizationRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function adaptiveGroupStats(rows,keyFn){
  const m={};
  for(const x of rows){const k=String(keyFn(x)||'UNKNOWN');(m[k]??=[]).push(x)}
  return Object.entries(m).map(([key,a])=>{
    const hits=a.filter(x=>x.outcome==='HIT').length;
    const r=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);
    const avgR=r.length?r.reduce((u,v)=>u+v,0)/r.length:null;
    return {key,n:a.length,hits,rate:a.length?hits/a.length:0,avgR};
  }).sort((a,b)=>b.n-a.n||b.rate-a.rate);
}
function adaptiveBucket(row){
  const f=row.featureSnapshot||{};
  const score=Number(row.score||0);
  const momentum=Number(f.momentumScore||0);
  const quality=row.quality?.label||'UNKNOWN';
  const readiness=row.readiness?.label||'WAIT';
  return `Q${quality} · ${readiness} · S${score>=80?'80+':score>=70?'70-79':score>=60?'60-69':'<60'} · M${momentum>=65?'STRONG':momentum>=45?'MID':'WEAK'}`;
}
function evaluateAdaptiveThreshold(rows,threshold){
  const a=rows.filter(x=>Number(x.score||0)>=threshold);
  const decided=a.length;
  const hit=a.filter(x=>x.outcome==='HIT').length;
  const r=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  return {threshold,n:decided,hit,rate:decided?hit/decided:null,avgR:r.length?r.reduce((u,v)=>u+v,0)/r.length:null};
}
function adaptiveSplit(rows){
  const n=rows.length, cut=Math.max(0,Math.floor(n*.7));
  return {train:rows.slice(0,cut),test:rows.slice(cut)};
}
function adaptiveConfidence(train,test,candidate,baseline){
  const min=8;
  if(candidate.n<min||test.n<min)return 'LOW';
  const improvement=(candidate.rate??0)-(baseline.rate??0);
  const rImprovement=(candidate.avgR??0)-(baseline.avgR??0);
  if(improvement>=.08&&rImprovement>=0)return 'HIGH';
  if(improvement>=.03||rImprovement>=.15)return 'MEDIUM';
  return 'LOW';
}
function buildAdaptiveOptimization(){
  const rows=getAdaptiveOptimizationRows();
  const currentScore=Math.max(0,Math.min(100,Number(AUTO_CONFIRM_SCORE)||65));
  const currentGap=Math.max(0,Number(AUTO_CONFIRM_GAP)||4);
  const {train,test}=adaptiveSplit(rows);
  const thresholds=[55,60,65,70,75,80];
  const thresholdRows=thresholds.map(t=>{
    const tr=evaluateAdaptiveThreshold(train,t),te=evaluateAdaptiveThreshold(test,t),full=evaluateAdaptiveThreshold(rows,t);
    return {...full,train:tr,test:te};
  });
  const baseline=evaluateAdaptiveThreshold(test,currentScore);
  const viable=thresholdRows.filter(x=>x.threshold!==currentScore&&x.test.n>=8&&x.train.n>=8&&x.test.avgR!=null&&x.train.avgR!=null);
  const candidates=viable.map(x=>({x,score:(x.test.avgR-baseline.avgR)*2+(x.test.rate-baseline.rate)*1})).sort((a,b)=>b.score-a.score);
  const best=candidates[0]?.x||null;
  let recommendation=null;
  if(best){
    const confidence=adaptiveConfidence(best.train,best.test,best.test,baseline);
    const stable=best.test.avgR>=baseline.avgR && best.train.avgR>=baseline.avgR;
    const rateStable=best.test.rate>=((baseline.rate??0)-.03) && best.train.rate>=((baseline.rate??0)-.03);
    if(confidence!=='LOW'&&stable&&rateStable)recommendation={type:'CONFIDENCE',from:currentScore,to:best.threshold,confidence,reason:`Threshold ${best.threshold} menunjukkan hasil walk-forward yang lebih konsisten pada train dan out-of-sample.`};
  }
  const gapRows=[2,4,6,8].map(g=>{
    const filtered=rows.filter(x=>Number(x.gap||0)>=g);
    const z=evaluateAdaptiveThreshold(filtered,-Infinity);
    return {gap:g,...z};
  });
  const currentGapStats=gapRows.find(x=>x.gap===currentGap)||gapRows[0];
  const gapCandidates=gapRows.filter(x=>x.gap!==currentGap&&x.n>=8&&x.avgR!=null).sort((a,b)=>(b.avgR-a.avgR)||(b.rate-a.rate));
  const bestGap=gapCandidates[0];
  if(!recommendation&&bestGap&&currentGapStats?.avgR!=null&&bestGap.avgR>currentGapStats.avgR&&bestGap.rate>=(currentGapStats.rate??0)-.03){
    const confidence=bestGap.n>=20?'MEDIUM':'LOW';
    if(confidence!=='LOW')recommendation={type:'GAP',from:currentGap,to:bestGap.gap,confidence,reason:`Minimum gap ${bestGap.gap} menghasilkan hasil historis lebih stabil pada sample yang tersedia.`};
  }
  const groups=adaptiveGroupStats(rows,adaptiveBucket);
  const ranked=groups.filter(x=>x.n>=3).sort((a,b)=>(b.rate-a.rate)||(b.avgR??-999)-(a.avgR??-999)).slice(0,8);
  const weak=groups.filter(x=>x.n>=3).sort((a,b)=>(a.rate-b.rate)||(a.avgR??999)-(b.avgR??999)).slice(0,5);
  const learningConfidence=rows.length>=50&&test.length>=15?'HIGH':rows.length>=20&&test.length>=8?'MEDIUM':'LOW';
  const overfit=best ? !(best.train.n>=8&&best.test.n>=8&&best.test.avgR>=best.train.avgR-.35) : true;
  return {rows,train,test,currentScore,currentGap,thresholdRows,gapRows,ranked,weak,recommendation,learningConfidence,overfit,baseline,best};
}
function adaptiveFormatR(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(2)}R`:'—'}
function adaptiveBadge(level){return `<span class="sxeBadge ${level==='HIGH'?'good':level==='MEDIUM'?'gold':'bad'}">${level}</span>`}
function applyAdaptiveRecommendation(){
  const a=buildAdaptiveOptimization(); const r=a.recommendation; if(!r)return;
  const ok=confirm(`Terapkan rekomendasi ${r.type==='CONFIDENCE'?'confidence threshold':'minimum gap'} secara manual untuk sesi ini?\n\n${r.from} → ${r.to}\n\nTidak ada parameter yang diubah otomatis.`);
  if(!ok)return;
  if(r.type==='CONFIDENCE'){AUTO_CONFIRM_SCORE=Number(r.to);AUTO_REENTRY_SCORE=Math.max(55,AUTO_CONFIRM_SCORE-5);}
  else {AUTO_CONFIRM_GAP=Number(r.to);AUTO_REENTRY_GAP=Math.max(2,AUTO_CONFIRM_GAP);}
  try{localStorage.setItem('obsidian_manual_adaptive',JSON.stringify({at:Date.now(),type:r.type,from:r.from,to:r.to}))}catch{}
  renderAdaptiveOptimization();
}

function getCalibrationRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function calibrationBucket(score){
  const n=Number(score||0);
  if(n>=80)return '80-100'; if(n>=70)return '70-79'; if(n>=60)return '60-69'; if(n>=50)return '50-59'; return '<50';
}
function buildConfidenceCalibration(){
  const rows=getCalibrationRows();
  const ranges=['<50','50-59','60-69','70-79','80-100'];
  const buckets=ranges.map(label=>{
    const a=rows.filter(x=>calibrationBucket(x.score)===label);
    const hit=a.filter(x=>x.outcome==='HIT').length;
    const avgScore=a.length?a.reduce((u,x)=>u+Number(x.score||0),0)/a.length:null;
    const actual=a.length?hit/a.length:null;
    const expected=avgScore==null?null:avgScore/100;
    const gap=actual==null||expected==null?null:Math.abs(actual-expected);
    const r=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);
    return {label,n:a.length,hit,actual,expected,gap,avgR:r.length?r.reduce((u,v)=>u+v,0)/r.length:null};
  });
  const recent=rows.slice(-20), previous=rows.slice(-40,-20);
  const stats=a=>{const h=a.filter(x=>x.outcome==='HIT').length;const r=a.map(x=>Number(x.realizedR)).filter(Number.isFinite);return {n:a.length,rate:a.length?h/a.length:null,avgR:r.length?r.reduce((u,v)=>u+v,0)/r.length:null};};
  const rr=stats(recent), pp=stats(previous);
  const drift=rr.rate!=null&&pp.rate!=null ? rr.rate-pp.rate : null;
  const rDrift=rr.avgR!=null&&pp.avgR!=null ? rr.avgR-pp.avgR : null;
  const calibrationError=buckets.filter(x=>x.n>=5&&x.gap!=null).reduce((u,x)=>u+x.gap,0)/(buckets.filter(x=>x.n>=5&&x.gap!=null).length||1);
  const stableSample=recent.length>=10&&previous.length>=10;
  const driftLevel=!stableSample?'WAIT':(drift!=null&&drift<=-.12)||(rDrift!=null&&rDrift<=-.25)?'ALERT':(drift!=null&&drift<=-.06)||(rDrift!=null&&rDrift<=-.12)?'WATCH':'STABLE';
  const calibration=rows.length>=20&&calibrationError<=.12?'GOOD':rows.length>=20&&calibrationError<=.20?'FAIR':'LOW DATA';
  const byRegime=adaptiveGroupStats(rows,x=>x.marketRegime?.regime||x.marketRegime?.label||'UNKNOWN').filter(x=>x.n>=3).slice(0,8);
  return {rows,buckets,recent,previous,rr,pp,drift,rDrift,calibrationError,calibration,driftLevel,byRegime};
}
function renderConfidenceCalibration(){
  const host=$('confidenceCalibration'); if(!host)return;
  const a=buildConfidenceCalibration();
  const bucketHtml=a.buckets.map(x=>`<div class="calRow"><span>${x.label}</span><span>${x.n}</span><b>${x.actual==null?'—':Math.round(x.actual*100)+'%'}</b><span>${x.expected==null?'—':Math.round(x.expected*100)+'%'}</span><span>${x.gap==null?'—':Math.round(x.gap*100)+'pp'}</span></div>`).join('');
  const driftText=a.drift==null?'Belum cukup data untuk membandingkan periode terbaru.':`Hit-rate ${a.drift>=0?'+':''}${Math.round(a.drift*100)}pp · Avg R ${a.rDrift==null?'—':(a.rDrift>=0?'+':'')+a.rDrift.toFixed(2)+'R'}`;
  const regime=a.byRegime.map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">Belum cukup sample per regime.</div>';
  const badge=a.driftLevel==='STABLE'?'good':a.driftLevel==='WATCH'?'gold':'bad';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.49 CONFIDENCE CALIBRATION &amp; EDGE STABILITY</span><b>Apakah confidence sejalan dengan hasil?</b></div><span class="sxeBadge ${badge}">${a.driftLevel}</span></div>
  <div class="ljSummary"><div><small>CALIBRATION</small><b>${a.calibration}</b></div><div><small>CALIBRATION ERROR</small><b>${a.rows.length?Math.round(a.calibrationError*100)+'pp':'—'}</b></div><div><small>RECENT 20</small><b>${a.rr.n?Math.round((a.rr.rate||0)*100)+'%':'—'}</b></div><div><small>PREV 20</small><b>${a.pp.n?Math.round((a.pp.rate||0)*100)+'%':'—'}</b></div></div>
  <div class="adaptiveGuard"><b>EDGE MONITOR:</b> ${driftText}. ${a.driftLevel==='ALERT'?'Performa terbaru melemah dibanding periode sebelumnya; hindari menganggap historical edge tetap konstan.':a.driftLevel==='WATCH'?'Ada pelemahan yang perlu dipantau sebelum menarik kesimpulan.':'Belum terlihat penurunan material pada sample yang tersedia.'}</div>
  <div class="sxeIntelTitle" style="margin-top:10px">CONFIDENCE CALIBRATION</div><div class="calTable"><div class="calHead"><span>SCORE</span><span>N</span><span>ACTUAL HIT</span><span>EXPECTED</span><span>ERROR</span></div>${bucketHtml||'<div class="note">Belum ada signal closed.</div>'}</div>
  <div class="sxeIntelTitle" style="margin-top:10px">EDGE BY MARKET REGIME</div>${regime}
  <div class="note" style="margin-top:8px">Calibration adalah evaluasi historis, bukan jaminan probabilitas candle berikutnya. V5.49 tidak mengubah signal, leverage, SL/TP, atau AUTO TRADE secara otomatis.</div>`;
}

function renderAdaptiveOptimization(){
  const host=$('adaptiveOptimization'); if(!host)return;
  const a=buildAdaptiveOptimization();
  const top=a.ranked.map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">Belum cukup sample.</div>';
  const weak=a.weak.map(x=>`<div class="ljRow"><span>${x.key}</span><b class="bad">${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">Belum cukup sample.</div>';
  const th=a.thresholdRows.map(x=>`<div class="adaptiveRow"><span>${x.threshold}</span><span>${x.n}</span><b>${x.rate==null?'—':Math.round(x.rate*100)+'%'}</b><span>${adaptiveFormatR(x.avgR)}</span><span>${x.test.n?Math.round((x.test.rate||0)*100)+'% / '+adaptiveFormatR(x.test.avgR):'—'}</span></div>`).join('');
  const rec=a.recommendation;
  const recHtml=rec?`<div class="adaptiveRec"><div><b>REKOMENDASI MANUAL</b><span>${rec.type==='CONFIDENCE'?'Confidence threshold':'Minimum gap'}: <strong>${rec.from} → ${rec.to}</strong></span><span>${rec.reason}</span></div>${adaptiveBadge(rec.confidence)}<button class="btn active" id="applyAdaptiveRec">Terapkan Sesi</button></div>`:`<div class="adaptiveRec"><div><b>BELUM ADA REKOMENDASI</b><span>Sample atau konsistensi out-of-sample belum cukup untuk menyarankan perubahan.</span></div>${adaptiveBadge(a.learningConfidence)}</div>`;
  const guard=`<div class="adaptiveGuard"><b>OVERFITTING GUARD:</b> ${a.overfit?'AKTIF — kandidat belum lolos validasi train/OOS.':'LOLOS — kandidat dibandingkan pada train + out-of-sample.'} · <b>LEARNING CONFIDENCE:</b> ${a.learningConfidence} · Sample ${a.rows.length} (train ${a.train.length} / OOS ${a.test.length}).</div>`;
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.48 ADAPTIVE LEARNING &amp; OPTIMIZATION</span><b>Learning yang dapat diaudit</b></div>${adaptiveBadge(a.learningConfidence)}</div>
  <div class="ljSummary"><div><small>CURRENT SCORE</small><b>${a.currentScore}</b></div><div><small>CURRENT GAP</small><b>${a.currentGap}</b></div><div><small>TRAIN / OOS</small><b>${a.train.length} / ${a.test.length}</b></div><div><small>CLOSED SAMPLE</small><b>${a.rows.length}</b></div></div>
  ${recHtml}${guard}
  <div class="ljGrid"><div><div class="sxeIntelTitle">PATTERN PERFORMANCE RANKING</div>${top}</div><div><div class="sxeIntelTitle">PATTERN YANG PERLU DIAWASI</div>${weak}</div></div>
  <div class="sxeIntelTitle" style="margin-top:10px">THRESHOLD SENSITIVITY · HISTORICAL</div><div class="adaptiveTable"><div class="adaptiveHead"><span>THRESHOLD</span><span>N</span><span>HIT</span><span>AVG R</span><span>OOS HIT / R</span></div>${th||'<div class="note">Belum ada sample.</div>'}</div>
  <div class="sxeIntelTitle" style="margin-top:10px">BEFORE / AFTER SIMULATION</div><div class="adaptiveCompare"><div><small>CURRENT OOS</small><b>${a.baseline.n} sample · ${a.baseline.rate==null?'—':Math.round(a.baseline.rate*100)+'%'} · ${adaptiveFormatR(a.baseline.avgR)}</b></div><div><small>CANDIDATE OOS</small><b>${a.best?`${a.best.test.n} sample · ${Math.round((a.best.test.rate||0)*100)}% · ${adaptiveFormatR(a.best.test.avgR)}`:'—'}</b></div></div>
  <div class="note" style="margin-top:8px">Adaptive Learning hanya memberi rekomendasi dari signal CLOSED. Tidak ada perubahan otomatis pada BUY/SELL, leverage, SL/TP, AUTO TRADE, atau parameter live. Tombol Terapkan Sesi membutuhkan tindakan manual dan hanya mengubah sesi browser.</div>`;
  $('applyAdaptiveRec')?.addEventListener('click',applyAdaptiveRecommendation);
}


function tradePlanRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function buildTradePlanIntelligence(){
  const rows=tradePlanRows();
  const current=getFinalSignal?.()||{};
  const risk=current.riskPlan||buildSmartRiskPlan(current);
  const closedR=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  const avgR=closedR.length?closedR.reduce((a,b)=>a+b,0)/closedR.length:null;
  const rr1=Number(risk.rr1||0), rr2=Number(risk.rr2||0);
  const r15=closedR.length?closedR.filter(r=>r>=1.5).length/closedR.length:null;
  const r20=closedR.length?closedR.filter(r=>r>=2).length/closedR.length:null;
  const recent=rows.slice(-20), recentR=recent.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  const recentAvg=recentR.length?recentR.reduce((a,b)=>a+b,0)/recentR.length:null;
  const quality=current.quality?.score||0;
  const readiness=current.readiness?.score||0;
  const riskQuality=rr2>=2.5?100:rr2>=2?90:rr2>=1.5?75:rr2>0?45:0;
  const planScore=Math.round(quality*.45+readiness*.2+riskQuality*.2+(risk.valid?100:0)*.15);
  let grade=planScore>=80?'A':planScore>=65?'B':planScore>=50?'C':'WAIT';
  const entryWidth=risk.valid?Math.abs(Number(risk.entryHigh)-Number(risk.entryLow)):0;
  const entryRiskRatio=risk.valid&&risk.riskDistance>0?entryWidth/risk.riskDistance:null;
  const entryState=!risk.valid?'WAIT':entryRiskRatio!=null&&entryRiskRatio<=.55?'TIGHT':entryRiskRatio<=1?'NORMAL':'WIDE';
  const warnings=[];
  if(!risk.valid)warnings.push('Risk plan belum valid.');
  if(rr1>0&&rr1<1.5)warnings.push('R:R TP1 di bawah 1.5.');
  if(rr2>0&&rr2<2)warnings.push('R:R TP2 di bawah 2.0.');
  if(current.readiness?.label!=='READY')warnings.push('Entry readiness belum READY.');
  if(current.quality?.score<65)warnings.push('Signal quality masih di bawah 65.');
  if(rows.length<10)warnings.push('Histori closed masih sedikit untuk evaluasi plan.');
  if(recentAvg!=null&&avgR!=null&&recent.length>=10&&recentAvg<avgR-0.35)warnings.push('Realized R terbaru melemah dibanding histori keseluruhan.');
  const state=warnings.length>=3?'CAUTION':warnings.length?'WATCH':'STRUCTURED';
  return {rows,current,risk,avgR,r15,r20,recentAvg,quality,readiness,riskQuality,planScore,grade,entryWidth,entryRiskRatio,entryState,warnings,state};
}
function renderTradePlanIntelligence(){
  const host=$('tradePlanIntelligence'); if(!host)return;
  const a=buildTradePlanIntelligence(), r=a.risk, fmtP=v=>Number.isFinite(Number(v))?fmtIDR(Number(v)):'—';
  const tone=a.state==='STRUCTURED'?'good':a.state==='WATCH'?'gold':'bad';
  const warning=a.warnings.length?a.warnings.map(x=>`<div>• ${x}</div>`).join(''):'Tidak ada warning utama dari data plan saat ini.';
  const sample=a.rows.length;
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.51 TRADE PLAN INTELLIGENCE</span><b>Rencana entry, invalidation &amp; target</b></div><span class="sxeBadge ${tone}">${a.state}</span></div>
  <div class="ljSummary"><div><small>PLAN SCORE</small><b>${a.planScore}/100 · ${a.grade}</b></div><div><small>ENTRY READINESS</small><b>${a.current.readiness?.label||'WAIT'} ${a.readiness}%</b></div><div><small>R:R TP1 / TP2</small><b>${r.valid?r.rr1.toFixed(1)+' / '+r.rr2.toFixed(1):'—'}</b></div><div><small>CLOSED SAMPLE</small><b>${sample}</b></div></div>
  <div class="tradePlanGrid"><div><div class="sxeIntelTitle">CURRENT TRADE PLAN</div><div class="tradePlanRows"><div><span>Direction</span><b>${r.side||'WAIT'}</b></div><div><span>Entry Zone</span><b>${r.valid?fmtP(r.entryLow)+' – '+fmtP(r.entryHigh):'—'}</b></div><div><span>Stop / Invalidation</span><b>${fmtP(r.sl)}</b></div><div><span>TP1</span><b>${fmtP(r.tp1)}</b></div><div><span>TP2</span><b>${fmtP(r.tp2)}</b></div><div><span>Entry Zone Width</span><b>${a.entryWidth?fmtP(a.entryWidth):'—'} · ${a.entryState}</b></div></div></div>
  <div><div class="sxeIntelTitle">HISTORICAL R OUTCOME</div><div class="tradePlanRows"><div><span>Average Realized R</span><b>${a.avgR==null?'—':a.avgR.toFixed(2)+'R'}</b></div><div><span>R ≥ 1.5</span><b>${a.r15==null?'—':Math.round(a.r15*100)+'%'}</b></div><div><span>R ≥ 2.0</span><b>${a.r20==null?'—':Math.round(a.r20*100)+'%'}</b></div><div><span>Recent Avg R</span><b>${a.recentAvg==null?'—':a.recentAvg.toFixed(2)+'R'}</b></div></div><div class="note">R ≥ 1.5/2.0 adalah frekuensi outcome realized-R historis, bukan probabilitas TP yang dijamin.</div></div></div>
  <div class="adaptiveGuard"><b>PLAN CHECK:</b><div style="margin-top:4px">${warning}</div></div>
  <div class="note" style="margin-top:8px">V5.51 menyusun rencana berdasarkan signal, S/R, ATR, readiness, quality, dan histori closed. Ini bukan jaminan hasil dan tidak mengirim atau mengubah order secara otomatis.</div>`;
}

function strategyIntelRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function strategyContext(row){
  const f=row?.featureSnapshot||{};
  const side=row?.side||'WAIT';
  const regime=row?.marketRegime?.regime||row?.marketRegime?.label||'UNKNOWN';
  const sr=row?.srContext||f.srContext||row?.sr?.context||'UNKNOWN';
  const momentum=Number(f.momentumScore||0);
  const body=Number(f.bodyPct||0);
  const mtf=Number(f.mtfRatio||f.mtfAlignment||0);
  const readiness=row?.readiness?.label||'WAIT';
  return {side,regime,sr,momentum,body,mtf,readiness};
}
function strategyKey(row){
  const c=strategyContext(row);
  return `${c.side} · ${c.regime} · ${c.sr} · ${c.momentum>=65?'MOM+':c.momentum>=45?'MOM~':'MOM-'} · ${c.readiness}`;
}
function buildStrategyIntelligence(){
  const rows=strategyIntelRows();
  const groups=adaptiveGroupStats(rows,strategyKey).filter(x=>x.n>=4);
  const ranked=[...groups].sort((a,b)=>(b.rate-a.rate)||(b.avgR??-999)-(a.avgR??-999));
  const current=getFinalSignal?.()||{};
  const active=strategyContext(current);
  const matching=rows.filter(x=>{
    const c=strategyContext(x);
    return c.side===active.side && c.regime===active.regime && c.sr===active.sr && c.readiness===active.readiness;
  });
  const matchStats=evaluateAdaptiveThreshold(matching,-Infinity);
  const sideStats=adaptiveGroupStats(rows,x=>x.side).filter(x=>x.n>=4);
  const regimeStats=adaptiveGroupStats(rows,x=>strategyContext(x).regime).filter(x=>x.n>=4);
  let status='NO MATCH';
  if(active.side==='BUY'||active.side==='SELL'){
    if(matching.length>=8) status=matchStats.rate>=.6?'SUPPORTED':matchStats.rate<=.4?'WEAK':'MIXED';
    else status='LOW SAMPLE';
  }
  const edge=matchStats.rate==null?null:matchStats.rate-.5;
  return {rows,groups:ranked.slice(0,8),weak:[...groups].sort((a,b)=>(a.rate-b.rate)||(a.avgR??999)-(b.avgR??999)).slice(0,5),active,matching,matchStats,sideStats,regimeStats,status,edge};
}
function researchRows(){
  return SIGNALS.filter(x=>x.symbol===S.symbol&&['BUY','SELL'].includes(x.side)&&x.status==='CLOSED'&&(x.outcome==='HIT'||x.outcome==='MISS'))
    .sort((a,b)=>Number(a.targetTs||a.ts)-Number(b.targetTs||b.ts));
}
function researchFeature(row){
  const f=row?.featureSnapshot||{};
  return {
    score:Number(row.score||0),
    momentum:Number(f.momentumScore||0),
    body:Number(f.bodyPct||0),
    mtf:Number(f.mtfRatio||f.mtfAlignment||0),
    readiness:row?.readiness?.label||'WAIT',
    regime:row?.marketRegime?.regime||row?.marketRegime?.label||'UNKNOWN',
    side:row?.side||'UNKNOWN'
  };
}
function researchMetrics(rows){
  const rs=rows.map(x=>Number(x.realizedR)).filter(Number.isFinite);
  const hit=rows.filter(x=>x.outcome==='HIT').length;
  let eq=0,peak=0,maxDD=0,losing=0,maxLosing=0;
  for(const r of rs){eq+=r; if(eq>peak)peak=eq; maxDD=Math.max(maxDD,peak-eq); if(r<0){losing++;maxLosing=Math.max(maxLosing,losing)}else losing=0;}
  return {n:rows.length,hit,rate:rows.length?hit/rows.length:null,avgR:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null,totalR:rs.length?rs.reduce((a,b)=>a+b,0):null,maxDD,maxLosing};
}
function buildResearchCandidate(rows, label, filterFn){
  const selected=rows.filter(filterFn), cut=Math.floor(selected.length*.7);
  const train=selected.slice(0,cut), test=selected.slice(cut);
  return {label,full:researchMetrics(selected),train:researchMetrics(train),test:researchMetrics(test)};
}
function buildStrategyResearch(){
  const rows=researchRows();
  const currentScore=Math.max(0,Math.min(100,Number(AUTO_CONFIRM_SCORE)||65));
  const candidates=[];
  for(const threshold of [55,60,65,70,75,80]) candidates.push(buildResearchCandidate(rows,`Score ≥ ${threshold}`,x=>researchFeature(x).score>=threshold));
  for(const threshold of [45,55,65]) candidates.push(buildResearchCandidate(rows,`Momentum ≥ ${threshold}`,x=>researchFeature(x).momentum>=threshold));
  candidates.push(buildResearchCandidate(rows,'READY only',x=>researchFeature(x).readiness==='READY'));
  candidates.push(buildResearchCandidate(rows,'Score ≥ 65 + Momentum ≥ 55',x=>{const f=researchFeature(x);return f.score>=65&&f.momentum>=55}));
  candidates.push(buildResearchCandidate(rows,'Score ≥ 70 + Momentum ≥ 65',x=>{const f=researchFeature(x);return f.score>=70&&f.momentum>=65}));
  const baseline={label:'ALL CLOSED',full:researchMetrics(rows),train:researchMetrics(rows.slice(0,Math.floor(rows.length*.7))),test:researchMetrics(rows.slice(Math.floor(rows.length*.7)))};
  const viable=candidates.filter(c=>c.test.n>=8&&c.train.n>=8&&Number.isFinite(c.test.avgR)&&Number.isFinite(c.train.avgR));
  const ranked=[...viable].sort((a,b)=>((b.test.avgR??-999)-(a.test.avgR??-999))||((b.test.rate??0)-(a.test.rate??0)));
  const best=ranked[0]||null;
  const baseTest=baseline.test;
  let recommendation=null;
  if(best&&baseTest.n>=8&&Number.isFinite(baseTest.avgR)){
    const deltaR=best.test.avgR-baseTest.avgR;
    const deltaRate=(best.test.rate??0)-(baseTest.rate??0);
    const trainDelta=best.train.avgR-baseline.train.avgR;
    const stable=deltaR>0&&trainDelta>0&&(best.test.rate??0)>=(baseTest.rate??0)-.03;
    const confidence=best.test.n>=20&&best.train.n>=20&&deltaR>=.15&&stable?'HIGH':best.test.n>=12&&deltaR>=.08&&stable?'MEDIUM':'LOW';
    if(confidence!=='LOW') recommendation={...best,deltaR,deltaRate,confidence};
  }
  const overfit=best?((best.test.avgR??-999)<(best.train.avgR??-999)-.35 || best.test.n<8 || best.train.n<8):true;
  const learning=rows.length>=60&&baseline.test.n>=18?'HIGH':rows.length>=25&&baseline.test.n>=8?'MEDIUM':'LOW';
  return {rows,baseline,candidates:ranked.slice(0,8),weak:[...viable].sort((a,b)=>(a.test.avgR??999)-(b.test.avgR??999)).slice(0,5),best,recommendation,overfit,learning,currentScore};
}
function fullHistoricalBacktest(){
  const a=Array.isArray(S.c)?S.c:[];
  const minScore=Math.max(0,Math.min(100,Number($('bscore')?.value||52)));
  const minGap=Math.max(0,Math.min(100,Number($('bgap')?.value||9)));
  const fee=Math.max(0,Number($('fee')?.value||0))/100;
  const slip=Math.max(0,Number($('slip')?.value||0))/100;
  const risk=Math.max(.05,Number($('brisk')?.value||1))/100;
  const maxBars=Math.max(3,Math.min(100,Number($('riskBars')?.value||20)));
  const rrMin=Math.max(1,Number($('rr')?.value||2));
  if(a.length<150){$('fullHistoricalBacktest').innerHTML='<span class="bad">Minimal 150 candle diperlukan untuk Full Historical Backtest.</span>';return;}
  const rows=[];
  let equity=1,peak=1,maxDD=0,grossWin=0,grossLoss=0,wins=0,losses=0,timeout=0,ambiguous=0;
  for(let i=60;i<a.length-1;i++){
    const hist=a.slice(0,i+1), pred=adaptivePredictiveCandle(hist);
    if(!['BUY','SELL'].includes(pred.side)||Number(pred.score||0)<minScore||Number(pred.gap||0)<minGap)continue;
    const plan=buildSmartRiskPlan({...pred,closed:hist});
    if(!plan?.valid||Number(plan.rr1||0)<rrMin)continue;
    const entryBar=a[i+1];
    const rawEntry=Number(entryBar.o);
    if(!Number.isFinite(rawEntry)||rawEntry<=0)continue;
    const entry=pred.side==='BUY'?rawEntry*(1+slip):rawEntry*(1-slip);
    const stop=Number(plan.sl), tp=Number(plan.tp2||plan.tp1);
    if(!Number.isFinite(stop)||!Number.isFinite(tp))continue;
    let result='TIMEOUT',exit=Number(entryBar.c),exitIndex=Math.min(a.length-1,i+maxBars),both=false;
    for(let j=i+1;j<=Math.min(a.length-1,i+maxBars);j++){
      const c=a[j],hi=Number(c.h),lo=Number(c.l);
      const hitSL=pred.side==='BUY'?lo<=stop:hi>=stop;
      const hitTP=pred.side==='BUY'?hi>=tp:lo<=tp;
      if(hitSL&&hitTP){result='SL';exit=stop;exitIndex=j;both=true;break;}
      if(hitTP){result='TP';exit=tp;exitIndex=j;break;}
      if(hitSL){result='SL';exit=stop;exitIndex=j;break;}
      exit=Number(c.c);exitIndex=j;
    }
    if(result==='TIMEOUT')timeout++;
    if(both)ambiguous++;
    const gross=pred.side==='BUY'?(exit-entry)/entry:(entry-exit)/entry;
    const riskUnit=Math.abs(entry-stop)/entry;
    if(!(riskUnit>0))continue;
    const realizedR=gross/riskUnit;
    const costs=fee*2+slip*2;
    const netR=(gross-costs)/riskUnit;
    const pnlPct=netR*risk*100;
    if(netR>=0){wins++;grossWin+=netR}else{losses++;grossLoss+=Math.abs(netR)}
    equity*=Math.max(.05,1+netR*risk); peak=Math.max(peak,equity); maxDD=Math.max(maxDD,(peak-equity)/peak);
    rows.push({i,exitIndex,side:pred.side,score:Number(pred.score||0),result,realizedR:netR,pnlPct});
  }
  const cut=Math.floor(rows.length*.7),train=rows.slice(0,cut),oos=rows.slice(cut);
  const stat=(rs)=>{const n=rs.length,w=rs.filter(x=>x.result==='TP').length,rr=rs.map(x=>x.realizedR);const avg=rr.length?rr.reduce((a,b)=>a+b,0)/rr.length:null;return {n,w,rate:n?w/n:null,avg,total:rr.reduce((a,b)=>a+b,0)};};
  const st=stat(rows),tr=stat(train),oo=stat(oos),pf=grossLoss?grossWin/grossLoss:null;
  const oosEq=oos.reduce((e,x)=>e*Math.max(.05,1+x.realizedR*risk),1),oosRet=(oosEq-1)*100;
  const stable=tr.avg!=null&&oo.avg!=null&&tr.avg>0&&oo.avg>0;
  const confidence=rows.length>=60&&oos.length>=18&&stable?'HIGH':rows.length>=30&&oos.length>=10?'MEDIUM':'LOW';
  const tone=stable?'good':(oo.avg!=null&&oo.avg>0?'gold':'bad');
  $('fullHistoricalBacktest').innerHTML=`<div class="ljHead"><div><span class="label">V5.58 FULL HISTORICAL BACKTEST</span><b>Candle-by-candle · chronological · no hindsight</b></div><span class="sxeBadge ${tone}">${stable?'OOS POSITIVE':'CAUTION'} · ${confidence}</span></div>
  <div class="ljSummary"><div><small>SETUPS</small><b>${st.n}</b></div><div><small>HIT TP</small><b>${st.rate==null?'—':Math.round(st.rate*100)+'%'}</b></div><div><small>AVG R</small><b>${st.avg==null?'—':st.avg.toFixed(2)+'R'}</b></div><div><small>MAX DD</small><b>${(maxDD*100).toFixed(1)}%</b></div></div>
  <div class="contextRows"><div><span>Full simulated equity</span><b>${((equity-1)*100).toFixed(2)}%</b></div><div><span>Profit Factor</span><b>${pf==null?'—':pf.toFixed(2)}</b></div><div><span>Train 70% Avg R</span><b>${tr.avg==null?'—':tr.avg.toFixed(2)+'R'} · ${tr.n} setups</b></div><div><span>OOS 30% Avg R</span><b>${oo.avg==null?'—':oo.avg.toFixed(2)+'R'} · ${oo.n} setups · ${oosRet.toFixed(2)}%</b></div><div><span>Timeout / ambiguous</span><b>${timeout} / ${ambiguous}</b></div></div>
  <div class="ljFeedback">${stable?'Train dan OOS sama-sama positif pada simulasi historis ini. Itu menunjukkan konsistensi pada sample yang tersedia, bukan jaminan bahwa edge akan bertahan di pasar live.':'Hasil belum menunjukkan konsistensi OOS yang cukup. Sistem tidak akan menyimpulkan strategi ini menguntungkan hanya dari full-sample result.'}</div>
  <div class="note">Entry = open candle setelah signal. SL/TP = Smart Risk Plan yang tersedia pada saat signal. Jika SL dan TP tersentuh dalam candle yang sama, simulasi memakai aturan konservatif <b>SL-first</b>. Fee, slippage, risk %, dan max holding bars mengikuti input Uji Strategi. Funding belum dimodelkan per candle karena data funding historis tidak tersedia di chart OHLC.</div>`;
}


function strategyOptimizationSim(rows, params, risk, fee, slip){
  const cut=Math.floor(rows.length*.7), out=[];
  const run=(arr)=>{
    let eq=1,peak=1,maxDD=0,w=0,l=0,gw=0,gl=0;
    for(const x of arr){
      if(x.score<params.score||x.gap<params.gap)continue;
      const entry=x.entry, atr=x.atr;
      if(!(entry>0&&atr>0))continue;
      const stopDist=atr*params.atr;
      const tpDist=stopDist*params.rr;
      let result='TIMEOUT',exit=x.close,both=false;
      for(let j=0;j<x.future.length&&j<params.bars;j++){
        const c=x.future[j],hi=Number(c.h),lo=Number(c.l);
        const sl=x.side==='BUY'?lo<=entry-stopDist:hi>=entry+stopDist;
        const tp=x.side==='BUY'?hi>=entry+tpDist:lo<=entry-tpDist;
        if(sl&&tp){result='SL';exit=x.side==='BUY'?entry-stopDist:entry+stopDist;both=true;break}
        if(tp){result='TP';exit=x.side==='BUY'?entry+tpDist:entry-tpDist;break}
        if(sl){result='SL';exit=x.side==='BUY'?entry-stopDist:entry+stopDist;break}
        exit=Number(c.c)
      }
      const gross=x.side==='BUY'?(exit-entry)/entry:(entry-exit)/entry;
      const netR=(gross-(fee*2+slip*2))/Math.max(1e-9,stopDist/entry);
      eq*=Math.max(.05,1+netR*risk); peak=Math.max(peak,eq); maxDD=Math.max(maxDD,(peak-eq)/peak);
      if(netR>=0){w++;gw+=netR}else{l++;gl+=Math.abs(netR)}
      out.push({result,netR,both});
    }
    const n=w+l, avg=n?out.filter(Boolean).reduce((a,z)=>a+z.netR,0)/Math.max(1,out.length):null;
    return {n,win:w,loss:l,avgR:avg,hit:n?w/n:null,maxDD,pf:gl?gw/gl:null,returnPct:(eq-1)*100};
  };
  const train=run(rows.slice(0,cut)); const before=out.length; const oosOut=[];
  // Re-run OOS separately so statistics are independent.
  out.length=0; const oos=run(rows.slice(cut));
  return {train,oos};
}
function optimizeStrategyV559(){
  const host=$('optimizationLab'); if(!host)return;
  const a=Array.isArray(S.c)?S.c:[];
  const fee=Math.max(0,Number($('fee')?.value||0))/100, slip=Math.max(0,Number($('slip')?.value||0))/100, risk=Math.max(.05,Number($('brisk')?.value||1))/100;
  if(a.length<220){host.innerHTML='<div class="note bad">Minimal 220 candle diperlukan untuk Optimization Lab.</div>';return;}
  const raw=[];
  for(let i=70;i<a.length-1;i++){
    const hist=a.slice(0,i+1), pred=adaptivePredictiveCandle(hist);
    if(!['BUY','SELL'].includes(pred.side))continue;
    const atr=Number(pred.atr||ATR(hist).at(-1)||0), entry=Number(a[i+1]?.o||0);
    if(!(atr>0&&entry>0))continue;
    raw.push({i,side:pred.side,score:Number(pred.score||0),gap:Number(pred.gap||0),atr,entry,close:entry,future:a.slice(i+1),regime:pred.regime||'UNKNOWN'});
  }
  const candidates=[];
  const scores=[48,52,56,60,64,68,72], gaps=[4,8,12], atrs=[0.8,1.0,1.25,1.5,1.75,2.0], rrs=[1.25,1.5,1.75,2,2.5,3], bars=[8,12,20,30];
  for(const score of scores)for(const gap of gaps)for(const atr of atrs)for(const rr of rrs)for(const bar of bars){
    const filtered=raw.filter(x=>x.score>=score&&x.gap>=gap); if(filtered.length<24)continue;
    const cut=Math.floor(filtered.length*.7), tr=filtered.slice(0,cut), oo=filtered.slice(cut);
    const sim=(arr)=>{let eq=1,peak=1,dd=0,w=0,l=0,gw=0,gl=0,rs=[];for(const x of arr){let result='TIMEOUT',exit=x.close,dist=x.atr*atr;for(let j=0;j<x.future.length&&j<bar;j++){const c=x.future[j],hi=+c.h,lo=+c.l,sl=x.side==='BUY'?lo<=x.entry-dist:hi>=x.entry+dist,tp=x.side==='BUY'?hi>=x.entry+dist*rr:lo<=x.entry-dist*rr;if(sl&&tp){result='SL';exit=x.side==='BUY'?x.entry-dist:x.entry+dist;break}if(tp){result='TP';exit=x.side==='BUY'?x.entry+dist*rr:x.entry-dist*rr;break}if(sl){result='SL';exit=x.side==='BUY'?x.entry-dist:x.entry+dist;break}exit=+c.c}const gross=x.side==='BUY'?(exit-x.entry)/x.entry:(x.entry-exit)/x.entry, netR=(gross-(fee*2+slip*2))/Math.max(1e-9,dist/x.entry);rs.push(netR);if(netR>=0){w++;gw+=netR}else{l++;gl+=-netR}eq*=Math.max(.05,1+netR*risk);peak=Math.max(peak,eq);dd=Math.max(dd,(peak-eq)/peak)}return{n:rs.length,avgR:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null,hit:rs.length?w/rs.length:null,maxDD:dd,pf:gl?gw/gl:null,ret:(eq-1)*100};};
    const train=sim(tr),oos=sim(oo); if(oos.n<10||train.n<14||train.avgR==null||oos.avgR==null)continue;
    const stability=Math.min(train.avgR,oos.avgR), scoreVal=oos.avgR-(oos.maxDD*.35)+(Math.min(oos.pf||0,3)*.03);
    candidates.push({params:{score,gap,atr,rr,bar},train,oos,stability,scoreVal});
  }
  candidates.sort((x,y)=>y.scoreVal-x.scoreVal);
  const best=candidates[0], baseline=candidates.find(x=>x.params.score===52&&x.params.gap===9&&x.params.atr===1.5&&x.params.rr===2&&x.params.bar===20)||null;
  const stable=best&&best.train.avgR>0&&best.oos.avgR>0&&best.oos.maxDD<Math.max(.35,best.train.maxDD*1.5);
  const improvement=best&&baseline&&baseline.oos.avgR!=null?best.oos.avgR-baseline.oos.avgR:null;
  const confidence=best&&best.oos.n>=30&&stable?'HIGH':best&&best.oos.n>=15?'MEDIUM':'LOW';
  const guard=best&&!stable?'HOLD':best&&best.oos.avgR<=0?'HOLD':best&&best.train.avgR>0&&best.oos.avgR>0?'PASS':'HOLD';
  const top=candidates.slice(0,8).map(x=>`<div class="ljRow"><span>S${x.params.score} · G${x.params.gap} · ATR ${x.params.atr} · RR ${x.params.rr} · ${x.params.bar}b</span><b>${x.oos.avgR.toFixed(2)}R</b><small>OOS ${x.oos.n} · Hit ${Math.round(x.oos.hit*100)}% · DD ${(x.oos.maxDD*100).toFixed(1)}%</small></div>`).join('')||'<div class="note">Belum ada kandidat yang memenuhi minimum sample.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.59 STRATEGY OPTIMIZATION LAB</span><b>Parameter search · train/OOS · no automatic apply</b></div><span class="sxeBadge ${guard==='PASS'?'good':guard==='HOLD'?'bad':'gold'}">${guard} · ${confidence}</span></div>
  <div class="ljSummary"><div><small>CANDIDATES</small><b>${candidates.length}</b></div><div><small>BEST OOS R</small><b>${best?best.oos.avgR.toFixed(2)+'R':'—'}</b></div><div><small>OOS HIT</small><b>${best?Math.round(best.oos.hit*100)+'%':'—'}</b></div><div><small>OOS DD</small><b>${best?(best.oos.maxDD*100).toFixed(1)+'%':'—'}</b></div></div>
  <div class="adaptiveGuard"><b>OPTIMIZATION GUARD:</b> hanya kandidat dengan sample minimum, Train/OOS kronologis, dan OOS positif yang dapat dianggap stabil. Tidak ada parameter live yang diubah otomatis.</div>
  <div class="contextRows"><div><span>Best candidate</span><b>${best?`Score ${best.params.score} · Gap ${best.params.gap} · ATR ${best.params.atr} · RR ${best.params.rr} · ${best.params.bar} bars`:'—'}</b></div><div><span>Train Avg R</span><b>${best?best.train.avgR.toFixed(2)+'R · '+best.train.n+' setups':'—'}</b></div><div><span>OOS Avg R</span><b>${best?best.oos.avgR.toFixed(2)+'R · '+best.oos.n+' setups':'—'}</b></div><div><span>vs baseline OOS</span><b>${improvement==null?'—':(improvement>=0?'+':'')+improvement.toFixed(2)+'R'}</b></div></div>
  <div class="ljFeedback">${best&&guard==='PASS'?`Kandidat historis teratas lolos guard dasar. Ini bukan jaminan edge masa depan dan tetap perlu diuji ulang pada data baru.`:'Belum ada kandidat yang cukup stabil untuk direkomendasikan. Sistem sengaja menahan rekomendasi daripada memilih parameter dari hasil yang belum kuat.'}</div>
  <div class="sxeIntelTitle">TOP CANDIDATES</div>${top}`;
}

function walkForwardV560(){
  const host=$('walkForwardV560'); if(!host)return;
  const a=Array.isArray(S.c)?S.c:[];
  const fee=Math.max(0,Number($('fee')?.value||0))/100, slip=Math.max(0,Number($('slip')?.value||0))/100, risk=Math.max(.05,Number($('brisk')?.value||1))/100;
  if(a.length<320){host.innerHTML='<div class="note bad">Minimal 320 candle diperlukan untuk Walk-Forward Validation 2.0.</div>';return;}
  const raw=[];
  for(let i=70;i<a.length-1;i++){
    const hist=a.slice(0,i+1), pred=adaptivePredictiveCandle(hist);
    if(!['BUY','SELL'].includes(pred.side))continue;
    const atr=Number(pred.atr||ATR(hist).at(-1)||0), entry=Number(a[i+1]?.o||0);
    if(!(atr>0&&entry>0))continue;
    raw.push({i,side:pred.side,score:Number(pred.score||0),gap:Number(pred.gap||0),atr,entry,close:entry,future:a.slice(i+1),regime:pred.regime||'UNKNOWN'});
  }
  if(raw.length<100){host.innerHTML='<div class="note bad">Signal historis yang dapat diuji belum cukup. Minimal 100 setup.</div>';return;}
  const configs=[];
  const scores=[52,60,68], gaps=[4,8,12], atrs=[1.0,1.5,2.0], rrs=[1.5,2,2.5], bars=[12,20,30];
  for(const score of scores)for(const gap of gaps)for(const atr of atrs)for(const rr of rrs)for(const bar of bars) configs.push({score,gap,atr,rr,bar});
  const sim=(arr,c)=>{
    let eq=1,peak=1,maxDD=0,w=0,l=0,gw=0,gl=0; const rs=[];
    for(const x of arr){
      let result='TIMEOUT',exit=x.close,dist=x.atr*c.atr;
      for(let j=0;j<x.future.length&&j<c.bar;j++){
        const z=x.future[j],hi=+z.h,lo=+z.l;
        const sl=x.side==='BUY'?lo<=x.entry-dist:hi>=x.entry+dist;
        const tp=x.side==='BUY'?hi>=x.entry+dist*c.rr:lo<=x.entry-dist*c.rr;
        if(sl&&tp){result='SL';exit=x.side==='BUY'?x.entry-dist:x.entry+dist;break}
        if(tp){result='TP';exit=x.side==='BUY'?x.entry+dist*c.rr:x.entry-dist*c.rr;break}
        if(sl){result='SL';exit=x.side==='BUY'?x.entry-dist:x.entry+dist;break}
        exit=+z.c;
      }
      const gross=x.side==='BUY'?(exit-x.entry)/x.entry:(x.entry-exit)/x.entry;
      const netR=(gross-(fee*2+slip*2))/Math.max(1e-9,dist/x.entry);
      rs.push(netR); if(netR>=0){w++;gw+=netR}else{l++;gl-=netR}
      eq*=Math.max(.05,1+netR*risk); peak=Math.max(peak,eq); maxDD=Math.max(maxDD,(peak-eq)/peak);
    }
    return {n:rs.length,avgR:rs.length?rs.reduce((x,y)=>x+y,0)/rs.length:0,hit:rs.length?w/rs.length:0,pf:gl?gw/gl:null,maxDD,ret:(eq-1)*100};
  };
  const windows=[];
  const windowCount=5, trainSize=Math.max(45,Math.floor(raw.length*.25)), testSize=Math.max(20,Math.floor(raw.length*.12));
  for(let k=0;k<windowCount;k++){
    const start=k*testSize, train=raw.slice(start,start+trainSize), test=raw.slice(start+trainSize,start+trainSize+testSize);
    if(train.length<45||test.length<20)break;
    windows.push({train,test});
  }
  const candidates=configs.map(c=>{
    const folds=windows.map(w=>({tr:sim(w.train,c),te:sim(w.test,c)}));
    const oos=folds.map(f=>f.te).filter(x=>x.n); const tr=folds.map(f=>f.tr).filter(x=>x.n);
    const oosAvg=oos.length?oos.reduce((x,y)=>x+y.avgR,0)/oos.length:0;
    const trainAvg=tr.length?tr.reduce((x,y)=>x+y.avgR,0)/tr.length:0;
    const positive=oos.filter(x=>x.avgR>0).length;
    const consistency=oos.length?positive/oos.length:0;
    const worstDD=oos.length?Math.max(...oos.map(x=>x.maxDD)):1;
    const totalN=oos.reduce((x,y)=>x+y.n,0);
    const scoreVal=oosAvg-(worstDD*.35)+(consistency*.05);
    return {c,folds,oosAvg,trainAvg,consistency,worstDD,totalN,scoreVal};
  }).filter(x=>x.totalN>=60);
  candidates.sort((x,y)=>y.scoreVal-x.scoreVal);
  const top=candidates[0];
  const stable=!!top && top.oosAvg>0 && top.trainAvg>0 && top.consistency>=.6 && top.worstDD<.35;
  const confidence=top&&top.totalN>=120&&top.consistency>=.8&&stable?'HIGH':top&&top.totalN>=80&&top.consistency>=.6?'MEDIUM':'LOW';
  const guard=top&&stable?'PASS':'HOLD';
  const foldRows=top?top.folds.map((f,i)=>`<div class="ljRow"><span>Fold ${i+1}</span><b class="${f.te.avgR>0?'good':'bad'}">OOS ${f.te.avgR.toFixed(2)}R</b><small>Train ${f.tr.avgR.toFixed(2)}R · ${f.te.n} setups · Hit ${Math.round(f.te.hit*100)}% · DD ${(f.te.maxDD*100).toFixed(1)}%</small></div>`).join(''):'<div class="note">Belum ada kandidat yang memenuhi minimum sample.</div>';
  const topRows=candidates.slice(0,6).map(x=>`<div class="ljRow"><span>S${x.c.score} · G${x.c.gap} · ATR ${x.c.atr} · RR ${x.c.rr} · ${x.c.bar}b</span><b>${x.oosAvg.toFixed(2)}R</b><small>${Math.round(x.consistency*100)}% folds positive · DD ${(x.worstDD*100).toFixed(1)}% · ${x.totalN} OOS</small></div>`).join('');
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.60 WALK-FORWARD VALIDATION 2.0</span><b>5 chronological OOS windows · no automatic apply</b></div><span class="sxeBadge ${guard==='PASS'?'good':'bad'}">${guard} · ${confidence}</span></div>
  <div class="ljSummary"><div><small>RAW SETUPS</small><b>${raw.length}</b></div><div><small>FOLDS</small><b>${windows.length}</b></div><div><small>BEST OOS AVG</small><b>${top?top.oosAvg.toFixed(2)+'R':'—'}</b></div><div><small>FOLDS POSITIVE</small><b>${top?Math.round(top.consistency*100)+'%':'—'}</b></div></div>
  <div class="adaptiveGuard"><b>WALK-FORWARD GUARD:</b> kandidat harus bertahan pada beberapa periode OOS. Satu periode bagus tidak cukup untuk dianggap stabil.</div>
  <div class="contextRows"><div><span>Candidate</span><b>${top?`Score ${top.c.score} · Gap ${top.c.gap} · ATR ${top.c.atr} · RR ${top.c.rr} · ${top.c.bar} bars`:'—'}</b></div><div><span>Train average</span><b>${top?top.trainAvg.toFixed(2)+'R':'—'}</b></div><div><span>OOS average</span><b>${top?top.oosAvg.toFixed(2)+'R':'—'}</b></div><div><span>Worst OOS DD</span><b>${top?(top.worstDD*100).toFixed(1)+'%':'—'}</b></div></div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">FOLD RESULTS</div>${foldRows}</div><div><div class="sxeIntelTitle">TOP STABLE CANDIDATES</div>${topRows||'<div class="note">—</div>'}</div></div>
  <div class="ljFeedback">${guard==='PASS'?'Kandidat teratas bertahan pada mayoritas window OOS dan melewati guard dasar. Ini tetap bukti historis, bukan jaminan profit masa depan.':'Validation menahan rekomendasi karena konsistensi OOS, sample, atau drawdown belum cukup kuat. Jangan menaikkan risiko hanya karena satu periode terlihat bagus.'}</div>`;
}


function monteCarloRows(){
  return researchRows().map(x=>Number(x.realizedR)).filter(Number.isFinite);
}
function seededRandom(seed){
  let x=(seed>>>0)||0x9e3779b9;
  return ()=>{x|=0;x=(x+0x6D2B79F5)|0;let t=Math.imul(x^(x>>>15),1|x);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}
function percentile(sorted,p){if(!sorted.length)return null;const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo)}
function buildMonteCarloV561(){
  const rs=monteCarloRows();
  const riskPct=Math.max(.05,Math.min(5,Number($('risk')?.value||1)));
  const risk=riskPct/100;
  const runs=2000;
  if(rs.length<20)return {state:'WAIT',reason:`Minimal 20 CLOSED outcomes diperlukan. Saat ini ${rs.length}.`,sample:rs.length,riskPct,runs};
  const rng=seededRandom(Math.floor(rs.reduce((a,b)=>a+b,0)*1000)^rs.length);
  const finals=[],dds=[],streaks=[];
  for(let run=0;run<runs;run++){
    let eq=1,peak=1,maxDD=0,lossStreak=0,maxLossStreak=0;
    for(let i=0;i<rs.length;i++){
      const r=rs[Math.floor(rng()*rs.length)];
      eq*=Math.max(.01,1+r*risk);
      peak=Math.max(peak,eq);maxDD=Math.max(maxDD,(peak-eq)/Math.max(peak,1e-9));
      if(r<0){lossStreak++;maxLossStreak=Math.max(maxLossStreak,lossStreak)}else lossStreak=0;
    }
    finals.push((eq-1)*100);dds.push(maxDD*100);streaks.push(maxLossStreak);
  }
  finals.sort((a,b)=>a-b);dds.sort((a,b)=>a-b);streaks.sort((a,b)=>a-b);
  const ruin20=dds.filter(x=>x>=20).length/runs, ruin30=dds.filter(x=>x>=30).length/runs;
  const state=percentile(dds,.95)<20?'STRESS OK':percentile(dds,.95)<30?'WATCH':'HIGH RISK';
  const confidence=rs.length>=60?'HIGH':rs.length>=35?'MEDIUM':'LOW';
  return {state,confidence,sample:rs.length,riskPct,runs,finals,dds,streaks,medianFinal:percentile(finals,.5),p05Final:percentile(finals,.05),p95Final:percentile(finals,.95),medianDD:percentile(dds,.5),p95DD:percentile(dds,.95),p99DD:percentile(dds,.99),p95Streak:percentile(streaks,.95),ruin20,ruin30,avgR:rs.reduce((a,b)=>a+b,0)/rs.length};
}
function renderMonteCarloV561(){
  const host=$('monteCarloV561');if(!host)return;
  const o=buildMonteCarloV561();
  if(o.state==='WAIT'){host.innerHTML=`<div class="ljHead"><div><span class="label">V5.61 MONTE CARLO RISK TEST</span><b>Stress test urutan outcome historis</b></div><span class="sxeBadge bad">WAIT</span></div><div class="ljFeedback">${o.reason}</div><div class="note">Monte Carlo membutuhkan minimal 20 CLOSED outcomes. Hasil simulasi tidak menjamin distribusi future return.</div>`;return;}
  const tone=o.state==='STRESS OK'?'good':o.state==='WATCH'?'gold':'bad';
  const pct=v=>Number.isFinite(v)?v.toFixed(1)+'%':'—';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.61 MONTE CARLO RISK TEST</span><b>${o.runs.toLocaleString()} simulasi · bootstrap outcome historis</b></div><span class="sxeBadge ${tone}">${o.state} · ${o.confidence}</span></div>
  <div class="ljSummary"><div><small>CLOSED SAMPLE</small><b>${o.sample}</b></div><div><small>RISK / TRADE</small><b>${o.riskPct.toFixed(2)}%</b></div><div><small>MEDIAN FINAL</small><b>${pct(o.medianFinal)}</b></div><div><small>95% MAX DD</small><b>${pct(o.p95DD)}</b></div></div>
  <div class="contextRows"><div><span>Final return · 5th percentile</span><b>${pct(o.p05Final)}</b></div><div><span>Final return · median</span><b>${pct(o.medianFinal)}</b></div><div><span>Final return · 95th percentile</span><b>${pct(o.p95Final)}</b></div><div><span>Max DD · median / 95th / 99th</span><b>${pct(o.medianDD)} / ${pct(o.p95DD)} / ${pct(o.p99DD)}</b></div><div><span>95th percentile losing streak</span><b>${o.p95Streak.toFixed(0)} trades</b></div><div><span>Simulated DD ≥ 20% / ≥ 30%</span><b>${pct(o.ruin20)} / ${pct(o.ruin30)}</b></div></div>
  <div class="adaptiveGuard"><b>INTERPRETASI:</b> Simulasi hanya mengacak ulang realized-R historis dengan risk ${o.riskPct.toFixed(2)}% per trade. Angka DD ≥20%/30% adalah frekuensi simulasi melewati ambang tersebut, bukan probabilitas kerugian masa depan yang terjamin.</div>
  <div class="note">Monte Carlo tidak mengklaim urutan trade masa depan akan mengikuti histori. Gunakan hasil ini sebagai stress test untuk menentukan apakah risk-per-trade terlalu agresif, bukan sebagai target profit.</div>`;
}

function renderStrategyResearch(){
  const host=$('strategyResearch'); if(!host)return;
  const r=buildStrategyResearch(), b=r.baseline, rec=r.recommendation;
  const badge=r.learning==='HIGH'?'good':r.learning==='MEDIUM'?'gold':'bad';
  const rows=r.candidates.map(x=>`<div class="ljRow"><span>${x.label}</span><b>${x.test.avgR==null?'—':x.test.avgR.toFixed(2)+'R'}</b><small>OOS ${x.test.n} · ${x.test.rate==null?'—':Math.round(x.test.rate*100)+'%'} · Train ${x.train.avgR==null?'—':x.train.avgR.toFixed(2)+'R'}</small></div>`).join('')||'<div class="note">Belum cukup closed signal untuk penelitian.</div>';
  const weak=r.weak.map(x=>`<div class="ljRow"><span>${x.label}</span><b class="bad">${x.test.avgR==null?'—':x.test.avgR.toFixed(2)+'R'}</b><small>OOS ${x.test.n} · DD ${x.test.maxDD.toFixed(2)}R</small></div>`).join('')||'<div class="note">—</div>';
  const recText=rec?`Kandidat <b>${rec.label}</b> memiliki OOS ${rec.test.avgR.toFixed(2)}R vs baseline ${b.test.avgR==null?'—':b.test.avgR.toFixed(2)+'R'}, dengan confidence ${rec.confidence}. Ini hasil penelitian historis, bukan jaminan hasil berikutnya.`:'Belum ada kandidat yang memenuhi syarat untuk rekomendasi. Sistem sengaja menahan rekomendasi jika sample, OOS, atau stabilitas belum cukup.';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.57 STRATEGY RESEARCH LAB</span><b>Walk-forward research · no hindsight</b></div><span class="sxeBadge ${badge}">${r.learning} DATA CONFIDENCE</span></div>
  <div class="ljSummary"><div><small>CLOSED</small><b>${r.rows.length}</b></div><div><small>BASE OOS R</small><b>${b.test.avgR==null?'—':b.test.avgR.toFixed(2)+'R'}</b></div><div><small>BASE HIT</small><b>${b.test.rate==null?'—':Math.round(b.test.rate*100)+'%'}</b></div><div><small>OVERFIT GUARD</small><b class="${r.overfit?'bad':'good'}">${r.overfit?'HOLD':'PASS'}</b></div></div>
  <div class="adaptiveGuard"><b>RESEARCH:</b> Data dibagi kronologis 70% train / 30% out-of-sample. Kandidat hanya dibandingkan setelah minimum sample terpenuhi. Tidak ada parameter live yang diubah otomatis.</div>
  <div class="ljFeedback">${recText}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">OOS CANDIDATES</div>${rows}</div><div><div class="sxeIntelTitle">WEAK / UNSTABLE CANDIDATES</div>${weak}</div></div>
  <div class="note" style="margin-top:8px">Research Lab menggunakan outcome signal yang sudah tercatat dan realized R yang tersedia. Ia bukan backtest candle-level dan tidak membuktikan profit masa depan.</div>`;
}

function renderStrategyIntelligence(){
  const host=$('strategyIntelligence'); if(!host)return;
  const a=buildStrategyIntelligence(), m=a.matchStats;
  const active=a.active;
  const statusClass=a.status==='SUPPORTED'?'good':a.status==='MIXED'?'gold':'bad';
  const top=a.groups.map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">Belum cukup pola dengan minimal 4 sample.</div>';
  const weak=a.weak.map(x=>`<div class="ljRow"><span>${x.key}</span><b class="bad">${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">Belum ada pola lemah yang cukup sample.</div>';
  const side=a.sideStats.map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">—</div>';
  const regime=a.regimeStats.map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample · ${adaptiveFormatR(x.avgR)}</small></div>`).join('')||'<div class="note">—</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.50 STRATEGY INTELLIGENCE</span><b>Setup aktif vs histori yang mirip</b></div><span class="sxeBadge ${statusClass}">${a.status}</span></div>
  <div class="ljSummary"><div><small>ACTIVE</small><b>${active.side||'WAIT'}</b></div><div><small>REGIME</small><b>${active.regime}</b></div><div><small>MATCH SAMPLE</small><b>${a.matching.length}</b></div><div><small>HIST HIT</small><b>${m.n?Math.round(m.rate*100)+'%':'—'}</b></div></div>
  <div class="adaptiveGuard"><b>SETUP:</b> ${active.side} · ${active.regime} · ${active.sr} · ${active.readiness} · Momentum ${active.momentum}. ${a.status==='SUPPORTED'?'Histori yang mirip menunjukkan dukungan, dengan catatan sample tetap terbatas pada kondisi yang tersedia.':a.status==='WEAK'?'Histori yang mirip menunjukkan hasil kurang konsisten; jangan menganggap pola ini memiliki edge yang tetap.':a.status==='MIXED'?'Hasil histori campuran; tidak ada edge yang cukup jelas dari sample ini.':'Belum cukup histori yang benar-benar mirip untuk menarik kesimpulan.'}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">PATTERN PERFORMANCE</div>${top}</div><div><div class="sxeIntelTitle">PATTERN TO WATCH</div>${weak}</div></div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">BY SIDE</div>${side}</div><div><div class="sxeIntelTitle">BY MARKET REGIME</div>${regime}</div></div>
  <div class="note" style="margin-top:8px">V5.50 adalah lapisan analitik. Status SUPPORTED/WEAK/MIXED bukan prediksi dan tidak mengubah signal BUY/SELL, leverage, SL/TP, atau AUTO TRADE secara otomatis.</div>`;
}

function renderSignalReplay(){
  const host=$('signalReplay'); if(!host)return;
  const rows=getReplayRows();
  if(!rows.length){host.innerHTML='<div class="ljHead"><div><span class="label">V5.56 REPLAY LAB</span><b>Belum ada closed signal</b></div></div><div class="note">Setelah signal selesai, snapshot candle historis akan tersedia untuk replay tanpa hindsight.</div>';return;}
  const selectedKey=$('replaySelect')?.value||rows[0].key;
  const row=rows.find(x=>x.key===selectedKey)||rows[0];
  const oldReveal=Number($('replayReveal')?.value||0);
  const ctx=replayCandleContext(row,oldReveal);
  const f=row.featureSnapshot||{};
  const sideClass=row.side==='BUY'?'replayBuy':'replaySell';
  const fmtC=c=>c?`${fmtIDR(Number(c.o))} → ${fmtIDR(Number(c.c))} · H ${fmtIDR(Number(c.h))} · L ${fmtIDR(Number(c.l))}`:'—';
  const futureTotal=Number(ctx.futureTotal||0);
  const reveal=Math.min(oldReveal,futureTotal);
  const steps=[['T-2','BEFORE',ctx.before.at(-2)],['T-1','PRE-SIGNAL',ctx.before.at(-1)],['T0','SIGNAL',ctx.signal],...ctx.after.slice(0,3).map((c,i)=>[`T+${i+1}`,'REVEAL',c])];
  const timeline=steps.map(([lab,name,c])=>`<div class="replayStep"><b>${lab} · ${name}</b><small>${c?fmtC(c):'Hidden'}</small></div>`).join('');
  const options=rows.slice(0,40).map(x=>`<option value="${String(x.key).replace(/"/g,'&quot;')}" ${x.key===row.key?'selected':''}>${signalTime(x.targetTs||x.ts)} · ${x.side} · ${x.outcome||'—'} · ${Number(x.score||0)}/100</option>`).join('');
  const mtf=Number(f.mtfTotal)>0?`${f.mtfAligned}/${f.mtfTotal}`:'—';
  const grade=replayGrade(row,reveal);
  const blind=reveal===0;
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.56 REPLAY LAB</span><b>Candle-by-candle · ${blind?'BLIND MODE':'REVEALED '+reveal+'/'+futureTotal}</b></div><span class="sxeBadge ${blind?'gold':row.outcome==='HIT'?'good':'bad'}">${blind?'HINDSIGHT OFF':row.outcome||'CLOSED'}</span></div>
  <select id="replaySelect" class="replaySelect">${options}</select>
  <div class="replayGrid"><div class="replayCard"><small>SIGNAL</small><b class="${sideClass}">${row.side} · ${Number(row.score||0)}/100</b></div><div class="replayCard"><small>REALIZED R</small><b>${Number.isFinite(Number(row.realizedR))?Number(row.realizedR).toFixed(2)+'R':'—'}</b></div><div class="replayCard"><small>MTF</small><b>${mtf}</b></div><div class="replayCard"><small>REPLAY GRADE</small><b>${grade.grade}</b></div></div>
  <div class="replayControls"><label><small>REVEAL CANDLE SETELAH SIGNAL</small><input id="replayReveal" type="range" min="0" max="${futureTotal}" value="${reveal}"><span id="replayRevealLabel">${reveal}/${futureTotal}</span></label><button class="btn" id="replayReset">RESET BLIND</button><button class="btn" id="replayRevealNext" ${reveal>=futureTotal?'disabled':''}>+1 CANDLE</button></div>
  <div class="sxeIntelTitle" style="margin-top:10px">REPLAY TIMELINE</div><div class="replayTimeline">${timeline}</div>
  <div class="replayInsight"><b>Blind checkpoint:</b> Saat T0, future candle disembunyikan. Snapshot signal: Body ${Number(f.bodyPct||0).toFixed(1)}% · Upper Wick ${Number(f.upperWickPct||0).toFixed(1)}% · Lower Wick ${Number(f.lowerWickPct||0).toFixed(1)}% · Momentum ${Number(f.momentumScore||0).toFixed(0)} · S/R ${f.context||row.context||'—'}.</div>
  <div class="replayInsight"><b>Audit:</b> ${grade.detail} ${ctx.source==='live-fallback'?' Signal lama tidak memiliki snapshot candle; replay menggunakan data candle yang tersedia saat ini dan diberi label fallback.':''}</div>
  <div class="note">Replay Lab adalah alat evaluasi. Grade bukan prediksi profit dan tidak mengubah signal, leverage, SL/TP, atau AUTO TRADE.</div>`;
  const sel=$('replaySelect'); if(sel)sel.addEventListener('change',()=>renderSignalReplay());
  const slider=$('replayReveal'); if(slider)slider.addEventListener('input',()=>renderSignalReplay());
  const reset=$('replayReset'); if(reset)reset.addEventListener('click',()=>{renderReplayWithReveal(0)});
  const next=$('replayRevealNext'); if(next)next.addEventListener('click',()=>{renderReplayWithReveal(reveal+1)});
}
function renderReplayWithReveal(value){
  const sel=$('replaySelect'); const key=sel?.value;
  renderSignalReplay();
  const slider=$('replayReveal'); if(slider){slider.value=String(Math.max(0,Number(value)||0)); slider.dispatchEvent(new Event('input'));}
  if(key&&$('replaySelect'))$('replaySelect').value=key;
}
function lifecycle2Tone(state){
  return ['INVALIDATED','SL / MISS'].includes(state)?'bad':(['TP1 REACHED','TP / HIT','TP2 REACHED'].includes(state)?'good':'gold');
}
function lifecycle2State(pred){
  if(!pred||!['BUY','SELL'].includes(pred.side))return {state:'WAIT',detail:'Menunggu BUY/SELL terkonfirmasi.'};
  const base=getSignalLifecycle(pred);
  if(base.state==='TP / HIT'||base.state==='SL / MISS'||base.state==='CLOSED')return base;
  const r=pred.riskPlan||buildSmartRiskPlan(pred), price=Number(S.c.at(-1)?.c||0);
  if(!r?.valid)return {state:base.state||'ACTIVE',detail:base.detail||'Risk plan belum valid.'};
  const tp2=Number(r.tp2||0), sl=Number(r.sl||0), tp1=Number(r.tp1||0);
  if(pred.side==='BUY'){
    if(tp2>0&&price>=tp2)return {state:'TP2 REACHED',detail:`Harga ${fmtIDR(price)} sudah mencapai TP2 ${fmtIDR(tp2)}.`};
    if(tp1>0&&price>=tp1)return {state:'TP1 REACHED',detail:`Harga ${fmtIDR(price)} sudah mencapai TP1 ${fmtIDR(tp1)}.`};
    if(sl>0&&price<=sl)return {state:'INVALIDATED',detail:`Harga ${fmtIDR(price)} berada di bawah invalidation/SL ${fmtIDR(sl)}.`};
  }else{
    if(tp2>0&&price<=tp2)return {state:'TP2 REACHED',detail:`Harga ${fmtIDR(price)} sudah mencapai TP2 ${fmtIDR(tp2)}.`};
    if(tp1>0&&price<=tp1)return {state:'TP1 REACHED',detail:`Harga ${fmtIDR(price)} sudah mencapai TP1 ${fmtIDR(tp1)}.`};
    if(sl>0&&price>=sl)return {state:'INVALIDATED',detail:`Harga ${fmtIDR(price)} berada di atas invalidation/SL ${fmtIDR(sl)}.`};
  }
  const readiness=pred.readiness?.label||getEntryReadiness(pred).label||'WAIT';
  if(readiness==='READY')return {state:'READY',detail:`Signal ${pred.side} memenuhi readiness saat ini dan belum mencapai target/invalidation.`};
  if(readiness==='WAIT-PULLBACK'||readiness==='LATE')return {state:'WAIT ENTRY',detail:`Signal ${pred.side} ada, tetapi entry belum ideal (${readiness}).`};
  return {state:'ACTIVE',detail:`Signal ${pred.side} aktif; belum mencapai TP atau invalidation.`};
}
function updateLifecycle2(pred){
  const current=lifecycle2State(pred); if(!current||current.state==='WAIT')return current;
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf), anchorTs=Number(pred.anchorTs||pred.targetTs||S.c.at(-1)?.t||0), targetTs=Number(pred.targetTs||anchorTs+ms);
  const idx=SIGNALS.findIndex(x=>x.symbol===S.symbol&&x.tf===tf&&Number(x.targetTs)===targetTs);
  if(idx<0)return current;
  const row=SIGNALS[idx]; const history=Array.isArray(row.lifecycleHistory)?row.lifecycleHistory:[];
  const last=history.at(-1);
  if(!last||last.state!==current.state){
    history.push({state:current.state,detail:current.detail,at:Date.now(),price:Number(S.c.at(-1)?.c||0)});
    SIGNALS[idx]={...row,lifecycleHistory:history.slice(-20),lifecycleState:current.state,lifecycleUpdatedAt:Date.now()};
    persistSignals();
  }
  return {...current,row:SIGNALS[idx]};
}
function renderSignalLifecycle2(pred){
  const host=$('signalLifecycle2'); if(!host)return;
  const x=updateLifecycle2(pred);
  if(!x||x.state==='WAIT'){host.innerHTML='<div class="ljHead"><div><span class="label">V5.55 SIGNAL LIFECYCLE 2.0</span><b>Menunggu signal</b></div></div><div class="note">Lifecycle akan mencatat perubahan state tanpa menulis ulang signal lama.</div>';return;}
  const row=x.row, history=Array.isArray(row?.lifecycleHistory)?row.lifecycleHistory:[];
  const events=history.slice().reverse().slice(0,8).map(e=>`<div class="lifecycleEvent"><span>${signalTime(e.at)}</span><b>${e.state}</b><small>${e.detail||''}</small></div>`).join('')||'<div class="note">Belum ada transition tersimpan.</div>';
  const r=pred.riskPlan||buildSmartRiskPlan(pred);
  const prices=r?.valid?`Entry ${fmtIDR(r.entry)} · SL ${fmtIDR(r.sl)} · TP1 ${fmtIDR(r.tp1)} · TP2 ${fmtIDR(r.tp2)}`:'Risk plan belum valid';
  host.innerHTML=`<div class="ljHead"><div><span class="label">V5.55 SIGNAL LIFECYCLE 2.0</span><b>${pred.side} · ${x.state}</b></div><span class="sxeBadge ${lifecycle2Tone(x.state)}">${x.state}</span></div>
  <div class="ljSummary"><div><small>CURRENT STATE</small><b>${x.state}</b></div><div><small>SIGNAL</small><b>${pred.side}</b></div><div><small>SCORE</small><b>${Number(pred.score||0)}/100</b></div><div><small>EVENTS</small><b>${history.length}</b></div></div>
  <div class="ljFeedback">${x.detail}</div>
  <div class="sxeIntelTitle" style="margin-top:10px">TRADE PLAN SNAPSHOT</div><div class="note">${prices}</div>
  <div class="sxeIntelTitle" style="margin-top:10px">STATE TIMELINE</div><div class="lifecycleTimeline">${events}</div>
  <div class="note" style="margin-top:8px">Lifecycle 2.0 mencatat perubahan state untuk audit. Ia tidak mengubah signal, leverage, SL/TP, atau membuka/menutup posisi secara otomatis.</div>`;
}

function renderAnalytics(){
  const host=$('signalAnalytics'); if(!host)return;
  const s=getAnalyticsStats(); const rate=s.decided?s.hit/s.decided:null;
  const row=(x)=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample</small></div>`;
  const hist=s.recent.map(x=>`<div class="analyticsHistory"><span>${signalTime(x.targetTs||x.ts).replace(' WIB','')}</span><b class="${x.side==='BUY'?'buy':'sell'}">${x.side}</b><span>${Number(x.score||0)}/100</span><span>${Number.isFinite(Number(x.realizedR))?Number(x.realizedR).toFixed(2)+'R':'—'}</span></div>`).join('')||'<div class="note">Belum ada signal closed.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">ANALYTICS LAYER</span><b>Performance Intelligence</b></div><span class="sxeBadge ${rate==null?'gold':rate>=.6?'good':'bad'}">${s.decided?Math.round(rate*100)+'% HIT':'BELUM ADA DATA'}</span></div>
  <div class="ljSummary"><div><small>AVG CONFIDENCE</small><b>${s.avgConf==null?'—':Math.round(s.avgConf)+'/100'}</b></div><div><small>AVG REALIZED R</small><b>${s.closed?s.avgR.toFixed(2)+'R':'—'}</b></div><div><small>MAX LOSING STREAK</small><b>${s.maxLosing}</b></div><div><small>MAX R DRAWDOWN</small><b>${s.closed?s.maxDD.toFixed(2)+'R':'—'}</b></div></div>
  <div class="analyticsGrid"><div><div class="sxeIntelTitle">PERFORMANCE BY TIMEFRAME</div>${s.byTf.slice(0,6).map(row).join('')||'<div class="note">Belum ada sample.</div>'}</div><div><div class="sxeIntelTitle">PERFORMANCE BY MARKET REGIME</div>${s.byRegime.slice(0,6).map(row).join('')||'<div class="note">Belum ada sample.</div>'}</div><div><div class="sxeIntelTitle">PERFORMANCE BY SIDE</div>${s.bySide.map(row).join('')||'<div class="note">Belum ada sample.</div>'}</div></div>
  <div class="sxeIntelTitle" style="margin-top:10px">CONFIDENCE / REALIZED-R HISTORY</div><div class="analyticsHistoryHead"><span>TIME</span><span>SIDE</span><span>SCORE</span><span>REALIZED R</span></div>${hist}
  <div class="note" style="margin-top:8px">TP Probability di sini menggunakan rasio outcome HIT pada sample yang sudah closed; bukan prediksi pasti untuk trade berikutnya.</div>`;
}
function renderLearningJournal(){
  const host=$('learningJournal'); if(!host)return;
  const s=getLearningJournalStats();
  const tone=s.rate==null?'gold':s.rate>=.6?'good':s.rate>=.45?'gold':'bad';
  const regimeRows=s.regimes.slice(0,4).map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample</small></div>`).join('')||'<div class="note">Belum ada sample.</div>';
  const contextRows=s.contexts.slice(0,4).map(x=>`<div class="ljRow"><span>${x.key}</span><b>${Math.round(x.rate*100)}%</b><small>${x.n} sample</small></div>`).join('')||'<div class="note">Belum ada sample.</div>';
  const recent=s.recent.slice(0,8).map(x=>`<div class="ljRecent"><span>${signalTime(x.targetTs||x.ts).replace(' WIB','')}</span><b class="${x.side==='BUY'?'buy':'sell'}">${x.side}</b><span>${x.outcome||'—'}</span><span>${Number.isFinite(Number(x.realizedR))?`${Number(x.realizedR).toFixed(2)}R`:'—'}</span></div>`).join('')||'<div class="note">Belum ada histori tertutup.</div>';
  host.innerHTML=`<div class="ljHead"><div><span class="label">LEARNING &amp; JOURNAL</span><b>Outcome Feedback Loop</b></div><span class="sxeBadge ${tone}">${s.decided} CLOSED</span></div>
  <div class="ljSummary"><div><small>HIT RATE</small><b>${s.rate==null?'—':Math.round(s.rate*100)+'%'}</b></div><div><small>HIT / MISS</small><b>${s.hit} / ${s.miss}</b></div><div><small>AVG REALIZED R</small><b>${Number.isFinite(s.avgR)?s.avgR.toFixed(2)+'R':'—'}</b></div><div><small>TOTAL JOURNAL</small><b>${s.total}</b></div></div>
  <div class="ljFeedback">${learningFeedbackText(s)}</div>
  <div class="ljGrid"><div><div class="sxeIntelTitle">PERFORMANCE BY REGIME</div>${regimeRows}</div><div><div class="sxeIntelTitle">PERFORMANCE BY S/R CONTEXT</div>${contextRows}</div></div>
  <div class="sxeIntelTitle" style="margin-top:10px">RECENT SIGNAL JOURNAL</div><div class="ljRecentHead"><span>TIME</span><span>SIDE</span><span>OUTCOME</span><span>R</span></div>${recent}`;
}
function freezeNextCandlePrediction(anchor){
  if(!anchor||S.c.length<36)return null;
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf);
  const targetTs=Number(anchor.t)+ms;
  const closed=S.c.filter(x=>Number(x.t)<=Number(anchor.t));
  if(closed.length<35)return null;
  // At candle close this is the same FINAL SIGNAL engine used by the rest of the UI.
  const t=adaptivePredictiveCandle(closed);
  const readiness=getEntryReadiness(t);
  const riskPlan=buildSmartRiskPlan(t);
  const key=`${S.symbol}:${tf}:${targetTs}`;
  const row={
    key,ts:Number(anchor.t),anchorTs:Number(anchor.t),targetTs,symbol:S.symbol,tf,strategyVersion:captureStrategyVersion().current.id,
    side:t.side,score:t.score,gap:Number(t.gap||0),strength:t.strength,reason:t.reason,
    learning:t.learning||null,readiness,riskPlan,quality:getSignalQuality(t,readiness,riskPlan),mtf:{...S.mtf},
    featureSnapshot:buildSignalFeatureSnapshot({...t,readiness,riskPlan}),
    replayCandles:S.c.filter(x=>Number(x.t)<=Number(anchor.t)).slice(-21).map(c=>({t:Number(c.t),o:Number(c.o),h:Number(c.h),l:Number(c.l),c:Number(c.c),v:Number(c.v||0)})).concat([{t:targetTs,hidden:true}]), replaySignalIndex:20,
    marketRegime:(()=>{try{return getMarketRegime()}catch{return {regime:'UNKNOWN',label:'UNKNOWN'}}})(),
    context:t.sr?.context||'NO_LEVEL',support:t.sr?.support,resistance:t.sr?.resistance,
    predictedAt:`Dibekukan saat close ${signalTime(anchor.t)}`,
    status:'PENDING',outcome:null,actual:null,actualOpen:null,actualClose:null,actualMovePct:null,lifecycleState:'FORMING',lifecycleHistory:[{state:'FORMING',detail:`Setup dibekukan pada ${signalTime(anchor.t)}; menunggu candle target.`,at:Date.now(),price:Number(anchor.c||0)}]
  };
  const idx=SIGNALS.findIndex(x=>x.key===key);
  if(idx>=0)return SIGNALS[idx];
  SIGNALS.unshift(row);SIGNALS=SIGNALS.slice(0,300);persistSignals();return row;
}
function evaluateClosedCandle(c){
  if(!c)return;
  const tf=$('signalTf')?.value||S.tf, targetTs=Number(c.t);
  const idx=SIGNALS.findIndex(x=>x.symbol===S.symbol&&x.tf===tf&&Number(x.targetTs)===targetTs&&x.status==='PENDING');
  if(idx<0)return;
  const row=SIGNALS[idx], actual=actualCandleSide(c), outcome=outcomeForPrediction(row.side,actual);
  const movePct=((Number(c.c)-Number(c.o))/Math.max(1e-12,Number(c.o)))*100;
  const riskDist=Number(row.riskPlan?.riskDistance||0);
  const realizedR=riskDist>0?(row.side==='BUY'?(Number(c.c)-Number(c.o)):(Number(c.o)-Number(c.c)))/riskDist:null;
  const finalState=outcome==='HIT'?'TP / HIT':outcome==='MISS'?'SL / MISS':'CLOSED'; const hist=Array.isArray(row.lifecycleHistory)?row.lifecycleHistory.slice():[]; hist.push({state:finalState,detail:`Outcome ${outcome||'CLOSED'} pada candle target ${signalTime(c.t)}.`,at:Date.now(),price:Number(c.c||0)}); const replayCandles=Array.isArray(row.replayCandles)?row.replayCandles.map(x=>Number(x.t)===targetTs?{t:Number(c.t),o:Number(c.o),h:Number(c.h),l:Number(c.l),c:Number(c.c),v:Number(c.v||0)}:x):row.replayCandles; SIGNALS[idx]={...row,status:'CLOSED',outcome,actual,actualOpen:Number(c.o),actualClose:Number(c.c),actualMovePct:movePct,realizedR,evaluatedAt:Date.now(),lifecycleState:finalState,lifecycleHistory:hist.slice(-20),replayCandles};
  persistSignals();
}
function recordPredictionSignal(){
  // IMPORTANT: Signal Drop is frozen at candle close. It never rewrites an old
  // prediction when the live candle moves, so HIT/MISS remains auditable.
  if(S.c.length<36)return;
  const last=S.c.at(-1);
  const now=Date.now();
  const liveIsCurrent=last && now>=Number(last.t) && now<Number(last.t)+tfMillis(S.tf);
  const anchor=liveIsCurrent?S.c.at(-2):last;
  if(anchor)freezeNextCandlePrediction(anchor);
  renderSignalDrop();
}
function recordClosedSignal(c){
  if(!c)return;
  paperResolveClosedCandle(c);
  paperQueueFromClosedCandle(c);
  simResolve(c);
  simQueue(c);
  evaluateClosedCandle(c);
  const row=freezeNextCandlePrediction(c);
  renderSignalDrop();
  if(row) scheduleAutoTrade(row);
}
async function scheduleAutoTrade(row){
  if(!AUTO_ENTRY||MANUAL_ENTRY_STOP||autoBusy||autoProtectBusy||!row)return;
  const safety=buildKillSwitchIntelligence();
  if(safety.state==='PAUSE'){setAutoStatus(`AUTO PAUSE: ${safety.issues.slice(0,2).map(x=>x.reason).join(' · ')}`,'bad');renderKillSwitchIntelligence();return;}
  if(row.side==='WAIT')return;
  if(!row.readiness?.ready)return;
  if(!row.riskPlan?.valid || Number(row.riskPlan?.rr1||0)<1.5)return;
  if(Number(row.quality?.score||0)<70)return;
  if(Number(row.score||0)<AUTO_CONFIRM_SCORE)return;
  const edgeGate=getProfitabilityGate(row);
  if(edgeGate.state!=='READY'){setAutoStatus(`AUTO EDGE GATE: ${edgeGate.state} · ${edgeGate.reason}`,'wait');return;}
  const gap=Number(row.gap||0);
  if(gap<AUTO_CONFIRM_GAP)return;
  /* One strong closed-candle signal is enough for AUTO. Do not force a second-candle wait. */
  if(lastAutoSignalKey===row.key)return;
  const now=Date.now();
  if(Date.now()<AUTO_COOLDOWN_UNTIL){setAutoStatus('AUTO: jeda pengaman setelah perubahan posisi · menunggu sinyal berikutnya','wait');return;}
  if(AUTO_LAST_ATTEMPT.key===row.key && now-AUTO_LAST_ATTEMPT.at<AUTO_RETRY_MS)return;
  AUTO_LAST_ATTEMPT={key:row.key,at:now};
  autoBusy=true;
  try{
    await refreshAccount();
    const p=S.accountPosition, current=p&&Math.abs(Number(p.positionAmt||0))>0?(Number(p.positionAmt)>0?'BUY':'SELL'):null;
    if(current===row.side){setAutoStatus(`AUTO: posisi ${row.side} tetap berjalan · sinyal ${row.score}/100`,'good');return;}
    if(current&&current!==row.side){
      setAutoStatus(`AUTO: sinyal berlawanan terkonfirmasi · menutup ${current}; entry balik ditunda satu candle`,'wait');
      await closePosition({silent:true,auto:true});
      AUTO_COOLDOWN_UNTIL=Date.now()+AUTO_PROTECT_COOLDOWN_MS;
      try{localStorage.setItem('obsidian_auto_cooldown',String(AUTO_COOLDOWN_UNTIL))}catch{}
      await refreshAccount();
      if(S.accountPosition&&Math.abs(Number(S.accountPosition.positionAmt||0))>0)throw Error('Posisi belum flat setelah close; entry baru dikunci.');
      setAutoStatus(`AUTO: posisi ${current} tertutup · menunggu candle berikutnya sebelum ${row.side}`,'wait');
      return;
    }
    if(!S.accountPosition||Math.abs(Number(S.accountPosition.positionAmt||0))===0){
      const fresh=getFinalSignal();
      const freshEdge=getProfitabilityGate(fresh); const freshDecision=buildUnifiedDecision(fresh);
      if(freshDecision.state!=='READY'){setAutoStatus(`AUTO WAIT: Decision Engine ${freshDecision.state} · ${freshDecision.reasons.slice(0,2).join(' · ')||'guard belum lolos'}`,'wait');return;}
      if(fresh.side!==row.side || !fresh.readiness?.ready || Number(fresh.quality?.score||0)<70 || !fresh.riskPlan?.valid || Number(fresh.score||0)<AUTO_CONFIRM_SCORE || Number(fresh.gap||0)<AUTO_CONFIRM_GAP || freshEdge.state!=='READY'){setAutoStatus(`AUTO: signal/entry readiness berubah · ${fresh.side} ${fresh.score||0}/100 · ENTRY ${fresh.readiness?.label||'WAIT'} · menunggu sinkron…`,'wait');return;}
      const timing=entryTimingGuard(row.side,fresh);
      if(!timing.ok){setAutoStatus(`AUTO WAIT: ${timing.reason}`,'wait');return;}
      setAutoStatus(`AUTO: membuka ${row.side} · skor ${fresh.score}/100 · timing entry OK…`,'wait');
      await order(row.side,{auto:true});
      await refreshAccount();
      const actual=S.accountPosition&&Math.abs(Number(S.accountPosition.positionAmt||0))>0?(Number(S.accountPosition.positionAmt)>0?'BUY':'SELL'):null;
      if(actual===row.side){
        lastAutoSignalKey=row.key;
        try{localStorage.setItem('obsidian_auto_last_signal',row.key)}catch{}
        setAutoStatus(`AUTO AKTIF: ${actual} · BINANCE POSITION TERDETEKSI · skor ${row.score}/100`,'good');
      }else{
        setAutoStatus('AUTO: order belum terdeteksi · akan mencoba lagi','bad');
      }
    }
  }catch(e){setAutoStatus(`AUTO GAGAL: ${e.message}`,'bad');}
  finally{autoBusy=false;}
}
async function autoRecoverPendingSignal(){
  if(!AUTO_ENTRY||MANUAL_ENTRY_STOP||autoBusy||autoProtectBusy)return;
  if(Date.now()<AUTO_COOLDOWN_UNTIL)return;
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf), now=Date.now();
  const live=S.c.at(-1);
  const liveCandle=live && now>=Number(live.t) && now<Number(live.t)+ms;
  const anchor=liveCandle?S.c.at(-2):live;
  if(!anchor)return;
  const row=SIGNALS.find(x=>x.symbol===S.symbol&&x.tf===tf&&x.status==='PENDING'&&Number(x.targetTs)===Number(anchor.t)+ms);
  if(!row||row.side==='WAIT')return;
  if(now<Number(row.targetTs)||now>=Number(row.targetTs)+ms)return;
  await scheduleAutoTrade(row);
}

function resetAutoProtect(){AUTO_PROTECT={key:null,side:null,peak:0,armed:false,lastActionAt:0};}
function currentPositionSide(){const p=S.accountPosition;if(!p||Math.abs(Number(p.positionAmt||0))<=0)return null;return Number(p.positionAmt)>0?'BUY':'SELL';}
async function autoProfitProtect(){
  if(!AUTO_ENTRY||MANUAL_ENTRY_STOP||autoProtectBusy||autoBusy)return;
  const p=S.accountPosition;
  if(!p||Math.abs(Number(p.positionAmt||0))<=0){resetAutoProtect();return;}
  const side=currentPositionSide();
  const up=Number(p.unRealizedProfit||0);
  if(!Number.isFinite(up))return;
  // Simple cut-loss: close as soon as the running loss reaches the configured IDR limit.
  const lossCutUSDT=AUTO_LOSS_CUT_IDR/USDT_IDR_RATE;
  if(up<=-lossCutUSDT){
    if(Date.now()-AUTO_PROTECT.lastActionAt<3000)return;
    AUTO_PROTECT.lastActionAt=Date.now(); autoProtectBusy=true;
    try{
      setAutoStatus(`AUTO PROTECT: loss ${fmtUSDT(up)} melewati batas · CLOSE…`,'bad');
      await closePosition({silent:true,auto:true});
      await refreshAccount();
      AUTO_COOLDOWN_UNTIL=Date.now()+AUTO_PROTECT_COOLDOWN_MS;
      try{localStorage.setItem('obsidian_auto_cooldown',String(AUTO_COOLDOWN_UNTIL))}catch{}
      lastAutoSignalKey=null;try{localStorage.removeItem('obsidian_auto_last_signal')}catch{};setAutoStatus('AUTO PROTECT: posisi rugi ditutup · tunggu konfirmasi baru / re-entry searah','wait');
    }catch(e){setAutoStatus(`AUTO CUT LOSS GAGAL: ${e.message}`,'bad');}
    finally{autoProtectBusy=false;}
    return;
  }
  const qty=Math.abs(Number(p.positionAmt||0));
  const key=[S.symbol,side,Number(p.entryPrice||0).toFixed(8),qty.toFixed(8)].join('|');
  if(AUTO_PROTECT.key!==key){AUTO_PROTECT={key,side,peak:up,armed:false,lastActionAt:0};}
  if(up>AUTO_PROTECT.peak)AUTO_PROTECT.peak=up;
  const armUSDT=AUTO_PROFIT_ARM_IDR/USDT_IDR_RATE;
  if(AUTO_PROTECT.peak>=armUSDT)AUTO_PROTECT.armed=true;
  if(!AUTO_PROTECT.armed)return;
  const lockUSDT=Math.max(armUSDT*0.25,AUTO_PROTECT.peak*(1-AUTO_PROFIT_GIVEBACK_PCT/100));
  const giveback=up<=lockUSDT;
  if(!giveback)return;
  if(Date.now()-AUTO_PROTECT.lastActionAt<8000)return;
  AUTO_PROTECT.lastActionAt=Date.now(); autoProtectBusy=true;
  try{
    setAutoStatus(`AUTO PROTECT: profit puncak ${fmtUSDT(AUTO_PROTECT.peak)} turun ke ${fmtUSDT(up)} · menutup untuk mengunci profit…`,'wait');
    await closePosition({silent:true,auto:true});
    await refreshAccount();
    if(S.accountPosition&&Math.abs(Number(S.accountPosition.positionAmt||0))>0){setAutoStatus('AUTO PROTECT: posisi belum flat, entry baru ditahan','bad');return;}
    AUTO_COOLDOWN_UNTIL=Date.now()+AUTO_PROTECT_COOLDOWN_MS;
    try{localStorage.setItem('obsidian_auto_cooldown',String(AUTO_COOLDOWN_UNTIL))}catch{}
    lastAutoSignalKey=null;try{localStorage.removeItem('obsidian_auto_last_signal')}catch{};setAutoStatus('AUTO PROTECT: profit dikunci · menunggu konfirmasi searah berikutnya','wait');
  }catch(e){setAutoStatus(`AUTO PROTECT GAGAL: ${e.message}`,'bad');}
  finally{autoProtectBusy=false;}
}
function setAutoStatus(msg,cls='wait'){const el=$('autoTradeStatus');if(el){el.textContent=msg;el.className='note '+cls;}}
function refreshSignalFromCurrent(){recordPredictionSignal()}
function scheduleLivePrediction(){/* Frozen Signal Drop: no realtime rewriting. */}
let mtfBusy=false;
async function mtf(){if(mtfBusy)return;mtfBusy=true;try{let tfs=['1m','5m','15m','1h','4h'];const rows=await Promise.all(tfs.map(tf=>jsonFetch(`/api/klines?symbol=${S.symbol}&interval=${tf}&limit=180`).then(d=>({tf,c:(d||[]).map(x=>({o:+x[1],h:+x[2],l:+x[3],c:+x[4]}))}))));S.mtf={};rows.forEach(x=>{let a=x.c.map(z=>z.c),r=RSI(a).at(-1),e20=EMA(a,20).at(-1),e50=EMA(a,50).at(-1),ad=ADX(x.c).at(-1),dir=e20>e50?'BULL':'BEAR';S.mtf[x.tf]={dir,r,ad};});updateAITrend();if(document.querySelector('.tab.active')?.dataset.tab==='confluence')render('confluence');}catch{}finally{mtfBusy=false}}
function normalizePositionSide(side){const v=String(side||'').toUpperCase();if(v==='BUY'||v==='LONG')return 'LONG';if(v==='SELL'||v==='SHORT')return 'SHORT';throw Error(`Arah order tidak valid: ${side}`)}
async function order(side,opts={}){
  side=normalizePositionSide(side);
  const isAuto=!!opts.auto;
  if(isAuto&&!AUTO_ENTRY)return;
  if(!isAuto&&!window.__manualOrderClick&&AUTO_ENTRY===true)return;
  if(S.accountPosition&&Math.abs(Number(S.accountPosition.positionAmt||0))>0)return alert(`Masih ada posisi Binance ${Number(S.accountPosition.positionAmt)>0?'LONG':'SHORT'} ${Math.abs(Number(S.accountPosition.positionAmt)).toFixed(6)} BTC. Tutup posisi aktif dulu.`);
  const cp=capitalProtectionCheck(); if(!cp.ok){const msg=cp.reason||'Capital Protection aktif'; if(isAuto)setAutoStatus(msg,'bad'); else alert(msg); return;}
  const g=entryGuard(side);if(!g.ok){alert(g.reason);return}
  const fresh=getFinalSignal();
  // Signal UI uses BUY/SELL while the order engine uses LONG/SHORT.
  // Normalize both before comparing so a valid BUY signal is not rejected as 'not LONG'.
  const freshOrderSide=fresh.side==='BUY'?'LONG':fresh.side==='SELL'?'SHORT':null;
  // Manual BUY/SELL is intentionally not blocked by the signal guard. The button is the user's explicit direction.
  // AUTO still requires the fresh realtime signal to match below.
  if(isAuto && ENTRY_GUARD && freshOrderSide!==side){const shownSide=fresh.side||'WAIT';const msg=`AUTO DITAHAN: signal realtime sekarang ${shownSide} ${fresh.score||0}/100, bukan ${side==='LONG'?'BUY/LONG':side==='SHORT'?'SELL/SHORT':side}. Menunggu konfirmasi searah.`;setAutoStatus(msg,'wait');throw Error(msg)}
  if(isAuto){const timing=entryTimingGuard(side);if(!timing.ok){setAutoStatus(`AUTO WAIT: ${timing.reason}`,'wait');throw Error(timing.reason);}}
  const z=S.smart?.[side.toLowerCase()];if(!z)return alert('SL/TP belum siap');
  const entryType=String($('entryType')?.value||'MARKET').toUpperCase();
  const chosenUSDT=entryType==='LIMIT'?toUSDT(Number($('entryPrice')?.value||0)):Number(S.c.at(-1)?.c||0);
  if(!(chosenUSDT>0))return alert('Harga entry belum tersedia');
  const capitalIdr=+$('capital').value||0,riskPct=+$('risk').value||0,leverage=+$('lev').value||1,sizingMode=String($('sizingMode')?.value||'MARGIN').toUpperCase();
  if(capitalIdr<=0)return alert('Modal harus lebih dari 0');
  const noTp=$('noTp').checked;
  let preview;
  try{preview=await serverOrderPreview(side)}catch(e){
    if(e.message==='POSITION_ALREADY_OPEN')await refreshAccount();
    return alert(e.message);
  }
  const mode=(await jsonFetch('/api/runtime').catch(()=>({tradingMode:'paper'}))).tradingMode?.toLowerCase()||'paper';
  const label=mode==='demo'?'BINANCE DEMO':mode==='live'?'BINANCE LIVE':'PAPER';
  const chosenIDR=Number(preview.entryPrice||0),slIDR=Number(z.sl||0),tpIDR=Number(z.tp||0);
  const confirmText=`${side==='LONG'?'BUY / LONG':'SELL / SHORT'}
Mode harga: ${entryType}
Harga acuan server: ${fmtIDR(chosenIDR)}
SL ${fmtIDR(slIDR)}
TP ${noTp?'TANPA BATAS':fmtIDR(tpIDR)}
Modal ${fmtIDR(capitalIdr)}
Leverage ${preview.leverage}x
Qty YANG AKAN DIKIRIM: ${Number(preview.finalQty).toFixed(6)} BTC
Nilai posisi: ${fmtIDR(Number(preview.finalNotional))}
Margin: ${fmtIDR(Number(preview.margin))}
Sizing: ${preview.sizingMode}
Mode: ${label}

Lanjut entry?`;
  if(!isAuto&&!confirm(confirmText))return;
  const body={symbol:S.symbol,side,entry:preview.entryPrice,entryType,entryPrice:entryType==='LIMIT'?chosenUSDT:preview.entryPrice,stopLoss:z.sl,takeProfit:noTp?0:z.tp,capital:toUSDT(capitalIdr),riskPct,leverage,marginType:String($('margin')?.value||'Cross').toUpperCase(),sizingMode,expectedQuantity:Number(preview.finalQty),expectedNotional:Number(preview.finalNotional),setup:'structure+ATR',reason:isAuto?'ai-auto':'manual',profitMode:noTp?'TANPA_BATAS':'TARGET'};
  const target=mode==='paper'?'/api/paper/order':'/api/live/order';
  const x=await jsonFetch(target,{method:'POST',headers:H(),body:JSON.stringify(body)}).catch(e=>({error:readableError(e),code:e.code}));
  if(x.error){
    x.error=readableError(x.error);
    $('orderResult').style.display='block';
    $('orderResult').innerHTML=`<b class="bad">ENTRY GAGAL · BINANCE</b><div class="note bad">${x.error}</div><div class="note">AUTO tidak akan menganggap sinyal ini sebagai posisi aktif. Jika sinyal masih valid, AUTO akan mencoba lagi setelah jeda.</div>`; LAST_ORDER_DIAGNOSTIC={at:Date.now(),html:$('orderResult').innerHTML,keepMs:12000};
    setAutoStatus(isAuto?`AUTO: ${x.error}`:'ENTRY MANUAL GAGAL: '+x.error,'bad');
    await refreshAccount();
    if(isAuto)throw Object.assign(new Error(x.error),{code:x.code||'ORDER_ERROR'});
    return alert(x.error)
  }
  const sz=x.sizing||{},ap=x.actualPosition;const match=x.qtyMatch!==false; LAST_ORDER_DIAGNOSTIC={at:0,html:'',keepMs:12000};
  if(!ap||!(Number(ap.quantity)>0)){
    const msg='Order mendapat respons tetapi posisi Binance belum aktif. Entry dianggap GAGAL agar UI tidak menipu.';
    $('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="bad">ENTRY TIDAK AKTIF</b><div class="note bad">${msg}</div>`; LAST_ORDER_DIAGNOSTIC={at:Date.now(),html:$('orderResult').innerHTML,keepMs:12000};
    setAutoStatus(isAuto?'AUTO: posisi belum terdeteksi · akan mencoba lagi':msg,'bad');
    await refreshAccount();
    if(isAuto)throw Error(msg);
    return alert(msg);
  }
  $('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${match?'good':'bad'}">ENTRY ${side==='LONG'?'BUY / LONG':'SELL / SHORT'} ${match?'TERSINKRON':'PERIKSA QTY'}</b><div class="note">Target server <b>${Number(sz.finalQty||preview.finalQty).toFixed(6)} BTC</b> · Notional target <b>${fmtIDR(Number(sz.finalNotional||preview.finalNotional))}</b> · Binance aktual <b>${ap?Number(ap.quantity).toFixed(6):'—'} BTC</b> / ${ap?fmtIDR(Number(ap.notional||0)):'—'} · Entry ${fmtIDR(Number(ap?.entryPrice||preview.entryPrice))} · SL ${fmtIDR(slIDR)} · Target ${noTp?'TANPA BATAS':fmtIDR(tpIDR)}</div><div class="note good">Rp300.000 × 20× hanya menjadi ±Rp6.000.000 jika Qty aktual Binance memang sesuai target. UI memakai Qty Binance sebagai sumber kebenaran.</div>`;
  if(mode==='paper'&&x.position){S.positions.push(x.position);render('positions')}else{await refreshAccount()}
}

function fmtIDRNumber(usdt){return Number(usdt||0)*USDT_IDR_RATE}
function fromUSDT(usdt){return Number(usdt||0)*USDT_IDR_RATE}

// ===== V5.90-V5.95 RESEARCH LAB =====
function labRows(){return Array.isArray(SIM?.trades)?SIM.trades:[]}
function labRegime(){
  const a=S.c||[]; if(a.length<30)return {label:'UNKNOWN',transition:'DATA PENDING',score:0};
  const p=adaptivePredictiveCandle(a.slice(-120)); const label=String(p?.trend||p?.regime||p?.side||'UNKNOWN').toUpperCase();
  const recent=a.slice(-12), prior=a.slice(-36,-12); const avg=x=>x.length?x.reduce((z,c)=>z+Number(c.c),0)/x.length:0;
  const r=avg(recent), q=avg(prior), delta=q?Math.abs(r-q)/q*100:0;
  const transition=delta>1.2?'TRANSITION':delta>.5?'WATCH':'STABLE';
  return {label:label.includes('BEAR')||label.includes('DOWN')?'BEAR':label.includes('BULL')||label.includes('UP')?'BULL':label.includes('RANGE')||label.includes('SIDE')?'SIDEWAYS':'UNKNOWN',transition,score:Math.min(100,delta*40)};
}
function labStats(rows){const n=rows.length,w=rows.filter(x=>x.netPnl>0),l=rows.filter(x=>x.netPnl<0),gw=w.reduce((a,x)=>a+x.netPnl,0),gl=Math.abs(l.reduce((a,x)=>a+x.netPnl,0));return{n,hit:n?w.length/n*100:0,avgR:n?rows.reduce((a,x)=>a+Number(x.realizedR||0),0)/n:0,exp:n?rows.reduce((a,x)=>a+Number(x.netPnl||0),0)/n:0,pf:gl?gw/gl:null,dd:SIM?.peak?Math.max(0,(SIM.peak-SIM.equity)/SIM.peak*100):0}}

// ===== V5.96-V5.99 FINAL SAFETY & REPORTING =====
function v596DataIntegrity(){
  const data=Array.isArray(S.c)?S.c:[]; let invalid=0,dup=0,order=0,gaps=0,volBad=0;
  for(let i=0;i<data.length;i++){
    const x=data[i], vals=['o','h','l','c'].map(k=>Number(x?.[k]));
    if(vals.some(v=>!Number.isFinite(v))||vals[1]<Math.max(vals[0],vals[3])||vals[2]>Math.min(vals[0],vals[3])||vals[1]<vals[2])invalid++;
    if(i&&Number(x.t)===Number(data[i-1].t))dup++;
    if(i&&Number(x.t)<Number(data[i-1].t))order++;
    if(i&&Number(x.t)>Number(data[i-1].t)+3*24*3600000)gaps++;
    if(x.v!=null&&(!Number.isFinite(Number(x.v))||Number(x.v)<0))volBad++;
  }
  const issues=invalid+dup+order+gaps+volBad; const score=Math.max(0,100-Math.min(100,issues*10));
  return {n:data.length,invalid,dup,order,gaps,volBad,issues,score,status:score>=90?'HEALTHY':score>=70?'WATCH':score>=40?'DATA LOW':'CRITICAL'};
}
function v597Report(){
  const rows=Array.isArray(SIM?.trades)?SIM.trades:[], st=simStats(), dq=v596DataIntegrity();
  const byReason={}; for(const x of rows){const k=x.reason||'UNKNOWN';(byReason[k]??={n:0,pnl:0,r:0}) ;byReason[k].n++;byReason[k].pnl+=Number(x.netPnl||0);byReason[k].r+=Number(x.realizedR||0)}
  return {version:'5.97.0',generatedAt:new Date().toISOString(),simulationOnly:true,symbol:S.symbol,stats:st,dataQuality:dq,tradeCount:rows.length,exitBreakdown:byReason,trades:rows};
}
function v598Strategies(){
  const versions={}; const rows=[...(SIM?.trades||[])];
  const current=typeof STRATEGY_VERSION==='string'?STRATEGY_VERSION:'UNKNOWN';
  for(const x of rows){const k=x.strategyVersion||current;(versions[k]??=[]).push(x)}
  return Object.entries(versions).map(([version,r])=>{const pnl=r.reduce((a,x)=>a+Number(x.netPnl||0),0),win=r.filter(x=>Number(x.netPnl)>0).length;return {version,n:r.length,pnl,hit:r.length?win/r.length*100:0,avgR:r.length?r.reduce((a,x)=>a+Number(x.realizedR||0),0)/r.length:0}});
}
function v599Safety(){
  const dq=v596DataIntegrity(), rows=SIM?.trades||[], st=simStats(), freeze=!!STRATEGY_FREEZE;
  const checks=[
    ['DATA QUALITY',dq.score>=90,dq.status],
    ['PAPER/SIM SAMPLE',rows.length>=20,`${rows.length} closed`],
    ['MAX DRAWDOWN',st.dd<8,`${st.dd.toFixed(2)}%`],
    ['STRATEGY FREEZE',freeze,freeze?'FROZEN':'NOT FROZEN'],
    ['LIVE EXECUTION',false,'MANUAL ONLY'],
    ['KILL SWITCH',true,'AVAILABLE'],
    ['REAL ORDER AUTO',false,'DISABLED BY GATE']
  ];
  const critical=checks.filter(x=>['DATA QUALITY','PAPER/SIM SAMPLE','MAX DRAWDOWN','STRATEGY FREEZE'].includes(x[0]));
  const pass=critical.filter(x=>x[1]).length; const state=pass===critical.length?'READY FOR MANUAL REVIEW':pass>=2?'HOLD':'BLOCKED';
  return {checks,state,pass,total:critical.length};
}
function renderFinalResearch(){
  const h=$('finalResearchV599'); if(!h)return;
  const dq=v596DataIntegrity(), report=v597Report(), comps=v598Strategies(), safe=v599Safety();
  h.innerHTML=`<div class="labHead"><div><span class="label">V5.96–V5.99 FINAL RESEARCH & SAFETY</span><b>Integrity → Report → Strategy Comparison → Pre-Live Gate</b></div><span class="paperBadge ${safe.state==='READY FOR MANUAL REVIEW'?'good':safe.state==='HOLD'?'gold':'bad'}">${safe.state}</span></div>
  <div class="paperSafe">🛡 <b>NO AUTO LIVE:</b> gate ini hanya memberi status kesiapan untuk review manusia. Ia tidak mengaktifkan live order dan tidak menganggap hasil simulasi sebagai jaminan profit.</div>
  <div class="perfStats"><div><small>DATA SCORE</small><b>${dq.score}/100</b></div><div><small>DATA STATUS</small><b>${dq.status}</b></div><div><small>TRADES</small><b>${report.tradeCount}</b></div><div><small>DD</small><b>${report.stats.dd.toFixed(2)}%</b></div><div><small>AVG R</small><b>${report.stats.avgR.toFixed(2)}</b></div><div><small>EXPECTANCY</small><b>${report.stats.expectancy.toFixed(2)}</b></div></div>
  <div class="labGrid"><section class="labBox"><h4>V5.96 · DATA INTEGRITY 2.0</h4><div class="labLine"><span>Invalid OHLC</span><b>${dq.invalid}</b></div><div class="labLine"><span>Duplicate timestamp</span><b>${dq.dup}</b></div><div class="labLine"><span>Out-of-order</span><b>${dq.order}</b></div><div class="labLine"><span>Large timestamp gaps</span><b>${dq.gaps}</b></div><div class="labLine"><span>Invalid volume</span><b>${dq.volBad}</b></div></section>
  <section class="labBox"><h4>V5.97 · FULL TRADING REPORT</h4><div class="labLine"><span>Closed trades</span><b>${report.tradeCount}</b></div><div class="labLine"><span>Hit rate</span><b>${report.stats.hit.toFixed(1)}%</b></div><div class="labLine"><span>Profit factor</span><b>${report.stats.pf==null?'—':report.stats.pf.toFixed(2)}</b></div><div class="labLine"><span>Max losing streak</span><b>${report.stats.maxStreak}</b></div></section>
  <section class="labBox"><h4>V5.98 · STRATEGY COMPARISON</h4>${comps.length?comps.map(x=>`<div class="labLine"><span>${x.version}</span><b>${x.n} · ${x.pnl>=0?'+':''}${x.pnl.toFixed(2)} · ${x.avgR.toFixed(2)}R</b></div>`).join(''):'<p>Belum ada trade dengan strategyVersion tersimpan.</p>'}<p>Versi dibandingkan berdampingan; tidak dibuat ranking otomatis.</p></section>
  <section class="labBox"><h4>V5.99 · PRE-LIVE SAFETY GATE</h4>${safe.checks.map(x=>`<div class="labLine"><span>${x[1]?'✓':'✕'} ${x[0]}</span><b>${x[2]}</b></div>`).join('')}<p><b>${safe.state}</b> — review manusia tetap diperlukan sebelum perubahan apa pun menuju live execution.</p></section></div>
  <div class="g2" style="margin-top:8px"><button class="btn" id="finalReportExport">EXPORT FULL REPORT</button><button class="btn" id="safetyRefresh">REFRESH SAFETY GATE</button></div>`;
  $('finalReportExport')?.addEventListener('click',()=>{const payload={version:'5.99.0',generatedAt:new Date().toISOString(),simulationOnly:true,fullReport:report,strategyComparison:comps,safety:safe};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`obsidian-final-report-${S.symbol||'symbol'}-v5.99.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  $('safetyRefresh')?.addEventListener('click',renderFinalResearch);
}

function renderResearchLab(){
 const h=$('researchLabV595'); if(!h)return; const rows=labRows(), reg=labRegime(), st=labStats(rows), enough=rows.length>=20;
 const noTrade=rows.filter(x=>x.reason==='SL').length, noTradeRate=rows.length?noTrade/rows.length*100:0;
 const risks=[.25,.5,1,1.5,2].map(r=>{let eq=1000,peak=1000,dd=0;for(const x of rows){eq+=Number(x.realizedR||0)*1000*(r/100);peak=Math.max(peak,eq);dd=Math.max(dd,(peak-eq)/peak*100)}return{r,ret:(eq/1000-1)*100,dd}});
 const mgmt=[['FIXED TP/SL',rows.filter(x=>x.reason==='TP'||x.reason==='SL')],['TIMEOUT',rows.filter(x=>x.reason==='TIMEOUT')]];
 const seq=rows.map(x=>Number(x.realizedR||0)); const oos=seq.length>=20?seq.slice(Math.floor(seq.length*.7)):[]; const oosR=oos.length?oos.reduce((a,b)=>a+b,0)/oos.length:0;
 const data=S.c||[]; let bad=0,dup=0,prev=0; for(const c of data){if(!Number.isFinite(Number(c.o))||!Number.isFinite(Number(c.h))||!Number.isFinite(Number(c.l))||!Number.isFinite(Number(c.c))||Number(c.h)<Number(c.l)||Number(c.l)>Number(c.o)||Number(c.h)<Number(c.o))bad++;if(prev&&Number(c.t)<=prev)dup++;prev=Number(c.t)} const dq=data.length?Math.max(0,100-(bad+dup)*10):0;
 h.innerHTML=`<div class="labHead"><div><span class="label">V5.90–V5.95 RESEARCH LAB</span><b>Robustness, transition, quality, risk & data controls</b></div><span class="paperBadge ${enough?'good':'gold'}">${enough?'REVIEWABLE':'COLLECTING'}</span></div><div class="paperSafe">🔬 Semua modul di bawah bersifat analisis. Tidak mengubah saldo Simulator, tidak membuat order, dan tidak memilih strategi secara otomatis.</div><div class="perfStats"><div><small>REGIME</small><b>${reg.label}</b></div><div><small>TRANSITION</small><b>${reg.transition}</b></div><div><small>SAMPLE</small><b>${rows.length}</b></div><div><small>DATA SCORE</small><b>${dq}/100</b></div><div><small>OOS AVG R</small><b>${oos.length?oosR.toFixed(2):'—'}</b></div><div><small>AVG R</small><b>${st.n?st.avgR.toFixed(2):'—'}</b></div></div><div class="labGrid">
 <section class="labBox"><h4>V5.90 · REGIME TRANSITION</h4><b>${reg.transition}</b><p>Perubahan harga/range terbaru dibanding periode sebelumnya: ${reg.score.toFixed(2)}%. Saat TRANSITION, statistik regime lama perlu diperlakukan lebih hati-hati.</p></section>
 <section class="labBox"><h4>V5.91 · SIGNAL QUALITY 2.0</h4><div>Sample ${rows.length} · Hit ${st.n?st.hit.toFixed(1):'—'}% · Avg R ${st.n?st.avgR.toFixed(2):'—'} · PF ${st.pf==null?'—':st.pf.toFixed(2)}</div><p>Quality dipisahkan dari confidence: hasil aktual, biaya, drawdown, regime dan data quality harus dibaca bersama.</p></section>
 <section class="labBox"><h4>V5.92 · NO-TRADE INTELLIGENCE</h4><div>SL outcomes ${rows.length?noTradeRate.toFixed(1):'—'}%</div><p>Loss bukan otomatis berarti kondisi WAIT seharusnya diambil; modul ini hanya menunjukkan pola hasil yang perlu ditinjau, bukan mengarang counterfactual.</p></section>
 <section class="labBox"><h4>V5.93 · TRADE MANAGEMENT LAB</h4>${mgmt.map(([k,r])=>`<div class="labLine"><span>${k}</span><b>${r.length}</b></div>`).join('')}<p>Histori simulator yang tersedia hanya menyimpan alasan exit. Perbandingan exit alternatif membutuhkan candle-path lengkap; sistem tidak mengarang data yang tidak tersimpan.</p></section>
 <section class="labBox"><h4>V5.94 · POSITION SIZING LAB</h4>${risks.map(x=>`<div class="labLine"><span>${x.r.toFixed(2)}% risk</span><b>Return ${x.ret.toFixed(2)}% · DD ${x.dd.toFixed(2)}%</b></div>`).join('')}<p>Ini rescaling historis berbasis R, bukan rekomendasi menaikkan risiko.</p></section>
 <section class="labBox"><h4>V5.95 · ROBUSTNESS / OOS</h4><div>Train/OOS 70/30: <b>${oos.length?oosR.toFixed(2)+'R':'DATA PENDING'}</b></div><div>OOS sample: <b>${oos.length}</b></div><p>Hasil OOS harus tetap dipisahkan dari data training. Sample kecil tidak cukup untuk menyimpulkan robustness.</p></section>
 </div><div class="labBox"><h4>V5.96 · DATA INTEGRITY 2.0 PREVIEW</h4><div class="labLine"><span>Invalid OHLC</span><b>${bad}</b></div><div class="labLine"><span>Timestamp order/duplicate</span><b>${dup}</b></div><div class="labLine"><span>Quality score</span><b>${dq}/100</b></div><p>Data score di sini hanya memeriksa candle yang tersedia di browser.</p></div><div id="finalResearchV599" style="margin-top:10px"></div><button class="btn" id="researchLabExport">EXPORT RESEARCH REPORT</button>`;
 $('researchLabExport')?.addEventListener('click',()=>{const report={version:'5.95.0',generatedAt:new Date().toISOString(),simulationOnly:true,regime:reg,stats:st,oos:{n:oos.length,avgR:oosR},data:{candles:data.length,invalid:bad,orderIssues:dup,score:dq},sizing:risks};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`research-lab-${S.symbol||'symbol'}-v5.95.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})
 renderFinalResearch();
}


// ===== V6.00 TRADING CONTROL CENTER =====
const CONTROL_REVIEW_KEY='obsidian_control_review_v600';
function getControlReview(){try{return JSON.parse(localStorage.getItem(CONTROL_REVIEW_KEY)||'null')}catch{return null}}
function saveControlReview(){const x={at:new Date().toISOString(),symbol:S.symbol||'UNKNOWN',strategyVersion:typeof STRATEGY_VERSION==='string'?STRATEGY_VERSION:'UNKNOWN'};localStorage.setItem(CONTROL_REVIEW_KEY,JSON.stringify(x));return x}
function controlCenterState(){
  const dq=v596DataIntegrity(), safe=v599Safety(), st=simStats(), rows=Array.isArray(SIM?.trades)?SIM.trades:[];
  const kill=typeof buildKillSwitch==='function'?buildKillSwitch():null;
  const decision=typeof buildUnifiedDecision==='function'?buildUnifiedDecision(LAST_LIVE_FINAL||{}):{state:'WAIT',score:0,reasons:[]};
  const checks=[
    ['DATA QUALITY',dq.score>=90,`${dq.score}/100 · ${dq.status}`],
    ['RESEARCH SAMPLE',rows.length>=20,`${rows.length} closed`],
    ['SIMULATOR DD',st.dd<8,`${st.dd.toFixed(2)}%`],
    ['STRATEGY FREEZE',!!STRATEGY_FREEZE,STRATEGY_FREEZE?'FROZEN':'NOT FROZEN'],
    ['PRE-LIVE GATE',safe.state==='READY FOR MANUAL REVIEW',safe.state],
    ['REAL ORDER AUTO',false,'DISABLED'],
    ['HUMAN REVIEW',!!getControlReview(),'REQUIRED']
  ];
  const critical=checks.slice(0,5), pass=critical.filter(x=>x[1]).length;
  const state=pass===critical.length&&!!getControlReview()?'MANUAL REVIEW COMPLETE':pass===critical.length?'READY FOR HUMAN REVIEW':pass>=3?'HOLD':'BLOCKED';
  return {dq,safe,st,rows,decision,checks,state,kill,review:getControlReview()};
}
function renderControlCenter(){
  const h=$('controlCenterV600'); if(!h)return; const o=controlCenterState();
  const tone=o.state==='MANUAL REVIEW COMPLETE'?'good':o.state==='READY FOR HUMAN REVIEW'||o.state==='HOLD'?'gold':'bad';
  const d=o.decision||{}; const reasons=Array.isArray(d.reasons)?d.reasons.slice(0,5):[];
  h.innerHTML=`<div class="controlHead"><div><span class="label">V6.00 TRADING CONTROL CENTER</span><b>Satu layar untuk kesiapan, keputusan, risiko, data & review manusia</b></div><span class="paperBadge ${tone}">${o.state}</span></div>
  <div class="paperSafe">🛡 <b>CONTROL CENTER:</b> ini adalah pusat pemeriksaan dan review. Tidak mengirim order, tidak mengaktifkan live trading, dan tidak menjanjikan profit.</div>
  <div class="perfStats"><div><small>LIVE DECISION</small><b>${d.state==='READY'?'TRADE':d.state==='BLOCK'?'BLOCK':'WAIT'}</b></div><div><small>DECISION SCORE</small><b>${Number(d.score||0)}/100</b></div><div><small>DATA</small><b>${o.dq.score}/100</b></div><div><small>SIM DD</small><b>${o.st.dd.toFixed(2)}%</b></div><div><small>SIM TRADES</small><b>${o.rows.length}</b></div><div><small>STRATEGY</small><b>${typeof STRATEGY_VERSION==='string'?STRATEGY_VERSION:'—'}</b></div><div><small>KILL / AUTO</small><b>MANUAL / OFF</b></div><div><small>REVIEW</small><b>${o.review?'RECORDED':'PENDING'}</b></div></div>
  <div class="controlGrid"><section class="controlBox"><h4>CONTROL CHECKS</h4>${o.checks.map(x=>`<div class="labLine"><span>${x[1]?'✓':'✕'} ${x[0]}</span><b>${x[2]}</b></div>`).join('')}</section>
  <section class="controlBox"><h4>CURRENT DECISION</h4><div class="controlDecision">${d.state==='READY'?'TRADE':d.state==='BLOCK'?'BLOCK':'WAIT'}</div><div class="note">Score ${Number(d.score||0)}/100</div>${reasons.length?reasons.map(r=>`<div class="labLine"><span>• ${String(r)}</span></div>`).join(''):'<p class="note">Belum ada alasan keputusan yang tersedia.</p>'}</section>
  <section class="controlBox"><h4>RISK & DATA</h4><div class="labLine"><span>Data integrity</span><b>${o.dq.status}</b></div><div class="labLine"><span>Simulator safety</span><b>${simRiskGate().blocked?'BLOCKED':'CLEAR'}</b></div><div class="labLine"><span>Pre-live gate</span><b>${o.safe.state}</b></div><div class="labLine"><span>Strategy freeze</span><b>${STRATEGY_FREEZE?'FROZEN':'NOT FROZEN'}</b></div></section>
  <section class="controlBox"><h4>HUMAN REVIEW</h4><p class="note">Tombol ini hanya mencatat bahwa dashboard sudah ditinjau pada waktu tertentu. Tidak membuka posisi dan tidak mengubah risk.</p>${o.review?`<div class="labLine"><span>Last review</span><b>${new Date(o.review.at).toLocaleString()}</b></div>`:'<div class="labLine"><span>Last review</span><b>PENDING</b></div>'}</section></div>
  <div class="g2" style="margin-top:8px"><button class="btn active" id="controlReviewBtn">${o.review?'RECORD NEW REVIEW':'RECORD HUMAN REVIEW'}</button><button class="btn" id="controlExport">EXPORT CONTROL REPORT</button></div>`;
  $('controlReviewBtn')?.addEventListener('click',()=>{saveControlReview();renderControlCenter()});
  $('controlExport')?.addEventListener('click',()=>{const now=controlCenterState();const payload={version:'6.00.0',generatedAt:new Date().toISOString(),simulationOnly:true,state:now.state,checks:now.checks,decision:now.decision,dataQuality:now.dq,safety:now.safe,simulator:{trades:now.rows.length,drawdown:now.st.dd,equity:SIM.equity},humanReview:now.review};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`obsidian-control-report-${S.symbol||'symbol'}-v6.00.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
}

function render(tab){let el=$('content');
if(tab==='confluence')el.innerHTML=`<div class="aiCard"><div><span class="label">FINAL SIGNAL · NEXT CANDLE</span><div id="aiSignal" class="signal wait">WAIT</div><div id="aiScore" class="note">0/100 · LOW</div></div><div class="aiReasons"><div class="label">ALASAN</div><div id="aiReason" class="note">Menunggu data candle…</div><div id="predictBox" class="predictBox note">FINAL SIGNAL menunggu data…</div></div></div><div class="srCard"><div class="label">SUPPORT / RESISTANCE</div><div class="srLevels"><div class="srLevel"><span class="note">SUPPORT</span><b id="srSupport">—</b></div><div class="srLevel"><span class="note">RESISTANCE</span><b id="srResistance">—</b></div></div><div id="srContext" class="note" style="margin-top:7px">Belum ada level.</div></div><table class="table"><tr><th>TF</th><th>Trend</th><th>RSI</th><th>ADX</th></tr>${Object.entries(S.mtf).map(([k,v])=>`<tr><td>${k}</td><td class="${v.dir==='BULL'?'good':'bad'}">${v.dir}</td><td>${fmt(v.r)}</td><td>${fmt(v.ad)}</td></tr>`).join('')}</table><div class="note"><b>FINAL SIGNAL</b> adalah satu keputusan bersama untuk seluruh UI: candle close + momentum + S/R + MTF. Semua BUY/SELL/WAIT di atas dan Signal Drop memakai keputusan yang sama. Candle live tidak mengubah keputusan sampai candle ditutup.</div><div class="note" id="learningInfo">CANDLE LEARNING: membangun statistik walk-forward dari candle yang sudah ditutup…</div>`;
else if(tab==='backtest')el.innerHTML=`<div class="aiCard"><div><span class="label">AI CANDLE VALIDATION</span><div id="btAiState" class="signal wait">BELUM DIUJI</div><div id="btAiRate" class="note">Prediksi next-candle · body/wick + Supertrend + S/R</div></div><div class="aiReasons"><div class="label">TUJUAN</div><div class="note">Mengukur prediksi pada candle berikutnya secara berurutan tanpa memakai candle masa depan. WAIT tidak dihitung sebagai hit/miss.</div></div></div><div class="g3"><label class="field">Min score<input id="bscore" value="52" type="number" min="0" max="100"></label><label class="field">Min gap<input id="bgap" value="9" type="number" min="0" max="100"></label><label class="field">Fee %/side<input id="fee" value=".04"></label></div><div class="g3" style="margin-top:7px"><label class="field">Slippage %<input id="slip" value=".02"></label><label class="field">Funding %/8h<input id="fund" value=".01"></label><label class="field">Risk %<input id="brisk" value="1"></label><label class="field">Max bars<input id="riskBars" value="20" type="number" min="3" max="50"></label></div><div class="g2" style="margin-top:8px"><button class="btn active" id="runAiBt">Uji AI Candle</button><button class="btn" id="runAdaptiveBt">Uji Adaptive Learning</button></div><div class="g2" style="margin-top:8px"><button class="btn" id="runRiskBt">Uji Smart SL/TP</button><button class="btn" id="runQualityBt">Uji Signal Quality</button><button class="btn" id="runFullHistoricalBt">FULL BACKTEST V5.58</button><button class="btn" id="runOptimizationBt">OPTIMIZE V5.59</button><button class="btn" id="runWalkForwardBt">WALK-FORWARD V5.60</button><button class="btn" id="runbt">Uji EMA (legacy)</button></div><div class="g2" style="margin-top:8px"><button class="btn" id="resetLearn">Reset Cache Learning</button><button class="btn" id="clearBt">Bersihkan Hasil</button></div><div id="bout" class="note" style="margin-top:8px"></div><div id="btLearn" class="note" style="margin-top:8px"></div>`;
else if(tab==='operating'){el.innerHTML='<div id="operatingStandaloneV575"></div>'; const h=$('operatingStandaloneV575'); if(h){h.id='tradingOperatingSystemV575'; renderTradingOperatingSystem(LAST_LIVE_FINAL||{});}}
else if(tab==='paper'){el.innerHTML='<div id="paperTradingV576"></div>'; renderPaperTrading();}
else if(tab==='performance'){el.innerHTML='<div id="performanceDashboardV583"></div>'; renderPerformanceDashboard();}
else if(tab==='simulator'){el.innerHTML='<div id="fullSimulatorV586"></div><div id="stressLabV587" style="margin-top:10px"></div><div id="scenarioLabV588" style="margin-top:10px"></div><div id="scenarioDecisionMatrixV589" style="margin-top:10px"></div>'; renderFullSimulator(); renderStressLab(); renderScenarioLab(); renderScenarioDecisionMatrix(LAST_LIVE_FINAL||{});}
else if(tab==='research'){el.innerHTML='<div id="researchLabV595"></div>'; renderResearchLab();}
else if(tab==='control'){el.innerHTML='<div id="controlCenterV600"></div>'; renderControlCenter();}
else if(tab==='journal')jsonFetch('/api/journal',{headers:H()}).then(rows=>{el.innerHTML=rows.length?`<table class="table"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>PnL</th><th>Fee</th><th>Funding</th></tr>${rows.map(x=>`<tr><td>${new Date(x.opened_at).toLocaleString()}</td><td>${x.symbol}</td><td>${x.side}</td><td class="${x.pnl>=0?'good':'bad'}">${fmt(x.pnl)}</td><td>${fmt(x.fee)}</td><td>${fmt(x.funding)}</td></tr>`).join('')}</table>`:'<div class="note">Journal kosong.</div>'});
else jsonFetch('/api/audit',{headers:H()}).then(rows=>el.innerHTML=`<div class="scroll"><table class="table"><tr><th>Time</th><th>Action</th><th>Detail</th></tr>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleTimeString()}</td><td>${x.action}</td><td>${String(x.detail).slice(0,120)}</td></tr>`).join('')}</table></div>`);
if(tab==='confluence')updateAITrend();
}
function backtest(){let f=Math.max(2,+$('bf')?.value||20),s=Math.max(f+1,+$('bs')?.value||50),fee=Math.max(0,+$('fee').value||0)/100,slip=Math.max(0,+$('slip').value||0)/100,fund=Math.max(0,+$('fund').value||0)/100,risk=Math.max(0,+$('brisk').value||1)/100,a=S.c,cl=a.map(x=>x.c);if(cl.length<s+40)return $('bout').textContent='Data belum cukup untuk backtest + walk-forward.';const run=(lo,hi)=>{let ef=EMA(cl.slice(0,hi),f),es=EMA(cl.slice(0,hi),s),pos=0,en=0,ret=0,n=0,peak=0,dd=0;for(let i=Math.max(s,lo);i<hi;i++){if(!pos&&ef[i]>es[i]&&ef[i-1]<=es[i-1]){pos=1;en=cl[i]*(1+slip)}if(pos&&ef[i]<es[i]&&ef[i-1]>=es[i-1]){let r=(cl[i]*(1-slip)-en)/en-fee*2-fund;ret+=r*risk;n++;peak=Math.max(peak,ret);dd=Math.max(dd,peak-ret);pos=0}}if(pos){ret+=((cl[hi-1]*(1-slip)-en)/en-fee*2-fund)*risk}return{ret,n,dd}};let all=run(s,cl.length),wf=[];let train=Math.max(80,Math.floor(cl.length*.35)),test=Math.max(30,Math.floor(cl.length*.15));for(let start=s;start+train+test<=cl.length;start+=test){let trainRes=run(start,start+train),testRes=run(start+train,start+train+test);wf.push({train:trainRes,test:testRes})}const avg=wf.length?wf.reduce((p,x)=>p+x.test.ret,0)/wf.length:0;$('bout').innerHTML=`Legacy EMA · Full sample return <b class="${all.ret>=0?'good':'bad'}">${(all.ret*100).toFixed(2)}%</b> · ${all.n} closed · Max DD ${(all.dd*100).toFixed(2)}%<br>Walk-forward windows <b>${wf.length}</b> · Out-of-sample avg <b class="${avg>=0?'good':'bad'}">${(avg*100).toFixed(2)}%</b> · fee ${fee*100}%/side · slippage ${slip*100}% · funding ${fund*100}%/8h<br><span class="note">Legacy EMA hanya pembanding. Untuk mesin signal baru gunakan Uji AI Candle.</span>`}
function backtestSmartRisk(){
  const a=S.c||[], n=a.length;
  const minScore=Math.max(0,Math.min(100,Number($('bscore')?.value||52))), minGap=Math.max(0,Math.min(100,Number($('bgap')?.value||9)));
  const fee=Math.max(0,Number($('fee')?.value||0))/100, slip=Math.max(0,Number($('slip')?.value||0))/100, risk=Math.max(.01,Number($('brisk')?.value||1))/100;
  const maxBars=Math.max(3,Math.min(50,Number($('riskBars')?.value||20)));
  if(n<100){$('bout').textContent='Data belum cukup. Minimal 100 candle untuk backtest Smart SL/TP.';return;}
  const rrTarget=Math.max(1.25,Number($('rr')?.value||2));
  let rows=[],tp1=0,tp2=0,sl=0,timeout=0,ambiguous=0,ret=0,peak=0,maxDD=0,rrSum=0;
  for(let i=50;i<n-1;i++){
    const hist=a.slice(0,i+1), pred=adaptivePredictiveCandle(hist);
    if(pred.side==='WAIT'||Number(pred.score||0)<minScore||Number(pred.gap||0)<minGap)continue;
    const plan=buildSmartRiskPlan({...pred,closed:hist});
    if(!plan.valid||plan.rr1<1.5)continue;
    const entryBar=a[i+1], entry=Number(entryBar.o)*(pred.side==='BUY'?(1+slip):(1-slip));
    const delta=entry-plan.entry, slP=plan.sl+delta, tp1P=plan.tp1+delta, tp2P=plan.tp2+delta;
    let result='TIMEOUT', exit=Number(entryBar.c), bars=0, both=false;
    for(let j=i+1;j<Math.min(n,i+1+maxBars);j++){
      const c=a[j], hi=Number(c.h), lo=Number(c.l);
      const hitSL=pred.side==='BUY'?lo<=slP:hi>=slP;
      const hitTP2=pred.side==='BUY'?hi>=tp2P:lo<=tp2P;
      const hitTP1=pred.side==='BUY'?hi>=tp1P:lo<=tp1P;
      if(hitSL&&hitTP2){both=true;result='SL';exit=slP;bars=j-i;break;}
      if(hitTP2){result='TP2';exit=tp2P;bars=j-i;break;}
      if(hitSL){result='SL';exit=slP;bars=j-i;break;}
      if(hitTP1){result='TP1';exit=tp1P;bars=j-i;break;}
      exit=Number(c.c);bars=j-i;
    }
    if(result==='TP1')tp1++; else if(result==='TP2')tp2++; else if(result==='SL')sl++; else timeout++;
    if(both)ambiguous++;
    const signed=pred.side==='BUY'?(exit-entry)/Math.max(entry,1e-12):(entry-exit)/Math.max(entry,1e-12);
    const net=signed-fee*2-(2*slip/100);
    ret+=net*risk; peak=Math.max(peak,ret); maxDD=Math.max(maxDD,peak-ret); rrSum+=Math.abs(exit-entry)/Math.max(Math.abs(entry-slP),1e-12);
    rows.push({side:pred.side,result,bars,score:pred.score,rr:plan.rr1});
  }
  const total=rows.length, wins=tp1+tp2, hitRate=total?wins/total:0, tp2Rate=total?tp2/total:0;
  const oosStart=Math.floor(rows.length*.6),oos=rows.slice(oosStart),oosWin=oos.filter(x=>x.result==='TP1'||x.result==='TP2').length,oosRate=oos.length?oosWin/oos.length:0;
  const state=$('btAiState'),rate=$('btAiRate');
  if(state){state.textContent=total?`SMART RISK ${Math.round(hitRate*100)}% TP`:'TIDAK ADA SETUP';state.className='signal '+(hitRate>=.6?'good':hitRate>=.5?'wait':'bad');}
  if(rate)rate.textContent=`${total} setup · TP1/TP2 ${Math.round(hitRate*100)}% · OOS ${Math.round(oosRate*100)}% · conservative same-candle SL-first`;
  $('bout').innerHTML=`<b>SMART ENTRY + SL/TP · walk-forward</b><br>Setup <b>${total}</b> · TP1 <b class="good">${tp1}</b> · TP2 <b class="good">${tp2}</b> · SL <b class="bad">${sl}</b> · Timeout <b>${timeout}</b><br>TP hit rate <b>${(hitRate*100).toFixed(1)}%</b> · TP2 rate <b>${(tp2Rate*100).toFixed(1)}%</b> · OOS terakhir <b>${oos.length}</b> / ${(oosRate*100).toFixed(1)}% TP<br>Simulated return <b class="${ret>=0?'good':'bad'}">${(ret*100).toFixed(2)}%</b> · Max DD ${(maxDD*100).toFixed(2)}% · Avg realized R <b>${total?(rrSum/total).toFixed(2):'0.00'}</b><br><span class="note">RR target ${rrTarget.toFixed(2)} · fee ${fee*100}%/side · slippage ${slip*100}% · ambiguous same-candle events ${ambiguous} diperlakukan SL-first. Ini validasi historis, bukan jaminan hasil live.</span>`;
  $('btLearn').innerHTML=`<b>DETAIL SETUP</b><br>Entry menggunakan open candle setelah signal. SL/TP berasal dari S/R + ATR. Maksimum ${maxBars} candle per setup.<br><span class="note">Untuk menghindari look-ahead bias, candle masa depan hanya dipakai untuk menentukan outcome setelah signal dibuat.</span>`;
}

function backtestSignalQuality(){
  const a=S.c||[], n=a.length;
  const minScore=Math.max(0,Math.min(100,Number($('bscore')?.value||52))), minGap=Math.max(0,Math.min(100,Number($('bgap')?.value||9)));
  if(n<100){$('bout').textContent='Data belum cukup. Minimal 100 candle untuk Signal Quality.';return;}
  let rows=[];
  for(let i=50;i<n-1;i++){
    const hist=a.slice(0,i+1), pred=adaptivePredictiveCandle(hist);
    if(pred.side==='WAIT'||Number(pred.score||0)<minScore||Number(pred.gap||0)<minGap)continue;
    const readiness=getEntryReadiness(pred), riskPlan=buildSmartRiskPlan({...pred,closed:hist}), quality=getSignalQuality(pred,readiness,riskPlan);
    const next=a[i+1], move=(Number(next.c)-Number(next.o))/Math.max(1e-12,Number(next.o));
    const hit=(pred.side==='BUY'&&move>0)||(pred.side==='SELL'&&move<0);
    rows.push({quality:quality.score,label:quality.label,hit,side:pred.side});
  }
  const total=rows.length, hits=rows.filter(x=>x.hit).length;
  const oos=rows.slice(Math.floor(total*.6)), oosHits=oos.filter(x=>x.hit).length;
  const buckets={A:{n:0,h:0},B:{n:0,h:0},C:{n:0,h:0}};
  rows.forEach(x=>{if(buckets[x.label]){buckets[x.label].n++;buckets[x.label].h+=x.hit?1:0;}});
  const avg=total?rows.reduce((p,x)=>p+x.quality,0)/total:0,acc=total?hits/total:0,oosAcc=oos.length?oosHits/oos.length:0;
  const state=$('btAiState'),rate=$('btAiRate');
  if(state){state.textContent=total?`QUALITY AVG ${Math.round(avg)}/100`:'TIDAK ADA SETUP';state.className='signal '+(avg>=70?'good':avg>=55?'wait':'bad');}
  if(rate)rate.textContent=`${total} setup · full sample ${Math.round(acc*100)}% hit · OOS ${Math.round(oosAcc*100)}% · threshold AUTO ≥70`;
  const b=(k)=>buckets[k].n?`${buckets[k].n} setup · ${(buckets[k].h/buckets[k].n*100).toFixed(1)}% hit`:'0 setup';
  $('bout').innerHTML=`<b>SIGNAL QUALITY ENGINE · walk-forward</b><br>Setup <b>${total}</b> · Avg quality <b>${avg.toFixed(1)}/100</b> · Full-sample hit <b>${(acc*100).toFixed(1)}%</b><br>OOS terakhir <b>${oos.length}</b> · Hit <b>${(oosAcc*100).toFixed(1)}%</b> · AUTO threshold <b>70/100</b><br><span class="note">A = 80–100 · B = 65–79 · C = 50–64. Label ini adalah klasifikasi internal engine, bukan jaminan hasil trading.</span>`;
  $('btLearn').innerHTML=`<b>QUALITY BUCKETS</b><br>A: ${b('A')}<br>B: ${b('B')}<br>C: ${b('C')}<br><br><span class="note">Quality menggabungkan candle score, Entry Readiness, learning, S/R, MTF, dan Smart Risk. Perhitungan historis tetap walk-forward agar candle masa depan tidak masuk ke prediksi.</span>`;
}

function backtestAICandle(){
  const a=S.c||[], n=a.length, minScore=Math.max(0,Math.min(100,Number($('bscore')?.value||52))), minGap=Math.max(0,Math.min(100,Number($('bgap')?.value||9)));
  const fee=Math.max(0,Number($('fee')?.value||0))/100, slip=Math.max(0,Number($('slip')?.value||0))/100, fund8=Math.max(0,Number($('fund')?.value||0))/100, risk=Math.max(.01,Number($('brisk')?.value||1))/100;
  if(n<80){$('bout').textContent='Data belum cukup. Minimal 80 candle diperlukan untuk validasi AI Candle.';return;}
  let rows=[], learned={BUY:{n:0,hit:0,move:0},SELL:{n:0,hit:0,move:0}}, allMove=0;
  // Walk forward: prediction at i may only use candles <= i; outcome is candle i+1.
  for(let i=40;i<n-1;i++){
    const hist=a.slice(0,i+1), pred=predictiveCandle(hist), next=a[i+1], actual=actualCandleSide(next);
    const accepted=pred.side!=='WAIT'&&pred.score>=minScore&&pred.gap>=minGap;
    if(!accepted)continue;
    const move=((Number(next.c)-Number(next.o))/Math.max(1e-12,Number(next.o)))*100;
    const hit=(pred.side==='BUY'&&move>0)||(pred.side==='SELL'&&move<0);
    const moveSigned=pred.side==='BUY'?move:-move;
    const cost=fee*2+fund8/3; // approximate one 5m trade's funding exposure; funding is shown separately below.
    const net=moveSigned/100-cost-(2*slip/100);
    rows.push({i,side:pred.side,score:pred.score,gap:pred.gap,actual,move,hit,net,context:pred.sr?.context||'NO_LEVEL',body:pred.candlePrediction?.candle?.bodyPct||0,upper:pred.candlePrediction?.candle?.upperWickPct||0,lower:pred.candlePrediction?.candle?.lowerWickPct||0});
    const z=learned[pred.side];z.n++;z.hit+=hit?1:0;z.move+=moveSigned;allMove+=moveSigned;
  }
  const total=rows.length, hits=rows.filter(x=>x.hit).length, misses=total-hits, accuracy=total?hits/total:0, coverage=(total/Math.max(1,n-41));
  const buy=learned.BUY,sell=learned.SELL;
  // Out-of-sample slice is the last 40% of available predictions, preserving chronology.
  const split=Math.max(40,Math.floor(rows.length*.6)), oos=rows.slice(split), oosHits=oos.filter(x=>x.hit).length, oosRate=oos.length?oosHits/oos.length:0;
  let ret=0,peak=0,maxDD=0; rows.forEach(x=>{ret+=x.net*risk;peak=Math.max(peak,ret);maxDD=Math.max(maxDD,peak-ret)});
  const avgMove=total?allMove/total:0;
  const srRows={}; rows.forEach(x=>{const k=x.context||'NO_LEVEL';if(!srRows[k])srRows[k]={n:0,hit:0};srRows[k].n++;srRows[k].hit+=x.hit?1:0});
  const top=Object.entries(srRows).sort((a,b)=>b[1].n-a[1].n).slice(0,5);
  const state=$('btAiState'), rate=$('btAiRate');
  if(state){state.textContent=total?`${accuracy>=.6?'VALIDASI ≥60%':'VALIDASI '+Math.round(accuracy*100)+'%'}`:'TIDAK ADA SIGNAL';state.className='signal '+(accuracy>=.6?'good':accuracy>=.5?'wait':'bad');}
  if(rate)rate.textContent=`${Math.round(accuracy*100)}% accuracy · ${total} signal · coverage ${Math.round(coverage*100)}% · OOS ${Math.round(oosRate*100)}%`;
  $('bout').innerHTML=`<b>AI Candle · full sample</b><br>Hit <b class="good">${hits}</b> · Miss <b class="bad">${misses}</b> · Accuracy <b>${(accuracy*100).toFixed(1)}%</b> · Coverage <b>${(coverage*100).toFixed(1)}%</b><br>Avg favorable move <b class="${avgMove>=0?'good':'bad'}">${avgMove.toFixed(3)}%</b> · Simulated return <b class="${ret>=0?'good':'bad'}">${(ret*100).toFixed(2)}%</b> · Max DD ${(maxDD*100).toFixed(2)}%<br>Out-of-sample terakhir <b>${oos.length}</b> signal · Accuracy <b>${(oosRate*100).toFixed(1)}%</b>`;
  const bucket=(z)=>z.n?`${z.n} signal · ${(z.hit/z.n*100).toFixed(1)}% hit · avg move ${(z.move/z.n).toFixed(3)}%`:'belum ada';
  $('btLearn').innerHTML=`<b>CANDLE LEARNING</b><br>BUY: ${bucket(buy)}<br>SELL: ${bucket(sell)}<br><br><b>POLA S/R</b><br>${top.map(([k,v])=>`${k.replaceAll('_',' ')}: ${v.n} signal · ${(v.hit/v.n*100).toFixed(1)}% hit`).join('<br>')||'Belum ada pola'}<br><br><span class="note">Ini validasi historis dari data yang tersedia di browser. Accuracy bukan jaminan hasil berikutnya; funding 8h, fee dan slippage hanya estimasi.</span>`;
}

function backtestAdaptiveLearning(){
  const a=S.c||[], n=a.length;
  if(n<100){$('bout').textContent='Data belum cukup. Minimal 100 candle untuk Adaptive Learning.';return;}
  const fee=Math.max(0,Number($('fee')?.value||0))/100,slip=Math.max(0,Number($('slip')?.value||0))/100,risk=Math.max(.01,Number($('brisk')?.value||1))/100;
  let rows=[],ret=0,peak=0,maxDD=0;
  // Rolling model: for every test candle, model is built only from earlier outcomes.
  for(let i=70;i<n-1;i++){
    const hist=a.slice(0,i+1),pred=adaptivePredictiveCandle(hist),next=a[i+1];
    if(pred.side==='WAIT'||pred.score<Number($('bscore')?.value||52)||pred.gap<Number($('bgap')?.value||9))continue;
    const move=(Number(next.c)-Number(next.o))/Math.max(1e-12,Number(next.o));
    const signed=pred.side==='BUY'?move:-move,hit=signed>0;
    const net=signed-fee*2-(2*slip/100);
    ret+=net*risk;peak=Math.max(peak,ret);maxDD=Math.max(maxDD,peak-ret);
    rows.push({side:pred.side,score:pred.score,hit,net,lr:pred.learning?.hitRate});
  }
  const hits=rows.filter(x=>x.hit).length,acc=rows.length?hits/rows.length:0;
  const buy=rows.filter(x=>x.side==='BUY'),sell=rows.filter(x=>x.side==='SELL');
  const bucket=x=>x.length?`${x.length} signal · ${(x.filter(y=>y.hit).length/x.length*100).toFixed(1)}% hit`:'0 signal';
  $('btAiState').textContent=rows.length?`ADAPTIVE ${Math.round(acc*100)}%`:'TIDAK ADA SIGNAL';
  $('btAiState').className='signal '+(acc>=.6?'good':acc>=.5?'wait':'bad');
  $('btAiRate').textContent=`Rolling OOS · ${rows.length} signal · model diperbarui sebelum setiap prediksi`;
  $('bout').innerHTML=`<b>ADAPTIVE CANDLE LEARNING · rolling OOS</b><br>Hit <b class="good">${hits}</b> · Miss <b class="bad">${rows.length-hits}</b> · Accuracy <b>${(acc*100).toFixed(1)}%</b> · Coverage <b>${(rows.length/Math.max(1,n-71)*100).toFixed(1)}%</b><br>Simulated return <b class="${ret>=0?'good':'bad'}">${(ret*100).toFixed(2)}%</b> · Max DD ${(maxDD*100).toFixed(2)}% · BUY ${bucket(buy)} · SELL ${bucket(sell)}<br><span class="note">Model setiap langkah hanya melihat hasil candle yang sudah terjadi sebelum signal berikutnya.</span>`;
  const model=buildAdaptiveModel(a.slice(0,-1));
  $('btLearn').innerHTML=`<b>MODEL SAAT INI</b><br>${model.samples} labeled candles · ${Object.keys(model.features).length} pola fitur · model v${model.version}<br><span class="note">Learning hanya mengubah confidence. Ia tidak menjamin arah candle berikutnya.</span>`;
}
function resetAdaptiveLearning(){ADAPTIVE_CACHE={key:'',upto:0,model:null};ADAPTIVE_INFO={samples:0,features:0,updatedAt:0};$('btLearn').textContent='Cache Candle Learning direset. Jalankan Uji Adaptive Learning untuk membangun ulang.';}

function setZoom(span){S.view.span=clamp(span,40,300);S.view.offset=0;safeDraw()}
$('zoomIn').onclick=()=>setZoom((S.view.span||140)-20);$('zoomOut').onclick=()=>setZoom((S.view.span||140)+20);$('zoomReset').onclick=()=>{S.view={span:140,offset:0};safeDraw()};cv.addEventListener('wheel',e=>{e.preventDefault();setZoom((S.view.span||140)+(e.deltaY>0?20:-20))},{passive:false});
cv.addEventListener('pointerdown',e=>{let r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,{a,dx,py}=priceMap(),i=clamp(Math.round((x-45)/dx),0,a.length-1),p=a[i]?.c;if(!S.tool)return;if(S.tool==='trend'){S.drag={type:'trend',x1:x,y1:y,x2:x,y2:y};S.lines.push(S.drag)}else if(S.tool==='fib'){S.drag={type:'fib',a:p,b:p};S.fib=S.drag}else if(S.tool==='sr'){S.sr.push(p);S.tool=null;updateAnalysisUI()}draw()});
cv.addEventListener('pointermove',e=>{if(!S.drag)return;let r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,{a,dx,py}=priceMap(),i=clamp(Math.round((x-45)/dx),0,a.length-1);if(S.drag.type==='trend'){S.drag.x2=x;S.drag.y2=y}else S.drag.b=a[i]?.c||S.drag.b;draw()});
cv.addEventListener('pointerup',()=>{S.drag=null});
$('entryGuard')?.addEventListener('change',e=>{ENTRY_GUARD=e.target.checked;updateEntryButtons()});
function syncAutoRiskUI(){const el=$('autoLossCut');if(el){el.value=AUTO_LOSS_CUT_IDR;el.addEventListener('input',e=>{AUTO_LOSS_CUT_IDR=Math.max(0,Number(e.target.value)||0);});}}
function syncAutoTradeUI(){const b=$('autoTradeBtn');if(b){b.textContent=AUTO_ENTRY?'AUTO: ON':'AUTO: OFF';b.className='btn '+(AUTO_ENTRY?'long':'');b.setAttribute('aria-pressed',AUTO_ENTRY?'true':'false');}setAutoStatus(AUTO_ENTRY?'AUTO AKTIF · entry + proteksi berjalan selama dashboard terbuka':'AUTO TRADE MATI · order hanya manual',AUTO_ENTRY?'good':'wait');}
$('autoTradeBtn')?.addEventListener('click',()=>{AUTO_ENTRY=!AUTO_ENTRY;localStorage.setItem('obsidian_auto_trade',AUTO_ENTRY?'1':'0');syncAutoTradeUI();updateEntryButtons()});
$('autoProfitArm')?.addEventListener('input',e=>{AUTO_PROFIT_ARM_IDR=Math.max(0,Number(e.target.value)||0)});
$('autoProfitGiveback')?.addEventListener('input',e=>{AUTO_PROFIT_GIVEBACK_PCT=Math.min(90,Math.max(5,Number(e.target.value)||35))});

setTimeout(()=>{syncAutoTradeUI();syncAutoRiskUI();},0);
async function closePosition(opts={}){
  if(!opts.silent&&!confirm(`Tutup posisi ${S.symbol} sekarang pada harga market?\nIni akan menutup posisi yang sedang terbuka.`))return;
  const rt=await jsonFetch('/api/runtime').catch(e=>({error:e.message}));if(rt.error)return alert(rt.error);
  const mode=String(rt.tradingMode||'paper').toLowerCase();
  const x=await jsonFetch(mode==='paper'?'/api/paper/close':'/api/live/close',{method:'POST',headers:H(),body:JSON.stringify({symbol:S.symbol})}).catch(e=>({error:e.message}));
  if(x.error){x.error=readableError(x.error);$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="bad">GAGAL MENUTUP</b><div class="note">${x.error}</div>`;if(opts.auto)throw Error(x.error);return alert(x.error)}
  const realized=Number(x.realizedPnl??x.pnl??0),fee=Number(x.commissionUSDT||0),net=Number(x.netRealizedAfterFee??(realized-fee)),delta=Number(x.walletDelta||0),after=Number(x.balanceAfter||0);$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${net>=0?'good':'bad'}">POSISI DITUTUP · ${net>=0?'PROFIT':'LOSS'} BERSIH ${fmtIDR(net)}</b><div class="note">PnL terealisasi: <b>${fmtIDR(realized)}</b> · Fee close: <b>${fmtIDR(fee)}</b> · Harga eksekusi: <b>${x.exitPrice?fmtIDR(Number(x.exitPrice||0)):'—'}</b></div><div class="note">Saldo Binance setelah close: <b>${Number.isFinite(after)?fmtIDR(after):'—'}</b> · Perubahan wallet: <b>${fmtIDR(delta)}</b></div>`;
  S.accountPosition=null;scheduleDraw();
  for(let i=0;i<8;i++){
    await refreshAccount();
    if(!S.accountPosition){
      $('orderResult').innerHTML=`<b class="${net>=0?'good':'bad'}">CLOSED · ${net>=0?'PROFIT':'LOSS'} BERSIH ${fmtIDR(net)}</b><div class="note">PnL terealisasi ${fmtIDR(realized)} · Fee ${fmtIDR(fee)} · Harga eksekusi ${x.exitPrice?fmtIDR(Number(x.exitPrice||0)):'—'}</div><div class="note">LIVE POSITION: <b>CLOSED / 0 BTC</b> · Saldo Binance: <b>${Number.isFinite(after)?fmtIDR(after):'—'}</b> · Perubahan wallet: ${fmtIDR(delta)}</div>`;
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  $('orderResult').innerHTML+=`<div class="note bad">Binance belum melaporkan 0 BTC setelah beberapa kali sinkronisasi. Tekan SYNC untuk cek ulang.</div>`;
  if(opts.auto)throw Error('Posisi belum terkonfirmasi tertutup oleh Binance; entry berikutnya dibatalkan.');
  return x;
}
$('closePosition')?.addEventListener('click',closePosition);
$('stopEntryBtn')?.addEventListener('click',()=>{MANUAL_ENTRY_STOP=true;updateEntryButtons();const b=$('stopEntryBtn');if(b){b.classList.add('active');b.textContent='⏹ ENTRY DIHENTIKAN'};if($('manualEntryStatus'))$('manualEntryStatus').textContent='Entry manual: DIHENTIKAN · posisi terbuka tetap berjalan'});
$('resumeEntryBtn')?.addEventListener('click',()=>{MANUAL_ENTRY_STOP=false;updateEntryButtons();const b=$('stopEntryBtn');if(b){b.classList.remove('active');b.textContent='⏸ STOP ENTRY'};if($('manualEntryStatus'))$('manualEntryStatus').textContent='Entry manual: DIIZINKAN'});
$('entryType')?.addEventListener('change',()=>{const lim=$('entryType').value==='LIMIT';$('entryPrice').disabled=!lim;if(!lim)$('entryPrice').value='';updateEntryPreview()});
$('entryPrice')?.addEventListener('input',updateEntryPreview);
function updateEntryPreview(){const mode=$('entryType')?.value||'MARKET',v=Number($('entryPrice')?.value||0),live=Number(S.c.at(-1)?.c||0);$('entryPreview').textContent=mode==='LIMIT'&&v>0?fmtIDR(v):live?fmtIDR(fmtIDRNumber(live)):'—'}
$('entryPrice').disabled=true; updateEntryPreview(); updateAnalysisUI();

['capital','risk','atrMult','rr','lev'].forEach(id=>$(id).addEventListener('input',()=>{smart();calc();scheduleDraw()}));$('sizingMode')?.addEventListener('change',()=>{calc();scheduleDraw()});
$('strategyFreezeToggle')?.addEventListener('click',strategyFreezeToggle);
applyStrategyFreezeUI();
$('symbol').onchange=e=>{S.symbol=e.target.value;$('pair').textContent=S.symbol;load()};$('tf').onchange=e=>{S.tf=e.target.value;load()};
function updateAnalysisUI(){
  const activeTool=S.tool||'';
  const stb=$('supertrendBtn'); if(stb){stb.classList.add('active');stb.title='Supertrend 10/3 · satu-satunya indikator signal · B/S realtime';}
  S.ema=false; S.bb=false; S.macd=false; S.vwap=false; S.adx=false; S.atr=false;
  [['emaBtn','ema'],['bbBtn','bb'],['macdBtn','macd'],['vwapBtn','vwap'],['adxBtn','adx'],['atrBtn','atr']].forEach(([id,k])=>{const b=$(id);if(b){b.classList.toggle('active',!!S[k]);b.title=`${k.toUpperCase()} · ANALISIS SAJA · tidak mengirim order`;}});
  [['trendBtn','trend'],['fibBtn','fib']].forEach(([id,k])=>{const b=$(id);if(b){b.classList.toggle('active',activeTool===k);b.title=`${k==='fib'?'Fibonacci':'Trendline'} · ANALISIS SAJA · klik chart untuk menggambar`;}});
  const sr=$('srBtn'); if(sr){sr.title='Auto S/R · ANALISIS SAJA · menghitung support/resistance, tidak mengirim order';sr.classList.toggle('active',Array.isArray(S.sr)&&S.sr.length>0);}
  const sw=$('swingBtn'); if(sw)sw.title='Swings H/L · ANALISIS SAJA · menampilkan swing high/low';
  const st=$('analysisMode'); if(st)st.textContent=activeTool?`ANALISIS: ${activeTool==='fib'?'FIBONACCI':'TRENDLINE'}`:'ANALISIS SAJA · ORDER: LONG/SHORT';
}
[['emaBtn','ema'],['bbBtn','bb'],['macdBtn','macd'],['vwapBtn','vwap'],['adxBtn','adx'],['atrBtn','atr']].forEach(([id,k])=>$(id).onclick=()=>{S[k]=!S[k];updateAnalysisUI();draw();calc();updateAITrend()});
function setChartTool(tool){S.tool=S.tool===tool?null:tool;S.drag=null;updateAnalysisUI();draw();}
if($('supertrendBtn'))$('supertrendBtn').onclick=()=>{S.ema=false;S.bb=false;S.macd=false;S.vwap=false;S.adx=false;S.atr=false;draw();updateAITrend();};
$('trendBtn').onclick=()=>setChartTool('trend');
$('fibBtn').onclick=()=>setChartTool('fib');
$('srBtn').onclick=()=>{const sr=detectSR(S.c.slice(0,-1));SR_STATE=sr;S.sr=[sr.support,sr.resistance].filter(Boolean);updateAnalysisUI();draw();updateAITrend();alert(`Auto S/R\nSupport: ${sr.support?fmt(sr.support):'—'}\nResistance: ${sr.resistance?fmt(sr.resistance):'—'}\nContext: ${sr.context}\n\nMode: ANALISIS SAJA — tidak ada order yang dikirim.`)};
$('swingBtn').onclick=()=>{S.swings=swings(S.c);updateAnalysisUI();draw()};
$('tv').onclick=()=>window.open(`https://www.tradingview.com/chart/?symbol=BINANCE:${S.symbol}.P`);
async function syncAfterClose(){for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,500));try{const x=await jsonFetch('/api/account',{headers:H()});if(x.error)continue;renderAccountDock(x);const ps=(x.binancePositions||[]).filter(z=>Math.abs(Number(z.positionAmt||0))>0);if(!ps.some(z=>z.symbol===S.symbol))return x}catch{}}return null}
$('long').onclick=()=>{window.__manualOrderClick=true;order('LONG').finally(()=>window.__manualOrderClick=false)};$('short').onclick=()=>{window.__manualOrderClick=true;order('SHORT').finally(()=>window.__manualOrderClick=false)};$('quickLong').onclick=()=>{window.__manualOrderClick=true;order('LONG').finally(()=>window.__manualOrderClick=false)};$('quickShort').onclick=()=>{window.__manualOrderClick=true;order('SHORT').finally(()=>window.__manualOrderClick=false)};$('reconcileDock').onclick=()=>refreshAccount();$('reconcile').onclick=()=>jsonFetch('/api/account',{headers:H()}).then(x=>{if(x.error){alert(x.error);return}let b=x.balances?.find(z=>z.asset==='USDT');$('balance').textContent=fmt(b?.balance);$('availableBalance').textContent=fmt(b?.availableBalance);$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';let p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol && Math.abs(Number(z.positionAmt||0))>0);if(p){$('upnl').textContent=fmt(p.unRealizedProfit);$('liqPrice').textContent=fmt(p.liquidationPrice)}else{$('upnl').textContent=fmt(0);$('liqPrice').textContent='—'}});
$('kill').onclick=()=>{let on=!S.kill;if(!confirm(on?'Aktifkan KILL SWITCH?':'Matikan KILL SWITCH?'))return;jsonFetch('/api/kill-switch',{method:'POST',headers:H(),body:JSON.stringify({enabled:on,symbol:S.symbol})}).then(x=>{S.kill=x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL';$('mode').textContent=S.kill?'HALTED':$('mode').textContent})};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');render(t.dataset.tab);if(t.dataset.tab==='backtest')setTimeout(()=>{let b=$('runbt'),ai=$('runAiBt'),ad=$('runAdaptiveBt'),riskBt=$('runRiskBt'),qualityBt=$('runQualityBt'),fullBt=$('runFullHistoricalBt'),optBt=$('runOptimizationBt'),wfBt=$('runWalkForwardBt'),rs=$('resetLearn'),clear=$('clearBt');if(b)b.onclick=backtest;if(ai)ai.onclick=backtestAICandle;if(ad)ad.onclick=backtestAdaptiveLearning;if(riskBt)riskBt.onclick=backtestSmartRisk;if(qualityBt)qualityBt.onclick=backtestSignalQuality;if(fullBt)fullBt.onclick=fullHistoricalBacktest;if(optBt)optBt.onclick=optimizeStrategyV559;if(wfBt)wfBt.onclick=walkForwardV560;if(rs)rs.onclick=resetAdaptiveLearning;if(clear)clear.onclick=()=>{if($('bout'))$('bout').textContent='';if($('btLearn'))$('btLearn').textContent='';if($('btAiState')){$('btAiState').textContent='BELUM DIUJI';$('btAiState').className='signal wait'}}},0)});
document.getElementById('alog').onclick=async()=>{let x=await jsonFetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value,password:document.getElementById('ap').value,code:document.getElementById('ac').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';document.getElementById('authmsg').textContent='Logged in';refreshAccount();connectAccountWS();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Login failed'};
document.getElementById('aset').onclick=async()=>{let x=await jsonFetch('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value||'admin',password:document.getElementById('ap').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';refreshAccount();connectAccountWS();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Setup failed'};
async function refreshAccount(){if(!AUTH)return;try{const x=await jsonFetch('/api/account',{headers:H()});if(x.error){$('accountMode').textContent='AKUN ERROR';$('accountMode').title=String(x.error)+' · '+(x.environment||'');return}renderAccountDock(x);$('accountMode').textContent=x.accountType||'ACCOUNT';$('accountMode').title=`Updated ${new Date(x.updatedAt||Date.now()).toLocaleTimeString()}`;}catch(e){$('accountMode').textContent='ACCOUNT ERROR';$('accountMode').title=e.message}}
async function loadCredStatus(){if(!AUTH)return;const x=await jsonFetch('/api/credentials/status',{headers:H()});$('credStatus').textContent=x.configured?'API credential tersimpan terenkripsi. Secret tidak dapat dibaca kembali dari UI.' :'API credential belum diset.';}
$('settingsTab')?.addEventListener('click',()=>{$('credentialPanel').style.display=$('credentialPanel').style.display==='none'?'block':'none';loadCredStatus()});
$('saveCred')?.addEventListener('click',async()=>{const apiKey=$('apiKey').value.trim(),apiSecret=$('apiSecret').value.trim();if(!apiKey||!apiSecret){$('credStatus').textContent='Error: API Key dan API Secret wajib diisi.';return}const x=await jsonFetch('/api/credentials',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({apiKey,apiSecret,code:$('credCode').value.trim()})});$('credStatus').textContent=x.ok?'Credential tersimpan terenkripsi. API Key/Secret tetap ditampilkan di form ini agar tidak terlihat hilang.':'Error: '+(x.error||'Gagal menyimpan');if(x.ok){await loadCredStatus();await refreshAccount();setTimeout(()=>document.getElementById('testBinance')?.click(),150)}});
$('testBinance')?.addEventListener('click',async()=>{const x=await jsonFetch('/api/binance/test',{headers:H()});if(!x.connected){$('credStatus').textContent='Error Binance: '+(x.error||'Gagal terhubung');return}const balance=Number(x.balance||x.totalWalletBalance||0),available=Number(x.availableUSDT||x.availableBalance||0),upnl=Number(x.unrealizedProfit||0);$('credStatus').textContent=`Binance terhubung. Trade: ${x.canTrade?'ON':'OFF'} · Balance USDT: ${fmt(balance)} · Available: ${fmt(available)}`;$('balance').textContent=fmt(balance);$('availableBalance').textContent=fmt(available);$('upnl').textContent=fmt(upnl);$('dd').textContent='0.00%';$('liqPrice').textContent='—';$('conn').textContent='BINANCE CONNECTED';$('dockBalance').textContent=fmt(balance);$('dockDanaTersedia').textContent=fmt(available);$('dockUpnl').textContent=fmt(upnl);$('accountDockMode').textContent=x.canTrade?'BINANCE DEMO':'TRADE OFF';$('conn').title='Binance Futures account connected';$('mode').textContent=x.canTrade?'PAPER · ACCOUNT CONNECTED':'PAPER · TRADE OFF';if(Array.isArray(x.positions)){const p=x.positions.find(z=>z.symbol===S.symbol && Math.abs(Number(z.positionAmt||0))>0);if(p){$('upnl').textContent=fmt(p.unRealizedProfit);$('liqPrice').textContent=fmt(p.liquidationPrice)}}});
$('removeCred')?.addEventListener('click',async()=>{if(!confirm('Hapus API credential tersimpan?'))return;const x=await jsonFetch('/api/credentials',{method:'DELETE',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({code:$('credCode').value})});$('credStatus').textContent=x.ok?'Credential dihapus.':'Error: '+(x.error||'Gagal menghapus')});
document.getElementById('aiNotify')?.addEventListener('click',()=>{try{Notification.requestPermission().then(p=>{document.getElementById('aiNotify').textContent=p==='granted'?'🔔 On':'🔕 Off'})}catch{}});
document.getElementById('signalTf')?.addEventListener('change',()=>renderSignalDrop());
document.getElementById('clearSignals')?.addEventListener('click',()=>{if(!confirm('Hapus riwayat Signal Drop untuk pair ini?'))return;SIGNALS=SIGNALS.filter(x=>x.symbol!==S.symbol);persistSignals();renderSignalDrop()});
renderSignalDrop();
ensureAuth();
Promise.all([jsonFetch('/api/health'),jsonFetch('/api/runtime')]).then(([x,rt])=>{updateModeUI(rt);S.kill=!!x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL'}).catch(e=>{$('conn').textContent='API ERROR';$('conn').title=e.message});render();resize();load();setTimeout(()=>{resize();safeDraw()},250);setInterval(()=>{if(marketWsConnected&&Date.now()-lastMarketWsDataAt>5000){try{wsMarket?.close()}catch{}}},2000);setInterval(updateAITrend,1500);setInterval(updateLiveSignal,500);setInterval(tickLivePositionHero,1000);setInterval(mtf,5000);setInterval(()=>{renderFutureForecast();updateSignalDropCountdown()},1000);setInterval(autoProfitProtect,1000);setInterval(autoRecoverPendingSignal,2000);setInterval(scheduleLivePrediction,5000);depth();oiTimer=setInterval(depth,3000);accountTimer=setInterval(()=>{if(!accountWsConnected||Date.now()-lastAccountWsDataAt>4000)refreshAccount().catch(()=>{});},1000);


window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const b=$('installPwa');if(b){b.style.display='inline-block';b.classList.add('pwaInstall')}});
$('installPwa')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installPwa').style.display='none'});
window.addEventListener('appinstalled',()=>{$('installPwa')?.remove()});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
