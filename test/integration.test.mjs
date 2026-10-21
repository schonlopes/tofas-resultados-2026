import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {generateKeyPair,exportJWK,exportPKCS8,SignJWT} from 'jose';
import {keyed} from '../scripts/normalize.mjs';
import worker from '../src/worker.js';

test('signed JWT + SQL: scoped lists, IDOR denial, download, revocation, expiry and rate limit',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(new URL('../fixtures/seed.sql',import.meta.url),'utf8'));
  const DB={prepare(sql) {
    let args=[];
    const q={bind(...values){args=values;return q;},
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...args)};},
      async run(){return sqlite.prepare(sql).run(...args);}};
    return q;
  }};
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const original=globalThis.fetch;let fileReads=0;
  globalThis.fetch=async(url)=>{
    const u=String(url);
    if(u.endsWith('/cdn-cgi/access/certs')) return Response.json({keys:[jwk]});
    if(u==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-token',expires_in:3600});
    if(u.includes('/permissions?'))return Response.json({permissions:[{type:'user',role:'reader'}]});
    if(u.includes('fields=id,mimeType'))return Response.json({mimeType:'application/pdf',trashed:false,capabilities:{canDownload:true}});
    if(u.startsWith('https://www.googleapis.com/drive/v3/files/')){fileReads++;return new Response('%PDF-1.7\nSYNTHETIC\n%%EOF',{headers:{'Content-Type':'application/pdf'}});}
    throw new Error('Unexpected network request');
  };
  const secret='synthetic-secret-for-integration-1234567890123456789';
  const env={DB,RELEASE_APPROVED:'true',ACCESS_ISSUER:'https://integration-test.cloudflareaccess.com',ACCESS_AUD:'test-aud',HMAC_SECRET:secret,GOOGLE_SERVICE_ACCOUNT:JSON.stringify({client_email:'synthetic@example.invalid',private_key:await exportPKCS8(privateKey)})};
  const now=Math.floor(Date.now()/1000);
  async function token(subject,overrides={}) {
    return new SignJWT({sub:subject,iss:env.ACCESS_ISSUER,aud:env.ACCESS_AUD,iat:now,exp:now+300,...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(privateKey);
  }
  async function call(path,jwt){return worker.fetch(new Request('https://portal.example'+path,{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env);}
  const grant=(subject,scope,id,expires)=>sqlite.prepare('INSERT INTO grants VALUES(?,?,?,?)').run(keyed(subject,secret),scope,id,expires);
  try {
    const schoolToken=await token('school-user');grant('school-user','school','aaaa',now+300);
    const own=await call('/api/students?school=aaaa',schoolToken);assert.equal(own.status,200);
    const ownBody=await own.json();assert.equal(ownBody.items.length,1);assert.equal(ownBody.items[0].id,'1111');
    assert.equal((await call('/api/students?school=bbbb',schoolToken)).status,404);
    assert.equal((await call('/api/students/2222/documents',schoolToken)).status,404);
    assert.equal((await call('/api/documents/dddd',schoolToken)).status,404);assert.equal(fileReads,0);
    sqlite.exec("UPDATE documents SET approved=1 WHERE id='dddd'");
    const listing=await (await call('/api/students/1111/documents',schoolToken)).json();
    assert.deepEqual(Object.keys(listing[0]).sort(),['id','kind','level']);
    const pdf=await call('/api/documents/dddd',schoolToken);
    assert.equal(pdf.status,200);assert.match(await pdf.text(),/^%PDF/);assert.equal(pdf.headers.get('location'),null);assert.equal(pdf.headers.get('cache-control'),'no-store');assert.equal(fileReads,1);
    const individual=await token('guardian');grant('guardian','student','2222',now+300);
    assert.equal((await (await call('/api/students',individual)).json()).items[0].id,'2222');
    assert.equal((await call('/api/documents/dddd',individual)).status,404);assert.equal(fileReads,1);
    assert.equal((await call('/api/students',await token('school-user',{aud:'other-app'}))).status,401);
    assert.equal((await call('/api/students',await token('school-user',{exp:now-10}))).status,401);
    assert.equal((await call('/api/students',await token('school-user',{iss:'https://evil.test'}))).status,401);
    sqlite.prepare('DELETE FROM grants WHERE subject=?').run(keyed('school-user',secret));
    assert.equal((await call('/api/documents/dddd',schoolToken)).status,404);
    grant('school-user','school','aaaa',now-1);
    assert.equal((await call('/api/students?school=aaaa',schoolToken)).status,404);
    sqlite.prepare('UPDATE rate_limits SET count=60 WHERE key LIKE ?').run(keyed('guardian',secret)+':%');
    assert.equal((await call('/api/students',individual)).status,429);
    assert.ok(sqlite.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='download'").get().n===1);
  } finally {globalThis.fetch=original;sqlite.close();}
});
