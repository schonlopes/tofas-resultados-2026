import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from '../src/worker.js';
import {passwordHash} from '../src/accounts.js';
test('ambassador login, all schools, CSRF, logout, revocation, expiry, rate limit and release gate',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const f of ['migrations/0001.sql','migrations/0002_ambassadors.sql','fixtures/seed.sql'])db.exec(await readFile(new URL('../'+f,import.meta.url),'utf8'));
 const DB={prepare(sql){let a=[];const q={bind(...v){a=v;return q;},async first(){return db.prepare(sql).get(...a)||null;},async all(){return {results:db.prepare(sql).all(...a)};},async run(){return db.prepare(sql).run(...a);}};return q;}};
 const env={DB,AUTH_PROVIDER:'ambassador',RELEASE_APPROVED:'true',HMAC_SECRET:'synthetic-test-secret-12345678901234567890'},password='synthetic-password-123456789';
 db.prepare('INSERT INTO ambassadors VALUES(?,?,?,?,1)').run('a','demo',await passwordHash(password,'salt'),'salt');
 const call=(path,cookie='',body,origin='https://portal.example')=>worker.fetch(new Request('https://portal.example'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 const credentials={username:'demo',password};
 try{
 assert.equal((await call('/api/me')).status,401);
 assert.equal((await call('/api/auth/login','',credentials,'https://evil.example')).status,403);
 assert.equal((await call('/api/auth/login','',{...credentials,password:'incorrect-password-long'})).status,401);
 const r=await call('/api/auth/login','',credentials);assert.equal(r.status,200);
 const c=r.headers.get('set-cookie');for(const flag of ['Secure','HttpOnly','SameSite=Strict'])assert.ok(c.includes(flag));const cookie=c.split(';')[0];
 assert.equal((await (await call('/api/me',cookie)).json()).schools.length,3);
 for(const school of ['aaaa','bbbb'])assert.equal((await call('/api/students?school='+school,cookie)).status,200);
 assert.equal((await call('/api/students/2222/documents',cookie)).status,200);
 assert.equal((await call('/api/documents/dddd',cookie)).status,404);
 env.DOCUMENT_DELIVERY='drive';
 db.exec("UPDATE documents SET approved=1,file_id='SYNTHETIC_FILE_ID_123' WHERE id='dddd'");
 const redirect=await call('/api/documents/dddd',cookie);
 assert.equal(redirect.status,302);
 assert.equal(redirect.headers.get('location'),'https://drive.google.com/file/d/SYNTHETIC_FILE_ID_123/view');
 assert.equal(redirect.headers.get('cache-control'),'no-store');
 assert.equal((await call('/api/documents/dddd')).status,401);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='open_drive'").get().n,1);
 db.exec("UPDATE documents SET file_id='https://evil.example' WHERE id='dddd'");
 assert.equal((await call('/api/documents/dddd',cookie)).status,404);
 db.exec("UPDATE documents SET approved=0 WHERE id='dddd'");
 env.RELEASE_APPROVED='false';assert.equal((await call('/api/me',cookie)).status,503);env.RELEASE_APPROVED='true';
 db.exec('UPDATE ambassadors SET enabled=0');assert.equal((await call('/api/me',cookie)).status,401);db.exec('UPDATE ambassadors SET enabled=1');
 await call('/api/auth/logout',cookie,{});assert.equal((await call('/api/me',cookie)).status,401);
 const second=await call('/api/auth/login','',credentials);const c2=second.headers.get('set-cookie').split(';')[0];db.exec('UPDATE sessions SET expires=1');assert.equal((await call('/api/me',c2)).status,401);
 db.exec('UPDATE rate_limits SET count=100');assert.equal((await call('/api/auth/login','',credentials)).status,429);
 }finally{db.close();}
});

