
const $=id=>document.getElementById(id),cv=$('chart'),ctx=cv.getContext('2d');
let AUTH=sessionStorage.getItem('obsidian_token')||'';
const H=()=>AUTH?{'content-type':'application/json','authorization':'Bearer '+AUTH}:{'content-type':'application/json'};
async function jsonFetch(url,opts={}){const r=await fetch(url,opts);const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error(`Server returned ${r.status} instead of JSON`)}if(!r.ok&&data?.error)throw Error(data.error);return data}
async function ensureAuth(){try{let z=await jsonFetch('/api/auth/status');if(z.authenticated){return true}document.getElementById('authbar').style.display='flex';if(z.mode==='env'){document.getElementById('authmsg').textContent='Mode Vercel: Login memakai ADMIN_USERNAME/ADMIN_PASSWORD. Setup database dilewati.';document.getElementById('aset').disabled=true;document.getElementById('aset').title='Setup membutuhkan PostgreSQL';}return false}catch(e){document.getElementById('authmsg').textContent='API belum siap: '+e.message;document.getElementById('authbar').style.display='flex';return false}}
let AI_TREND={side:'WAIT',score:0,reason:[],lastNotified:null,sr:null};
let SR_STATE={support:null,resistance:null,context:'NO_LEVEL',distanceSupport:null,distanceResistance:null};
let SIGNALS=[];
const SIGNAL_KEY='obsidian_signal_drop_v561';
try{SIGNALS=JSON.parse(localStorage.getItem(SIGNAL_KEY)||'[]')}catch{SIGNALS=[]}
let ws=null,oiTimer=null,pollTimer=null,accountTimer=null,livePollTimer=null,clockTimer=null;
let PINCH=null;

