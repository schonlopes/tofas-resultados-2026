import { createRemoteJWKSet, jwtVerify } from 'jose';
const resolvers = new Map();
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function googleIdentity(request,env) {
  const header=request.headers.get('Authorization')||'';
  if(!env.GOOGLE_CLIENT_ID || !header.startsWith('Bearer ') || header.length>8192)return null;
  try {
    const {payload}=await jwtVerify(header.slice(7),googleKeys,{
      issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,
      algorithms:['RS256'],requiredClaims:['sub','iat','exp','hd','email_verified'],maxTokenAge:'1h'
    });
    return payload.hd==='escola.pr.gov.br' && payload.email_verified===true && typeof payload.sub==='string' && payload.sub.length>0 ? `google:${payload.sub}` : null;
  } catch {return null;}
}
export async function identity(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER)) return null;
  try {
    let keys = resolvers.get(env.ACCESS_ISSUER);
    if (!keys) {
      keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', env.ACCESS_ISSUER));
      resolvers.set(env.ACCESS_ISSUER, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: env.ACCESS_ISSUER, audience: env.ACCESS_AUD, algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '8h'
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}
export async function digest(value, secret) {
  if (!secret || secret.length < 32) throw new Error('Secret missing');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
}
export function permitted(grants, student, now = Math.floor(Date.now()/1000)) {
  return grants.some(g => g.expires > now && (
    g.scope === 'school' && g.target_id === student.school_id ||
    g.scope === 'student' && g.target_id === student.id
  ));
}
export function secure(response,google=false) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Frame-Options','DENY');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(google){
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; img-src 'self'; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  }
  headers.set('Strict-Transport-Security','max-age=31536000');
  headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  return new Response(response.body, {status: response.status, headers});
}
