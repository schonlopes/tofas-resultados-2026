import { importPKCS8, SignJWT } from 'jose';
let cached;
export async function driveToken(env) {
  if (cached && cached.expires > Date.now()+60000) return cached.token;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope:'https://www.googleapis.com/auth/drive.readonly' })
    .setProtectedHeader({alg:'RS256'}).setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion})
  });
  if (!response.ok) throw new Error('Google authentication unavailable');
  const data = await response.json();
  cached = {token:data.access_token, expires:Date.now()+data.expires_in*1000};
  return cached.token;
}
