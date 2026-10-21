const nre=document.querySelector('#nre'),school=document.querySelector('#school'),status=document.querySelector('#status');
const option=(label,value)=>{const e=document.createElement('option');e.textContent=label;e.value=value;return e;};
let schools=[];
try {
  const [configResponse,catalogResponse]=await Promise.all([fetch('/api/config'),fetch('/api/catalog')]);
  if(!configResponse.ok || !catalogResponse.ok) throw new Error();
  const config=await configResponse.json(); schools=await catalogResponse.json();
  document.querySelector('#notice').lastChild.textContent=config.synthetic?' Ambiente de validação · os exemplos são fictícios':config.released?' Consulta protegida · acesso individual autorizado':' Em validação institucional · resultados ainda não liberados';
  nre.replaceChildren(option('Selecione o NRE',''),...[...new Set(schools.map(s=>s.nre))].sort().map(s=>option(s,s)));
  if(!schools.length) {nre.disabled=true;status.textContent='O catálogo está em validação. Aguarde a liberação institucional.';}
} catch {nre.replaceChildren(option('Consulta temporariamente indisponível',''));nre.disabled=true;status.textContent='Não foi possível carregar as escolas. Tente novamente mais tarde.';}
nre.addEventListener('change',()=>{
  school.replaceChildren(option('Selecione a escola',''),...schools.filter(s=>s.nre===nre.value).map(s=>option(s.name,s.id)));
  school.disabled=!nre.value;status.textContent='';
});
document.querySelector('#finder').addEventListener('submit',e=>{
  e.preventDefault();
  if(!school.value) return;
  // School selection is context, never authorization. No student data is fetched here.
  status.replaceChildren(document.createTextNode('Escola selecionada. Para consultar documentos, '));
  const a=document.createElement('a');a.href=`/restricted/?school=${encodeURIComponent(school.value)}`;a.textContent='entre com sua conta autorizada';status.append(a,document.createTextNode('. O vínculo será conferido após a identificação.'));
});
