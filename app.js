
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
let AUTO_ENTRY=localStorage.getItem('obsidian_auto_trade')==='1';
let AUTO_CONFIRM_SCORE=65;
let AUTO_CONFIRM_GAP=4;
let lastAutoSignalKey=localStorage.getItem('obsidian_auto_last_signal')||null;
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
async function pollLive(){if(marketWsConnected)return;try{const r=await fetch(`/api/market/ticker?symbol=${S.symbol}&interval=${S.tf}`,{cache:'no-store'});const d=await r.json();if(marketWsConnected)return;if(!r.ok||d.error)throw Error(d.error||`Market ticker HTTP ${r.status}`);if(d.candle){const c={t:+d.candle.t,o:+d.candle.o,h:+d.candle.h,l:+d.candle.l,c:+d.candle.c,v:+d.candle.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else if(!q||c.t>q.t)S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);$('mark').textContent=fmtIDR(d.markPrice);$('index').textContent=fmtIDR(d.indexPrice);$('funding').textContent=(+d.fundingRate*100).toFixed(4)+'%';S.market.mark=+d.markPrice;S.market.index=+d.indexPrice;S.market.funding=+d.fundingRate;updateLiveSignal();S.swings=swings(S.c);smart();calc();safeDraw()}}catch(e){$('conn').title='REST fallback: '+e.message}}
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

