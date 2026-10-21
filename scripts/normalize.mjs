import { createHmac } from 'node:crypto';
export const text = cell => String(cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? '').trim();
export function fileId(cell) {
  const formula=cell?.userEnteredValue?.formulaValue;
  const candidate=cell?.hyperlink || (formula?.match(/^=HYPERLINK\(\s*"([^"]+)"/i)?.[1]) || text(cell);
  if (!candidate || /^(NÃO CERTIFICOU|NAO CERTIFICOU|NÃO PARTICIPOU|-)$/i.test(candidate)) return null;
  let url;
  try { url=new URL(candidate); } catch { throw new Error('Conteúdo de documento não reconhecido'); }
  if (url.protocol!=='https:' || url.hostname!=='drive.google.com' || url.username || url.password || url.port) throw new Error('Host de documento não autorizado');
  const id=url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)$/)?.[1] ||
    (url.pathname==='/open' ? url.searchParams.get('id') : null);
  if (!id || !/^[A-Za-z0-9_-]{10,150}$/.test(id)) throw new Error('Link Drive inválido');
  return id;
}
export function keyed(value,secret) {
  if (!secret || secret.length<32) throw new Error('IMPORT_HMAC_SECRET precisa ter pelo menos 32 caracteres');
  return createHmac('sha256',secret).update(value).digest('hex');
}
export function normalize(cells,source,row,secret) {
  if (cells.every(c=>!text(c) && !c?.hyperlink && !c?.userEnteredValue?.formulaValue)) return null;
  const [nre,school,name,cgm,grade]=cells.map(text);
  if (!nre || !school || !name || !/^\d{1,20}$/.test(cgm) || grade.toLocaleLowerCase('pt-BR')!==source.grade.toLocaleLowerCase('pt-BR')) throw new Error(`Linha ${row}: identidade ou série inválida`);
  const schoolId=keyed(`school:${nre}:${school}`,secret);
  const studentId=keyed(`student:2026:${grade}:${cgm}`,secret);
  const documents=[];
  for(let i=0;i<3;i++) {
    const fid=fileId(cells[source.links+i]);
    if(fid) documents.push({id:keyed(`doc:${studentId}:${source.kind}:${i+1}`,secret),studentId,kind:source.kind,level:i+1,fileId:fid,source:source.id,row});
  }
  return {school:{id:schoolId,nre,name:school},student:{id:studentId,schoolId,name,grade},documents};
}
export const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
