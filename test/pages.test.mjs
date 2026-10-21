import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildPages,protectedOrigin} from '../scripts/build-pages.mjs';
test('Pages rejects unsafe endpoints and accepts HTTPS origins',()=>{
  assert.equal(protectedOrigin(''),'');
  assert.equal(protectedOrigin('https://portal.example.org/'),'https://portal.example.org');
  for(const value of ['http://portal.example.org','https://user:pass@example.org','https://example.org/path','https://example.org/?token=secret','javascript:alert(1)'])assert.throws(()=>protectedOrigin(value));
});
test('Pages package works under repository paths and contains only allowlisted public assets',async()=>{
  const out=await mkdtemp(path.join(tmpdir(),'tofas-pages-'));
  try{
    await buildPages(out);
    const files=await readdir(out,{recursive:true});
    assert.ok(!files.some(f=>/private|restricted|seed|\.sql$|worker|sources/.test(f) && !f.endsWith('seed-educacao.png')));
    const html=await readFile(path.join(out,'index.html'),'utf8');
    assert.ok(html.includes('href="./acesso.html"'));
    assert.ok(!/(src|href)="\/(?!\/)/.test(html));
    assert.ok(!html.includes('docs.google.com/spreadsheets'));
    const js=await readFile(path.join(out,'app.js'),'utf8');
    assert.ok(!js.includes('fetch('));
    assert.ok(!js.includes('Demonstração'));
    const css=await readFile(path.join(out,'style.css'),'utf8');
    assert.ok(!css.includes("url('/"));
    assert.equal(await readFile(path.join(out,'config.js'),'utf8'),'export const protectedPortal = "";\n');
    await buildPages(out,'https://protected.example.org');
    assert.ok((await readFile(path.join(out,'config.js'),'utf8')).includes('https://protected.example.org'));
    await writeFile(path.join(out,'private.json'),'synthetic leak sentinel');
    await assert.rejects(()=>buildPages(out),/Arquivo inesperado/);
  }finally{
    if(!path.resolve(out).startsWith(path.resolve(tmpdir())+path.sep))throw new Error('Unexpected cleanup path');
    await rm(out,{recursive:true,force:true});
  }
});
