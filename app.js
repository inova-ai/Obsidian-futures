
const $=id=>document.getElementById(id),cv=$('chart'),ctx=cv.getContext('2d');
let AUTH=sessionStorage.getItem('obsidian_token')||'';
const H=()=>AUTH?{'content-type':'application/json','authorization':'Bearer '+AUTH}:{'content-type':'application/json'};
async function jsonFetch(url,opts={}){const r=await fetch(url,opts);const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error(`Server returned ${r.status} instead of JSON`)}if(r.status===401){try{sessionStorage.removeItem('obsidian_token')}catch{};AUTH=''}if(!r.ok&&data?.error)throw Error(data.error);return data}
async function ensureAuth(){try{let z=await jsonFetch('/api/auth/status');if(z.authenticated){return true}document.getElementById('authbar').style.display='flex';if(z.mode==='env'){document.getElementById('authmsg').textContent='Mode Vercel: Login memakai ADMIN_USERNAME/ADMIN_PASSWORD. Setup database dilewati.';document.getElementById('aset').disabled=true;document.getElementById('aset').title='Setup membutuhkan PostgreSQL';}return false}catch(e){document.getElementById('authmsg').textContent='API belum siap: '+e.message;document.getElementById('authbar').style.display='flex';return false}}
let AI_TREND={side:'WAIT',score:0,reason:[],lastNotified:null,sr:null};
let SR_STATE={support:null,resistance:null,context:'NO_LEVEL',distanceSupport:null,distanceResistance:null};
let SIGNALS=[];
const SIGNAL_KEY='obsidian_signal_drop_v533';
const AUTO_ENTRY=false; // Startup is read-only: never place an order automatically.
let lastSignalSlot=null,lastSignalSide=null;
try{SIGNALS=JSON.parse(localStorage.getItem(SIGNAL_KEY)||'[]')}catch{SIGNALS=[]}
let ws=null,oiTimer=null,pollTimer=null,accountTimer=null,livePollTimer=null,clockTimer=null;
let PINCH=null;
let drawRAF=0;
let ENTRY_GUARD=true;
let MANUAL_ENTRY_STOP=false;
let deferredInstallPrompt=null;
let lastLivePriceTs=0;
function scheduleDraw(){if(drawRAF)return;drawRAF=requestAnimationFrame(()=>{drawRAF=0;safeDraw()})}
function currentLiveSide(){const c=S.c.at(-1); if(!c)return 'WAIT'; const pred=AI_TREND?.side||'WAIT'; const candle=c.c>c.o?'BUY':c.c<c.o?'SELL':'WAIT'; if(pred!=='WAIT')return pred; return candle;}
function entryGuard(side){if(MANUAL_ENTRY_STOP)return {ok:false,live:currentLiveSide(),reason:'STOP ENTRY aktif secara manual.'}; if(!ENTRY_GUARD)return {ok:true}; const live=currentLiveSide(); if(live!==side)return {ok:false,live,reason:live==='WAIT'?'Arah belum jelas (WAIT).':'Arah live berubah berlawanan.'}; return {ok:true,live};}
function updateEntryButtons(){const live=currentLiveSide(); const stopped=MANUAL_ENTRY_STOP; const lb=$('long'),sb=$('short'),ql=$('quickLong'),qs=$('quickShort'); [lb,ql,sb,qs].forEach(b=>{if(b){b.disabled=stopped || (ENTRY_GUARD && ((b===lb||b===ql)?live!=='BUY':live!=='SELL'));b.classList.toggle('entryStopped',b.disabled);b.title=b.disabled?(stopped?'STOP ENTRY aktif.':`Entry dihentikan: sinyal live ${live}.`):''}}); const st=$('entryGuardStatus'); if(st)st.textContent=stopped?'STOP ENTRY AKTIF · order baru dihentikan':(ENTRY_GUARD?`Perlindungan entry: AKTIF · Arah live ${live}`:'Perlindungan entry: MATI'); if(st)st.className='note '+(live==='BUY'?'good':live==='SELL'?'bad':'wait');}


