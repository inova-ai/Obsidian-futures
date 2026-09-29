from pathlib import Path
p=Path('/mnt/data/unify/app.js')
s=p.read_text()
old="""function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),closed=S.c.length>1?S.c.slice(0,-1):S.c,t=hybridPredictiveCandle(closed,c);const dir=c.c>c.o?'NAIK · B':c.c<c.o?'TURUN · S':'DATAR';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta');if(sig){sig.textContent=t.side==='BUY'?'B':t.side==='SELL'?'S':'WAIT';sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`${t.score||0}/100 · ${t.strength||'LOW'} · ${t.reason?.[0]||'Membaca sumbu dan momentum'}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('NAIK')?'good':dir.startsWith('TURUN')?'bad':'wait')}if(cprice)cprice.textContent=`${fmtIDR(c.c)} · Buka ${fmtIDR(c.o)}`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'B ↑':t.side==='SELL'?'S ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`${t.score||0}/100 · ${dir} · close ${mm}:${ss}`;AI_TREND=t; updateEntryButtons()}"""
new="""function getFinalSignal(){
  const c=S.c.at(-1); if(!c)return {side:'WAIT',score:0,gap:0,strength:'LOW',reason:['Menunggu data candle']};
  const ms=tfMillis(S.tf), live=Date.now()>=Number(c.t)&&Date.now()<Number(c.t)+ms;
  const anchor=live&&S.c.length>1?S.c.at(-2):c;
  const targetTs=anchor?Number(anchor.t)+ms:null;
  if(targetTs!=null){
    const row=SIGNALS.find(x=>x.symbol===S.symbol&&x.tf===S.tf&&Number(x.targetTs)===targetTs&&x.status==='PENDING');
    if(row)return {...row,final:true};
  }
  const closed=live&&S.c.length>1?S.c.slice(0,-1):S.c;
  const t=predictiveCandle(closed);
  return {...t,final:true,targetTs:targetTs||null};
}
function updateLiveSignal(){if(!S.c.length)return;const c=S.c.at(-1),t=getFinalSignal();const dir=c.c>c.o?'NAIK · B':c.c<c.o?'TURUN · S':'DATAR';const box=$('liveSignalBox'),sig=$('liveEntrySignal'),score=$('liveSignalScore'),cd=$('candleCountdown'),ct=$('candleTime'),clock=$('liveClock'),cdir=$('liveCandleDirection'),cprice=$('liveCandlePrice'),ls=$('signalLiveSide'),lm=$('signalLiveMeta');if(sig){sig.textContent=t.side==='BUY'?'BUY':t.side==='SELL'?'SELL':'WAIT';sig.className='signal '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(score)score.textContent=`FINAL SIGNAL · ${t.score||0}/100 · ${t.strength||'LOW'} · ${(t.reason||['Belum cukup konfirmasi']).slice(0,2).join(' · ')}`;if(box)box.className='liveBox '+(t.side==='BUY'?'signalBuy':t.side==='SELL'?'signalSell':'signalWait');if(cdir){cdir.textContent=dir;cdir.className=''+(dir.startsWith('NAIK')?'good':dir.startsWith('TURUN')?'bad':'wait')}if(cprice)cprice.textContent=`${fmtIDR(c.c)} · Buka ${fmtIDR(c.o)}`;const ms=tfMillis(S.tf),remain=Math.max(0,(c.t+ms)-Date.now()),sec=Math.floor(remain/1000),mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(cd)cd.textContent=`${mm}:${ss}`;if(ct)ct.textContent=`Candle ${new Date(c.t).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(c.t+ms).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`;if(clock)clock.textContent=new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'});if(ls){ls.textContent=t.side==='BUY'?'BUY ↑':t.side==='SELL'?'SELL ↓':'WAIT •';ls.className='signalSide '+(t.side==='BUY'?'good':t.side==='SELL'?'bad':'wait')}if(lm)lm.textContent=`FINAL ${t.side} · ${t.score||0}/100 · ${dir} · alasan: ${(t.reason||['—']).slice(0,2).join(' / ')}`;AI_TREND=t; updateEntryButtons()}"""
if old not in s: raise SystemExit('old updateLiveSignal not found')
s=s.replace(old,new)
old2="""function updateAITrend(){
  const closed=S.c.length>1?S.c.slice(0,-1):S.c;
  const t=predictiveCandle(closed);
"""
new2="""function updateAITrend(){
  const t=getFinalSignal();
"""
if old2 not in s: raise SystemExit('updateAITrend start not found')
s=s.replace(old2,new2)
s=s.replace("<span class=\"label\">AI CANDLE TREND</span><div id=\"aiSignal\" class=\"signal wait\">WAIT</div>","<span class=\"label\">FINAL SIGNAL · NEXT CANDLE</span><div id=\"aiSignal\" class=\"signal wait\">WAIT</div>")
s=s.replace("<div id=\"predictBox\" class=\"predictBox note\">S/R: —</div>","<div id=\"predictBox\" class=\"predictBox note\">FINAL SIGNAL menunggu data…</div>")
s=s.replace("<div class=\"note\">AI membaca rangkaian candle + momentum + struktur. BUY/SELL adalah sinyal informasi; WAIT dipakai saat arah tidak dominan.</div>","<div class=\"note\"><b>FINAL SIGNAL</b> adalah satu keputusan bersama untuk seluruh UI: candle close + momentum + S/R + MTF. Semua BUY/SELL/WAIT di atas dan Signal Drop memakai keputusan yang sama. Candle live tidak mengubah keputusan sampai candle ditutup.</div>")
p.write_text(s)

# HTML label for the top live card
hp=Path('/mnt/data/unify/index.html')
h=hp.read_text()
h=h.replace('<small>ARAH ENTRY LIVE</small>','<small>FINAL SIGNAL · ENTRY BERIKUTNYA</small>')
hp.write_text(h)