function connect(){closeMarketWS();const s=S.symbol.toLowerCase(),tf=S.tf;const streams=[`${s}@kline_${tf}`,`${s}@markPrice@1s`,`${s}@forceOrder`,`${s}@aggTrade`].join('/');const url=`${MARKET_WS_BASE.replace(/\/$/,'')}/stream?streams=${streams}`;let socket;try{socket=new WebSocket(url);wsMarket=socket}catch(e){$('conn').textContent='REST FALLBACK';startPolling();scheduleMarketReconnect();return}socket.onopen=()=>{if(wsMarket!==socket)return;marketWsConnected=true;lastMarketWsDataAt=Date.now();marketWsRetry=0;stopPolling();$('conn').textContent=publicWsConnected?'REALTIME · WS':'REALTIME · WS (MARKET)';$('conn').title='Binance Futures market WebSocket';safeDraw();chartStatus('REALTIME · Binance Futures WebSocket')};socket.onerror=()=>{if(wsMarket!==socket)return;marketWsConnected=false;$('conn').textContent='RECONNECTING…';$('conn').title='Market WebSocket error; REST fallback active'};socket.onclose=()=>{if(wsMarket!==socket)return;marketWsConnected=false;$('conn').textContent='RECONNECTING…';startPolling();scheduleMarketReconnect()};socket.onmessage=e=>{if(wsMarket!==socket)return;try{lastMarketWsDataAt=Date.now();const z=JSON.parse(e.data),d=z.data||z;if(!d)return;if(d.e==='kline'){const k=d.k,c={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v},q=S.c.at(-1);if(q?.t===c.t){if(lastLivePriceTs>Date.now()-1500){c.c=q.c;c.h=Math.max(c.h,q.h);c.l=Math.min(c.l,q.l)}S.c[S.c.length-1]=c}else S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);S.swings=swings(S.c);smart();calc();updateLiveSignal();scheduleDraw();if(k.x)recordClosedSignal(c)}else if(d.e==='markPriceUpdate'){S.market.mark=+d.p;S.market.index=+d.i;S.market.funding=+d.r;$('mark').textContent=fmtIDR(d.p);$('index').textContent=fmtIDR(d.i);$('funding').textContent=(+d.r*100).toFixed(4)+'%';scheduleDraw()}else if(d.e==='aggTrade'){const price=+d.p;if(Number.isFinite(price)){const q=S.c.at(-1);if(q){q.c=price;q.h=Math.max(q.h,price);q.l=Math.min(q.l,price);lastLivePriceTs=Date.now();$('price').textContent=fmtIDR(price);S.market.last=price;updateLiveSignal();scheduleDraw()}}}else if(d.e==='forceOrder'){$('liq').textContent=`${d.o?.S||''} ${fmt(+d.o?.p||0)} × ${fmt(+d.o?.q||0)}`;S.market.liq=d.o?.q||0}}catch{}}}
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
function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),t=getFinalSignal(),m=t.momentum||getRealtimeMomentum();const dir=c.c>c.o?'NAIK · B':c.c<c.o?'TURUN · S':'DATAR';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta'),msig=$('liveMomentumSignal'),mscore=$('liveMomentumScore'),mbox=$('liveMomentumBox');if(sig){sig.textContent=t.side==='BUY'?'BUY':t.side==='SELL'?'SELL':'WAIT';sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`CONFIRMED · ${t.score||0}/100 · ${t.strength||'LOW'} · ${t.confirmations||0} KONF · ${(t.reason||['Belum cukup konfirmasi']).slice(0,2).join(' · ')}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(msig){msig.textContent=m.side==='BUY'?'BUY ↑':m.side==='SELL'?'SELL ↓':'WAIT •';msig.className='signal '+(m.side==='BUY'?'good':m.side==='SELL'?'bad':'wait')}if(mscore)mscore.textContent=`REALTIME MOMENTUM · ${m.score||0}/100 · ${(m.reason||['Menunggu momentum']).slice(0,2).join(' · ')}`;if(mbox)mbox.className='liveBox '+(m.side==='BUY'?'signalBuy':m.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('NAIK')?'good':dir.startsWith('TURUN')?'bad':'wait')}if(cprice)cprice.textContent=`${fmtIDR(c.c)} · Buka ${fmtIDR(c.o)}`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'BUY ↑':t.side==='SELL'?'SELL ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`CONFIRMED ${t.side} · MOMENTUM ${m.side} · ${m.score||0}/100 · ${dir} · ${(m.reason||['—']).slice(0,2).join(' / ')}`;AI_TREND=t;
  const one=$('singleIndicatorSignal'), oneMeta=$('singleIndicatorMeta');
  if(one){const liveSide=m?.side&&m.side!=='WAIT'?m.side:t.side; one.textContent=liveSide==='BUY'?'BUY · B':liveSide==='SELL'?'SELL · S':'WAIT'; one.className='signal '+(liveSide==='BUY'?'good':liveSide==='SELL'?'bad':'wait');}
  if(oneMeta)oneMeta.textContent=`SUPERTREND 10/3 · Confirmed ${t.side} ${t.score||0}/100 · Realtime ${m?.side||'WAIT'} ${m?.score||0}/100`;
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
function renderAccountDock(x){if(!x)return;const b=x.balances?.find(z=>z.asset==='USDT'),p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol&&Math.abs(Number(z.positionAmt||0))>0);S.accountPosition=p||null;scheduleDraw();const bal=Number(b?.balance||0),av=Number(b?.availableBalance||0),up=Number(p?.unRealizedProfit||0),entry=Number(p?.entryPrice||0),mark=Number(p?.markPrice||S.market.mark||0),qty=Number(p?.positionAmt||0),notional=Math.abs(entry*qty),roe=notional?up/Math.max(1,Math.abs(notional)/Math.max(1,Number(p?.leverage||+$('lev').value||1)))*100:0,rp=Number(x.lastRealizedPnL);$('dockBalance').textContent=fmtIDR(bal);$('dockDanaTersedia').textContent=fmtIDR(av);$('dockUpnl').textContent=fmtIDR(up);$('dockUpnl').className=up>0?'pnlProfit':up<0?'pnlLoss':'';$('dockDD').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';if($('dockRealized')){$('dockRealized').textContent=Number.isFinite(rp)?fmtIDR(rp):'—';$('dockRealized').className=Number.isFinite(rp)?(rp>=0?'pnlProfit':'pnlLoss'):''}const rt=Number(x.realizedPnlTotal);if($('dockRealizedTotal')){$('dockRealizedTotal').textContent=Number.isFinite(rt)?fmtIDR(rt):'—';$('dockRealizedTotal').className=Number.isFinite(rt)?(rt>=0?'pnlProfit':'pnlLoss'):''}$('accountDockMode').textContent=x.accountType||'ACCOUNT';$('dockPositionStatus').textContent=p?'OPEN POSITION · TERDETEKSI DI BINANCE':'NO OPEN POSITION';$('dockArah').textContent=p?(Number(p.positionAmt)>0?'LONG':'SHORT'):'—';$('dockArah').className=p?(Number(p.positionAmt)>0?'good':'bad'):'';$('dockHargaMasuk').textContent=p?fmtIDR(entry):'—';$('dockHargaMark').textContent=p?fmtIDR(mark):fmtIDR(S.market.mark);$('dockJumlah').textContent=p?fmt(Math.abs(qty)):'—';$('dockPnl').textContent=p?fmtIDR(up):'—';$('dockPnl').className=p?(up>=0?'pnlProfit':'pnlLoss'):'';$('dockRoe').textContent=p?fmt(roe)+'%':'—';$('balance').textContent=fmtIDR(bal);$('availableBalance').textContent=fmtIDR(av);$('upnl').textContent=fmtIDR(up);$('liqPrice').textContent=p?fmtIDR(p.liquidationPrice):'—';$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';const closeBtn=$('closePosition'),entryBtns=[$('long'),$('short'),$('quickLong'),$('quickShort')].filter(Boolean);if(closeBtn){closeBtn.disabled=!p;closeBtn.style.opacity=p?'1':'.45'}entryBtns.forEach(btn=>{btn.disabled=!!p;btn.style.opacity=p?'.45':'1';btn.title=p?'Tutup posisi aktif terlebih dahulu sebelum entry baru.':''});if(p){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${up>=0?'good':'bad'}">${up>=0?'PROFIT':'LOSS'} ${fmtIDR(up)} · OPEN</b><div class="note">${Number(p.positionAmt)>0?'BUY / LONG':'SELL / SHORT'} · Masuk ${fmtIDR(entry)} · Mark ${fmtIDR(mark)} · Jumlah ${fmt(Math.abs(qty))} · ROE ${fmt(roe)}%</div><div class="note bad">PnL/posisi bersumber dari Binance positionRisk. Membuka halaman tidak membuat order baru. Tutup posisi ini sebelum entry berikutnya.</div>`}else if(LAST_ORDER_DIAGNOSTIC.html&&Date.now()-LAST_ORDER_DIAGNOSTIC.at<LAST_ORDER_DIAGNOSTIC.keepMs){$('orderResult').style.display='block';$('orderResult').innerHTML=LAST_ORDER_DIAGNOSTIC.html}else if(Number.isFinite(rp)){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${rp>=0?'good':'bad'}">LAST REALIZED: ${rp>=0?'PROFIT':'LOSS'} ${fmtIDR(rp)}</b><div class="note">LIVE POSITION: <b>CLOSED / 0 BTC</b> · Saldo diambil langsung dari Binance.</div>`}else{$('orderResult').style.display='none'};updateLivePositionHero(p)}

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
function predictiveCandle(c){return supertrendSignal(c,false)}
function aiCandleTrend(c){return supertrendSignal(c,false)}
function getRealtimeMomentum(){return supertrendSignal(S.c,true)}
function getConfirmedSignal(){const closed=S.c.slice(0,-1);return predictiveCandle(closed.length?closed:S.c)}
function getFinalSignal(){
  const c=S.c.at(-1); if(!c)return {side:'WAIT',score:0,gap:0,strength:'LOW',reason:['Menunggu data candle'],final:true};
  const t=getConfirmedSignal(); const ms=tfMillis(S.tf), live=Date.now()>=Number(c.t)&&Date.now()<Number(c.t)+ms;
  const anchor=live&&S.c.length>1?S.c.at(-2):c;
  return {...t,final:true,targetTs:Number(anchor.t)+ms,anchorTs:Number(anchor.t),live,momentum:live?getRealtimeMomentum():null};
}
function updateAITrend(){
  const t=getFinalSignal();
  const prev=AI_TREND.side; AI_TREND=t;
  const el=$('aiSignal'); if(el){
    el.textContent=t.side;
    el.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait');
  }
  const sc=$('aiScore'); if(sc)sc.textContent=`${t.score}/100 · ${t.strength}`;
  const rs=$('aiReason'); if(rs)rs.innerHTML=t.reason.map(x=>`<div>• ${x}</div>`).join(''); const sr=t.sr||detectSR(closed); SR_STATE=sr; const ss=$('srSupport'),rr=$('srResistance'),scx=$('srContext'),pb=$('predictBox'); if(ss)ss.textContent=sr.support?fmt(sr.support):'—'; if(rr)rr.textContent=sr.resistance?fmt(sr.resistance):'—'; if(scx)scx.textContent=`Context: ${sr.context||'—'} · Support ${sr.distanceSupport!=null?sr.distanceSupport.toFixed(2)+'%':'—'} · Resistance ${sr.distanceResistance!=null?sr.distanceResistance.toFixed(2)+'%':'—'}`; if(pb)pb.innerHTML=`Predictive: <b>${t.side}</b> · wick/body + momentum + S/R reaction`; 
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
function renderFutureForecast(){
  const el=$('forecastFeed');if(!el)return;
  const tf=$('signalTf')?.value||S.tf,ms=tfMillis(tf),now=Date.now(),last=S.c.at(-1);
  const live=last&&now>=Number(last.t)&&now<Number(last.t)+ms;
  const anchor=live?S.c.at(-2):last;
  const next=anchor?SIGNALS.find(x=>x.symbol===S.symbol&&x.tf===tf&&Number(x.targetTs)===Number(anchor.t)+ms):null;
  const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===tf&&x.status==='CLOSED').slice(0,16);
  const liveFinal=getFinalSignal();
  const nextSide=next?.side||liveFinal.side||'WAIT';
  const target=next?.targetTs||(last?Number(last.t)+ms:Date.now()+ms);
  const label=nextSide==='BUY'?'BUY ↑':nextSide==='SELL'?'SELL ↓':'WAIT •';
  const meta=next?`${next.score}/100 · ${next.strength} · ${(next.reason||'').slice(0,90)}`:`Realtime ${liveFinal.score||0}/100 · ${liveFinal.strength||'LOW'}`;
  const rowsHtml=rows.map(x=>{
    const b=x.side==='BUY',s=x.side==='SELL',dir=b?'B':s?'S':'W',cls=b?'buy':s?'sell':'wait';
    const outcome=x.outcome==='HIT'?'✓ HIT':x.outcome==='MISS'?'✕ MISS':x.outcome==='NEUTRAL'?'• NETRAL':'… PENDING';
    const oc=x.outcome==='HIT'?'hit':x.outcome==='MISS'?'miss':x.status==='PENDING'?'pending':'neutral';
    const action=b?'MASUK LONG':s?'MASUK SHORT':'SKIP';
    return `<div class="sdRow"><span class="sdTime">${signalTime(x.targetTs||x.ts).replace(' WIB','')}</span><b class="sdDir ${cls}">${dir}</b><span class="sdLabel">${action} · ${outcome}</span><span class="sdScore">${x.score}/100</span></div>`;
  }).join('');
  el.innerHTML=`<div class="sdNext"><div class="sdNextTitle">NEXT CANDLE · ${signalTime(target)}</div><div class="sdNextMain"><b class="sdNextSide ${nextSide==='BUY'?'buy':nextSide==='SELL'?'sell':'wait'}">${label}</b><b id="signalCountdown" class="sdCountdown">${signalCountdown(target)}</b></div><div class="sdNextMeta">${meta}</div></div><div class="sdRowsTitle">SIGNAL HISTORY · ${tf}</div>${rowsHtml||'<div class="note">Belum ada histori signal. Menunggu candle close.</div>'}`;
  renderSignalDropLiveOnly();
}
function renderSignalDropLiveOnly(){
  const liveFinal=getFinalSignal(),side=liveFinal.side==='BUY'?'BUY ↑':liveFinal.side==='SELL'?'SELL ↓':'WAIT •';
  const el=$('signalLiveSide');if(el){el.textContent=`LIVE · ${side}`;el.className=liveFinal.side==='BUY'?'good':liveFinal.side==='SELL'?'bad':'wait'}
  const meta=$('signalLiveMeta');if(meta)meta.textContent=`${liveFinal.score||0}/100 · ${liveFinal.strength||'LOW'} · ${S.tf} · ${liveFinal.confirmations||0} KONF`;
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
function freezeNextCandlePrediction(anchor){
  if(!anchor||S.c.length<36)return null;
  const tf=$('signalTf')?.value||S.tf, ms=tfMillis(tf);
  const targetTs=Number(anchor.t)+ms;
  const closed=S.c.filter(x=>Number(x.t)<=Number(anchor.t));
  if(closed.length<35)return null;
  // At candle close this is the same FINAL SIGNAL engine used by the rest of the UI.
  const t=predictiveCandle(closed);
  const key=`${S.symbol}:${tf}:${targetTs}`;
  const row={
    key,ts:Number(anchor.t),anchorTs:Number(anchor.t),targetTs,symbol:S.symbol,tf,
    side:t.side,score:t.score,gap:Number(t.gap||0),strength:t.strength,reason:t.reason,
    context:t.sr?.context||'NO_LEVEL',support:t.sr?.support,resistance:t.sr?.resistance,
    predictedAt:`Dibekukan saat close ${signalTime(anchor.t)}`,
    status:'PENDING',outcome:null,actual:null,actualOpen:null,actualClose:null,actualMovePct:null
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
  SIGNALS[idx]={...row,status:'CLOSED',outcome,actual,actualOpen:Number(c.o),actualClose:Number(c.c),actualMovePct:movePct,evaluatedAt:Date.now()};
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
  evaluateClosedCandle(c);
  const row=freezeNextCandlePrediction(c);
  renderSignalDrop();
  if(row) scheduleAutoTrade(row);
}
async function scheduleAutoTrade(row){
  if(!AUTO_ENTRY||MANUAL_ENTRY_STOP||autoBusy||autoProtectBusy||!row)return;
  if(row.side==='WAIT')return;
  if(Number(row.score||0)<AUTO_CONFIRM_SCORE)return;
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
      if(fresh.side!==row.side || Number(fresh.score||0)<AUTO_CONFIRM_SCORE || Number(fresh.gap||0)<AUTO_CONFIRM_GAP){setAutoStatus(`AUTO: signal berubah sebelum order · ${fresh.side} ${fresh.score||0}/100 · menunggu sinkron…`,'wait');return;}
      setAutoStatus(`AUTO: membuka ${row.side} · skor ${fresh.score}/100 · realtime terkonfirmasi…`,'wait');
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
  const g=entryGuard(side);if(!g.ok){alert(g.reason);return}
  const fresh=getFinalSignal();
  // Signal UI uses BUY/SELL while the order engine uses LONG/SHORT.
  // Normalize both before comparing so a valid BUY signal is not rejected as 'not LONG'.
  const freshOrderSide=fresh.side==='BUY'?'LONG':fresh.side==='SELL'?'SHORT':null;
  // Manual BUY/SELL is intentionally not blocked by the signal guard. The button is the user's explicit direction.
  // AUTO still requires the fresh realtime signal to match below.
  if(isAuto && ENTRY_GUARD && freshOrderSide!==side){const shownSide=fresh.side||'WAIT';const msg=`AUTO DITAHAN: signal realtime sekarang ${shownSide} ${fresh.score||0}/100, bukan ${side==='LONG'?'BUY/LONG':side==='SHORT'?'SELL/SHORT':side}. Menunggu konfirmasi searah.`;setAutoStatus(msg,'wait');throw Error(msg)}
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
function render(tab){let el=$('content');
if(tab==='confluence')el.innerHTML=`<div class="aiCard"><div><span class="label">FINAL SIGNAL · NEXT CANDLE</span><div id="aiSignal" class="signal wait">WAIT</div><div id="aiScore" class="note">0/100 · LOW</div></div><div class="aiReasons"><div class="label">ALASAN</div><div id="aiReason" class="note">Menunggu data candle…</div><div id="predictBox" class="predictBox note">FINAL SIGNAL menunggu data…</div></div></div><div class="srCard"><div class="label">SUPPORT / RESISTANCE</div><div class="srLevels"><div class="srLevel"><span class="note">SUPPORT</span><b id="srSupport">—</b></div><div class="srLevel"><span class="note">RESISTANCE</span><b id="srResistance">—</b></div></div><div id="srContext" class="note" style="margin-top:7px">Belum ada level.</div></div><table class="table"><tr><th>TF</th><th>Trend</th><th>RSI</th><th>ADX</th></tr>${Object.entries(S.mtf).map(([k,v])=>`<tr><td>${k}</td><td class="${v.dir==='BULL'?'good':'bad'}">${v.dir}</td><td>${fmt(v.r)}</td><td>${fmt(v.ad)}</td></tr>`).join('')}</table><div class="note"><b>FINAL SIGNAL</b> adalah satu keputusan bersama untuk seluruh UI: candle close + momentum + S/R + MTF. Semua BUY/SELL/WAIT di atas dan Signal Drop memakai keputusan yang sama. Candle live tidak mengubah keputusan sampai candle ditutup.</div>`;
else if(tab==='backtest')el.innerHTML=`<div class="g3"><label class="field">Fast<input id="bf" value="20"></label><label class="field">Slow<input id="bs" value="50"></label><label class="field">Fee %/side<input id="fee" value=".04"></label></div><div class="g3" style="margin-top:7px"><label class="field">Slippage %<input id="slip" value=".02"></label><label class="field">Funding %/8h<input id="fund" value=".01"></label><label class="field">Risk %<input id="brisk" value="1"></label></div><button class="btn" style="margin-top:8px" id="runbt">Run backtest</button><div id="bout" class="note" style="margin-top:8px"></div>`;
else if(tab==='journal')jsonFetch('/api/journal',{headers:H()}).then(rows=>{el.innerHTML=rows.length?`<table class="table"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>PnL</th><th>Fee</th><th>Funding</th></tr>${rows.map(x=>`<tr><td>${new Date(x.opened_at).toLocaleString()}</td><td>${x.symbol}</td><td>${x.side}</td><td class="${x.pnl>=0?'good':'bad'}">${fmt(x.pnl)}</td><td>${fmt(x.fee)}</td><td>${fmt(x.funding)}</td></tr>`).join('')}</table>`:'<div class="note">Journal kosong.</div>'});
else jsonFetch('/api/audit',{headers:H()}).then(rows=>el.innerHTML=`<div class="scroll"><table class="table"><tr><th>Time</th><th>Action</th><th>Detail</th></tr>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleTimeString()}</td><td>${x.action}</td><td>${String(x.detail).slice(0,120)}</td></tr>`).join('')}</table></div>`);
if(tab==='confluence')updateAITrend();
}
function backtest(){let f=Math.max(2,+$('bf').value||20),s=Math.max(f+1,+$('bs').value||50),fee=Math.max(0,+$('fee').value||0)/100,slip=Math.max(0,+$('slip').value||0)/100,fund=Math.max(0,+$('fund').value||0)/100,risk=Math.max(0,+$('brisk').value||1)/100,a=S.c,cl=a.map(x=>x.c);if(cl.length<s+40)return $('bout').textContent='Data belum cukup untuk backtest + walk-forward.';const run=(lo,hi)=>{let ef=EMA(cl.slice(0,hi),f),es=EMA(cl.slice(0,hi),s),pos=0,en=0,ret=0,n=0,peak=0,dd=0;for(let i=Math.max(s,lo);i<hi;i++){if(!pos&&ef[i]>es[i]&&ef[i-1]<=es[i-1]){pos=1;en=cl[i]*(1+slip)}if(pos&&ef[i]<es[i]&&ef[i-1]>=es[i-1]){let r=(cl[i]*(1-slip)-en)/en-fee*2-fund;ret+=r*risk;n++;peak=Math.max(peak,ret);dd=Math.max(dd,peak-ret);pos=0}}if(pos){ret+=((cl[hi-1]*(1-slip)-en)/en-fee*2-fund)*risk}return{ret,n,dd}};let all=run(s,cl.length),wf=[];let train=Math.max(80,Math.floor(cl.length*.35)),test=Math.max(30,Math.floor(cl.length*.15));for(let start=s;start+train+test<=cl.length;start+=test){let trainRes=run(start,start+train),testRes=run(start+train,start+train+test);wf.push({train:trainRes,test:testRes})}const avg=wf.length?wf.reduce((p,x)=>p+x.test.ret,0)/wf.length:0;$('bout').innerHTML=`Full sample return <b class="${all.ret>=0?'good':'bad'}">${(all.ret*100).toFixed(2)}%</b> · ${all.n} closed · Max DD ${(all.dd*100).toFixed(2)}%<br>Walk-forward windows <b>${wf.length}</b> · Out-of-sample avg <b class="${avg>=0?'good':'bad'}">${(avg*100).toFixed(2)}%</b> · fee ${fee*100}%/side · slippage ${slip*100}% · funding ${fund*100}%/8h<br><span class="note">Walk-forward memakai urutan waktu; parameter tidak dioptimalkan pada test window.</span>`}
function setZoom(span){S.view.span=clamp(span,40,300);S.view.offset=0;safeDraw()}
$('zoomIn').onclick=()=>setZoom((S.view.span||140)-20);$('zoomOut').onclick=()=>setZoom((S.view.span||140)+20);$('zoomReset').onclick=()=>{S.view={span:140,offset:0};safeDraw()};cv.addEventListener('wheel',e=>{e.preventDefault();setZoom((S.view.span||140)+(e.deltaY>0?20:-20))},{passive:false});
cv.addEventListener('pointerdown',e=>{let r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,{a,dx,py}=priceMap(),i=clamp(Math.round((x-45)/dx),0,a.length-1),p=a[i]?.c;if(S.tool==='trend'){S.drag={type:'trend',x1:x,y1:y,x2:x,y2:y};S.lines.push(S.drag)}else if(S.tool==='fib'){S.drag={type:'fib',a:p,b:p};S.fib=S.drag}else if(S.tool==='sr'){S.sr.push(p);S.tool=null;updateAnalysisUI()}draw()});
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
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');render(t.dataset.tab);if(t.dataset.tab==='backtest')setTimeout(()=>{let b=$('runbt');if(b)b.onclick=backtest},0)});
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
