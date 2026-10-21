const status=document.querySelector('#status'), results=document.querySelector('#results'),select=document.querySelector('#authorized'),more=document.querySelector('#more');
let next=null,busy=false;
const login=document.querySelector('#login'),logout=document.querySelector('#logout');
let credential='', expiryTimer;
function clearLogin(){credential='';clearTimeout(expiryTimer);results.replaceChildren();select.replaceChildren();select.hidden=true;more.hidden=true;logout.hidden=true;login.hidden=false;}
async function api(path) {
  const r=await fetch(path,{headers:{Accept:'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})}});
  const data=await r.json();if(!r.ok){if(r.status===401)clearLogin();throw new Error(data.error||'Consulta indisponível.');}return data;
}
async function load(append=false) {
  if(busy)return;busy=true;more.disabled=true;select.disabled=true;status.textContent='Carregando…';
  if(!append)results.replaceChildren();
  try {
    const data=await api(`/api/students?school=${encodeURIComponent(select.value)}&after=${encodeURIComponent(append?next||'':'')}`);
    for(const s of data.items) {
      const item=document.createElement('article');item.className='result';
      const title=document.createElement('h3');title.textContent=s.name;
      const grade=document.createElement('span');grade.textContent=s.grade;
      const button=document.createElement('button');button.className='button';button.textContent='Ver documentos';
      const downloads=document.createElement('div');downloads.className='downloads';
      button.addEventListener('click',async()=>{
        button.disabled=true;downloads.replaceChildren();
        try {const docs=await api(`/api/students/${s.id}/documents`);
          if(!docs.length) downloads.textContent='Não há documentos liberados para este vínculo. Isso não indica o resultado da avaliação.';
          for(const d of docs) {const a=document.createElement('a');a.href=`/api/documents/${d.id}`;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',async event=>{event.preventDefault();const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{const result=await api(a.getAttribute('href'));const u=new URL(result.url);if(u.origin!=='https://drive.google.com'||!/^\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(u.pathname))throw new Error('Destino inválido.');if(tab)tab.location.replace(u.href);else status.textContent='Permita novas abas e tente novamente.';}catch(e){tab?.close();status.textContent=e.message;}});a.textContent=`${d.kind==='certificate'?'Certificado':'Relatório'} · Nível ${d.level} · Abrir no Drive ↗`;downloads.append(a);}
        } catch(e){downloads.textContent=e.message;}finally{button.disabled=false;}
      });
      item.append(title,grade,button,downloads);results.append(item);
    }
    next=data.next;more.hidden=!next;status.textContent=results.children.length?'Documentos disponíveis somente para os vínculos autorizados.':'Nenhum vínculo disponível. Solicite a conferência à secretaria.';
  } catch(e){status.textContent=e.message;more.hidden=true;}finally{busy=false;more.disabled=false;select.disabled=false;}
}
async function start(){try {
  select.replaceChildren();results.replaceChildren();
  const auth=await api('/api/auth/status');
  login.hidden=auth.authenticated;logout.hidden=!auth.authenticated;
  if(!auth.authenticated){status.textContent='Entre com sua conta @escola.pr.gov.br.';return;}
  const me=await api('/api/me');
  if(me.individual)select.add(new Option('Meu vínculo individual',''));
  for(const s of me.schools)select.add(new Option(`${s.nre} · ${s.name}`,s.id));
  const requested=new URLSearchParams(location.search).get('school');
  if(me.schools.some(s=>s.id===requested)) select.value=requested;
  if(select.options.length){select.hidden=false;await load();}
  else status.textContent='Sua conta ainda não tem vínculo autorizado. Procure a secretaria da escola.';
} catch(e){status.textContent=e.message;}}
logout.addEventListener('click',()=>{clearLogin();window.google?.accounts.id.disableAutoSelect();status.textContent='Você saiu do portal. Sua conta Google permanece conectada ao navegador.';});
try {
  const config=await api('/api/config');
  if(config.authProvider!=='google'||!config.googleClientId){status.textContent='Login institucional em configuração. A coordenação precisa cadastrar o aplicativo Google.';}
  else {
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onerror=()=>{status.textContent='Não foi possível carregar o login Google. Tente novamente.';};
    script.onload=()=>{
      window.google.accounts.id.initialize({client_id:config.googleClientId,nonce,hd:'escola.pr.gov.br',auto_select:false,callback:async response=>{
        clearLogin();credential=response.credential;
        try{
          // Decode only for local clearing; authorization always uses server JWT verification.
          const encoded=credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
          const payload=JSON.parse(atob(encoded));if(payload.nonce!==nonce)throw new Error('Resposta de login inválida.');const {exp}=payload;
          expiryTimer=setTimeout(()=>{clearLogin();status.textContent='Sua sessão expirou. Entre novamente.';},Math.max(0,Math.min(3600000,exp*1000-Date.now())));
          await start();
        }catch{clearLogin();status.textContent='Não foi possível entrar com esta conta.';}
      }});
      window.google.accounts.id.renderButton(document.querySelector('#google-button'),{theme:'outline',size:'large',text:'signin_with'});
      status.textContent='Use sua conta institucional @escola.pr.gov.br.';
    };
    document.head.append(script);
  }
}catch(e){status.textContent=e.message;}
select.addEventListener('change',()=>load());more.addEventListener('click',()=>load(true));
