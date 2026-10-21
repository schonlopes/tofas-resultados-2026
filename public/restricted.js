const status=document.querySelector('#status'), results=document.querySelector('#results'),select=document.querySelector('#authorized'),more=document.querySelector('#more');
let next=null,busy=false;
const login=document.querySelector('#login'),logout=document.querySelector('#logout');
async function post(path,data={}) {
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await r.json();if(!r.ok)throw new Error(result.error||'Acesso indisponível.');
}
async function api(path) {const r=await fetch(path);const data=await r.json();if(!r.ok) throw new Error(data.error||'Consulta indisponível.');return data;}
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
          for(const d of docs) {const a=document.createElement('a');a.href=`/api/documents/${d.id}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${d.kind==='certificate'?'Certificado':'Relatório'} · Nível ${d.level} · Abrir no Drive ↗`;downloads.append(a);}
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
  if(!auth.authenticated){status.textContent='Entre com sua conta de embaixador.';return;}
  const me=await api('/api/me');
  if(me.individual)select.add(new Option('Meu vínculo individual',''));
  for(const s of me.schools)select.add(new Option(`${s.nre} · ${s.name}`,s.id));
  const requested=new URLSearchParams(location.search).get('school');
  if(me.schools.some(s=>s.id===requested)) select.value=requested;
  if(select.options.length){select.hidden=false;await load();}
  else status.textContent='Sua conta ainda não tem vínculo autorizado. Procure a secretaria da escola.';
} catch(e){status.textContent=e.message;}}
login.addEventListener('submit',async event=>{
  event.preventDefault();const button=login.querySelector('button');button.disabled=true;
  try{await post('/api/auth/login',{username:login.elements.username.value,password:login.elements.password.value});login.elements.password.value='';await start();}
  catch(e){status.textContent=e.message;}finally{button.disabled=false;}
});
logout.addEventListener('click',async()=>{
  try{await post('/api/auth/logout');location.reload();}catch(e){status.textContent=e.message;}
});
await start();
select.addEventListener('change',()=>load());more.addEventListener('click',()=>load(true));