let MARKET_WS_BASE='wss://fstream.binance.com';
let USDT_IDR_RATE=16500;
let ORDER_FILTERS={stepSize:0.001,minQty:0,maxQty:0,tickSize:0.01};
const fmtIDR=n=>{n=+n;if(!Number.isFinite(n))return '—';return 'Rp '+Math.round(n*USDT_IDR_RATE).toLocaleString('id-ID')};
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
let S={symbol:'BTCUSDT',tf:'5m',c:[],view:{span:140,offset:0},ema:true,bb:false,macd:false,vwap:false,adx:false,atr:false,tool:null,lines:[],fib:null,sr:[],swings:[],drag:null,book:{bids:[],asks:[]},market:{},account:{},accountPosition:null,positions:[],mtf:{},kill:false};
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
function safeDraw(){try{if(!cv.clientWidth||!cv.clientHeight)return;draw();if(S.c.length)chartStatus('',false)}catch(e){const el=$('conn');if(el){el.textContent='CHART ERROR';el.title=e?.stack||e?.message||String(e)}chartStatus('Chart error: '+(e?.message||String(e)))}}
function draw(){
  if(!cv||!ctx)return;
  const r=priceMap(); const {w,h,a,dx,py,start,hi,lo}=r;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#070b11'; ctx.fillRect(0,0,w,h);
  if(!a.length){ctx.fillStyle='#718096';ctx.font='12px system-ui';ctx.fillText('Menunggu data market…',16,24);return;}
  ctx.strokeStyle='#16202c';ctx.lineWidth=1;
  for(let i=0;i<5;i++){const y=20+i*(h-52)/4;ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(w-8,y);ctx.stroke();}
  ctx.font='9px system-ui';ctx.fillStyle='#718096';
  for(let i=0;i<5;i++){const price=r.lo+(r.hi-r.lo)*(1-i/4);const y=20+i*(h-52)/4;ctx.fillText(fmtIDR(price),4,y+3);}
  const bw=Math.max(2,Math.min(10,dx*.62));
  a.forEach((c,i)=>{const x=45+i*dx,yo=py(c.o),yc=py(c.c),yh=py(c.h),yl=py(c.l),up=c.c>=c.o;
    ctx.strokeStyle=up?'#19d39b':'#ff5b7c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
    ctx.fillStyle=up?'#19d39b':'#ff5b7c';const top=Math.min(yo,yc),bh=Math.max(1,Math.abs(yc-yo));ctx.fillRect(x-bw/2,top,bw,bh);
  });
  // Swing High / Swing Low markers (H/L)
  const visibleHighs=(S.swings?.hi||[]).filter(i=>i>=start&&i<start+a.length);
  const visibleLows=(S.swings?.lo||[]).filter(i=>i>=start&&i<start+a.length);
  ctx.textAlign='center';ctx.font='bold 10px system-ui';
  visibleHighs.forEach(i=>{const c=S.c[i],x=45+(i-start)*dx,y=Math.max(12,py(c.h)-10);ctx.fillStyle='#ffb35c';ctx.fillText('H',x,y);});
  visibleLows.forEach(i=>{const c=S.c[i],x=45+(i-start)*dx,y=Math.min(h-38,py(c.l)+18);ctx.fillStyle='#6ee7c8';ctx.fillText('L',x,y);});
  ctx.textAlign='start';
  const closes=a.map(x=>x.c);
  if(S.ema){const e=EMA(closes,20);line(a,e.slice(start),py,dx,'#d9b56c');}
  if(S.bb){const mid=SMA(closes,20),sd=closes.map((_,i)=>{const z=closes.slice(Math.max(0,i-19),i+1),m=mid[i];return Math.sqrt(z.reduce((q,v)=>q+(v-m)**2,0)/z.length)});line(a,mid.slice(start).map((v,i)=>v+2*sd[start+i]),py,dx,'#60758e');line(a,mid.slice(start).map((v,i)=>v-2*sd[start+i]),py,dx,'#60758e');}
  if(S.vwap){const v=VWAP(a);line(a,v.slice(start),py,dx,'#7ea6ff');}
  (S.sr||[]).filter(Number.isFinite).forEach(p=>hline(p,py,w,'#8b6f39'));
  // Open-position entry line: show the real Binance entry price directly on the chart.
  const ep=S.accountPosition;
  const entry=Number(ep?.entryPrice||0);
  if(ep && Math.abs(Number(ep.positionAmt||0))>0 && entry>0 && entry>=lo && entry<=hi){
    const ey=py(entry);
    const isLong=Number(ep.positionAmt)>0;
    ctx.save();
    ctx.strokeStyle=isLong?'#19d39b':'#ff5b7c';
    ctx.lineWidth=1.4;
    ctx.setLineDash([7,4]);
    ctx.beginPath();ctx.moveTo(45,ey);ctx.lineTo(w-8,ey);ctx.stroke();ctx.setLineDash([]);
    const label=(isLong?'ENTRY LONG':'ENTRY SHORT')+' · '+fmtIDR(entry);
    ctx.font='bold 10px system-ui';
    const tw=ctx.measureText(label).width+12;
    const bx=Math.max(48,Math.min(w-tw-8,w-10-tw));
    const by=Math.max(18,Math.min(h-30,ey-15));
    ctx.fillStyle=isLong?'#12372d':'#3b1825';
    ctx.fillRect(bx,by,tw,18);
    ctx.fillStyle=isLong?'#7ff2cc':'#ff9ab0';
    ctx.fillText(label,bx+6,by+12);
    ctx.restore();
  }
  
  if(S.fib&&Number.isFinite(S.fib.a)&&Number.isFinite(S.fib.b)){[0,.236,.382,.5,.618,.786,1].forEach(f=>hline(S.fib.a+(S.fib.b-S.fib.a)*f,py,w,'#3f536a'));}
  const last=a.at(-1); if(last){const x=45+(a.length-1)*dx;ctx.fillStyle='#e7edf5';ctx.font='10px system-ui';ctx.fillText('LIVE',Math.min(w-34,x+5),Math.max(12,py(last.c)-8));}
  ctx.fillStyle='#566579';ctx.font='9px system-ui';ctx.fillText('BINANCE FUTURES · LIVE',w-145,14);
}
function priceMap(){let w=Math.max(1,cv.clientWidth),h=Math.max(1,cv.clientHeight);const end=Math.max(1,S.c.length-(S.view?.offset||0)),span=Math.max(40,Math.min(300,S.view?.span||140)),start=Math.max(0,end-span),a=S.c.slice(start,end);if(!a.length)return{w,h,a,hi:1,lo:0,dx:1,py:p=>h/2,start,end};const levels=S.sr.filter(Number.isFinite),hi0=Math.max(...a.map(x=>x.h),...(levels.length?levels:[-Infinity])),lo0=Math.min(...a.map(x=>x.l),...(levels.length?levels:[Infinity]));let hi=Number.isFinite(hi0)?hi0:a[0].h,lo=Number.isFinite(lo0)?lo0:a[0].l;if(S.fib&&Number.isFinite(S.fib.a)&&Number.isFinite(S.fib.b)){hi=Math.max(hi,S.fib.a,S.fib.b);lo=Math.min(lo,S.fib.a,S.fib.b)}if(!(hi>lo)){const mid=Number(a.at(-1)?.c)||0;hi=mid+1;lo=mid-1}return{w,h,a,hi,lo,dx:Math.max(1,(w-58)/Math.max(1,a.length)),py:p=>h-32-(p-lo)/(hi-lo)*(h-62),start,end}}
function line(a,v,py,dx,col){ctx.strokeStyle=col||'#d9b56c';ctx.beginPath();v.forEach((z,i)=>{let x=45+i*dx,y=py(z);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
function hline(p,py,w,col){ctx.strokeStyle=col;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(45,py(p));ctx.lineTo(w,py(p));ctx.stroke();ctx.setLineDash([])}
function dot(i,p,dx,py,col,t){let x=45+i*dx,y=py(p);ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillText(t,x+4,y-4)}
async function load(){chartStatus('Mengambil data candlestick…');try{try{const rt=await jsonFetch('/api/runtime');MARKET_WS_BASE=rt.marketWs||rt.binanceWs||MARKET_WS_BASE;USDT_IDR_RATE=Number(rt.usdtIdrRate||USDT_IDR_RATE);updateModeUI(rt);await loadOrderConstraints()}catch{}let r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`),source=r.headers.get('X-Market-Data-Source')||'binance';let d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);S.c=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));$('price').textContent=fmtIDR(S.c.at(-1)?.c);$('conn').textContent=source==='bybit-fallback'?'MARKET DATA FALLBACK':'BINANCE DATA';$('conn').title=source==='bybit-fallback'?'Binance market-data access is unavailable; chart is using Bybit USDT perpetual public market data as a fallback.':'Binance Futures market data';S.swings=swings(S.c);smart();safeDraw();calc();connect();depth();if(!livePollTimer){pollLive();livePollTimer=setInterval(pollLive,1000)}if($('signalTf'))$('signalTf').value=S.tf;mtf();refreshSignalFromCurrent();updateAITrend();updateLiveSignal();}catch(e){$('conn').textContent='MARKET DATA ERROR';$('conn').title=e.message;chartStatus('Data chart gagal dimuat: '+e.message+' — periksa /api/klines dan konfigurasi Vercel.');startPolling()}}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
async function pollKlines(){try{const r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`);const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);const rows=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));if(!rows.length)return;S.c=rows;const source=r.headers.get('X-Market-Data-Source')||'binance';$('price').textContent=fmtIDR(S.c.at(-1).c);$('conn').textContent=source==='bybit-fallback'?'POLLING · BYBIT FALLBACK':'POLLING';S.swings=swings(S.c);smart();calc();safeDraw()}catch(e){$('conn').title=e.message}}
async function pollLive(){try{const r=await fetch(`/api/market/ticker?symbol=${S.symbol}&interval=${S.tf}`,{cache:'no-store'});const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market ticker HTTP ${r.status}`);if(d.candle){const c={t:+d.candle.t,o:+d.candle.o,h:+d.candle.h,l:+d.candle.l,c:+d.candle.c,v:+d.candle.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else if(!q||c.t>q.t)S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);$('mark').textContent=fmtIDR(d.markPrice);$('index').textContent=fmtIDR(d.indexPrice);$('funding').textContent=(+d.fundingRate*100).toFixed(4)+'%';S.market.mark=+d.markPrice;S.market.index=+d.indexPrice;S.market.funding=+d.fundingRate;updateLiveSignal();S.swings=swings(S.c);smart();calc();safeDraw()} }catch(e){$('conn').title='Live ticker fallback: '+e.message}}
function startPolling(){if(pollTimer)return;pollKlines();pollTimer=setInterval(pollKlines,5000)}
let wsRetry=0,wsRetryTimer=null;
function connect(){if(wsRetryTimer){clearTimeout(wsRetryTimer);wsRetryTimer=null}if(ws){try{ws.close()}catch{}}const s=S.symbol.toLowerCase(),tf=S.tf;const streams=[`${s}@kline_${tf}`,`${s}@bookTicker`,`${s}@depth@100ms`,`${s}@markPrice@1s`,`${s}@forceOrder`,`${s}@aggTrade`].join('/');const url=`${MARKET_WS_BASE.replace(/\/$/,'')}/stream?streams=${streams}`;try{ws=new WebSocket(url)}catch(e){$('conn').textContent='POLLING';startPolling();scheduleReconnect();return}ws.onopen=()=>{wsRetry=0;$('conn').textContent='REALTIME · WS';$('conn').title='Binance Futures WebSocket market data';safeDraw();chartStatus('REALTIME · Binance Futures WebSocket')};ws.onerror=()=>{$('conn').textContent='RECONNECTING…';$('conn').title='WebSocket error; retrying';startPolling()};ws.onclose=()=>{$('conn').textContent='RECONNECTING…';startPolling();scheduleReconnect()};ws.onmessage=e=>{try{let z=JSON.parse(e.data),d=z.data||z;if(!d)return;if(d.e==='kline'){let k=d.k,c={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmtIDR(c.c);S.swings=swings(S.c);smart();calc();updateLiveSignal();scheduleDraw();if(k.x)recordClosedSignal(c)}else if(d.e==='bookTicker'){S.book.bid=+d.b;S.book.ask=+d.a;$('spread').textContent=fmt(+d.a-+d.b);scheduleDraw()}else if(d.e==='depthUpdate'){
  const merge=(current,updates)=>{const m=new Map((current||[]).map(x=>{const k=String(x[0]);return [k,[k,String(x[1])]];}));for(const x of (updates||[])){const k=String(x[0]),q=Number(x[1]);if(q===0)m.delete(k);else m.set(k,[k,String(x[1])]);}return [...m.values()].sort((a,b)=>Number(b[0])-Number(a[0]));};
  S.book.bids=merge(S.book.bids,d.b);S.book.asks=merge(S.book.asks,d.a);renderBook()
}else if(d.e==='markPriceUpdate'){S.market.mark=+d.p;S.market.index=+d.i;S.market.funding=+d.r;$('mark').textContent=fmtIDR(d.p);$('index').textContent=fmtIDR(d.i);$('funding').textContent=(+d.r*100).toFixed(4)+'%'}else if(d.e==='aggTrade'){const price=+d.p;if(Number.isFinite(price)){const q=S.c.at(-1);if(q){q.c=price;q.h=Math.max(q.h,price);q.l=Math.min(q.l,price);lastLivePriceTs=Date.now();$('price').textContent=fmtIDR(price);S.market.last=price;updateLiveSignal();scheduleDraw();}}}else if(d.e==='forceOrder'){S.market.liq=d.o?.q||0;$('liq').textContent=`${d.o?.S||''} ${fmt(+d.o?.p||0)} × ${fmt(+d.o?.q||0)}`}}catch{}}}
function tfMillis(tf){const m={1:60000,3:180000,5:300000,15:900000,30:1800000,1.0:3600000};if(tf.endsWith('m'))return Number(tf.slice(0,-1))*60000;if(tf.endsWith('h'))return Number(tf.slice(0,-1))*3600000;if(tf.endsWith('d'))return Number(tf.slice(0,-1))*86400000;return 300000}
function hybridPredictiveCandle(closed, live){
  const base=predictiveCandle(closed);
  if(!live||!closed?.length)return base;
  const last=closed.at(-1), atr=ATR(closed).at(-1)||Math.abs(last.c-last.o)||1;
  const range=Math.max(1e-12,live.h-live.l), body=Math.abs(live.c-live.o);
  const upper=live.h-Math.max(live.o,live.c), lower=Math.min(live.o,live.c)-live.l;
  const bodyRatio=body/range, upperRatio=upper/range, lowerRatio=lower/range;
  const move=(live.c-last.c)/Math.max(atr,1e-12);
  let bull=base.bull,bear=base.bear,reason=[...base.reason];
  // Live candle is an early-warning layer only. It is deliberately capped so
  // one/two ticks cannot overturn the closed-candle structure.
  if(lowerRatio>=.55 && move<=.35){bull+=7;bear-=3;reason.push('Realtime lower-wick support');}
  if(upperRatio>=.55 && move>=-.35){bear+=7;bull-=3;reason.push('Realtime upper-wick resistance');}
  if(bodyRatio>=.60 && Math.abs(move)>=.25){
    if(live.c>live.o){bull+=6;reason.push('Realtime bullish pressure');}
    else if(live.c<live.o){bear+=6;reason.push('Realtime bearish pressure');}
  }
  bull=Math.max(0,Math.min(100,bull)); bear=Math.max(0,Math.min(100,bear));
  const gap=Math.abs(bull-bear),score=Math.max(bull,bear);
  let side='WAIT';
  const twoSidedConflict = bull>=45 && bear>=45 && gap<10;
  if(!twoSidedConflict && bull>=54&&gap>=8)side='BUY';
  else if(!twoSidedConflict && bear>=54&&gap>=8)side='SELL';
  else reason.push(twoSidedConflict?'Realtime conflict → WAIT':'Realtime belum cukup dominan');
  return {...base,side,score,bull,bear,gap,reason:reason.slice(-8),strength:score>=78?'HIGH':score>=62?'MEDIUM':'LOW'};
}

// SINGLE SOURCE OF TRUTH for the current signal.
// The UI used to mix predictiveCandle(), hybridPredictiveCandle(), and
// aiCandleTrend(), so different panels could legitimately show BUY/SELL/WAIT
// at the same moment. Current-signal panels now all use this function.
function finalSignal(closed, live){
  const t=hybridPredictiveCandle(closed, live);
  return {...t,signalModel:'UNIFIED_HYBRID',signalScope:'CURRENT_CANDLE'};
}

function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),closed=S.c.length>1?S.c.slice(0,-1):S.c,t=finalSignal(closed,c);const dir=c.c>c.o?'NAIK · B':c.c<c.o?'TURUN · S':'DATAR';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta');if(sig){sig.textContent=t.side==='BUY'?'B':t.side==='SELL'?'S':'WAIT';sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`${t.score||0}/100 · ${t.strength||'LOW'} · ${t.reason?.[0]||'Membaca sumbu dan momentum'}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('NAIK')?'good':dir.startsWith('TURUN')?'bad':'wait')}if(cprice)cprice.textContent=`${fmtIDR(c.c)} · Buka ${fmtIDR(c.o)}`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'B ↑':t.side==='SELL'?'S ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`${t.score||0}/100 · ${dir} · close ${mm}:${ss}`;AI_TREND=t; updateEntryButtons()}
function renderAccountDock(x){if(!x)return;const b=x.balances?.find(z=>z.asset==='USDT'),p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol&&Math.abs(Number(z.positionAmt||0))>0);S.accountPosition=p||null;scheduleDraw();const bal=Number(b?.balance||0),av=Number(b?.availableBalance||0),up=Number(p?.unRealizedProfit||0),entry=Number(p?.entryPrice||0),mark=Number(p?.markPrice||S.market.mark||0),qty=Number(p?.positionAmt||0),notional=Math.abs(entry*qty),roe=notional?up/Math.max(1,Math.abs(notional)/Math.max(1,Number(p?.leverage||+$('lev').value||1)))*100:0,rp=Number(x.lastRealizedPnL);$('dockBalance').textContent=fmtIDR(bal);$('dockDanaTersedia').textContent=fmtIDR(av);$('dockUpnl').textContent=fmtIDR(up);$('dockUpnl').className=up>0?'pnlProfit':up<0?'pnlLoss':'';$('dockDD').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';if($('dockRealized')){$('dockRealized').textContent=Number.isFinite(rp)?fmtIDR(rp):'—';$('dockRealized').className=Number.isFinite(rp)?(rp>=0?'pnlProfit':'pnlLoss'):''}$('accountDockMode').textContent=x.accountType||'ACCOUNT';$('dockPositionStatus').textContent=p?'OPEN POSITION · TERDETEKSI DI BINANCE':'NO OPEN POSITION';$('dockArah').textContent=p?(Number(p.positionAmt)>0?'LONG':'SHORT'):'—';$('dockArah').className=p?(Number(p.positionAmt)>0?'good':'bad'):'';$('dockHargaMasuk').textContent=p?fmtIDR(entry):'—';$('dockHargaMark').textContent=p?fmtIDR(mark):fmtIDR(S.market.mark);$('dockJumlah').textContent=p?fmt(Math.abs(qty)):'—';$('dockPnl').textContent=p?fmtIDR(up):'—';$('dockPnl').className=p?(up>=0?'pnlProfit':'pnlLoss'):'';$('dockRoe').textContent=p?fmt(roe)+'%':'—';$('balance').textContent=fmtIDR(bal);$('availableBalance').textContent=fmtIDR(av);$('upnl').textContent=fmtIDR(up);$('liqPrice').textContent=p?fmtIDR(p.liquidationPrice):'—';$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';const closeBtn=$('closePosition'),entryBtns=[$('long'),$('short'),$('quickLong'),$('quickShort')].filter(Boolean);if(closeBtn){closeBtn.disabled=!p;closeBtn.style.opacity=p?'1':'.45'}entryBtns.forEach(btn=>{btn.disabled=!!p;btn.style.opacity=p?'.45':'1';btn.title=p?'Tutup posisi aktif terlebih dahulu sebelum entry baru.':''});if(p){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${up>=0?'good':'bad'}">${up>=0?'PROFIT':'LOSS'} ${fmtIDR(up)} · OPEN</b><div class="note">${Number(p.positionAmt)>0?'BUY / LONG':'SELL / SHORT'} · Masuk ${fmtIDR(entry)} · Mark ${fmtIDR(mark)} · Jumlah ${fmt(Math.abs(qty))} · ROE ${fmt(roe)}%</div><div class="note bad">Posisi ini terdeteksi dari akun Binance saat sinkronisasi. Membuka halaman tidak membuat order baru. Tutup posisi ini sebelum entry berikutnya.</div>`}else if(Number.isFinite(rp)){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${rp>=0?'good':'bad'}">LAST REALIZED: ${rp>=0?'PROFIT':'LOSS'} ${fmtIDR(rp)}</b><div class="note">LIVE POSITION: <b>CLOSED / 0 BTC</b> · Saldo diambil langsung dari Binance.</div>`}else{$('orderResult').style.display='none'}}

function updateModeUI(rt){if(!rt)return;const mode=String(rt.tradingMode||'paper').toUpperCase();$('mode').textContent=mode;$('accountMode').textContent=mode==='DEMO'?'BINANCE DEMO':mode==='LIVE'?'BINANCE LIVE':'PAPER';const note=$('executionNote');if(note)note.textContent=mode==='DEMO'?'BUY/SELL akan mengirim order ke Binance Futures DEMO (virtual funds).':mode==='LIVE'?'BUY/SELL akan mengirim order ke Binance Futures LIVE. Periksa API permission sebelum entry.':'BUY/SELL hanya membuat posisi PAPER lokal.';}
function scheduleReconnect(){if(wsRetryTimer)return;const delay=Math.min(30000,Math.max(1000,2**wsRetry*1000));wsRetry=Math.min(wsRetry+1,5);wsRetryTimer=setTimeout(()=>{wsRetryTimer=null;connect()},delay)}
async function depth(){try{let d=await jsonFetch(`/api/depth?symbol=${S.symbol}`);if(!d.error){S.book.bids=d.bids;S.book.asks=d.asks;renderBook()};let o=await jsonFetch(`/api/open-interest?symbol=${S.symbol}`);if(!o.error)$('oi').textContent=fmt(o.openInterest)}catch{}}
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
function predictiveCandle(c){
  const sr=detectSR(c);
  if(!c||c.length<35)return {side:'WAIT',score:0,bull:0,bear:0,reason:['Need candle history'],strength:'LOW',sr};

  // This model predicts the NEXT candle, not the prevailing trend.
  // Trend/MTF is context only; candle structure and S/R can override it.
  const a=c, n=a.length-1, x=a[n], prev=a[n-1];
  let bull=0,bear=0,reason=[];
  const range=Math.max(1e-12,x.h-x.l);
  const body=Math.abs(x.c-x.o);
  const upper=x.h-Math.max(x.o,x.c);
  const lower=Math.min(x.o,x.c)-x.l;

  // Candle structure
  if(lower/range>=.40){bull+=18;reason.push('Lower-wick rejection');}
  if(upper/range>=.40){bear+=18;reason.push('Upper-wick rejection');}
  if(body/range>=.50&&x.c>x.o){bull+=14;reason.push('Bullish body/close kuat');}
  if(body/range>=.50&&x.c<x.o){bear+=14;reason.push('Bearish body/close kuat');}
  if(x.c>prev.c){bull+=7}else if(x.c<prev.c){bear+=7}

  // Short-term momentum
  const recent=a.slice(-8);
  const ups=recent.filter((z,i)=>i&&z.c>recent[i-1].c).length;
  const downs=recent.filter((z,i)=>i&&z.c<recent[i-1].c).length;
  if(ups>=5){bull+=10;reason.push('Momentum candle bullish');}
  if(downs>=5){bear+=10;reason.push('Momentum candle bearish');}

  const closes=a.map(z=>z.c);
  const e9=EMA(closes,9),e21=EMA(closes,21);
  const slope9=e9[n]-e9[Math.max(0,n-3)];
  if(e9[n]>e21[n]&&slope9>0){bull+=9;reason.push('Momentum EMA naik');}
  if(e9[n]<e21[n]&&slope9<0){bear+=9;reason.push('Momentum EMA turun');}

  // S/R is a directional input, not just an informational label.
  if(sr.context==='SUPPORT_REJECTION'){bull+=22;reason.push('Rejection di support');}
  if(sr.context==='RESISTANCE_REJECTION'){bear+=22;reason.push('Rejection di resistance');}
  if(sr.support&&x.c>sr.support&&prev.c<=sr.support){bull+=16;reason.push('Reclaim support');}
  if(sr.resistance&&x.c<sr.resistance&&prev.c>=sr.resistance){bear+=16;reason.push('Reject resistance');}
  if(sr.resistance&&x.c>sr.resistance&&prev.c<=sr.resistance){bull+=16;reason.push('Breakout resistance');}
  if(sr.support&&x.c<sr.support&&prev.c>=sr.support){bear+=16;reason.push('Breakdown support');}

  // Near a level, the next candle has less room to continue in the same direction.
  // A rejection gets priority over the broader trend.
  const nearPct=0.35;
  if(sr.resistance&&sr.distanceResistance!=null&&sr.distanceResistance<nearPct){
    bear+=14; bull-=10; reason.push('Harga dekat resistance → proyeksi SELL diperkuat');
  }
  if(sr.support&&sr.distanceSupport!=null&&sr.distanceSupport<nearPct){
    bull+=14; bear-=10; reason.push('Harga dekat support → proyeksi BUY diperkuat');
  }

  // MTF is deliberately a capped context signal. It must not turn a bullish
  // trend into a permanent BUY sequence when the next candle disagrees.
  const mtfWeights={ '1m':3, '5m':5, '15m':6, '1h':7, '4h':5 };
  let mtfBull=0,mtfBear=0;
  if(S.mtf&&typeof S.mtf==='object'){
    for(const [tf,w] of Object.entries(mtfWeights)){
      const v=S.mtf[tf]; if(!v)continue;
      const adx=Number(v.ad);
      const strength=Number.isFinite(adx)?clamp(adx/35,0.55,1.15):0.8;
      if(v.dir==='BULL')mtfBull+=w*strength;
      else if(v.dir==='BEAR')mtfBear+=w*strength;
    }
  }
  if(mtfBull>mtfBear+4){bull+=Math.min(16,mtfBull);reason.push('MTF bullish (context)');}
  else if(mtfBear>mtfBull+4){bear+=Math.min(16,mtfBear);reason.push('MTF bearish (context)');}

  bull=Math.max(0,Math.min(100,bull));
  bear=Math.max(0,Math.min(100,bear));
  const gap=Math.abs(bull-bear),score=Math.max(bull,bear);

  // Three-level decision:
  // BUY/SELL must have a real directional edge, but the bar must not be so
  // strict that normal market structure becomes WAIT almost everywhere.
  // If both sides have meaningful evidence and are close, keep WAIT.
  let side='WAIT';
  const twoSidedConflict = bull>=45 && bear>=45 && gap<9;
  if(!twoSidedConflict && bull>=52 && gap>=7)side='BUY';
  else if(!twoSidedConflict && bear>=52 && gap>=7)side='SELL';
  else reason.push(twoSidedConflict?'Konflik bullish/bearish → WAIT':'Bukti belum cukup kuat → WAIT');

  return {
    side,score,bull,bear,gap,mtfBull,mtfBear,
    reason:reason.slice(-8),
    strength:score>=78?'HIGH':score>=62?'MEDIUM':'LOW',
    sr
  };
}
function aiCandleTrend(c){
  if(!c||c.length<30)return {side:'WAIT',score:0,reason:['Need at least 30 candles'],strength:'LOW'};
  const close=c.map(x=>x.c), e9=EMA(close,9), e21=EMA(close,21), e50=EMA(close,50);
  const last=c.length-1, recent=c.slice(-12);
  let bull=0,bear=0,reason=[];
  const slope=(a,n)=>a[last]-a[last-n];
  const s9=slope(e9,5),s21=slope(e21,5);
  if(e9[last]>e21[last]&&s9>0) {bull+=25;reason.push('EMA 9 > EMA 21 dan slope naik')}
  else if(e9[last]<e21[last]&&s9<0) {bear+=25;reason.push('EMA 9 < EMA 21 dan slope turun')}
  if(e21[last]>e50[last]&&s21>0) {bull+=20;reason.push('Trend menengah bullish')}
  else if(e21[last]<e50[last]&&s21<0) {bear+=20;reason.push('Trend menengah bearish')}
  let up=0,down=0;
  for(let i=1;i<recent.length;i++){
    if(recent[i].c>recent[i-1].c)up++;
    if(recent[i].c<recent[i-1].c)down++;
  }
  if(up>=8){bull+=20;reason.push('Mayoritas candle naik')}
  if(down>=8){bear+=20;reason.push('Mayoritas candle turun')}
  const body=recent.map(x=>Math.abs(x.c-x.o)), avg=body.reduce((a,b)=>a+b,0)/body.length;
  const lastBody=Math.abs(c[last].c-c[last].o);
  if(lastBody>avg*1.25){
    if(c[last].c>c[last].o){bull+=10;reason.push('Candle terakhir bullish kuat')}
    else if(c[last].c<c[last].o){bear+=10;reason.push('Candle terakhir bearish kuat')}
  }
  const hh=recent[recent.length-1].h>Math.max(...recent.slice(0,-1).map(x=>x.h));
  const ll=recent[recent.length-1].l<Math.min(...recent.slice(0,-1).map(x=>x.l));
  if(hh){bull+=15;reason.push('Break recent high / higher-high')}
  if(ll){bear+=15;reason.push('Break recent low / lower-low')}
  const total=bull+bear;
  let side='WAIT',score=Math.max(bull,bear);
  if(bull>=60&&bull-bear>=15)side='BUY';
  else if(bear>=60&&bear-bull>=15)side='SELL';
  else {score=Math.max(bull,bear);reason.push('Arah belum cukup dominan → WAIT')}
  return {side,score,bull,bear,reason,strength:score>=75?'HIGH':score>=60?'MEDIUM':'LOW'};
}
function updateAITrend(){
  const closed=S.c.length>1?S.c.slice(0,-1):S.c;
  const t=finalSignal(closed,S.c.at(-1));
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
  if(lb)lb.disabled=ENTRY_GUARD && t.side!=='BUY'; if(sb)sb.disabled=ENTRY_GUARD && t.side!=='SELL'; updateEntryButtons();
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

    const twoSidedConflict = bull>=45 && bear>=45 && gap<9;
    if(!srConflict&&!twoSidedConflict&&bull>=52&&gap>=7)side='BUY';
    else if(!srConflict&&!twoSidedConflict&&bear>=52&&gap>=7)side='SELL';
    else if(srConflict&&!twoSidedConflict&&bull>=62&&gap>=10)side='BUY';
    else if(srConflict&&!twoSidedConflict&&bear>=62&&gap>=10)side='SELL';

    const strength=score>=78?'HIGH':score>=62?'MEDIUM':'LOW';
    const reason=side==='BUY'
      ? (srConflict?'support/breakout + projected path':h<=2?'next-candle momentum + structure':'projected bullish path')
      : side==='SELL'
        ? (srConflict?'resistance/rejection + projected path':h<=2?'next-candle momentum + structure':'projected bearish path')
        : (srConflict?'S/R conflict → WAIT':'candle projection conflict → WAIT');

    const ts=Math.floor((last.t+ms*h)/ms)*ms;
    out.push({ts,side,score,strength,horizon:h,reason,virtual,bull,bear,gap});

    // The next projected candle starts from the path just produced.
    pressure=clamp((step/Math.max(atr,1))*.72,-0.8,0.8);
  }
  return out;
}
function renderFutureForecast(){
  const el=$('forecastFeed'); if(!el)return;
  const rows=projectFutureSignals();
  const count=$('forecastCount'); if(count)count.textContent=`${rows.length||26} candle`;
  if(!rows.length){el.innerHTML='<div class="note">Menunggu minimal 36 candle untuk proyeksi.</div>';return}
  const seq=rows.map(x=>x.side==='BUY'?'B':x.side==='SELL'?'S':'•').join(' ');
  const patt=$('forecastPattern'); if(patt)patt.textContent=seq;
  el.innerHTML=rows.map((x,i)=>{
    const side=x.side==='BUY'?'B':x.side==='SELL'?'S':'WAIT', cls=x.side==='BUY'?'buy':x.side==='SELL'?'sell':'wait', arrow=x.side==='BUY'?'↑':x.side==='SELL'?'↓':'•';
    return `<div class="forecastRow ${i===0?'next':''}"><span class="forecastTime">${forecastLabel(x.ts)}</span><span class="forecastSide ${cls}">${side} ${arrow}</span><span class="forecastMeta">${x.score}/100 · ${x.strength} · ${x.reason}<div class="forecastBar"><i class="${cls}" style="width:${Math.max(4,Math.min(100,x.score))}%"></i></div></span></div>`;
  }).join('');
}
function renderSignalDrop(){const el=$('signalFeed');if(!el)return;const tf=$('signalTf')?.value||S.tf;const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===tf).slice(0,80);$('signalCount').textContent=`${rows.length} sinyal`;el.innerHTML=rows.length?rows.map(x=>{const b=x.side==='BUY',s=x.side==='SELL',label=b?'B':s?'S':'W',cls=b?'good':s?'bad':'wait',arrow=b?'↑':s?'↓':'•';return `<div class="signalRow"><span class="signalTime">${signalTime(x.ts)}</span><span class="signalSide ${cls}">${label} <span class="signalArrow">${arrow}</span></span><span class="signalMeta">${x.score}/100 · ${x.strength}<br>${x.predictedAt||''}<br>${x.reason?.[0]||x.context||''}</span></div>`}).join(''):'<div class="note">Belum ada proyeksi candle. AI sedang membaca struktur, momentum, MTF, dan S/R…</div>';renderFutureForecast();}
function persistSignals(){try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(SIGNALS.slice(0,300)))}catch{}}
function recordPredictionSignal(ts=Date.now()){
  if(S.c.length<36)return;
  // Use the latest closed candle as the structural base and the live candle as
  // a capped realtime correction, so Signal Drop can react without tick-noise.
  const closed=S.c.slice(0,-1);
  const t=finalSignal(closed,S.c.at(-1));
  const slot=Math.floor(ts/Math.max(60000,tfMillis(S.tf)));
  const key=`${S.symbol}:${S.tf}:${slot}`;
  const c=S.c.at(-1);
  const row={
    key,ts,symbol:S.symbol,tf:S.tf,side:t.side,score:t.score,strength:t.strength,
    reason:t.reason,context:t.sr?.context||'NO_LEVEL',support:t.sr?.support,
    resistance:t.sr?.resistance,
    predictedAt:`Prediksi candle berikutnya ${nextCandleTime(c?.t||ts)}`
  };
  // One row per candle slot. If the model changes B → S → W while the
  // candle is forming, Signal Drop reflects the latest per-candle projection.
  const idx=SIGNALS.findIndex(x=>x.key===key);
  if(idx>=0)SIGNALS[idx]={...SIGNALS[idx],...row};
  else SIGNALS.unshift(row);
  lastSignalSlot=slot; lastSignalSide=t.side;
  SIGNALS=SIGNALS.slice(0,300);
  persistSignals();renderSignalDrop();
}
function recordClosedSignal(c){if(!c)return;recordPredictionSignal(Date.now())}
function refreshSignalFromCurrent(){recordPredictionSignal(Date.now());renderSignalDrop()}
function scheduleLivePrediction(){recordPredictionSignal(Date.now())}
function mtf(){let tfs=['1m','5m','15m','1h','4h'];Promise.all(tfs.map(tf=>jsonFetch(`/api/klines?symbol=${S.symbol}&interval=${tf}&limit=180`).then(d=>({tf,c:(d||[]).map(x=>({o:+x[1],h:+x[2],l:+x[3],c:+x[4]}))})))).then(rows=>{S.mtf={};rows.forEach(x=>{let a=x.c.map(z=>z.c),r=RSI(a).at(-1),e20=EMA(a,20).at(-1),e50=EMA(a,50).at(-1),ad=ADX(x.c).at(-1),dir=e20>e50?'BULL':'BEAR';S.mtf[x.tf]={dir,r,ad};});render('confluence')}).catch(()=>{})}
async function order(side){
  if(AUTO_ENTRY!==false && !window.__manualOrderClick)return;
  if(S.accountPosition&&Math.abs(Number(S.accountPosition.positionAmt||0))>0)return alert(`Masih ada posisi Binance ${Number(S.accountPosition.positionAmt)>0?'LONG':'SHORT'} ${Math.abs(Number(S.accountPosition.positionAmt)).toFixed(6)} BTC. Tutup posisi aktif dulu.`);
  const g=entryGuard(side);if(!g.ok){alert(g.reason);return}
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
  const chosenIDR=fromUSDT(preview.entryPrice),slIDR=fromUSDT(z.sl),tpIDR=fromUSDT(z.tp);
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
  if(!confirm(confirmText))return;
  const body={symbol:S.symbol,side,entry:preview.entryPrice,entryType,entryPrice:entryType==='LIMIT'?chosenUSDT:preview.entryPrice,stopLoss:z.sl,takeProfit:noTp?0:z.tp,capital:toUSDT(capitalIdr),riskPct,leverage,marginType:String($('margin')?.value||'Cross').toUpperCase(),sizingMode,expectedQuantity:Number(preview.finalQty),expectedNotional:Number(preview.finalNotional),setup:'structure+ATR',reason:'manual',profitMode:noTp?'TANPA_BATAS':'TARGET'};
  const target=mode==='paper'?'/api/paper/order':'/api/live/order';
  const x=await jsonFetch(target,{method:'POST',headers:H(),body:JSON.stringify(body)}).catch(e=>({error:e.message,code:e.code}));
  if(x.error){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="bad">ENTRY GAGAL</b><div class="note">${x.error}</div>`;await refreshAccount();return alert(x.error)}
  const sz=x.sizing||{},ap=x.actualPosition;const match=x.qtyMatch!==false;
  $('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${match?'good':'bad'}">ENTRY ${side==='LONG'?'BUY / LONG':'SELL / SHORT'} ${match?'TERSINKRON':'PERIKSA QTY'}</b><div class="note">Target server <b>${Number(sz.finalQty||preview.finalQty).toFixed(6)} BTC</b> · Notional target <b>${fmtIDR(Number(sz.finalNotional||preview.finalNotional))}</b> · Binance aktual <b>${ap?Number(ap.quantity).toFixed(6):'—'} BTC</b> / ${ap?fmtIDR(Number(ap.notional||0)):'—'} · Entry ${fmtIDR(fromUSDT(Number(ap?.entryPrice||preview.entryPrice)))} · SL ${fmtIDR(slIDR)} · Target ${noTp?'TANPA BATAS':fmtIDR(tpIDR)}</div><div class="note good">Rp300.000 × 20× hanya menjadi ±Rp6.000.000 jika Qty aktual Binance memang sesuai target. UI memakai Qty Binance sebagai sumber kebenaran.</div>`;
  if(mode==='paper'&&x.position){S.positions.push(x.position);render('positions')}else{await refreshAccount()}
}

