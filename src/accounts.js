import {digest} from './security.js';
const cookieName='__Host-tofas';
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));
}
function cookie(request) {
  return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
}
export async function session(request,env) {
  const token=cookie(request);
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  return env.DB.prepare('SELECT a.id,a.username FROM sessions s JOIN ambassadors a ON a.id=s.ambassador_id WHERE s.token_hash=? AND s.expires>? AND a.enabled=1')
    .bind(await digest(token,env.HMAC_SECRET),Math.floor(Date.now()/1000)).first();
}
export async function authentication(request,env) {
  const path=new URL(request.url).pathname;
  if(request.method!=='POST')return Response.json({error:'Método não permitido.'},{status:405});
  if(request.headers.get('Origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
  if(path==='/api/auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(cookie(request),env.HMAC_SECRET)).run();
    return Response.json({ok:true},{headers:{'Set-Cookie':`${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`}});
  }
  if(path!=='/api/auth/login')return Response.json({error:'Não encontrado.'},{status:404});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return Response.json({error:'Formato inválido.'},{status:415});
  // Stream a bounded body, including requests without Content-Length.
  const reader=request.body?.getReader();let size=0,body='';
  if(!reader)return Response.json({error:'Dados inválidos.'},{status:400});
  const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return Response.json({error:'Dados inválidos.'},{status:413});}body+=decoder.decode(value,{stream:true});}
  let data;try{data=JSON.parse(body+decoder.decode());}catch{return Response.json({error:'Dados inválidos.'},{status:400});}
  const username=typeof data?.username==='string'?data.username.trim().toLowerCase():'';
  const password=typeof data?.password==='string'?data.password:'';
  if(!/^[a-z0-9._-]{3,80}$/.test(username)||password.length<16||password.length>256)return Response.json({error:'Login ou senha inválidos.'},{status:401});
  const now=Math.floor(Date.now()/1000);
  // Separate IP and account budgets prevent username rotation and distributed guessing.
  for(const [kind,value,limit] of [['ip',request.headers.get('CF-Connecting-IP')||'local',30],['user',username,10]]) {
    const key=`login:${kind}:${await digest(String(value),env.HMAC_SECRET)}:${Math.floor(now/900)}`;
    const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+1800).first();
    if(row.count>Number(limit))return Response.json({error:'Muitas tentativas. Aguarde 15 minutos.'},{status:429});
  }
  const user=await env.DB.prepare('SELECT * FROM ambassadors WHERE username=?').bind(username).first();
  const computed=await passwordHash(password,user?.salt||'00000000000000000000000000000000');
  const expected=user?.password_hash||'0'.repeat(64);
  let mismatch=computed.length^expected.length;
  for(let i=0;i<computed.length;i++)mismatch|=computed.charCodeAt(i)^expected.charCodeAt(i);
  if(mismatch||!user?.enabled)return Response.json({error:'Login ou senha inválidos.'},{status:401});
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions(token_hash,ambassador_id,expires) VALUES(?,?,?)').bind(await digest(token,env.HMAC_SECRET),user.id,now+28800).run();
  await env.DB.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').bind(await digest(`ambassador:${user.id}`,env.HMAC_SECRET),'login','session',now).run();
  return Response.json({ok:true},{headers:{'Set-Cookie':`${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`}});
}