let MARKET_WS_BASE='wss://fstream.binance.com';
let S={symbol:'BTCUSDT',tf:'5m',c:[],view:{span:140,offset:0},ema:true,bb:false,macd:false,vwap:false,adx:false,atr:false,tool:null,lines:[],fib:null,sr:[],swings:[],drag:null,book:{bids:[],asks:[]},market:{},account:{},positions:[],mtf:{},kill:false};
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
function priceMap(){let w=Math.max(1,cv.clientWidth),h=Math.max(1,cv.clientHeight);const end=Math.max(1,S.c.length-(S.view?.offset||0)),span=Math.max(40,Math.min(300,S.view?.span||140)),start=Math.max(0,end-span),a=S.c.slice(start,end);if(!a.length)return{w,h,a,hi:1,lo:0,dx:1,py:p=>h/2,start,end};const levels=S.sr.filter(Number.isFinite),hi0=Math.max(...a.map(x=>x.h),...(levels.length?levels:[-Infinity])),lo0=Math.min(...a.map(x=>x.l),...(levels.length?levels:[Infinity]));let hi=Number.isFinite(hi0)?hi0:a[0].h,lo=Number.isFinite(lo0)?lo0:a[0].l;if(S.fib&&Number.isFinite(S.fib.a)&&Number.isFinite(S.fib.b)){hi=Math.max(hi,S.fib.a,S.fib.b);lo=Math.min(lo,S.fib.a,S.fib.b)}if(!(hi>lo)){const mid=Number(a.at(-1)?.c)||0;hi=mid+1;lo=mid-1}return{w,h,a,hi,lo,dx:Math.max(1,(w-58)/Math.max(1,a.length)),py:p=>h-32-(p-lo)/(hi-lo)*(h-62),start,end}}
function line(a,v,py,dx,col){ctx.strokeStyle=col||'#d9b56c';ctx.beginPath();v.forEach((z,i)=>{let x=45+i*dx,y=py(z);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
function hline(p,py,w,col){ctx.strokeStyle=col;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(45,py(p));ctx.lineTo(w,py(p));ctx.stroke();ctx.setLineDash([])}
function dot(i,p,dx,py,col,t){let x=45+i*dx,y=py(p);ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillText(t,x+4,y-4)}
async function load(){chartStatus('Mengambil data candlestick…');try{try{const rt=await jsonFetch('/api/runtime');MARKET_WS_BASE=rt.binanceWs||MARKET_WS_BASE;updateModeUI(rt)}catch{}let r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`),source=r.headers.get('X-Market-Data-Source')||'binance';let d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);S.c=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));$('price').textContent=fmt(S.c.at(-1)?.c);$('conn').textContent=source==='bybit-fallback'?'MARKET DATA FALLBACK':'BINANCE DATA';$('conn').title=source==='bybit-fallback'?'Binance market-data access is unavailable; chart is using Bybit USDT perpetual public market data as a fallback.':'Binance Futures market data';S.swings=swings(S.c);smart();safeDraw();calc();connect();depth();if(!livePollTimer){pollLive();livePollTimer=setInterval(pollLive,1500)}if($('signalTf'))$('signalTf').value=S.tf;mtf();refreshSignalFromCurrent();updateAITrend();updateLiveSignal();}catch(e){$('conn').textContent='MARKET DATA ERROR';$('conn').title=e.message;chartStatus('Data chart gagal dimuat: '+e.message+' — periksa /api/klines dan konfigurasi Vercel.');startPolling()}}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
async function pollKlines(){try{const r=await fetch(`/api/klines?symbol=${S.symbol}&interval=${S.tf}&limit=500`);const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market data HTTP ${r.status}`);const rows=d.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));if(!rows.length)return;S.c=rows;const source=r.headers.get('X-Market-Data-Source')||'binance';$('price').textContent=fmt(S.c.at(-1).c);$('conn').textContent=source==='bybit-fallback'?'POLLING · BYBIT FALLBACK':'POLLING';S.swings=swings(S.c);smart();calc();safeDraw()}catch(e){$('conn').title=e.message}}
async function pollLive(){try{const r=await fetch(`/api/market/ticker?symbol=${S.symbol}&interval=${S.tf}`,{cache:'no-store'});const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Market ticker HTTP ${r.status}`);if(d.candle){const c={t:+d.candle.t,o:+d.candle.o,h:+d.candle.h,l:+d.candle.l,c:+d.candle.c,v:+d.candle.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else if(!q||c.t>q.t)S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmt(c.c);$('mark').textContent=fmt(d.markPrice);$('index').textContent=fmt(d.indexPrice);$('funding').textContent=(+d.fundingRate*100).toFixed(4)+'%';S.market.mark=+d.markPrice;S.market.index=+d.indexPrice;S.market.funding=+d.fundingRate;updateLiveSignal();S.swings=swings(S.c);smart();calc();safeDraw()} }catch(e){$('conn').title='Live ticker fallback: '+e.message}}
function startPolling(){if(pollTimer)return;pollKlines();pollTimer=setInterval(pollKlines,5000)}
let wsRetry=0,wsRetryTimer=null;
function connect(){if(wsRetryTimer){clearTimeout(wsRetryTimer);wsRetryTimer=null}if(ws){try{ws.close()}catch{}}const s=S.symbol.toLowerCase(),tf=S.tf;const streams=[`${s}@kline_${tf}`,`${s}@bookTicker`,`${s}@depth@100ms`,`${s}@markPrice@1s`,`${s}@forceOrder`].join('/');const url=`${MARKET_WS_BASE.replace(/\/$/,'')}/stream?streams=${streams}`;try{ws=new WebSocket(url)}catch(e){$('conn').textContent='POLLING';startPolling();scheduleReconnect();return}ws.onopen=()=>{wsRetry=0;$('conn').textContent='REALTIME · WS';$('conn').title='Binance Futures WebSocket market data';safeDraw();chartStatus('REALTIME · Binance Futures WebSocket')};ws.onerror=()=>{$('conn').textContent='RECONNECTING…';$('conn').title='WebSocket error; retrying';startPolling()};ws.onclose=()=>{$('conn').textContent='RECONNECTING…';startPolling();scheduleReconnect()};ws.onmessage=e=>{try{let z=JSON.parse(e.data),d=z.data||z;if(!d)return;if(d.e==='kline'){let k=d.k,c={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v},q=S.c.at(-1);if(q?.t===c.t)S.c[S.c.length-1]=c;else S.c.push(c);if(S.c.length>500)S.c.shift();$('price').textContent=fmt(c.c);S.swings=swings(S.c);smart();calc();draw();if(k.x)recordClosedSignal(c)}else if(d.e==='bookTicker'){S.book.bid=+d.b;S.book.ask=+d.a;$('spread').textContent=fmt(+d.a-+d.b)}else if(d.e==='depthUpdate'){
  const merge=(current,updates)=>{const m=new Map((current||[]).map(x=>{const k=String(x[0]);return [k,[k,String(x[1])]];}));for(const x of (updates||[])){const k=String(x[0]),q=Number(x[1]);if(q===0)m.delete(k);else m.set(k,[k,String(x[1])]);}return [...m.values()].sort((a,b)=>Number(b[0])-Number(a[0]));};
  S.book.bids=merge(S.book.bids,d.b);S.book.asks=merge(S.book.asks,d.a);renderBook()
}else if(d.e==='markPriceUpdate'){S.market.mark=+d.p;S.market.index=+d.i;S.market.funding=+d.r;$('mark').textContent=fmt(d.p);$('index').textContent=fmt(d.i);$('funding').textContent=(+d.r*100).toFixed(4)+'%'}else if(d.e==='forceOrder'){S.market.liq=d.o?.q||0;$('liq').textContent=`${d.o?.S||''} ${fmt(+d.o?.p||0)} × ${fmt(+d.o?.q||0)}`}}catch{}}}
function tfMillis(tf){const m={1:60000,3:180000,5:300000,15:900000,30:1800000,1.0:3600000};if(tf.endsWith('m'))return Number(tf.slice(0,-1))*60000;if(tf.endsWith('h'))return Number(tf.slice(0,-1))*3600000;if(tf.endsWith('d'))return Number(tf.slice(0,-1))*86400000;return 300000}
function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),closed=S.c.length>1?S.c.slice(0,-1):S.c,t=predictiveCandle(closed);const dir=c.c>c.o?'BUY / UP':c.c<c.o?'SELL / DOWN':'FLAT';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta');if(sig){sig.textContent=t.side;sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`${t.score||0}/100 · ${t.strength||'LOW'} · ${t.reason?.[0]||'Menunggu konfirmasi'}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('BUY')?'good':dir.startsWith('SELL')?'bad':'wait')}if(cprice)cprice.textContent=`${fmt(c.c)} · O ${fmt(c.o)}`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'BUY ↑':t.side==='SELL'?'SELL ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`${t.score||0}/100 · ${dir} · close ${mm}:${ss}`;AI_TREND=t}
function renderAccountDock(x){if(!x)return;const b=x.balances?.find(z=>z.asset==='USDT'),p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol&&Math.abs(Number(z.positionAmt||0))>0);const bal=Number(b?.balance||0),av=Number(b?.availableBalance||0),up=Number(p?.unRealizedProfit||0),entry=Number(p?.entryPrice||0),mark=Number(p?.markPrice||S.market.mark||0),qty=Number(p?.positionAmt||0),notional=Math.abs(entry*qty),roe=notional?up/Math.max(1,Math.abs(notional)/Math.max(1,Number(p?.leverage||+$('lev').value||1)))*100:0;$('dockBalance').textContent=fmt(bal);$('dockAvailable').textContent=fmt(av);$('dockUpnl').textContent=fmt(up);$('dockUpnl').className=up>0?'pnlProfit':up<0?'pnlLoss':'';$('dockDD').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';$('accountDockMode').textContent=x.accountType||'ACCOUNT';$('dockPositionStatus').textContent=p?'OPEN POSITION':'NO OPEN POSITION';$('dockSide').textContent=p?(Number(p.positionAmt)>0?'LONG':'SHORT'):'—';$('dockSide').className=p?(Number(p.positionAmt)>0?'good':'bad'):'';$('dockEntry').textContent=p?fmt(entry):'—';$('dockMark').textContent=p?fmt(mark):fmt(S.market.mark);$('dockQty').textContent=p?fmt(Math.abs(qty)):'—';$('dockPnl').textContent=p?fmt(up):'—';$('dockPnl').className=p?(up>=0?'pnlProfit':'pnlLoss'):'';$('dockRoe').textContent=p?fmt(roe)+'%':'—';$('balance').textContent=fmt(bal);$('availableBalance').textContent=fmt(av);$('upnl').textContent=fmt(up);$('liqPrice').textContent=p?fmt(p.liquidationPrice):'—';$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';if(p){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${up>=0?'good':'bad'}">${up>=0?'PROFIT':'LOSS'} ${fmt(up)} USDT · OPEN</b><div class="note">${Number(p.positionAmt)>0?'BUY / LONG':'SELL / SHORT'} · Entry ${fmt(entry)} · Mark ${fmt(mark)} · Qty ${fmt(Math.abs(qty))} · ROE ${fmt(roe)}%</div>`}else if(Number.isFinite(Number(x.lastRealizedPnL))){const rp=Number(x.lastRealizedPnL);$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="${rp>=0?'good':'bad'}">LAST CLOSED: ${rp>=0?'PROFIT':'LOSS'} ${fmt(rp)} USDT</b><div class="note">Posisi saat ini kosong · hasil realized terakhir dari Binance</div>`}else{$('orderResult').style.display='none'}}
function updateModeUI(rt){if(!rt)return;const mode=String(rt.tradingMode||'paper').toUpperCase();$('mode').textContent=mode;$('accountMode').textContent=mode==='DEMO'?'BINANCE DEMO':mode==='LIVE'?'BINANCE LIVE':'PAPER';const note=$('executionNote');if(note)note.textContent=mode==='DEMO'?'BUY/SELL akan mengirim order ke Binance Futures DEMO (virtual funds).':mode==='LIVE'?'BUY/SELL akan mengirim order ke Binance Futures LIVE. Periksa API permission sebelum entry.':'BUY/SELL hanya membuat posisi PAPER lokal.';}
function scheduleReconnect(){if(wsRetryTimer)return;const delay=Math.min(30000,Math.max(1000,2**wsRetry*1000));wsRetry=Math.min(wsRetry+1,5);wsRetryTimer=setTimeout(()=>{wsRetryTimer=null;connect()},delay)}
async function depth(){try{let d=await jsonFetch(`/api/depth?symbol=${S.symbol}`);if(!d.error){S.book.bids=d.bids;S.book.asks=d.asks;renderBook()};let o=await jsonFetch(`/api/open-interest?symbol=${S.symbol}`);if(!o.error)$('oi').textContent=fmt(o.openInterest)}catch{}}
function renderBook(){let b=(S.book.bids||[]).slice(0,10),a=(S.book.asks||[]).slice(0,10),sum=(z)=>z.reduce((p,x)=>p+ +x[1],0),sb=sum(b),sa=sum(a);$('bids').innerHTML=b.map(x=>`<div class="obrow"><span class="good">${fmt(+x[0])}</span><span>${fmt(+x[1])}</span></div>`).join('');$('asks').innerHTML=a.map(x=>`<div class="obrow"><span class="bad">${fmt(+x[0])}</span><span>${fmt(+x[1])}</span></div>`).join('');$('imbalance').textContent=((sb-sa)/(sb+sa||1)*100).toFixed(1)+'%'}
function smart(){if(!S.c.length)return;let c=S.c.at(-1),at=ATR(S.c).at(-1),sw=S.swings,low=sw.lo.length?S.c[sw.lo.at(-1)].l:c.l,high=sw.hi.length?S.c[sw.hi.at(-1)].h:c.h,am=+$('atrMult').value||1.5,rr=+$('rr').value||2;let slL=Math.min(low,c.c-at*am),tpL=c.c+(c.c-slL)*rr,slS=Math.max(high,c.c+at*am),tpS=c.c-(slS-c.c)*rr;S.smart={long:{sl:slL,tp:tpL},short:{sl:slS,tp:tpS},atr:at};$('smartSL').textContent=`L ${fmt(slL)} · S ${fmt(slS)}`;$('smartTP').textContent=`L ${fmt(tpL)} · S ${fmt(tpS)}`}
function calc(){if(!S.c.length)return;let a=S.c.map(x=>x.c),c=S.c.at(-1),m=MACD(a),at=ATR(S.c),r=RSI(a),v=VWAP(S.c),adx=ADX(S.c),sd=SMA(a,20).map((x,i)=>{let z=a.slice(Math.max(0,i-19),i+1),av=x;return Math.sqrt(z.reduce((p,q)=>p+(q-av)**2,0)/z.length)});$('macd').textContent=fmt(m.m.at(-1))+' / '+fmt(m.sig.at(-1));$('vwap').textContent=fmt(v.at(-1));$('adx').textContent=fmt(adx.at(-1));$('atr').textContent=fmt(at.at(-1));$('rsi').textContent=fmt(r.at(-1));$('bbw').textContent=((4*sd.at(-1))/(SMA(a,20).at(-1)||1)*100).toFixed(2)+'%';$('riskMeter').style.width=Math.min(100,(+$('risk').value||0)/2*100)+'%';let side=$('long').dataset.side||'LONG',z=S.smart?.[side.toLowerCase()];if(z){let rc=Math.min((+$('capital').value*(+$('risk').value/100))/Math.abs(c.c-z.sl),(+$('capital').value*+$('lev').value)/c.c);$('qty').textContent=rc.toFixed(6);$('riskUsd').textContent=(+$('capital').value*+$('risk').value/100).toFixed(2)}}

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
  const sr=detectSR(c); if(!c||c.length<35)return {side:'WAIT',score:0,reason:['Need candle history'],strength:'LOW',sr};
  const a=c.slice(0,-1), n=a.length-1, x=a[n], prev=a[n-1];
  let bull=0,bear=0,reason=[];
  const range=Math.max(1e-12,x.h-x.l),body=Math.abs(x.c-x.o),upper=x.h-Math.max(x.o,x.c),lower=Math.min(x.o,x.c)-x.l;
  if(lower/range>=.45){bull+=18;reason.push('Lower-wick rejection');}
  if(upper/range>=.45){bear+=18;reason.push('Upper-wick rejection');}
  if(body/range>=.55&&x.c>x.o){bull+=12;reason.push('Bullish body close kuat');}
  if(body/range>=.55&&x.c<x.o){bear+=12;reason.push('Bearish body close kuat');}
  if(x.c>prev.c){bull+=7}else if(x.c<prev.c){bear+=7}
  const recent=a.slice(-8), ups=recent.filter((z,i)=>i&&z.c>recent[i-1].c).length, downs=recent.filter((z,i)=>i&&z.c<recent[i-1].c).length;
  if(ups>=5){bull+=12;reason.push('Momentum candle bullish');} if(downs>=5){bear+=12;reason.push('Momentum candle bearish');}
  const e9=EMA(a.map(z=>z.c),9),e21=EMA(a.map(z=>z.c),21); const slope9=e9[n]-e9[Math.max(0,n-3)], slope21=e21[n]-e21[Math.max(0,n-3)];
  if(e9[n]>e21[n]&&slope9>0&&slope21>0){bull+=10;reason.push('EMA momentum naik');}
  if(e9[n]<e21[n]&&slope9<0&&slope21<0){bear+=10;reason.push('EMA momentum turun');}
  if(sr.context==='SUPPORT_REJECTION'){bull+=22;reason.push('Rejection di support');}
  if(sr.context==='RESISTANCE_REJECTION'){bear+=22;reason.push('Rejection di resistance');}
  if(sr.support&&x.c>sr.support&&prev.c<=sr.support){bull+=16;reason.push('Reclaim support');}
  if(sr.resistance&&x.c<sr.resistance&&prev.c>=sr.resistance){bear+=16;reason.push('Reject resistance');}
  if(sr.resistance&&x.c>sr.resistance&&prev.c<=sr.resistance){bull+=20;reason.push('Breakout resistance');}
  if(sr.support&&x.c<sr.support&&prev.c>=sr.support){bear+=20;reason.push('Breakdown support');}
  if(sr.resistance&&sr.distanceResistance!=null&&sr.distanceResistance<0.12&&sr.context==='BETWEEN_LEVELS'){bull-=12;reason.push('Terlalu dekat resistance → hindari BUY');}
  if(sr.support&&sr.distanceSupport!=null&&sr.distanceSupport<0.12&&sr.context==='BETWEEN_LEVELS'){bear-=12;reason.push('Terlalu dekat support → hindari SELL');}
  bull=Math.max(0,Math.min(100,bull)); bear=Math.max(0,Math.min(100,bear));
  let side='WAIT',score=Math.max(bull,bear);
  if(bull>=62&&bull-bear>=16)side='BUY'; else if(bear>=62&&bear-bull>=16)side='SELL'; else reason.push('Konfluensi belum cukup → WAIT');
  return {side,score,bull,bear,reason:reason.slice(-7),strength:score>=80?'HIGH':score>=62?'MEDIUM':'LOW',sr};
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
  const t=predictiveCandle(closed);
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
  if(lb)lb.disabled=t.side!=='BUY'; if(sb)sb.disabled=t.side!=='SELL';
}
function signalTime(ts){return new Date(ts||Date.now()).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})+' WIB'}
function renderSignalDrop(){const el=$('signalFeed');if(!el)return;const tf=$('signalTf')?.value||S.tf;const rows=SIGNALS.filter(x=>x.symbol===S.symbol&&x.tf===tf).slice(0,80);$('signalCount').textContent=`${rows.length} signal`;el.innerHTML=rows.length?rows.map(x=>`<div class="signalRow"><span class="signalTime">${signalTime(x.ts)}</span><span class="signalSide ${x.side==='BUY'?'good':'bad'}">${x.side} <span class="signalArrow">${x.side==='BUY'?'↑':'↓'}</span></span><span class="signalMeta">${x.score}/100<br>${x.strength}<br>${x.context||''}</span></div>`).join(''):'<div class="note">Belum ada BUY/SELL. Menunggu candle close…</div>';}
function persistSignals(){try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(SIGNALS.slice(0,300)))}catch{}}
function recordClosedSignal(c){if(!c)return;const closed=S.c.length>1?S.c.slice(0,-1):S.c;const t=predictiveCandle(closed);if(t.side==='WAIT')return;const key=`${S.symbol}:${S.tf}:${c.t}:${t.side}`;if(SIGNALS.some(x=>x.key===key))return;SIGNALS.unshift({key,ts:c.t,symbol:S.symbol,tf:S.tf,side:t.side,score:t.score,strength:t.strength,reason:t.reason,context:t.sr?.context||'NO_LEVEL',support:t.sr?.support,resistance:t.sr?.resistance});SIGNALS=SIGNALS.slice(0,300);persistSignals();renderSignalDrop();const msg=`${t.side} ${S.symbol} ${S.tf} · ${t.score}/100`;try{if('Notification' in window&&Notification.permission==='granted')new Notification('Obsidian Signal Drop',{body:msg})}catch{}}
function refreshSignalFromCurrent(){const closed=S.c.length>1?S.c[S.c.length-2]:S.c[S.c.length-1];if(closed)recordClosedSignal(closed);renderSignalDrop()}
function mtf(){let tfs=['1m','5m','15m','1h','4h'];Promise.all(tfs.map(tf=>jsonFetch(`/api/klines?symbol=${S.symbol}&interval=${tf}&limit=180`).then(d=>({tf,c:(d||[]).map(x=>({o:+x[1],h:+x[2],l:+x[3],c:+x[4]}))})))).then(rows=>{S.mtf={};rows.forEach(x=>{let a=x.c.map(z=>z.c),r=RSI(a).at(-1),e20=EMA(a,20).at(-1),e50=EMA(a,50).at(-1),ad=ADX(x.c).at(-1),dir=e20>e50?'BULL':'BEAR';S.mtf[x.tf]={dir,r,ad};});render('confluence')}).catch(()=>{})}
async function order(side){
  if(S.kill)return alert('Kill switch aktif');
  const p=S.c.at(-1)?.c,z=S.smart?.[side.toLowerCase()];
  if(!p||!z)return alert('Data market belum siap.');
  const body={symbol:S.symbol,side,entry:p,stopLoss:z.sl,takeProfit:z.tp,capital:+$('capital').value,riskPct:+$('risk').value,leverage:+$('lev').value,setup:'structure+ATR',reason:'manual'};
  let rt; try{rt=await jsonFetch('/api/runtime');updateModeUI(rt)}catch(e){return alert('Runtime belum siap: '+e.message)}
  const mode=String(rt?.tradingMode||'paper').toLowerCase();
  const target=mode==='paper'?'/api/paper/order':'/api/live/order';
  const label=mode==='demo'?'BINANCE DEMO':mode==='live'?'BINANCE LIVE':'PAPER';
  if(!confirm(`${side==='LONG'?'BUY / LONG':'SELL / SHORT'} ${S.symbol}\nEntry ${fmt(p)}\nSL ${fmt(z.sl)}\nTP ${fmt(z.tp)}\nRisk ${body.riskPct}%\nMode: ${label}\n\nLanjut entry?`))return;
  const x=await jsonFetch(target,{method:'POST',headers:H(),body:JSON.stringify(body)}).catch(e=>({error:e.message}));
  if(x.error){$('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="bad">ENTRY FAILED</b><div class="note">${x.error}</div>`;return alert(x.error)}
  $('orderResult').style.display='block';$('orderResult').innerHTML=`<b class="good">ENTRY ${side==='LONG'?'BUY / LONG':'SELL / SHORT'} SENT</b><div class="note">Mode ${label} · Entry ${fmt(p)} · SL ${fmt(z.sl)} · TP ${fmt(z.tp)} · Risk ${body.riskPct}%</div>`;
  if(mode==='paper'&&x.position){S.positions.push(x.position);render('positions')}
  else{alert(`${side==='LONG'?'BUY':'SELL'} terkirim ke ${label}.`);await refreshAccount();}
}

function render(tab='positions'){let el=$('content');if(tab==='positions')el.innerHTML=S.positions.length?`<table class="table"><tr><th>Side</th><th>Entry</th><th>SL</th><th>TP</th><th>Qty</th><th>Status</th></tr>${S.positions.map(x=>`<tr><td class="${x.side==='LONG'?'good':'bad'}">${x.side}</td><td>${fmt(x.entry)}</td><td>${fmt(x.sl)}</td><td>${fmt(x.tp)}</td><td>${fmt(x.quantity)}</td><td>${x.status}</td></tr>`).join('')}</table><div class="note">BE=${$('be').checked?'ON':'OFF'} · Trail=${$('trail').checked?'ON':'OFF'} · Partial=${$('partial').checked?'50%':'OFF'}</div>`:'<div class="note">Belum ada posisi paper.</div>';
else if(tab==='confluence')el.innerHTML=`<div class="aiCard"><div><span class="label">AI CANDLE TREND</span><div id="aiSignal" class="signal wait">WAIT</div><div id="aiScore" class="note">0/100 · LOW</div></div><div class="aiReasons"><div class="label">ALASAN</div><div id="aiReason" class="note">Menunggu data candle…</div><div id="predictBox" class="predictBox note">S/R: —</div></div></div><div class="srCard"><div class="label">SUPPORT / RESISTANCE</div><div class="srLevels"><div class="srLevel"><span class="note">SUPPORT</span><b id="srSupport">—</b></div><div class="srLevel"><span class="note">RESISTANCE</span><b id="srResistance">—</b></div></div><div id="srContext" class="note" style="margin-top:7px">Belum ada level.</div></div><table class="table"><tr><th>TF</th><th>Trend</th><th>RSI</th><th>ADX</th></tr>${Object.entries(S.mtf).map(([k,v])=>`<tr><td>${k}</td><td class="${v.dir==='BULL'?'good':'bad'}">${v.dir}</td><td>${fmt(v.r)}</td><td>${fmt(v.ad)}</td></tr>`).join('')}</table><div class="note">AI membaca rangkaian candle + momentum + struktur. BUY/SELL adalah sinyal informasi; WAIT dipakai saat arah tidak dominan.</div>`;
else if(tab==='backtest')el.innerHTML=`<div class="g3"><label class="field">Fast<input id="bf" value="20"></label><label class="field">Slow<input id="bs" value="50"></label><label class="field">Fee %/side<input id="fee" value=".04"></label></div><div class="g3" style="margin-top:7px"><label class="field">Slippage %<input id="slip" value=".02"></label><label class="field">Funding %/8h<input id="fund" value=".01"></label><label class="field">Risk %<input id="brisk" value="1"></label></div><button class="btn" style="margin-top:8px" id="runbt">Run backtest</button><div id="bout" class="note" style="margin-top:8px"></div>`;
else if(tab==='journal')jsonFetch('/api/journal',{headers:H()}).then(rows=>{el.innerHTML=rows.length?`<table class="table"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>PnL</th><th>Fee</th><th>Funding</th></tr>${rows.map(x=>`<tr><td>${new Date(x.opened_at).toLocaleString()}</td><td>${x.symbol}</td><td>${x.side}</td><td class="${x.pnl>=0?'good':'bad'}">${fmt(x.pnl)}</td><td>${fmt(x.fee)}</td><td>${fmt(x.funding)}</td></tr>`).join('')}</table>`:'<div class="note">Journal kosong.</div>'});
else jsonFetch('/api/audit').then(rows=>el.innerHTML=`<div class="scroll"><table class="table"><tr><th>Time</th><th>Action</th><th>Detail</th></tr>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleTimeString()}</td><td>${x.action}</td><td>${String(x.detail).slice(0,120)}</td></tr>`).join('')}</table></div>`);
if(tab==='confluence')updateAITrend();
}
function backtest(){let f=Math.max(2,+$('bf').value||20),s=Math.max(f+1,+$('bs').value||50),fee=Math.max(0,+$('fee').value||0)/100,slip=Math.max(0,+$('slip').value||0)/100,fund=Math.max(0,+$('fund').value||0)/100,risk=Math.max(0,+$('brisk').value||1)/100,a=S.c,cl=a.map(x=>x.c);if(cl.length<s+40)return $('bout').textContent='Data belum cukup untuk backtest + walk-forward.';const run=(lo,hi)=>{let ef=EMA(cl.slice(0,hi),f),es=EMA(cl.slice(0,hi),s),pos=0,en=0,ret=0,n=0,peak=0,dd=0;for(let i=Math.max(s,lo);i<hi;i++){if(!pos&&ef[i]>es[i]&&ef[i-1]<=es[i-1]){pos=1;en=cl[i]*(1+slip)}if(pos&&ef[i]<es[i]&&ef[i-1]>=es[i-1]){let r=(cl[i]*(1-slip)-en)/en-fee*2-fund;ret+=r*risk;n++;peak=Math.max(peak,ret);dd=Math.max(dd,peak-ret);pos=0}}if(pos){ret+=((cl[hi-1]*(1-slip)-en)/en-fee*2-fund)*risk}return{ret,n,dd}};let all=run(s,cl.length),wf=[];let train=Math.max(80,Math.floor(cl.length*.35)),test=Math.max(30,Math.floor(cl.length*.15));for(let start=s;start+train+test<=cl.length;start+=test){let trainRes=run(start,start+train),testRes=run(start+train,start+train+test);wf.push({train:trainRes,test:testRes})}const avg=wf.length?wf.reduce((p,x)=>p+x.test.ret,0)/wf.length:0;$('bout').innerHTML=`Full sample return <b class="${all.ret>=0?'good':'bad'}">${(all.ret*100).toFixed(2)}%</b> · ${all.n} closed · Max DD ${(all.dd*100).toFixed(2)}%<br>Walk-forward windows <b>${wf.length}</b> · Out-of-sample avg <b class="${avg>=0?'good':'bad'}">${(avg*100).toFixed(2)}%</b> · fee ${fee*100}%/side · slippage ${slip*100}% · funding ${fund*100}%/8h<br><span class="note">Walk-forward memakai urutan waktu; parameter tidak dioptimalkan pada test window.</span>`}
function setZoom(span){S.view.span=clamp(span,40,300);S.view.offset=0;safeDraw()}
$('zoomIn').onclick=()=>setZoom((S.view.span||140)-20);$('zoomOut').onclick=()=>setZoom((S.view.span||140)+20);$('zoomReset').onclick=()=>{S.view={span:140,offset:0};safeDraw()};cv.addEventListener('wheel',e=>{e.preventDefault();setZoom((S.view.span||140)+(e.deltaY>0?20:-20))},{passive:false});
cv.addEventListener('pointerdown',e=>{let r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,{a,dx,py}=priceMap(),i=clamp(Math.round((x-45)/dx),0,a.length-1),p=a[i]?.c;if(S.tool==='trend'){S.drag={type:'trend',x1:x,y1:y,x2:x,y2:y};S.lines.push(S.drag)}else if(S.tool==='fib'){S.drag={type:'fib',a:p,b:p};S.fib=S.drag}else if(S.tool==='sr'){S.sr.push(p);S.tool=null}draw()});
cv.addEventListener('pointermove',e=>{if(!S.drag)return;let r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,{a,dx,py}=priceMap(),i=clamp(Math.round((x-45)/dx),0,a.length-1);if(S.drag.type==='trend'){S.drag.x2=x;S.drag.y2=y}else S.drag.b=a[i]?.c||S.drag.b;draw()});
cv.addEventListener('pointerup',()=>{S.drag=null});
['capital','risk','atrMult','rr','lev'].forEach(id=>$(id).addEventListener('input',()=>{smart();calc();draw()}));
$('symbol').onchange=e=>{S.symbol=e.target.value;$('pair').textContent=S.symbol;load()};$('tf').onchange=e=>{S.tf=e.target.value;load()};
[['emaBtn','ema'],['bbBtn','bb'],['macdBtn','macd'],['vwapBtn','vwap'],['adxBtn','adx'],['atrBtn','atr']].forEach(([id,k])=>$(id).onclick=()=>{S[k]=!S[k];$(id).classList.toggle('active',S[k]);draw();calc()});
$('trendBtn').onclick=()=>S.tool=S.tool==='trend'?null:'trend';$('fibBtn').onclick=()=>S.tool=S.tool==='fib'?null:'fib';$('srBtn').onclick=()=>{const sr=detectSR(S.c.slice(0,-1));SR_STATE=sr;S.sr=[sr.support,sr.resistance].filter(Boolean);draw();updateAITrend();alert(`Auto S/R\nSupport: ${sr.support?fmt(sr.support):'—'}\nResistance: ${sr.resistance?fmt(sr.resistance):'—'}\nContext: ${sr.context}`)};$('swingBtn').onclick=()=>{S.swings=swings(S.c);draw()};$('tv').onclick=()=>window.open(`https://www.tradingview.com/chart/?symbol=BINANCE:${S.symbol}.P`);
$('long').onclick=()=>order('LONG');$('short').onclick=()=>order('SHORT');$('quickLong').onclick=()=>order('LONG');$('quickShort').onclick=()=>order('SHORT');$('reconcileDock').onclick=()=>refreshAccount();$('reconcile').onclick=()=>jsonFetch('/api/account',{headers:H()}).then(x=>{if(x.error){alert(x.error);return}let b=x.balances?.find(z=>z.asset==='USDT');$('balance').textContent=fmt(b?.balance);$('availableBalance').textContent=fmt(b?.availableBalance);$('dd').textContent=x.guard?.dd==null?'—':fmt(x.guard.dd)+'%';let p=(x.binancePositions||x.positions||[]).find(z=>z.symbol===S.symbol && Math.abs(Number(z.positionAmt||0))>0);if(p){$('upnl').textContent=fmt(p.unRealizedProfit);$('liqPrice').textContent=fmt(p.liquidationPrice)}else{$('upnl').textContent=fmt(0);$('liqPrice').textContent='—'}});
$('kill').onclick=()=>{let on=!S.kill;if(!confirm(on?'Aktifkan KILL SWITCH?':'Matikan KILL SWITCH?'))return;jsonFetch('/api/kill-switch',{method:'POST',headers:H(),body:JSON.stringify({enabled:on,symbol:S.symbol})}).then(x=>{S.kill=x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL';$('mode').textContent=S.kill?'HALTED':$('mode').textContent})};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');render(t.dataset.tab);if(t.dataset.tab==='backtest')setTimeout(()=>{let b=$('runbt');if(b)b.onclick=backtest},0)});
document.getElementById('alog').onclick=async()=>{let x=await jsonFetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value,password:document.getElementById('ap').value,code:document.getElementById('ac').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';document.getElementById('authmsg').textContent='Logged in';refreshAccount();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Login failed'};
document.getElementById('aset').onclick=async()=>{let x=await jsonFetch('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:document.getElementById('au').value||'admin',password:document.getElementById('ap').value})});if(x.token){AUTH=x.token;sessionStorage.setItem('obsidian_token',AUTH);document.getElementById('authbar').style.display='none';refreshAccount();loadCredStatus();requestAnimationFrame(()=>{resize();safeDraw()})}else document.getElementById('authmsg').textContent=x.error||'Setup failed'};
async function refreshAccount(){if(!AUTH)return;try{const x=await jsonFetch('/api/account',{headers:H()});if(x.error){$('accountMode').textContent='ACCOUNT ERROR';$('accountMode').title=x.error;return}renderAccountDock(x);$('accountMode').textContent=x.accountType||'ACCOUNT';$('accountMode').title=`Updated ${new Date(x.updatedAt||Date.now()).toLocaleTimeString()}`;}catch(e){$('accountMode').textContent='ACCOUNT ERROR';$('accountMode').title=e.message}}
async function loadCredStatus(){if(!AUTH)return;const x=await jsonFetch('/api/credentials/status',{headers:H()});$('credStatus').textContent=x.configured?'API credential tersimpan terenkripsi. Secret tidak dapat dibaca kembali dari UI.' :'API credential belum diset.';}
$('settingsTab')?.addEventListener('click',()=>{$('credentialPanel').style.display=$('credentialPanel').style.display==='none'?'block':'none';loadCredStatus()});
$('saveCred')?.addEventListener('click',async()=>{const apiKey=$('apiKey').value.trim(),apiSecret=$('apiSecret').value.trim();if(!apiKey||!apiSecret){$('credStatus').textContent='Error: API Key dan API Secret wajib diisi.';return}const x=await jsonFetch('/api/credentials',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({apiKey,apiSecret,code:$('credCode').value.trim()})});$('credStatus').textContent=x.ok?'Credential tersimpan terenkripsi. API Key/Secret tetap ditampilkan di form ini agar tidak terlihat hilang.':'Error: '+(x.error||'Gagal menyimpan');if(x.ok){await loadCredStatus();await refreshAccount();setTimeout(()=>document.getElementById('testBinance')?.click(),150)}});
$('testBinance')?.addEventListener('click',async()=>{const x=await jsonFetch('/api/binance/test',{headers:H()});if(!x.connected){$('credStatus').textContent='Error Binance: '+(x.error||'Gagal terhubung');return}const balance=Number(x.balance||x.totalWalletBalance||0),available=Number(x.availableUSDT||x.availableBalance||0),upnl=Number(x.unrealizedProfit||0);$('credStatus').textContent=`Binance terhubung. Trade: ${x.canTrade?'ON':'OFF'} · Balance USDT: ${fmt(balance)} · Available: ${fmt(available)}`;$('balance').textContent=fmt(balance);$('availableBalance').textContent=fmt(available);$('upnl').textContent=fmt(upnl);$('dd').textContent='0.00%';$('liqPrice').textContent='—';$('conn').textContent='BINANCE CONNECTED';$('dockBalance').textContent=fmt(balance);$('dockAvailable').textContent=fmt(available);$('dockUpnl').textContent=fmt(upnl);$('accountDockMode').textContent=x.canTrade?'BINANCE DEMO':'TRADE OFF';$('conn').title='Binance Futures account connected';$('mode').textContent=x.canTrade?'PAPER · ACCOUNT CONNECTED':'PAPER · TRADE OFF';if(Array.isArray(x.positions)){const p=x.positions.find(z=>z.symbol===S.symbol && Math.abs(Number(z.positionAmt||0))>0);if(p){$('upnl').textContent=fmt(p.unRealizedProfit);$('liqPrice').textContent=fmt(p.liquidationPrice)}}});
$('removeCred')?.addEventListener('click',async()=>{if(!confirm('Hapus API credential tersimpan?'))return;const x=await jsonFetch('/api/credentials',{method:'DELETE',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({code:$('credCode').value})});$('credStatus').textContent=x.ok?'Credential dihapus.':'Error: '+(x.error||'Gagal menghapus')});
document.getElementById('aiNotify')?.addEventListener('click',()=>{try{Notification.requestPermission().then(p=>{document.getElementById('aiNotify').textContent=p==='granted'?'🔔 On':'🔕 Off'})}catch{}});
document.getElementById('signalTf')?.addEventListener('change',()=>renderSignalDrop());
document.getElementById('clearSignals')?.addEventListener('click',()=>{if(!confirm('Hapus riwayat Signal Drop untuk pair ini?'))return;SIGNALS=SIGNALS.filter(x=>x.symbol!==S.symbol);persistSignals();renderSignalDrop()});
renderSignalDrop();
ensureAuth();
Promise.all([jsonFetch('/api/health'),jsonFetch('/api/runtime')]).then(([x,rt])=>{updateModeUI(rt);S.kill=!!x.killSwitch;$('kill').textContent=S.kill?'KILL ON':'KILL'}).catch(e=>{$('conn').textContent='API ERROR';$('conn').title=e.message});render();resize();load();setTimeout(()=>{resize();safeDraw()},250);setInterval(updateAITrend,1500);setInterval(updateLiveSignal,500);oiTimer=setInterval(depth,3000);accountTimer=setInterval(refreshAccount,2000);
