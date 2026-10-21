import {protectedPortal} from './config.js';
const status=document.querySelector('#access-status');
if(protectedPortal){
  status.textContent='Você será atendido no ambiente protegido do portal. Entre com a conta vinculada pela instituição.';
  const link=document.querySelector('#access-link');link.href=protectedPortal+'/restricted/';link.hidden=false;
} else {
  status.textContent='O acesso aos documentos ainda está em preparação. Procure a secretaria da escola para orientações. Nenhum resultado individual está disponível nesta página pública.';
}
