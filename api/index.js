import express from 'express';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { Pool } = pg;

const app=express(); app.disable('x-powered-by');
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML=path.join(ROOT,'..','index.html');
app.get('/',(req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.send(fs.readFileSync(INDEX_HTML,'utf8'))});
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next()});
app.use(express.json({limit:'1mb'})); 
const rate=new Map();
function rateLimit(req,res,next){const key=(req.ip||'unknown')+'|'+req.path,now=Date.now();let x=rate.get(key);if(!x||now-x.t>60000)x={t:now,n:0};x.n++;rate.set(key,x);if(x.n>120)return res.status(429).json({error:'Rate limit exceeded'});next()}
app.get('/api',(req,res)=>res.json({ok:true,service:'obsidian-futures',version:'5.23.0-full-reconcile'}));
app.use('/api',rateLimit);

const TRADING_MODE=String(process.env.TRADING_MODE|| (process.env.ENABLE_LIVE_TRADING==='true'?'live':'demo')).trim().toLowerCase();
const IS_DEMO=TRADING_MODE==='demo', LIVE=TRADING_MODE==='live' && process.env.ENABLE_LIVE_TRADING==='true';
const BASE=IS_DEMO?'https://demo-fapi.binance.com':(process.env.BINANCE_BASE_URL||'https://fapi.binance.com');
const WS_BASE=IS_DEMO?'wss://demo-fstream.binance.com':(process.env.BINANCE_WS_URL||'wss://fstream.binance.com');
const MARKET_BASE=process.env.BINANCE_MARKET_BASE_URL||'https://fapi.binance.com';
const MARKET_WS_BASE=process.env.BINANCE_MARKET_WS_URL||'wss://fstream.binance.com';
const BYBIT_BASE=process.env.BYBIT_BASE_URL||'https://api.bybit.com';
const USDT_IDR_RATE=Number(process.env.USDT_IDR_RATE||16500);
const MAXLEV=Number(process.env.MAX_LEVERAGE||20), MAXRISK=Number(process.env.MAX_RISK_PCT||2), MAX_DD=Number(process.env.MAX_DAILY_LOSS_PCT||5);
const ALLOWED=new Set((process.env.ALLOWED_SYMBOLS||'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT').split(',').map(x=>x.trim().toUpperCase()));
const MASTER=process.env.MASTER_KEY||'', DATABASE_URL=process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_PRISMA_URL||process.env.NEON_DATABASE_URL||'';
const ENV_ADMIN_USER=String(process.env.ADMIN_USERNAME||'admin').trim();
// If no database is connected, MASTER_KEY can act as the bootstrap password.
// ADMIN_PASSWORD is recommended and overrides it.
const ENV_ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||MASTER);
const ENV_BINANCE_API_KEY=String(process.env.BINANCE_API_KEY||'').trim();
const ENV_BINANCE_API_SECRET=String(process.env.BINANCE_API_SECRET||'').trim();
if(!DATABASE_URL) console.warn('DATABASE_URL/POSTGRES_URL is not configured; using environment-admin authentication fallback');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false},max:Number(process.env.PG_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
const SESSION_TTL=Number(process.env.SESSION_TTL_SEC||28800)*1000;
let killSwitch=false, dayState={date:new Date().toISOString().slice(0,10),equityStart:0}, KEY='', SECRET='';

async function q(sql,params=[]){if(!pool)throw Error('Database is not configured. Set DATABASE_URL (or POSTGRES_URL) in Vercel.');return (await pool.query(sql,params)).rows}
async function exec(sql,params=[]){if(!pool)throw Error('Database is not configured. Set DATABASE_URL (or POSTGRES_URL) in Vercel.');await pool.query(sql,params)}
async function initDb(){await exec(`CREATE TABLE IF NOT EXISTS trades(id TEXT PRIMARY KEY,symbol TEXT,side TEXT,entry DOUBLE PRECISION,exit DOUBLE PRECISION,qty DOUBLE PRECISION,pnl DOUBLE PRECISION DEFAULT 0,fee DOUBLE PRECISION DEFAULT 0,funding DOUBLE PRECISION DEFAULT 0,opened_at BIGINT,closed_at BIGINT,reason TEXT,setup TEXT,status TEXT DEFAULT 'OPEN',meta JSONB);CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,symbol TEXT,client_order_id TEXT,exchange_order_id TEXT,side TEXT,type TEXT,qty DOUBLE PRECISION,price DOUBLE PRECISION,status TEXT,reduce_only BOOLEAN DEFAULT FALSE,created_at BIGINT,updated_at BIGINT,raw JSONB);CREATE TABLE IF NOT EXISTS journal(id TEXT PRIMARY KEY,trade_id TEXT,note TEXT,tags TEXT,created_at BIGINT);CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT,actor TEXT,detail TEXT,created_at BIGINT);CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY CHECK(id=1),api_key_enc TEXT,api_secret_enc TEXT,totp_enc TEXT);CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT UNIQUE,salt TEXT,password_hash TEXT,created_at BIGINT);CREATE INDEX IF NOT EXISTS idx_trades_opened ON trades(opened_at DESC);CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at DESC);`)}
let dbReady=false, dbInitPromise=null;
async function ensureDb(){if(dbReady)return;if(!dbInitPromise)dbInitPromise=initDb().then(()=>{dbReady=true}).catch(e=>{dbInitPromise=null;throw e});await dbInitPromise}
const DB_REQUIRED=['/api/journal','/api/audit','/api/2fa/','/api/paper/'];
app.use('/api',async(req,res,next)=>{const path=req.path||'';const needsDb=DB_REQUIRED.some(x=>path===x||path.startsWith(x));if(!needsDb)return next();try{await ensureDb();next()}catch(e){res.status(503).json({error:'Database initialization failed',detail:e.message,code:'DB_UNAVAILABLE'})}});
async function audit(action,detail='',actor='system'){try{await exec('INSERT INTO audit(id,action,actor,detail,created_at) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),action,actor,detail,Date.now()])}catch(e){console.error('audit',e.message)}}
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){const h=crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1});return {salt,hash:h.toString('hex')}}
function makeToken(user){if(!MASTER)throw Error('MASTER_KEY is not configured');const payload=Buffer.from(JSON.stringify({u:user,exp:Date.now()+SESSION_TTL})).toString('base64url');const mac=crypto.createHmac('sha256',MASTER).update(payload).digest('base64url');return payload+'.'+mac}
function verifyToken(token){try{const [payload,mac]=String(token||'').split('.');if(!payload||!mac)return null;const expected=crypto.createHmac('sha256',MASTER).update(payload).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;const p=JSON.parse(Buffer.from(payload,'base64url').toString());return p.exp>Date.now()?p.u:null}catch{return null}}
function auth(req,res,next){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const user=verifyToken(token);if(!user)return res.status(401).json({error:'Authentication required'});req.user=user;next()}
function optionalAuth(req){return verifyToken(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''))}
function requireMaster(req,res,next){if(!MASTER)return res.status(503).json({error:'MASTER_KEY is not configured'});next()}
function enc(s){if(!MASTER)throw Error('MASTER_KEY is required');const iv=crypto.randomBytes(12),k=crypto.createHash('sha256').update(MASTER).digest(),c=crypto.createCipheriv('aes-256-gcm',k,iv),out=Buffer.concat([c.update(String(s),'utf8'),c.final()]);return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${out.toString('base64')}`}
function dec(v){const [iv,tag,data]=String(v).split('.'),k=crypto.createHash('sha256').update(MASTER).digest(),d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(iv,'base64'));d.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([d.update(Buffer.from(data,'base64')),d.final()]).toString()}
async function loadCredentials(){
  // Environment credentials are preferred for Vercel deployments; they never reach the browser.
  if(ENV_BINANCE_API_KEY&&ENV_BINANCE_API_SECRET){KEY=ENV_BINANCE_API_KEY;SECRET=ENV_BINANCE_API_SECRET;return}
  try{const r=(await q('SELECT api_key_enc,api_secret_enc FROM credentials WHERE id=1'))[0];KEY=r?.api_key_enc?dec(r.api_key_enc):'';SECRET=r?.api_secret_enc?dec(r.api_secret_enc):''}catch{KEY='';SECRET=''}
}
function sym(s){s=String(s||'').toUpperCase();if(!ALLOWED.has(s))throw Error('Symbol not allowed');return s}
function sig(qs){return crypto.createHmac('sha256',SECRET).update(qs).digest('hex')}
async function publicBinance(path,p={}){
  const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)])).toString();
  const url=MARKET_BASE+path+(qs?'?'+qs:'');
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.msg||`HTTP ${r.status}`);
  return d;
}
async function binance(path,p={},method='GET',signed=false){if(signed)await loadCredentials();const x={...p};if(signed){if(!KEY||!SECRET)throw Error('API credentials not configured');x.timestamp=Date.now();x.recvWindow=5000}const qs=new URLSearchParams(Object.entries(x).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)])).toString(),body=signed?`${qs}&signature=${sig(qs)}`:qs,url=BASE+path+(['GET','DELETE'].includes(method)&&body?`?${body}`:'');const r=await fetch(url,{method,headers:{'X-MBX-APIKEY':KEY,'Content-Type':'application/x-www-form-urlencoded'},body:['POST','PUT'].includes(method)?body:undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.msg||`HTTP ${r.status}`);return d}
function riskCalc({entry,stopLoss,capital,riskPct,leverage,sizingMode}){
  const E=Number(entry), SL=Number(stopLoss), C=Number(capital), R=Number(riskPct), requestedLev=Number(leverage);
  const L=Math.min(requestedLev,MAXLEV);
  if(![E,SL,C,R,L].every(Number.isFinite)||E<=0||SL<=0||C<=0||R<=0)throw Error('Invalid risk input');
  if(R>MAXRISK)throw Error(`Risk capped at ${MAXRISK}%`);
  const loss=Math.abs(E-SL);
  const riskUsd=C*R/100;
  const mode=String(sizingMode||'MARGIN').toUpperCase()==='RISK'?'RISK':'MARGIN';
  // MARGIN = Modal x Leverage. The capital value is USDT margin, never the final position quantity.
  const targetNotional=C*L;
  const marginQty=targetNotional/E;
  const riskQty=loss>0?riskUsd/loss:marginQty;
  const rawQty=mode==='RISK'?Math.min(riskQty,marginQty):marginQty;
  return {quantity:rawQty,notional:rawQty*E,margin:rawQty*E/L,riskUsd,estimatedLoss:rawQty*loss,leverage:L,sizingMode:mode,targetNotional,capital:C,entry:E};
}
function decimalFloor(value,step){
  const v=Number(value), st=Number(step);
  if(!Number.isFinite(v)||!Number.isFinite(st)||st<=0)return 0;
  const decimals=Math.max(0,(String(st).split('.')[1]||'').length);
  const factor=10**decimals;
  return Math.floor((v*factor+1e-9)/(st*factor))*st;
}
function filterOrderQty(rawQty,lot){
  const step=Number(lot?.stepSize||'0.001'), minQty=Number(lot?.minQty||'0'), maxQty=Number(lot?.maxQty||'Infinity');
  const qty=decimalFloor(rawQty,step);
  if(qty<minQty)throw Error(`Quantity ${qty} di bawah minimum Binance ${minQty}`);
  if(qty>maxQty)throw Error(`Quantity ${qty} melebihi maksimum Binance ${maxQty}`);
  return qty;
}
async function cancelSymbolAlgoOrders(s){try{return await binance('/fapi/v1/algoOpenOrders',{symbol:s},'DELETE',true)}catch(e){return {error:e.message}}}
async function cancelSymbolRegularOrders(s){try{return await binance('/fapi/v1/allOpenOrders',{symbol:s},'DELETE',true)}catch(e){return {error:e.message}}}
function decodeBase32(input){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='',out=[];for(const ch of String(input).replace(/=+$/,'').toUpperCase().replace(/\s/g,'')){const i=a.indexOf(ch);if(i<0)throw Error('Invalid TOTP secret');bits+=i.toString(2).padStart(5,'0');while(bits.length>=8){out.push(parseInt(bits.slice(0,8),2));bits=bits.slice(8)}}return Buffer.from(out)}
function totp(secret,time=Math.floor(Date.now()/1000),step=30,digits=6){const key=decodeBase32(secret),b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(time/step)));const h=crypto.createHmac('sha1',key).update(b).digest(),o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%10**digits).padStart(digits,'0')}
function base32(buf){let bits='',out='';for(const b of buf)bits+=b.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5)out+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return out}
async function getSetting(k, fallback=''){if(!pool){if(k==='kill_switch')return String(killSwitch);if(k==='guard_date')return dayState.date;if(k==='equity_start')return String(dayState.equityStart||0);return fallback}const r=await q('SELECT v FROM settings WHERE k=$1',[k]);return r[0]?.v ?? fallback}
async function setSetting(k,v){if(!pool){if(k==='kill_switch')killSwitch=String(v)==='true';if(k==='guard_date')dayState.date=String(v);if(k==='equity_start')dayState.equityStart=+v||0;return}await exec('INSERT INTO settings(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v',[k,String(v)])}
async function getKillSwitch(){return (await getSetting('kill_switch','false'))==='true'}
async function dailyGuard(equity){const d=new Date().toISOString().slice(0,10);let guardDate=await getSetting('guard_date',''),start=+(await getSetting('equity_start','0'));if(guardDate!==d){guardDate=d;start=equity;await setSetting('guard_date',d);await setSetting('equity_start',start);await setSetting('kill_switch','false')}if(!start&&equity>0){start=equity;await setSetting('equity_start',start)}const dd=start?Math.max(0,(start-equity)/start*100):0;if(dd>=MAX_DD)await setSetting('kill_switch','true');return {dd,equityStart:start}}
function ema(vals,n){if(vals.length<n)return null;let e=vals.slice(0,n).reduce((a,b)=>a+b,0)/n,k=2/(n+1);for(let i=n;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e}
function srLevels(rows){const c=rows.slice(0,-1).map(x=>({o:+x[1],h:+x[2],l:+x[3],c:+x[4]})); if(c.length<40)return {support:null,resistance:null,context:'NO_LEVEL'}; const a=c.slice(-120),last=a.at(-1); const tr=[]; for(let i=2;i<a.length-2;i++){if(a[i].h>=a[i-1].h&&a[i].h>=a[i-2].h&&a[i].h>=a[i+1].h&&a[i].h>=a[i+2].h)tr.push(a[i].h);if(a[i].l<=a[i-1].l&&a[i].l<=a[i-2].l&&a[i].l<=a[i+1].l&&a[i].l<=a[i+2].l)tr.push(a[i].l)} const tol=last.c*.001; const levels=[]; for(const p of tr){let g=levels.find(x=>Math.abs(x.p-p)<=tol);if(!g){g={p,n:0};levels.push(g)}g.p=(g.p*g.n+p)/(g.n+1);g.n++} const sup=levels.filter(x=>x.p<last.c).sort((a,b)=>b.p-a.p)[0]?.p||null,res=levels.filter(x=>x.p>last.c).sort((a,b)=>a.p-b.p)[0]?.p||null; let context='BETWEEN_LEVELS'; if(sup&&last.l<sup&&last.c>sup)context='SUPPORT_REJECTION'; if(res&&last.h>res&&last.c<res)context='RESISTANCE_REJECTION'; return {support:sup,resistance:res,context,distanceSupport:sup?(last.c-sup)/last.c*100:null,distanceResistance:res?(res-last.c)/last.c*100:null}; }
function aiTrend(rows){if(!rows||rows.length<60)return {side:'WAIT',score:0,strength:'LOW',reason:['Menunggu minimal 60 candle']};const c=rows.map(x=>({o:+x[1],h:+x[2],l:+x[3],cl:+x[4]}));const closes=c.map(x=>x.cl),e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),e9p=ema(closes.slice(0,-1),9),e21p=ema(closes.slice(0,-1),21),recent=c.slice(-12),dirs=recent.slice(1).filter((x,i)=>x.cl>recent[i].cl).length,avgBody=recent.slice(0,-1).reduce((a,x)=>a+Math.abs(x.cl-x.o),0)/11,last=recent.at(-1),bull=dirs>=8&&e9>e21&&e21>e50&&e9>e9p&&e21>e21p, bear=(10-dirs)>=8&&e9<e21&&e21<e50&&e9<e9p&&e21<e21p;let bs=0,ss=0,r=[];if(e9>e21&&e9>e9p)bs+=25;if(e21>e50&&e21>e21p)bs+=20;if(dirs>=8)bs+=20;if(Math.abs(last.cl-last.o)>avgBody*1.25&&last.cl>last.o)bs+=10;if(last.h>=Math.max(...recent.slice(0,-1).map(x=>x.h)))bs+=15;if(e9<e21&&e9<e9p)ss+=25;if(e21<e50&&e21<e21p)ss+=20;if(dirs<=2)ss+=20;if(Math.abs(last.cl-last.o)>avgBody*1.25&&last.cl<last.o)ss+=10;if(last.l<=Math.min(...recent.slice(0,-1).map(x=>x.l)))ss+=15;if(bs>=60&&bs-ss>=15)r=['EMA 9/21/50 bullish','Mayoritas candle naik','Momentum/structure bullish'];else if(ss>=60&&ss-bs>=15)r=['EMA 9/21/50 bearish','Mayoritas candle turun','Momentum/structure bearish'];else r=['Trend belum cukup kuat','Menunggu konfirmasi candle berikutnya'];return {side:bs>=60&&bs-ss>=15?'BUY':ss>=60&&ss-bs>=15?'SELL':'WAIT',score:Math.max(bs,ss),strength:Math.max(bs,ss)>=75?'HIGH':Math.max(bs,ss)>=60?'MEDIUM':'LOW',reason:r,ema:{e9,e21,e50}}}
async function aiMulti(symbol){const tfs=[['4h',.30],['1h',.25],['15m',.20],['5m',.15],['1m',.10]],out=[];for(const [tf,w] of tfs){const rows=await publicBinance('/fapi/v1/klines',{symbol,interval:tf,limit:150});const a=aiTrend(rows);out.push({timeframe:tf,weight:w,...a})}const buy=out.reduce((s,x)=>s+(x.side==='BUY'?x.weight:0),0),sell=out.reduce((s,x)=>s+(x.side==='SELL'?x.weight:0),0),buyN=out.filter(x=>x.side==='BUY').length,sellN=out.filter(x=>x.side==='SELL').length;let side='WAIT';if(buy>=.60&&buyN>=3)side='BUY';if(sell>=.60&&sellN>=3)side='SELL';return {symbol,side,score:Math.round(Math.max(buy,sell)*100),buyWeight:Math.round(buy*100),sellWeight:Math.round(sell*100),timeframes:out,updatedAt:Date.now()}}

app.get('/api/runtime',(_,r)=>r.json({
  ok:true,
  vercelRegion:process.env.VERCEL_REGION||'unknown',
  vercelUrl:process.env.VERCEL_URL||'unknown',
  tradingMode:TRADING_MODE,
  usdtIdrRate:USDT_IDR_RATE,
  binanceEnvironment:IS_DEMO?'demo':'live',
  binanceBase:BASE,
  binanceWs:WS_BASE,
  marketWs:MARKET_WS_BASE,
  marketBase:MARKET_BASE,
  bybitBase:BYBIT_BASE
}));

app.get('/api/health',async(_,r)=>{try{let db='not-configured';if(pool){await ensureDb();db='postgres'}r.json({ok:true,version:'5.23.0-full-reconcile',live:LIVE,tradingMode:TRADING_MODE,binanceEnvironment:IS_DEMO?'demo':'live',binanceBase:BASE,binanceWs:WS_BASE,marketBase:MARKET_BASE,marketWs:MARKET_WS_BASE,binanceCredentialsConfigured:!!(ENV_BINANCE_API_KEY&&ENV_BINANCE_API_SECRET),killSwitch:await getKillSwitch(),maxLeverage:MAXLEV,maxRiskPct:MAXRISK,dailyDrawdownPct:MAX_DD,db,auth:pool?'postgres':(ENV_ADMIN_USER&&ENV_ADMIN_PASSWORD?'env-admin':'unconfigured')})}catch(e){r.status(503).json({ok:false,db:'down',auth:ENV_ADMIN_USER&&ENV_ADMIN_PASSWORD?'env-admin':'unconfigured',error:e.message})}});
app.get('/api/auth/status',async(qr,r)=>{try{if(pool){try{await ensureDb();const u=(await q('SELECT username FROM users WHERE id=1'))[0];return r.json({configured:!!u,authenticated:!!optionalAuth(qr),username:u?.username||null,mode:'postgres'})}catch(e){if(!ENV_ADMIN_USER||!ENV_ADMIN_PASSWORD)throw e}}if(!ENV_ADMIN_USER||!ENV_ADMIN_PASSWORD)throw Error('Authentication is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD and MASTER_KEY in Vercel.');r.json({configured:true,authenticated:!!optionalAuth(qr),username:ENV_ADMIN_USER,mode:'env'})}catch(e){r.status(503).json({error:e.message,code:'AUTH_NOT_CONFIGURED'})}});
app.post('/api/auth/setup',async(qr,r)=>{try{if(!pool)throw Error('Database belum dikonfigurasi. Untuk mode Vercel tanpa database, isi ADMIN_USERNAME, ADMIN_PASSWORD dan MASTER_KEY lalu gunakan Login.');await ensureDb();if((await q('SELECT id FROM users WHERE id=1')).length)throw Error('User already configured');const username=String(qr.body.username||'admin').trim(),password=String(qr.body.password||'');if(!username||password.length<12)throw Error('Username required and password must be at least 12 characters');const ph=passwordHash(password);await exec('INSERT INTO users(id,username,salt,password_hash,created_at) VALUES(1,$1,$2,$3,$4)',[username,ph.salt,ph.hash,Date.now()]);await audit('AUTH_SETUP',username);const token=makeToken(username);r.json({token,username,expiresInSec:SESSION_TTL/1000,mode:'postgres'})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/auth/login',async(qr,r)=>{try{const suppliedUser=String(qr.body.username||'').trim(),suppliedPass=String(qr.body.password||'');let username='';if(pool){try{await ensureDb();const u=(await q('SELECT * FROM users WHERE id=1'))[0];if(u){const got=crypto.scryptSync(suppliedPass,u.salt,64,{N:16384,r:8,p:1});if(!crypto.timingSafeEqual(got,Buffer.from(u.password_hash,'hex')))throw Error('Invalid credentials');username=u.username;const row=(await q('SELECT totp_enc FROM credentials WHERE id=1'))[0];if(row?.totp_enc&&String(qr.body.code||'').trim()!==totp(dec(row.totp_enc)))throw Error('Valid 2FA code required')}}catch(e){if(!ENV_ADMIN_USER||!ENV_ADMIN_PASSWORD||e.message==='Invalid credentials'||e.message==='Valid 2FA code required')throw e}}if(!username){if(!ENV_ADMIN_USER||!ENV_ADMIN_PASSWORD)throw Error('Run setup first or configure ADMIN_USERNAME and ADMIN_PASSWORD in Vercel');if(suppliedUser!==ENV_ADMIN_USER||suppliedPass!==ENV_ADMIN_PASSWORD)throw Error('Invalid credentials');username=ENV_ADMIN_USER}const token=makeToken(username);if(pool)await audit('AUTH_LOGIN',username);r.json({token,username,expiresInSec:SESSION_TTL/1000,mode:pool?'postgres':'env'})}catch(e){r.status(401).json({error:e.message})}});
app.post('/api/auth/logout',auth,(q,r)=>{r.json({ok:true})});
function bybitInterval(v){const m={'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','3d':'D','1w':'W','1M':'M'};return m[String(v||'5m')]||'5'}
async function bybitKlines(symbol,interval,limit){const u=new URL('/v5/market/kline',BYBIT_BASE);u.searchParams.set('category','linear');u.searchParams.set('symbol',symbol);u.searchParams.set('interval',bybitInterval(interval));u.searchParams.set('limit',String(Math.min(limit||500,1000)));const rr=await fetch(u,{headers:{'Accept':'application/json'}});const d=await rr.json().catch(()=>({}));if(!rr.ok||d.retCode!==0)throw Error(d.retMsg||`Bybit HTTP ${rr.status}`);return (d.result?.list||[]).reverse().map(x=>[+x[0],x[1],x[2],x[3],x[4],x[5],0,x[6]||'0',0,'0','0','0'])}
async function marketKlines(symbol,interval,limit){try{const rows=await publicBinance('/fapi/v1/klines',{symbol,interval,limit});return {rows,source:'binance'}}catch(binanceError){const rows=await bybitKlines(symbol,interval,limit);return {rows,source:'bybit-fallback',fallbackReason:binanceError.message}}}
app.get('/api/klines',async(qr,r)=>{try{const symbol=sym(qr.query.symbol),interval=qr.query.interval||'5m',limit=Math.min(+qr.query.limit||500,1500),x=await marketKlines(symbol,interval,limit);r.setHeader('Cache-Control','no-store');r.setHeader('X-Market-Data-Source',x.source);if(x.fallbackReason)r.setHeader('X-Market-Data-Fallback','1');r.json(x.rows)}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/ticker',async(qr,r)=>{try{r.json(await publicBinance('/fapi/v2/ticker/price',{symbol:sym(qr.query.symbol)}))}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/depth',async(qr,r)=>{try{r.json(await publicBinance('/fapi/v1/depth',{symbol:sym(qr.query.symbol),limit:100}))}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/open-interest',async(qr,r)=>{try{r.json(await publicBinance('/fapi/v1/openInterest',{symbol:sym(qr.query.symbol)}))}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/market/ticker',async(qr,r)=>{try{const symbol=sym(qr.query.symbol),interval=String(qr.query.interval||'5m');const [rows,mark]=await Promise.all([publicBinance('/fapi/v1/klines',{symbol,interval,limit:2}),publicBinance('/fapi/v1/premiumIndex',{symbol})]);const k=rows.at(-1);if(!k)throw Error('No kline data');r.setHeader('Cache-Control','no-store');r.json({symbol,interval,candle:{t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]},markPrice:mark.markPrice,indexPrice:mark.indexPrice,fundingRate:mark.lastFundingRate,serverTime:Date.now(),source:'binance'});}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/exchange-info',async(qr,r)=>{try{const all=await publicBinance('/fapi/v1/exchangeInfo');const s=all.symbols.find(x=>x.symbol===sym(qr.query.symbol));if(!s)throw Error('Symbol not found');r.json(s)}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/force-orders',async(qr,r)=>{try{r.json(await publicBinance('/fapi/v1/forceOrders',{symbol:sym(qr.query.symbol),limit:20}))}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/ai/trend',async(qr,r)=>{try{const symbol=sym(qr.query.symbol||'BTCUSDT'),interval=qr.query.interval||'5m',x=await marketKlines(symbol,interval,150);r.setHeader('X-Market-Data-Source',x.source);r.json({symbol,interval,...aiTrend(x.rows),source:x.source,updatedAt:Date.now()})}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/ai/mtf',async(qr,r)=>{try{r.json(await aiMulti(sym(qr.query.symbol||'BTCUSDT')))}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/risk/check',async(qr,r)=>{try{r.json({...riskCalc(qr.body),killSwitch:await getKillSwitch()})}catch(e){r.status(400).json({error:e.message})}});
async function getSymbolMeta(s){
  const info=await binance('/fapi/v1/exchangeInfo',{},'GET',true);
  const meta=info.symbols.find(x=>x.symbol===s);
  if(!meta)throw Error('Symbol unavailable');
  const lot=meta.filters?.find(x=>x.filterType==='LOT_SIZE');
  const price=meta.filters?.find(x=>x.filterType==='PRICE_FILTER');
  const notional=meta.filters?.find(x=>x.filterType==='MIN_NOTIONAL'||x.filterType==='NOTIONAL');
  return {meta,lot,price,notional};
}
async function serverEntryPrice(s,entryType,entryPrice){
  const type=String(entryType||'MARKET').toUpperCase();
  if(type==='LIMIT'){
    const p=Number(entryPrice);
    if(!(p>0))throw Error('Harga LIMIT wajib diisi');
    return p;
  }
  const t=await publicBinance('/fapi/v1/ticker/price',{symbol:s});
  const p=Number(t?.price||0);
  if(!(p>0))throw Error('Harga market Binance tidak tersedia');
  return p;
}
app.post('/api/order/preview',auth,async(qr,r)=>{try{
  if(TRADING_MODE==='paper'||(TRADING_MODE==='live'&&!LIVE))throw Error('Exchange trading disabled');
  const b=qr.body,s=sym(b.symbol),entryType=String(b.entryType||'MARKET').toUpperCase();
  const existing=(await binance('/fapi/v3/positionRisk',{symbol:s},'GET',true));
  const open=(Array.isArray(existing)?existing:[]).find(x=>Math.abs(Number(x.positionAmt||0))>0);
  if(open) return r.status(409).json({error:'POSITION_ALREADY_OPEN',message:`Masih ada posisi ${Number(open.positionAmt)>0?'LONG':'SHORT'} ${Math.abs(Number(open.positionAmt))} BTC. Tutup posisi lama sebelum membuat entry baru.`,position:{side:Number(open.positionAmt)>0?'LONG':'SHORT',quantity:Math.abs(Number(open.positionAmt)),entryPrice:Number(open.entryPrice||0),notional:Math.abs(Number(open.positionAmt||0))*Number(open.entryPrice||0)}});
  const entry=await serverEntryPrice(s,entryType,b.entryPrice||b.entry);
  const rc=riskCalc({...b,entry});
  const {lot,price,notional}=await getSymbolMeta(s);
  const qty=filterOrderQty(rc.quantity,lot);
  const tick=Number(price?.tickSize||0.01),roundedEntry=decimalFloor(entry,tick),finalNotional=qty*roundedEntry,margin=finalNotional/rc.leverage;
  const minNotional=Number(notional?.minNotional||notional?.notional||0);
  if(minNotional&&finalNotional<minNotional)throw Error(`Nilai posisi ${finalNotional.toFixed(2)} USDT di bawah minimum notional Binance ${minNotional} USDT`);
  r.json({ok:true,symbol:s,entryType,entryPrice:roundedEntry,capital:rc.capital,leverage:rc.leverage,sizingMode:rc.sizingMode,requestedNotional:rc.targetNotional,serverQty:rc.quantity,finalQty:qty,finalNotional,margin,minNotional,stepSize:Number(lot?.stepSize||0.001),minQty:Number(lot?.minQty||0),maxQty:Number(lot?.maxQty||0),updatedAt:Date.now()});
}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/order/constraints',auth,async(qr,r)=>{try{const s=sym(qr.query.symbol||'BTCUSDT');const info=await binance('/fapi/v1/exchangeInfo',{},'GET',true);const meta=info.symbols.find(x=>x.symbol===s);if(!meta)throw Error('Symbol unavailable');const lot=meta.filters.find(x=>x.filterType==='LOT_SIZE'),price=meta.filters.find(x=>x.filterType==='PRICE_FILTER');r.json({symbol:s,lotSize:{minQty:Number(lot?.minQty||0),maxQty:Number(lot?.maxQty||0),stepSize:Number(lot?.stepSize||0.001)},priceFilter:{tickSize:Number(price?.tickSize||0.01)}})}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/account',auth,async(_,r)=>{try{await loadCredentials();if(KEY&&SECRET){const [b,p,income]=await Promise.all([binance('/fapi/v3/balance',{},'GET',true),binance('/fapi/v3/positionRisk',{},'GET',true),binance('/fapi/v1/income',{incomeType:'REALIZED_PNL',limit:10},'GET',true).catch(()=>[])]);const eq=+(b.find(x=>x.asset==='USDT')?.balance||0);let paperPositions=[];if(pool){try{paperPositions=await q("SELECT * FROM trades WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 200")}catch{}}let guard=null;try{guard=await dailyGuard(eq)}catch{};const lastRealized=Array.isArray(income)&&income.length?income.slice().sort((a,c)=>Number(c.time||0)-Number(a.time||0))[0]:null;const usdt=b.find(x=>x.asset==='USDT')||{};const walletBalance=Number(usdt.balance||0),availableBalance=Number(usdt.availableBalance||0),unrealizedProfit=Number(usdt.crossUnPnl||0);return r.json({mode:TRADING_MODE,liveTrading:LIVE,exchangeTrading:IS_DEMO||LIVE,accountType:IS_DEMO?'BINANCE DEMO FUTURES':'BINANCE LIVE FUTURES',balances:b,positions:p,binancePositions:p,paperPositions,guard,killSwitch:await getKillSwitch(),walletBalance,availableBalance,equity:walletBalance+unrealizedProfit,unrealizedProfit,lastRealizedPnL:lastRealized?Number(lastRealized.income||0):null,lastRealized:lastRealized||null,updatedAt:Date.now()})}let positions=[];if(pool){positions=await q("SELECT * FROM trades WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 200")}return r.json({mode:'paper',liveTrading:false,exchangeTrading:false,accountType:'PAPER ONLY',balances:[],positions,binancePositions:[],killSwitch:await getKillSwitch(),error:'Binance API credentials not configured'});}catch(e){r.status(400).json({error:e.message,base:BASE,environment:IS_DEMO?'demo':'live'})}});
app.post('/api/kill-switch',auth,async(qr,r)=>{try{const enabled=!!qr.body.enabled;await setSetting('kill_switch',enabled);await audit('KILL_SWITCH',String(enabled),qr.user);if(enabled&&LIVE)await binance('/fapi/v1/allOpenOrders',{symbol:sym(qr.body.symbol||'BTCUSDT')},'DELETE',true);r.json({killSwitch:enabled})}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/journal',async(_,r)=>{try{r.json(await q('SELECT * FROM trades ORDER BY opened_at DESC LIMIT 200'))}catch(e){r.status(500).json({error:e.message})}});
app.post('/api/journal',auth,async(qr,r)=>{try{const b=qr.body,id=b.id||crypto.randomUUID();await exec(`INSERT INTO trades(id,symbol,side,entry,exit,qty,pnl,fee,funding,opened_at,closed_at,reason,setup,status,meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET exit=EXCLUDED.exit,pnl=EXCLUDED.pnl,status=EXCLUDED.status,closed_at=EXCLUDED.closed_at,meta=EXCLUDED.meta`,[id,b.symbol,b.side,+b.entry||0,+b.exit||0,+b.qty||0,+b.pnl||0,+b.fee||0,+b.funding||0,+b.openedAt||Date.now(),b.closedAt||null,b.reason||'',b.setup||'manual',b.status||'CLOSED',b.meta||{}]);await audit('JOURNAL_WRITE',id,qr.user);r.json({id})}catch(e){r.status(400).json({error:e.message})}});
app.get('/api/audit',async(_,r)=>{try{r.json(await q('SELECT * FROM audit ORDER BY created_at DESC LIMIT 300'))}catch(e){r.status(500).json({error:e.message})}});
app.get('/api/credentials/status',auth,async(_,r)=>{try{
  if(ENV_BINANCE_API_KEY&&ENV_BINANCE_API_SECRET)return r.json({configured:true,source:'vercel-env',twoFactorEnabled:false,editableInUi:false});
  const row=(await q('SELECT api_key_enc,api_secret_enc,totp_enc FROM credentials WHERE id=1'))[0];
  r.json({configured:!!(row?.api_key_enc&&row?.api_secret_enc),source:'database',twoFactorEnabled:!!row?.totp_enc,editableInUi:true})
}catch(e){r.status(500).json({error:e.message})}});
app.get('/api/binance/test',auth,async(_,r)=>{try{await loadCredentials();if(!KEY||!SECRET)throw Error('Binance API credentials belum dikonfigurasi. Isi BINANCE_API_KEY dan BINANCE_API_SECRET di Vercel.');const [account,balances,positions]=await Promise.all([binance('/fapi/v3/account',{},'GET',true),binance('/fapi/v3/balance',{},'GET',true),binance('/fapi/v3/positionRisk',{},'GET',true)]);const usdt=balances.find(x=>x.asset==='USDT')||{};r.json({ok:true,connected:true,source:ENV_BINANCE_API_KEY&&ENV_BINANCE_API_SECRET?'vercel-env':'database',canTrade:!!account.canTrade,totalWalletBalance:account.totalWalletBalance||usdt.balance||'0',availableBalance:account.availableBalance||usdt.availableBalance||'0',balance:usdt.balance||'0',availableUSDT:usdt.availableBalance||'0',unrealizedProfit:usdt.crossUnPnl||'0',balances,positions})}catch(e){r.status(400).json({ok:false,connected:false,error:e.message})}});
app.post('/api/credentials',auth,requireMaster,async(qr,r)=>{try{const apiKey=String(qr.body.apiKey||'').trim(),apiSecret=String(qr.body.apiSecret||'').trim();if(!apiKey||!apiSecret)throw Error('API Key and API Secret are required');if(apiKey.length<10||apiSecret.length<20)throw Error('Credential format looks invalid');const existing=(await q('SELECT totp_enc FROM credentials WHERE id=1'))[0];if(existing?.totp_enc&&String(qr.body.code||'').trim()!==totp(dec(existing.totp_enc)))throw Error('Valid 2FA code required');await exec(`INSERT INTO credentials(id,api_key_enc,api_secret_enc,totp_enc) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET api_key_enc=EXCLUDED.api_key_enc,api_secret_enc=EXCLUDED.api_secret_enc`,[enc(apiKey),enc(apiSecret),existing?.totp_enc||'']);await loadCredentials();await audit('CREDENTIALS_UPDATED','',qr.user);r.json({ok:true,configured:true})}catch(e){r.status(400).json({error:e.message})}});
app.delete('/api/credentials',auth,requireMaster,async(qr,r)=>{try{const existing=(await q('SELECT totp_enc FROM credentials WHERE id=1'))[0];if(existing?.totp_enc&&String(qr.body.code||'').trim()!==totp(dec(existing.totp_enc)))throw Error('Valid 2FA code required');await exec('DELETE FROM credentials WHERE id=1');KEY='';SECRET='';await audit('CREDENTIALS_REMOVED','',qr.user);r.json({ok:true})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/2fa/setup',auth,requireMaster,async(qr,r)=>{try{const secret=base32(crypto.randomBytes(20)),row=(await q('SELECT api_key_enc,api_secret_enc FROM credentials WHERE id=1'))[0];await exec(`INSERT INTO credentials(id,api_key_enc,api_secret_enc,totp_enc) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET totp_enc=EXCLUDED.totp_enc`,[row?.api_key_enc||'',row?.api_secret_enc||'',enc(secret)]);await audit('2FA_SETUP','',qr.user);r.json({secret,otpauth:`otpauth://totp/Obsidian%20Futures?secret=${secret}&issuer=Obsidian`})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/2fa/verify',auth,requireMaster,async(qr,r)=>{try{const row=(await q('SELECT totp_enc FROM credentials WHERE id=1'))[0];if(!row?.totp_enc)throw Error('2FA not configured');const secret=dec(row.totp_enc),code=String(qr.body.code||'').trim(),ok=[-1,0,1].some(d=>totp(secret,Math.floor(Date.now()/1000)+d*30)===code);if(ok)await audit('2FA_VERIFY','success',qr.user);r.json({ok})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/paper/order',auth,async(qr,r)=>{try{if(await getKillSwitch())throw Error('Kill switch active');const b=qr.body,rc=riskCalc(b),id=crypto.randomUUID(),now=Date.now(),p={id,symbol:sym(b.symbol),side:b.side,entry:+b.entry,quantity:rc.quantity,sl:+b.stopLoss,tp:+b.takeProfit,openedAt:now,status:'OPEN',pnl:0};await exec(`INSERT INTO trades(id,symbol,side,entry,qty,opened_at,reason,setup,status,meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9)`,[id,p.symbol,p.side,p.entry,p.quantity,now,b.reason||'manual',b.setup||'structure+ATR',b]);await audit('PAPER_ORDER',id,qr.user);r.json({mode:'PAPER',position:p,risk:rc})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/paper/close',auth,async(qr,r)=>{try{const s=sym(qr.body.symbol),row=(await q("SELECT * FROM trades WHERE symbol=$1 AND status='OPEN' ORDER BY opened_at DESC LIMIT 1",[s]))[0];if(!row)throw Error('Tidak ada posisi PAPER yang terbuka.');const price=Number((await publicBinance('/fapi/v1/ticker/price',{symbol:s})).price||0),pnl=(row.side==='LONG'?1:-1)*(price-Number(row.entry))*Number(row.qty);await exec("UPDATE trades SET exit=$1,pnl=$2,closed_at=$3,status='CLOSED',reason=$4 WHERE id=$5",[price,pnl,Date.now(),'manual-close',row.id]);await audit('PAPER_CLOSE',row.id,qr.user);r.json({ok:true,mode:'PAPER',exitPrice:price,pnl,realizedPnl:pnl})}catch(e){r.status(400).json({error:e.message})}});
app.post('/api/live/close',auth,async(qr,r)=>{try{
  const s=sym(qr.body.symbol); await loadCredentials();
  if(!KEY||!SECRET)throw Error('Binance API credential belum dikonfigurasi.');
  const beforeBal=(await binance('/fapi/v3/balance',{},'GET',true)).find(x=>x.asset==='USDT')||{};
  const balanceBefore=Number(beforeBal.balance||0),availableBefore=Number(beforeBal.availableBalance||0);
  const ps=await binance('/fapi/v3/positionRisk',{symbol:s},'GET',true);
  const p=Array.isArray(ps)?ps.find(x=>Math.abs(Number(x.positionAmt||0))>0):ps;
  const amt=Number(p?.positionAmt||0); if(!amt)throw Error('Tidak ada posisi Binance yang terbuka.');
  const side=amt>0?'SELL':'BUY',qty=Math.abs(amt);
  const info=await binance('/fapi/v1/exchangeInfo',{},'GET',true),meta=info.symbols.find(x=>x.symbol===s),lot=meta?.filters?.find(x=>x.filterType==='LOT_SIZE');
  const step=+(lot?.stepSize||'0.001'),q=decimalFloor(qty,step); if(q<=0)throw Error('Quantity posisi tidak valid.');
  const closeStarted=Date.now()-2000;
  const [algoCancel,regularCancel]=await Promise.all([cancelSymbolAlgoOrders(s),cancelSymbolRegularOrders(s)]);
  const out=await binance('/fapi/v1/order',{symbol:s,side,type:'MARKET',quantity:q,reduceOnly:'true',newOrderRespType:'RESULT'},'POST',true);
  let finalPos=null,afterBal=null,income=[];
  for(let i=0;i<16;i++){
    await new Promise(resolve=>setTimeout(resolve,250));
    const [pp,bb,ii]=await Promise.all([
      binance('/fapi/v3/positionRisk',{symbol:s},'GET',true),
      binance('/fapi/v3/balance',{},'GET',true),
      binance('/fapi/v1/income',{incomeType:'REALIZED_PNL',symbol:s,startTime:closeStarted,limit:50},'GET',true).catch(()=>[])
    ]);
    finalPos=(Array.isArray(pp)?pp.find(x=>Math.abs(Number(x.positionAmt||0))>0):null)||null;
    afterBal=(Array.isArray(bb)?bb:[]).find(x=>x.asset==='USDT')||{}; income=Array.isArray(ii)?ii:[];
    if(!finalPos)break;
  }
  if(finalPos)throw Error(`Binance belum melaporkan posisi ${s} = 0 setelah close. Posisi aktual masih ${finalPos.positionAmt}.`);
  const realizedRows=income.filter(x=>x.symbol===s&&Number(x.time||0)>=closeStarted).sort((a,b)=>Number(a.time||0)-Number(b.time||0));
  const realizedPnl=realizedRows.reduce((sum,x)=>sum+Number(x.income||0),0);
  const balanceAfter=Number(afterBal?.balance||0),availableAfter=Number(afterBal?.availableBalance||0),walletDelta=balanceAfter-balanceBefore;
  const entryPrice=Number(p.entryPrice||0),exitPrice=Number(out.avgPrice||p.markPrice||0),grossEstimate=(amt>0?1:-1)*(exitPrice-entryPrice)*q;
  await audit('EXCHANGE_CLOSE',JSON.stringify({environment:IS_DEMO?'demo':'live',symbol:s,side,orderId:out.orderId,qty:q,realizedPnl,walletDelta,balanceBefore,balanceAfter,algoCancel,regularCancel}),qr.user);
  r.json({ok:true,mode:TRADING_MODE,exitPrice,entryPrice,quantity:q,grossEstimate,realizedPnl,walletDelta,balanceBefore,balanceAfter,availableBefore,availableAfter,positionClosed:true,order:out,realizedIncome:realizedRows,canceled:{algo:algoCancel,regular:regularCancel}});
}catch(e){r.status(400).json({error:e.message,code:e.code||'CLOSE_ERROR'})}});
app.post('/api/live/order',auth,async(qr,r)=>{try{
  if(TRADING_MODE==='paper'||(TRADING_MODE==='live'&&!LIVE))throw Error('Exchange trading is disabled. Set TRADING_MODE=demo for Binance Demo or TRADING_MODE=live with ENABLE_LIVE_TRADING=true.');
  if(await getKillSwitch())throw Error('Kill switch active');
  const b=qr.body,s=sym(b.symbol),side=b.side==='LONG'?'BUY':'SELL',entryType=String(b.entryType||'MARKET').toUpperCase();
  if(!b.stopLoss)throw Error('Stop Loss wajib diisi');
  // Never add a new entry on top of an existing position. This prevents an old 0.0003 BTC
  // position from being mistaken for the new calculator size.
  const before=await binance('/fapi/v3/positionRisk',{symbol:s},'GET',true);
  const existing=(Array.isArray(before)?before:[]).find(x=>Math.abs(Number(x.positionAmt||0))>0);
  if(existing){
    const eq=Math.abs(Number(existing.positionAmt||0)), ee=Number(existing.entryPrice||0);
    return r.status(409).json({error:`Masih ada posisi ${Number(existing.positionAmt)>0?'LONG':'SHORT'} ${eq.toFixed(6)} BTC. Tutup posisi lama dulu. Entry baru tidak dikirim agar Qty kalkulator tidak tercampur dengan posisi lama.`,code:'POSITION_ALREADY_OPEN',actualPosition:{side:Number(existing.positionAmt)>0?'LONG':'SHORT',quantity:eq,entryPrice:ee,notional:eq*ee}});
  }
  const effectiveEntry=await serverEntryPrice(s,entryType,b.entryPrice||b.entry);
  const rc=riskCalc({...b,entry:effectiveEntry});
  await binance('/fapi/v1/leverage',{symbol:s,leverage:rc.leverage},'POST',true);
  const {meta,lot,price,notional}=await getSymbolMeta(s);
  const tick=Number(price?.tickSize||'0.01');
  const roundPrice=(v,st)=>decimalFloor(Number(v),Number(st));
  const qty=filterOrderQty(rc.quantity,lot);
  const roundedEntry=roundPrice(effectiveEntry,tick);
  const stop=roundPrice(+b.stopLoss,tick),take=roundPrice(+b.takeProfit,tick);
  if(!qty)throw Error('Quantity posisi tidak valid setelah mengikuti LOT_SIZE Binance.');
  const finalNotional=qty*roundedEntry, margin=finalNotional/rc.leverage;
  const minNotional=Number(notional?.minNotional||notional?.notional||0);
  if(minNotional&&finalNotional<minNotional)throw Error(`Nilai posisi ${finalNotional.toFixed(2)} USDT di bawah minimum notional Binance ${minNotional} USDT`);
  const requestedQty=Number(b.expectedQuantity||0),requestedNotional=Number(b.expectedNotional||0);
  const qtyTolerance=Math.max(Number(lot?.stepSize||0.001),Math.abs(qty)*0.00001);
  if(requestedQty>0 && Math.abs(requestedQty-qty)>qtyTolerance){
    throw Object.assign(new Error(`Qty kalkulator (${requestedQty.toFixed(6)} BTC) berbeda dari Qty server (${qty.toFixed(6)} BTC). Sinkronkan ulang kalkulator sebelum entry.`),{code:'SIZING_MISMATCH'});
  }
  const sizingCheck={requestedQty,requestedNotional,serverEntry:effectiveEntry,serverQty:rc.quantity,serverNotional:rc.notional,finalQty:qty,finalNotional,margin,leverage:rc.leverage,capital:rc.capital,sizingMode:rc.sizingMode,stepSize:Number(lot?.stepSize||0.001),minQty:Number(lot?.minQty||0),maxQty:Number(lot?.maxQty||0)};
  const clientOrderId=`OBS-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const entryPayload={symbol:s,side,quantity:qty,newClientOrderId:clientOrderId,newOrderRespType:'RESULT',type:entryType};
  if(entryType==='LIMIT'){
    const ep=roundPrice(+b.entryPrice,tick);if(!(ep>0))throw Error('Harga LIMIT wajib diisi');
    entryPayload.price=ep;entryPayload.timeInForce='GTC';
  }
  const entry=await binance('/fapi/v1/order',entryPayload,'POST',true);
  const exit=side==='BUY'?'SELL':'BUY';
  const sl=await binance('/fapi/v1/algoOrder',{algoType:'CONDITIONAL',symbol:s,side:exit,type:'STOP_MARKET',triggerPrice:stop,closePosition:'true',workingType:'MARK_PRICE'},'POST',true);
  const tp=take>0?await binance('/fapi/v1/algoOrder',{algoType:'CONDITIONAL',symbol:s,side:exit,type:'TAKE_PROFIT_MARKET',triggerPrice:take,closePosition:'true',workingType:'MARK_PRICE'},'POST',true):null;
  let actualPosition=null, actualOrder=null;
  for(let i=0;i<12;i++){
    try{
      const [ps,ord]=await Promise.all([
        binance('/fapi/v3/positionRisk',{symbol:s},'GET',true),
        entry.orderId?binance('/fapi/v1/order',{symbol:s,orderId:entry.orderId},'GET',true):Promise.resolve(null)
      ]);
      actualPosition=(Array.isArray(ps)?ps:[]).find(x=>Math.abs(Number(x.positionAmt||0))>0)||null;
      actualOrder=ord||entry;
      if(actualPosition || ['FILLED','PARTIALLY_FILLED','CANCELED','REJECTED','EXPIRED'].includes(String(actualOrder.status||'').toUpperCase()))break;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const executedQty=Number(actualOrder?.executedQty||entry.executedQty||0);
  const actualQty=actualPosition?Math.abs(Number(actualPosition.positionAmt)):executedQty;
  const actualEntry=actualPosition?Number(actualPosition.entryPrice):Number(actualOrder?.avgPrice||entry.avgPrice||roundedEntry);
  const actualNotional=actualQty*actualEntry;
  const qtyDelta=actualQty-qty;
  const actualQtyTolerance=Math.max(Number(lot?.stepSize||0.001),Math.abs(qty)*0.00001);
  const qtyMatch=actualQty>0 && Math.abs(qtyDelta)<=actualQtyTolerance;
  if(!qtyMatch){
    // Never leave an unintended position open if the exchange reports a different size.
    try{await cancelSymbolAlgoOrders(s)}catch{}
    try{await cancelSymbolRegularOrders(s)}catch{}
    if(actualQty>0){
      try{await binance('/fapi/v1/order',{symbol:s,side:side==='BUY'?'SELL':'BUY',type:'MARKET',quantity:filterOrderQty(actualQty,lot),reduceOnly:'true',newOrderRespType:'RESULT'},'POST',true)}catch{}
    }
    throw Object.assign(new Error(`Qty Binance tidak cocok. Diminta ${qty.toFixed(6)} BTC, aktual ${actualQty.toFixed(6)} BTC. Posisi yang berbeda otomatis dibatalkan/ditutup agar tidak ada risiko sizing tak sengaja.`),{code:'ACTUAL_QTY_MISMATCH'});
  }
  await audit('EXCHANGE_ORDER',JSON.stringify({environment:IS_DEMO?'demo':'live',symbol:s,side,orderId:entry.orderId,profitMode:take>0?'TARGET':'UNLIMITED',requestedQty,finalQty:qty,actualQty,actualNotional,qtyMatch}),qr.user);
  r.json({mode:TRADING_MODE,environment:IS_DEMO?'demo':'live',entry,sl,tp,profitMode:take>0?'TARGET':'UNLIMITED',sizing:sizingCheck,actualPosition:{side:Number(actualPosition?.positionAmt||0)>0?'LONG':'SHORT',positionSide:actualPosition?.positionSide||'BOTH',quantity:actualQty,entryPrice:actualEntry,notional:actualNotional,leverage:Number(actualPosition?.leverage||rc.leverage)},qtyMatch:true,updatedAt:Date.now()});
}catch(e){r.status(e.code==='POSITION_ALREADY_OPEN'||e.code==='SIZING_MISMATCH'?409:400).json({error:e.message,code:e.code||'ORDER_ERROR',actualPosition:e.actualPosition||null})}});

app.use('/api',(err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:'Internal server error'});});

export default app;
