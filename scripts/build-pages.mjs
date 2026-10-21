import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export function protectedOrigin(raw='') {
  if(!raw.trim())return '';
  const url=new URL(raw);
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/' ||
    url.hostname==='localhost' || !url.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
    throw new Error('PROTECTED_PORTAL_URL deve ser uma origem HTTPS, sem caminho, credenciais ou parâmetros.');
  }
  return url.origin;
}
export async function buildPages(destination, raw='') {
  const origin=protectedOrigin(raw);
  const out=path.resolve(destination);
  await mkdir(path.join(out,'assets/logos'),{recursive:true});
  // Explicit allowlist: never publish imports, private/, backend, SQL, or secrets.
  for(const name of ['index.html','privacy.html']) {
    let html=await readFile(path.join(root,'public',name),'utf8');
    html=html.replaceAll('href="/restricted/"','href="./acesso.html"')
      .replaceAll('href="/"','href="./index.html"')
      .replaceAll('href="/privacy.html"','href="./privacy.html"')
      .replaceAll('href="/style.css"','href="./style.css"')
      .replaceAll('src="/app.js"','src="./app.js"')
      .replaceAll('src="/assets/','src="./assets/');
    html=html.replace('Ambiente de validação · os exemplos são fictícios','Portal de resultados · consulta protegida em preparação')
      .replace('<form id="finder">','<form id="finder" hidden>')
      .replace('<p id="status" role="status" aria-live="polite"></p>','<p id="status" role="status" aria-live="polite">A consulta de documentos está em preparação. A escola informará quando o acesso estiver disponível.</p>');
    // A meta CSP is the protection available to a static Pages deployment.
    html=html.replace('<head>','<head><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">');
    await writeFile(path.join(out,name),html);
  }
  const css=(await readFile(path.join(root,'public/style.css'),'utf8')).replaceAll("url('/fonts.css')","url('./fonts.css')");
  await writeFile(path.join(out,'style.css'),css);
  for(const name of ['fonts.css'])await copyFile(path.join(root,'public',name),path.join(out,name));
  for(const name of ['nre-guarapuava.png','programacao-parana.png','seed-educacao.png','tofas.webp']) {
    await copyFile(path.join(root,'public/assets/logos',name),path.join(out,'assets/logos',name));
  }
  for(const name of ['demo.html','demo.js'])await copyFile(path.join(root,'pages',name),path.join(out,name));
  await copyFile(path.join(root,'pages/app.js'),path.join(out,'app.js'));
  await copyFile(path.join(root,'pages/acesso.html'),path.join(out,'acesso.html'));
  await copyFile(path.join(root,'pages/access.js'),path.join(out,'access.js'));
  await writeFile(path.join(out,'config.js'),`export const protectedPortal = ${JSON.stringify(origin)};\n`);
  await writeFile(path.join(out,'.nojekyll'),'');
  const allowed=new Set(['demo.html','demo.js','index.html','privacy.html','style.css','fonts.css','app.js','acesso.html','access.js','config.js','.nojekyll','assets','assets/logos',...['nre-guarapuava.png','programacao-parana.png','seed-educacao.png','tofas.webp'].map(n=>'assets/logos/'+n)]);
  async function inspect(dir,prefix=''){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const relative=prefix+entry.name;
      if(entry.isSymbolicLink() || !allowed.has(relative))throw new Error('Arquivo inesperado no pacote público. Build interrompido.');
      if(entry.isDirectory())await inspect(path.join(dir,entry.name),relative+'/');
    }
  }
  await inspect(out);
  return out;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await buildPages(path.join(root,'dist-pages'),process.env.PROTECTED_PORTAL_URL||'');
  console.log('GitHub Pages preparado em dist-pages; nenhum dado de estudante incluído.');
}
