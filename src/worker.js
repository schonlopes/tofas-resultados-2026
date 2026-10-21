import { identity, googleIdentity, digest, permitted, secure } from './security.js';
import { driveToken } from './google.js';
import { verifyPrivatePdf } from './drive-policy.js';
import { authentication, session } from './accounts.js';
const json = (value,status=200)=>Response.json(value,{status});
const unavailable = ()=>json({error:'Recurso indisponível ou acesso não autorizado.'},404);
export async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if(path==='/api/auth/status' && request.method==='GET' && env.AUTH_PROVIDER==='google')return json({authenticated:!!await googleIdentity(request,env)});
  if(path==='/api/auth/status' && request.method==='GET' && env.AUTH_PROVIDER==='ambassador')return json({authenticated:!!await session(request,env)});
  if(path.startsWith('/api/auth/') && env.AUTH_PROVIDER==='ambassador')return authentication(request,env);
  if (request.method !== 'GET') return json({error:'Método não permitido.'},405);
  if (path === '/api/config') return json({ released:env.RELEASE_APPROVED==='true', synthetic:env.DATASET!=='real', contact:env.PRIVACY_CONTACT || null, authProvider:env.AUTH_PROVIDER, googleClientId:env.AUTH_PROVIDER==='google'?env.GOOGLE_CLIENT_ID||'':null });
  if (path === '/api/catalog') {
    const {results} = await env.DB.prepare('SELECT id,nre,name FROM schools WHERE public_approved=1 ORDER BY nre,name').all();
    return json(results);
  }
  // HTML contains no personal data. API calls below enforce release and identity.
  if (path === '/restricted/') return env.ASSETS.fetch(new Request(new URL('/restricted.html',url),request));
  if (!path.startsWith('/api/') && !path.startsWith('/restricted/')) return env.ASSETS.fetch(request);
  // All protected operations fail closed until institutional release.
  if (env.RELEASE_APPROVED !== 'true') return json({error:'A consulta está em validação institucional. Nenhum resultado real foi liberado.'},503);
  const account=env.AUTH_PROVIDER==='ambassador'?await session(request,env):null;
  const googleSub=env.AUTH_PROVIDER==='google'?await googleIdentity(request,env):null;
  const ambassador=!!account || !!googleSub;
  const sub = env.AUTH_PROVIDER==='google'?googleSub:env.AUTH_PROVIDER==='ambassador'?(account?`ambassador:${account.id}`:null):await identity(request,env);
  if (!sub) return json({error:'Entre com sua conta autorizada.'},401);
  const actor = await digest(sub, env.HMAC_SECRET);
  const now = Math.floor(Date.now()/1000);
  const rate = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count')
    .bind(`${actor}:${Math.floor(now/60)}`,now+120).first();
  if (rate.count > 60) return json({error:'Limite temporário. Aguarde um minuto.'},429);
  const {results:grants} = await env.DB.prepare('SELECT scope,target_id,expires FROM grants WHERE subject=? AND expires>?').bind(actor,now).all();
  if (path === '/api/me') {
    if(ambassador){
      const {results:schools}=await env.DB.prepare('SELECT id,name,nre FROM schools ORDER BY nre,name').all();
      return json({schools,individual:false,role:'ambassador'});
    }
    const {results:schools}=await env.DB.prepare("SELECT id,name,nre FROM schools WHERE id IN (SELECT target_id FROM grants WHERE subject=? AND scope='school' AND expires>?) ORDER BY name").bind(actor,now).all();
    return json({schools,individual:grants.some(g=>g.scope==='student')});
  }
  if (path === '/api/students') {
    const school = url.searchParams.get('school')||'';
    const after = url.searchParams.get('after')||'';
    if (school.length>100 || after.length>100) return unavailable();
    let rows;
    if (school) {
      if (!ambassador && !grants.some(g=>g.scope==='school' && g.target_id===school)) return unavailable();
      rows=await env.DB.prepare('SELECT id,name,grade FROM students WHERE school_id=? AND id>? ORDER BY id LIMIT 51').bind(school,after).all();
    } else {
      rows=await env.DB.prepare("SELECT id,name,grade FROM students WHERE id IN (SELECT target_id FROM grants WHERE subject=? AND scope='student' AND expires>?) AND id>? ORDER BY id LIMIT 51").bind(actor,now,after).all();
    }
    await env.DB.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').bind(actor,'list',school||'individual',now).run();
    const items=rows.results.slice(0,50);
    return json({items,next:rows.results.length>50?items.at(-1).id:null});
  }
  const docs = path.match(/^\/api\/students\/([a-f0-9-]+)\/documents$/);
  if (docs) {
    const student=await env.DB.prepare('SELECT id,school_id FROM students WHERE id=?').bind(docs[1]).first();
    if (!student || (!ambassador && !permitted(grants,student,now))) return unavailable();
    const {results}=await env.DB.prepare('SELECT id,kind,level FROM documents WHERE student_id=? AND approved=1 ORDER BY kind,level').bind(student.id).all();
    return json(results);
  }
  const download=path.match(/^\/api\/documents\/([a-f0-9-]+)$/);
  if (download) {
    const doc=await env.DB.prepare('SELECT d.*,s.school_id FROM documents d JOIN students s ON s.id=d.student_id WHERE d.id=? AND d.approved=1').bind(download[1]).first();
    if (!doc || (!ambassador && !permitted(grants,{id:doc.student_id,school_id:doc.school_id},now))) return unavailable();
    if(env.DOCUMENT_DELIVERY==='drive') {
      // Only approved database records can generate a destination, never user URLs.
      if(!/^[A-Za-z0-9_-]{10,200}$/.test(doc.file_id))return unavailable();
      await env.DB.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').bind(actor,'open_drive',doc.id,now).run();
      // Google authenticates the visitor and applies the file's current ACL.
      // This redirect does not prove a successful view or download.
      const destination=`https://drive.google.com/file/d/${doc.file_id}/view`;
      if(request.headers.get('Accept')==='application/json')return json({url:destination});
      return new Response(null,{status:302,headers:{Location:destination}});
    }
    const token=await driveToken(env);
    // Inspect only the requested PDF, after authorization; no pre-separation needed.
    // Recheck on every download so later public sharing/restrictions are detected.
    await verifyPrivatePdf(doc.file_id,async url=>{
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error'});
      if(!response.ok) throw new Error('Drive indisponível');
      return response.json();
    });
    const upstream=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.file_id)}?alt=media`,{
      headers:{Authorization:`Bearer ${token}`},redirect:'error'
    });
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('application/pdf')) return json({error:'Documento temporariamente indisponível.'},502);
    await env.DB.prepare('INSERT INTO audit(actor,action,target,at) VALUES(?,?,?,?)').bind(actor,'download',doc.id,now).run();
    return new Response(upstream.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="tofas-2026-${doc.kind}-${doc.level}.pdf"`}});
  }
  return unavailable();
}
export default {
  async fetch(request,env) {
    try { return secure(await handle(request,env),env.AUTH_PROVIDER==='google'); }
    catch { return secure(json({error:'Serviço temporariamente indisponível.'},503),env.AUTH_PROVIDER==='google'); }
  },
  async scheduled(event,env) {
    const now=Math.floor(Date.now()/1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now),
      env.DB.prepare('DELETE FROM grants WHERE expires<?').bind(now),
      env.DB.prepare('DELETE FROM audit WHERE at<?').bind(now-90*86400)
      ,...(env.AUTH_PROVIDER==='ambassador'?[env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now)]:[])
    ]);
  }
};
