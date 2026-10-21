import test from 'node:test';
import assert from 'node:assert/strict';
import {fileId,normalize,keyed} from '../scripts/normalize.mjs';
import {sources} from '../scripts/sources.mjs';
import {permitted,identity,secure} from '../src/security.js';
import worker,{handle} from '../src/worker.js';
const secret='synthetic-secret-for-tests-01234567890123456789';
const cell=s=>({formattedValue:s});
test('both grade schemas and three levels map correctly without storing CGM',()=>{
  for(const s of sources) {
    const row=['NRE Fictício','Escola Exemplo','Pessoa Sintética','000123',s.grade];
    if(s.links===6)row.push('A');
    row.push('https://drive.google.com/file/d/synthetic_file_001/view','NÃO CERTIFICOU','');
    const r=normalize(row.map(cell),s,s.start,secret);
    assert.equal(r.documents.length,1);assert.equal(r.documents[0].level,1);
    assert.equal(r.documents[0].kind,s.kind);
    assert.ok(!JSON.stringify(r).includes('000123'));
  }
});
test('formula, rich hyperlink and raw URL are accepted',()=>{
  const url='https://drive.google.com/file/d/synthetic_file_001/view?usp=drivesdk';
  for(const c of [cell(url),{hyperlink:url},{userEnteredValue:{formulaValue:`=HYPERLINK("${url}"; "PDF")`}}]) assert.equal(fileId(c),'synthetic_file_001');
});
test('host spoofing, executable URLs and unknown statuses fail closed',()=>{
  for(const url of ['https://drive.google.com.evil.test/file/d/synthetic_file_001/view','javascript:alert(1)','https://user@drive.google.com/file/d/synthetic_file_001/view','https://drive.google.com:444/file/d/synthetic_file_001/view','ERRO']) assert.throws(()=>fileId(cell(url)));
});
test('empty rows are skipped, invalid identity and grade rejected',()=>{
  assert.equal(normalize([],sources[0],4,secret),null);
  assert.throws(()=>normalize(['N','S','Name','12','wrong'].map(cell),sources[0],4,secret));
});
test('school and student grants do not cross scope, expire and revoke',()=>{
  const student={id:'student-a',school_id:'school-a'};
  const schoolGrant={scope:'school',target_id:'school-a',expires:200};
  assert.equal(permitted([schoolGrant],student,100),true);
  assert.equal(permitted([schoolGrant],{...student,school_id:'school-b'},100),false);
  assert.equal(permitted([schoolGrant],student,200),false);
  assert.equal(permitted([],student,100),false);
  assert.equal(permitted([{scope:'student',target_id:'student-a',expires:200}],student,100),true);
  assert.equal(permitted([{scope:'student',target_id:'student-b',expires:200}],student,100),false);
});
test('no authentication through forged headers or malformed JWT',async()=>{
  assert.equal(await identity(new Request('https://example.test',{headers:{'Cf-Access-Authenticated-User-Email':'principal@example.test'}}),{}),null);
  assert.equal(await identity(new Request('https://example.test',{headers:{'Cf-Access-Jwt-Assertion':'forged'}}),{ACCESS_AUD:'aud',ACCESS_ISSUER:'https://example.cloudflareaccess.com'}),null);
});
test('release gate stops all protected endpoints before database access',async()=>{
  for(const path of ['/api/me','/api/students','/api/students/aaaa/documents','/api/documents/aaaa']) {
    const r=await handle(new Request('https://example.test'+path),{RELEASE_APPROVED:'false'});
    assert.equal(r.status,503);
  }
});
test('released endpoints still require verified identity',async()=>{
  const r=await handle(new Request('https://example.test/api/students'),{RELEASE_APPROVED:'true'});
  assert.equal(r.status,401);
});
test('public catalog selects only approved non-personal fields',async()=>{
  let query;
  const DB={prepare:q=>{query=q;return {all:async()=>({results:[{id:'aaaa',name:'Escola Exemplo',nre:'NRE Fictício'}]})};}};
  const r=await handle(new Request('https://example.test/api/catalog'),{DB});
  assert.match(query,/SELECT id,nre,name FROM schools WHERE public_approved=1/);
  assert.deepEqual(Object.keys((await r.json())[0]),['id','name','nre']);
});
test('security headers and sanitized errors',async()=>{
  const r=secure(new Response('ok'));assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const failed=await worker.fetch(new Request('https://example.test/api/catalog'),{});
  assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('TypeError'));
});
test('stable keyed identifiers depend on a secret',()=>{
  assert.equal(keyed('abc',secret),keyed('abc',secret));assert.notEqual(keyed('abc',secret),keyed('abcd',secret));assert.throws(()=>keyed('a','short'));
});
test('mutations are rejected',async()=>{
  assert.equal((await handle(new Request('https://example.test/api/me',{method:'POST'}),{})).status,405);
});