function fmtIDRNumber(usdt){return Number(usdt||0)*USDT_IDR_RATE}
function fromUSDT(usdt){return Number(usdt||0)*USDT_IDR_RATE}
function render(tab){let el=$('content');
if(tab==='confluence')el.innerHTML=`<div class="aiCard"><div><span class="label">FINAL SIGNAL · UNIFIED</span><div id="aiSignal" class="signal wait">WAIT</div><div id="aiScore" class="note">0/100 · LOW</div></div><div class="aiReasons"><div class="label">ALASAN</div><div id="aiReason" class="note">Menunggu data candle…</div><div id="predictBox" class="predictBox note">S/R: —</div></div></div><div class="srCard"><div class="label">SUPPORT / RESISTANCE</div><div class="srLevels"><div class="srLevel"><span class="note">SUPPORT</span><b id="srSupport">—</b></div><div class="srLevel"><span class="note">RESISTANCE</span><b id="srResistance">—</b></div></div><div id="srContext" class="note" style="margin-top:7px">Belum ada level.</div></div><table class="table"><tr><th>TF</th><th>Trend</th><th>RSI</th><th>ADX</th></tr>${Object.entries(S.mtf).map(([k,v])=>`<tr><td>${k}</td><td class="${v.dir==='BULL'?'good':'bad'}">${v.dir}</td><td>${fmt(v.r)}</td><td>${fmt(v.ad)}</td></tr>`).join('')}</table><div class="note">FINAL SIGNAL memakai satu mesin keputusan untuk panel utama, live, dan Signal Drop. MTF tetap ditampilkan sebagai konteks; proyeksi masa depan dipisahkan dari sinyal saat ini.</div>`;
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
async function closePosition(){
  if(!confirm(`Tutup posisi ${S.symbol} sekarang pada harga market?
Ini akan menutup posisi yang sedang terbuka.`))return;
  const rt=await jsonFetch('/api/runtime').catch(e=>({error:e.message}));if(rt.error)return alert(rt.error);
  const mode=String(rt.tradingMode||'paper').toLowerCase();
  const x=await jsonFetch(mode==='paper'?'/api/paper/close':'/api/live/close',{method:'POST',headers:H(),body:JSON.stringify({symbol:S.symbol})}).catch(e=>({error:e.message}));
  if(x.error){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="bad">GAGAL MENUTUP</b><div class="note">${x.error}</div>`;return alert(x.error)}
  const realized=Number(x.realizedPnl??x.pnl??0),delta=Number(x.walletDelta||0),after=Number(x.balanceAfter||0);$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${realized>=0?'good':'bad'}">POSISI DITUTUP · ${realized>=0?'PROFIT':'LOSS'} REALIZED ${fmtIDR(fromUSDT(realized))}</b><div class="note">Harga keluar ${x.exitPrice?fmtIDR(fromUSDT(x.exitPrice)):'market'} · Saldo Binance setelah close: <b>${Number.isFinite(after)?fmtIDR(fromUSDT(after)):'—'}</b> · Perubahan wallet: ${fmtIDR(fromUSDT(delta))}</div>`;
  S.accountPosition=null;scheduleDraw();
  for(let i=0;i<8;i++){
    await refreshAccount();
    if(!S.accountPosition){
      $('orderResult').innerHTML=`<b class="${realized>=0?'good':'bad'}">CLOSED · ${realized>=0?'PROFIT':'LOSS'} REALIZED ${fmtIDR(fromUSDT(realized))}</b><div class="note">LIVE POSITION: <b>CLOSED / 0 BTC</b> · Saldo Binance: <b>${Number.isFinite(after)?fmtIDR(fromUSDT(after)):'—'}</b> · Perubahan wallet: ${fmtIDR(fromUSDT(delta))}</div>`;
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  $('orderResult').innerHTML+=`<div class="note bad">Binance belum melaporkan 0 BTC setelah beberapa kali sinkronisasi. Tekan SYNC untuk cek ulang.</div>`;
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
  [['emaBtn','ema'],['bbBtn','bb'],['macdBtn','macd'],['vwapBtn','vwap'],['adxBtn','adx'],['atrBtn','atr']].forEach(([id,k])=>{const b=$(id);if(b){b.classList.toggle('active',!!S[k]);b.title=`${k.toUpperCase()} · ANALISIS SAJA · tidak mengirim order`;}});
  [['trendBtn','trend'],['fibBtn','fib']].forEach(([id,k])=>{const b=$(id);if(b){b.classList.toggle('active',activeTool===k);b.title=`${k==='fib'?'Fibonacci':'Trendline'} · ANALISIS SAJA · klik chart untuk menggambar`;}});
  const sr=$('srBtn'); if(sr){sr.title='Auto S/R · ANALISIS SAJA · menghitung support/resistance, tidak mengirim order';sr.classList.toggle('active',Array.isArray(S.sr)&&S.sr.length>0);}
  const sw=$('swingBtn'); if(sw)sw.title='Swings H/L · ANALISIS SAJA · menampilkan swing high/low';
  const st=$('analysisMode'); if(st)st.textContent=activeTool?`ANALISIS: ${activeTool==='fib'?'FIBONACCI':'TRENDLINE'}`:'ANALISIS SAJA · ORDER: LONG/SHORT';
}
[['emaBtn','ema'],['bbBtn','bb'],['macdBtn','macd'],['vwapBtn','vwap'],['adxBtn','adx'],['atrBtn','atr']].forEach(([id,k])=>$(id).onclick=()=>{S[k]=!S[k];updateAnalysisUI();draw();calc();updateAITrend()});
function setChartTool(tool){S.tool=S.tool===tool?null:tool;S.drag=null;updateAnalysisUI();draw();}
$('trendBtn').onclick=()=>setChartTool('trend');
$('fibBtn').onclick=()=>setChartTool('fib');
$('srBtn').onclick=()=>{const sr=detectSR(S.c.slice(0,-1));SR_STATE=sr;S.sr=[sr.support,sr.resistance].filter(Boolean);updateAnalysisUI();draw();updateAITrend();alert(`Auto S/R\nSupport: ${sr.support?fmt(sr.support):'—'}\nResistance: ${sr.resistance?fmt(sr.resistance):'—'}\nContext: ${sr.context}\n\nMode: ANALISIS SAJA — tidak ada order yang dikirim.`)};
$('swingBtn').onclick=()=>{S.swings=swings(S.c);updateAnalysisUI();draw()};
$('tv').onclick=()=>window.open(`https://www.tradingview.com/chart/?symbol=BINANCE:${S.symbol}.P`);
async function syncAfterClose(){for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,500));try{const x=await jsonFetch('/api/account',{headers:H()});if(x.error)continue;renderAccountDock(x);const ps=(x.binancePositions||[]).filter(z=>Math.abs(Number(z.positionAmt||0))>0);if(!ps.some(z=>z.symbol===S.symbol))return x}catch{}}return null}
$('long').onclick=()=>{window.__manualOrderClick=true;order('LONG').finally(()=>window.__manualOrderClick=false)};$('short').onclick=()=>{window.__manualOrderClick=true;order('SHORT').finally(()=>window.__manualOrderClick=false)};$('quickLong').onclick=()=>{window.__manualOrderClick=true;order('LONG').finally(()=>window.__manualOrderClick=false)};$('quickShort').onclick=()=>{window.__manualOrderClick=true;order('SHORT').finally(()=>window.__manualOrderClick=false)};$('reconcileDock').onclick=()=>refreshAccount();$('reconcile').onclick=()=>jsonFetch('/api/account',{headers:H()}).then(x=>{if(x.error){alert(x.error);return}let b=x.balances?.find(z=>z.asset==='USDT');$('balance').textContent=fmt(b?.balance);$('availableBalance').textContent=fmt(b?.availableBalance);$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';let p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol && Math.abs(Number(z.positionAmt||0))>0);if(p){$('upnl').textContent=fmt(p.unRealizedProfit);$('liqPrice').textContent=fmt(p.liquidationPrice)}else{$('upnl').textContent=fmt(0);$('liqPrice').textContent='—'}});
$('kill').onclick=()=>{let on=!S.kill;if(!confirm(on?'Aktifkan KILL SWITCH?':'Matikan KILL SWITCH?'))return;jsonFetch('/api/kill-switch',{method:'POST',headers:H(),body:JSON.stringify({enabled:on,symbol:S.symbol})}).then(x=>{S.kill=x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL';$('mode').textContent=S.kill?'HALTED':$('mode').textContent})};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');render(t.dataset.tab);if(t.dataset.tab==='backtest')setTimeout(()=>{let b=$('runbt');if(b)b.onclick=backtest},0)});
document.getElementById('alog').onclick=async()=>{let x=await jsonFetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value,password:document.getElementById('ap').value,code:document.getElementById('ac').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';document.getElementById('authmsg').textContent='Logged in';refreshAccount();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Login failed'};
document.getElementById('aset').onclick=async()=>{let x=await jsonFetch('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value||'admin',password:document.getElementById('ap').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';refreshAccount();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Setup failed'};
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
Promise.all([jsonFetch('/api/health'),jsonFetch('/api/runtime')]).then(([x,rt])=>{updateModeUI(rt);S.kill=!!x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL'}).catch(e=>{$('conn').textContent='API ERROR';$('conn').title=e.message});render();resize();load();setTimeout(()=>{resize();safeDraw()},250);setInterval(updateAITrend,1500);setInterval(updateLiveSignal,500);setInterval(()=>{renderFutureForecast()},1000);setInterval(scheduleLivePrediction,5000);oiTimer=setInterval(depth,3000);accountTimer=setInterval(refreshAccount,1000);


window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const b=$('installPwa');if(b){b.style.display='inline-block';b.classList.add('pwaInstall')}});
$('installPwa')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installPwa').style.display='none'});
window.addEventListener('appinstalled',()=>{$('installPwa')?.remove()});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
