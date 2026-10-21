import {protectedPortal} from './config.js';
const notice=document.querySelector('#notice');notice.lastChild.textContent=' Portal de resultados · acesso institucional';
document.querySelector('#finder').hidden=true;
const status=document.querySelector('#status');
status.textContent='Consulte os documentos com sua conta @escola.pr.gov.br ou experimente a demonstração fictícia.';
for(const [href,label] of [[protectedPortal?protectedPortal+'/restricted/':'./acesso.html','Acesso institucional →'],['./demo.html','Testar com dados fictícios →']]){const link=document.createElement('a');link.href=href;link.textContent=label;link.className='button';status.append(link);}
document.querySelector('.section-intro p:last-child').textContent='Na área institucional, selecione sua escola e consulte os documentos liberados.';
