const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const fail=(message,status=400)=>reply({error:message},status);
const id=()=>crypto.randomUUID();
const safe=(v,n=500)=>String(v??'').trim().slice(0,n);
const nowPlus=days=>new Date(Date.now()+days*86400000).toISOString();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function digest(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:210000,hash:'SHA-256'},key,256))}
function equal(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function cookie(token,age){return `sulmos_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
async function body(request){if(Number(request.headers.get('content-length')||'0')>35000)throw Error('Request too large');const raw=await request.text();if(raw.length>35000)throw Error('Request too large');return JSON.parse(raw||'{}');}
async function current(request,db){const token=/\bsulmos_session=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1];if(!token)return null;const hash=await digest(token);return db.prepare('SELECT u.id,u.company_id,u.name,u.email,u.role,c.name AS company FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash,new Date().toISOString()).first();}
function fields(obj, allowed){const out={};for(const k of allowed)if(Object.hasOwn(obj,k))out[k]=typeof obj[k]==='number'?obj[k]:safe(obj[k],k==='notes'||k==='detail'||k==='details_json'?5000:500);return out;}
const specs={customers:{cols:['name','email','phone','address','notes'],required:'name'},tickets:{cols:['customer_id','title','detail','priority','status','assignee'],required:'title'},jobs:{cols:['customer_id','title','category','status','technician','scheduled_date','notes'],required:'title'},services:{cols:['customer_id','category','title','status','amount_cents','details_json'],required:'title'}};
const enums={priority:['Low','Normal','High','Critical'],statusTickets:['Open','In progress','Resolved','Closed'],statusJobs:['Scheduled','In progress','Awaiting parts','Completed','Cancelled'],categoryJobs:['IT Support','Security','LTE / Internet','Hardware','Cabling','Other'],categoryServices:['security','hardware','lte','cabling']};
async function validate(db,tenant,table,vals){
 if(Object.hasOwn(vals,'customer_id')&&vals.customer_id){const ok=await db.prepare('SELECT id FROM customers WHERE id=? AND company_id=?').bind(vals.customer_id,tenant).first();if(!ok)throw Error('Customer does not belong to this company');}
 if(Object.hasOwn(vals,'customer_id') && !vals.customer_id) vals.customer_id=null;
 if(vals[specs[table].required]==='')throw Error('Required name/title is missing');
 if(table==='tickets'){if(vals.priority&&!enums.priority.includes(vals.priority))throw Error('Invalid priority');if(vals.status&&!enums.statusTickets.includes(vals.status))throw Error('Invalid ticket status');}
 if(table==='jobs'){if(vals.category&&!enums.categoryJobs.includes(vals.category))throw Error('Invalid job category');if(vals.status&&!enums.statusJobs.includes(vals.status))throw Error('Invalid job status');}
 if(table==='services'){
  if(vals.category&&!enums.categoryServices.includes(vals.category))throw Error('Invalid service category');
  if(Object.hasOwn(vals,'amount_cents')){const n=Number(vals.amount_cents);if(!Number.isSafeInteger(n)||n<0||n>1e11)throw Error('Invalid amount');vals.amount_cents=n;}
  if(Object.hasOwn(vals,'details_json')){try{const o=JSON.parse(vals.details_json);if(!o||Array.isArray(o)||typeof o!=='object')throw Error();}catch{throw Error('Invalid service details JSON');}}
 }
}
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(!env.DB)return fail('D1 binding DB is not configured',503);
 try{
  const path=url.pathname;const method=request.method;
  if(path==='/api/health')return reply({ok:true,storage:'D1'});
  if(path==='/api/register'&&method==='POST'){
    const b=await body(request),company=safe(b.company,120),name=safe(b.name,120),email=safe(b.email,200).toLowerCase(),pw=String(b.password||'');
    if(!company||!name||!/^\S+@\S+\.\S+$/.test(email)||pw.length<12||pw.length>128)return fail('Enter company, name, valid email and a password of 12–128 characters');
    const cid=id(),uid=id(),salt=id(),hash=await passwordHash(pw,salt);
    try{await env.DB.batch([env.DB.prepare('INSERT INTO companies(id,name) VALUES(?,?)').bind(cid,company),env.DB.prepare("INSERT INTO users(id,company_id,name,email,password_hash,salt,role) VALUES(?,?,?,?,?,?,'owner')").bind(uid,cid,name,email,hash,salt)]);}catch(e){if(String(e).includes('UNIQUE'))return fail('Email already registered',409);throw e;}
    return reply({ok:true,message:'Company created. Sign in to continue.'},201);
  }
  if(path==='/api/login'&&method==='POST'){
    const b=await body(request),email=safe(b.email,200).toLowerCase(),pw=String(b.password||'');
    const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    // Run the same expensive KDF for unknown users to reduce timing information.
    const actual=await passwordHash(pw,u?.salt||'unregistered-user-salt');
    if(!u||!equal(actual,u.password_hash))return fail('Incorrect email or password',401);
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),u.id,nowPlus(7)).run();
    return reply({ok:true},200,{'Set-Cookie':cookie(token,7*86400)});
  }
  const user=await current(request,env.DB);if(!user)return fail('Sign in required',401);
  if(path==='/api/logout'&&method==='POST'){
    const t=/\bsulmos_session=([^;]+)/.exec(request.headers.get('Cookie')||'')?.[1];if(t)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(t)).run();
    return reply({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/me'&&method==='GET')return reply({user});
  if(path==='/api/summary'&&method==='GET'){
    const q=await env.DB.batch(['customers','tickets','jobs','services'].map(table=>env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE company_id=?`).bind(user.company_id)));
    return reply({customers:q[0].results[0].count,tickets:q[1].results[0].count,jobs:q[2].results[0].count,services:q[3].results[0].count});
  }
  const match=/^\/api\/(customers|tickets|jobs|services)(?:\/([0-9a-f-]{36}))?$/.exec(path);
  if(!match)return fail('Endpoint not found',404);
  const [,table,recordId]=match, spec=specs[table];
  if(method==='GET'&&!recordId){
    const category=table==='services'?url.searchParams.get('category'):null;
    const rows=category&&enums.categoryServices.includes(category)?await env.DB.prepare('SELECT * FROM services WHERE company_id=? AND category=? ORDER BY created_at DESC LIMIT 200').bind(user.company_id,category).all():await env.DB.prepare(`SELECT * FROM ${table} WHERE company_id=? ORDER BY created_at DESC LIMIT 200`).bind(user.company_id).all();
    return reply({items:rows.results});
  }
  if(method==='GET'&&recordId){const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE company_id=? AND id=?`).bind(user.company_id,recordId).first();return row?reply({item:row}):fail('Not found',404);}
  if(!['owner','manager'].includes(user.role)&&method!=='GET')return fail('Manager permission required',403);
  if(method==='POST'&&!recordId){
    const vals=fields(await body(request),spec.cols);await validate(env.DB,user.company_id,table,vals);
    if(!vals[spec.required])return fail('Required name/title is missing');
    if(table==='jobs'&&!vals.category)return fail('Job category required');if(table==='services'&&!vals.category)return fail('Service category required');
    const record=id(),cols=Object.keys(vals);await env.DB.prepare(`INSERT INTO ${table}(id,company_id,${cols.join(',')}) VALUES(?,?${cols.map(()=>',?').join('')})`).bind(record,user.company_id,...cols.map(k=>vals[k])).run();return reply({ok:true,id:record},201);
  }
  if(method==='PATCH'&&recordId){
    const vals=fields(await body(request),spec.cols);await validate(env.DB,user.company_id,table,vals);const cols=Object.keys(vals);if(!cols.length)return fail('No changes');
    const result=await env.DB.prepare(`UPDATE ${table} SET ${cols.map(k=>`${k}=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(...cols.map(k=>vals[k]),recordId,user.company_id).run();
    return result.meta.changes?reply({ok:true}):fail('Not found',404);
  }
  if(method==='DELETE'&&recordId){
    const result=await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND company_id=?`).bind(recordId,user.company_id).run();return result.meta.changes?reply({ok:true}):fail('Not found',404);
  }
  return fail('Method not allowed',405);
 }catch(e){const msg=String(e?.message||e);if(/no such table/.test(msg))return fail('Run the D1 database migration before using the application',503);if(/Request too large|Invalid service|Customer does not|Required|Invalid amount|Invalid ticket|Invalid job|Invalid priority/.test(msg))return fail(msg);console.error('API request failed',msg);return fail('Unexpected server error',500);}
}};
