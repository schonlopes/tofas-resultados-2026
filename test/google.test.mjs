import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {googleIdentity} from '../src/security.js';
import worker from '../src/worker.js';
test('Google institutional identity validates signature, audience, issuer, expiry and hosted domain',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='google-test';
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
 const now=Math.floor(Date.now()/1000),env={AUTH_PROVIDER:'google',GOOGLE_CLIENT_ID:'client-test',RELEASE_APPROVED:'true',HMAC_SECRET:'synthetic-google-test-secret-12345678901234'};
 const token=async extra=>new SignJWT({sub:'123',aud:'client-test',iss:'https://accounts.google.com',iat:now,exp:now+300,hd:'escola.pr.gov.br',email_verified:true,...extra}).setProtectedHeader({alg:'RS256',kid:'google-test'}).sign(privateKey);
 const request=t=>new Request('https://portal.example/api/me',{headers:{Authorization:'Bearer '+t}});
 try{
 assert.equal(await googleIdentity(request(await token({})),env),'google:123');
 for(const bad of [{aud:'other'},{iss:'https://evil.test'},{exp:now-1},{hd:'gmail.com'},{hd:undefined,email:'person@escola.pr.gov.br'},{email_verified:false},{hd:'escola.pr.gov.br.evil.test'}])assert.equal(await googleIdentity(request(await token(bad)),env),null);
 const forged=(await token({})).split('.');forged[2]='forged';assert.equal(await googleIdentity(request(forged.join('.')),env),null);
 assert.equal(await googleIdentity(request(await token({})),{...env,GOOGLE_CLIENT_ID:''}),null);
 let sqls=[];env.DB={prepare(sql){sqls.push(sql);const q={bind(){return q;},async first(){return {count:1};},async all(){return {results:sql.includes('FROM schools')?[{id:'a',name:'Synthetic',nre:'Example'}]:[]};}};return q;}};
 const response=await worker.fetch(request(await token({})),env);assert.equal(response.status,200);assert.equal((await response.json()).schools.length,1);
 assert.equal((await worker.fetch(new Request('https://portal.example/api/me',{headers:{Cookie:'__Host-tofas=legacy'}}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://portal.example/api/auth/login',{method:'POST'}),env)).status,405);
 }finally{globalThis.fetch=original;}
});
