// Read-only Google calls. No source writes and no database writes.
import { sources } from './sources.mjs';
import { normalize, quote } from './normalize.mjs';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyPrivatePdf } from '../src/drive-policy.js';
const approved=process.argv.includes('--approved-read');
const indexOnly=process.argv.includes('--index-only');
if(indexOnly && !approved) throw new Error('--index-only exige --approved-read e autorização institucional');
const token=process.env.GOOGLE_ACCESS_TOKEN;
if (!token) throw new Error('Defina GOOGLE_ACCESS_TOKEN com scopes sheets.readonly e drive.metadata.readonly');
async function get(url) {
  for(let attempt=0;attempt<5;attempt++) {
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    if(r.ok) return r.json();
    if((r.status===429 || r.status>=500) && attempt<4) {await new Promise(r=>setTimeout(r,1000*2**attempt)); continue;}
    throw new Error(`Google HTTP ${r.status}; nenhum dado será gravado`);
  }
}
const report={at:new Date().toISOString(),mode:approved?(indexOnly?'staging-index-only':'staging'):'preflight',sources:[],rejected:0};
const schools=new Map(),students=new Map(),documents=new Map(),checkedFiles=new Set();
for(const source of sources) {
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${source.id}`;
  const meta=await get(base+'?fields=sheets.properties');
  const tab=meta.sheets.find(s=>s.properties.title==='Export')?.properties;
  if(!tab || tab.gridProperties.columnCount!==source.width) throw new Error('Estrutura alterada; revisar mapeamento');
  const last=String.fromCharCode(64+source.width);
  const head=await get(base+`/values/${encodeURIComponent(`Export!A${source.header}:${last}${source.header}`)}`);
  const h=head.values?.[0];
  if(!h || h[1]!=='ESTABELECIMENTO' || h[2]!=='ALUNO' || h[3]!=='CGM' || h[4]!=='SERIAÇÃO' || [0,1,2].some(i=>h[source.links+i]!== (source.kind==='report'?'ScoreReport':'Certificado'))) throw new Error('Cabeçalho alterado; revisar mapeamento');
  const levels=await get(base+`/values/${encodeURIComponent(`Export!${String.fromCharCode(65+source.links)}${source.header-1}:${last}${source.header-1}`)}`);
  if([0,1,2].some(i=>levels.values?.[0]?.[i]!==`Nível ${i+1}`)) throw new Error('Níveis alterados; revisar mapeamento');
  const sourceAcl=await get(`https://www.googleapis.com/drive/v3/files/${source.id}/permissions?supportsAllDrives=true&fields=permissions(type,role),nextPageToken&pageSize=100`);
  const anonymousRead=sourceAcl.permissions?.some(p=>p.type==='anyone')??null;
  report.sources.push({id:source.id,gridRows:tab.gridProperties.rowCount,header:source.header,columns:source.width,anonymousRead});
  if(!approved) continue;
  if(anonymousRead!==false || sourceAcl.nextPageToken) throw new Error('A planilha possui acesso anônimo ou ACL não validada; solicitar revisão na origem antes de importar dados reais');
  // Administrative approval record; signature/authority must be verified institutionally.
  const approval=JSON.parse(await readFile(process.env.IMPORT_APPROVAL_FILE||'private/approval.json','utf8'));
  if (!approval.authorizedBy || !approval.purpose || !approval.sources?.includes(source.id) || !(Date.parse(approval.expires)>Date.now())) throw new Error('Autorização de leitura ausente ou vencida');
  for(let start=source.start;start<=tab.gridProperties.rowCount;start+=500) {
    const end=Math.min(start+499,tab.gridProperties.rowCount);
    const range=`Export!A${start}:${last}${end}`;
    const data=await get(base+`?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue)`);
    const rows=data.sheets?.[0]?.data?.[0]?.rowData||[];
    for(let offset=0;offset<rows.length;offset++) {
      let record;
      try { record=normalize(rows[offset].values||[],source,start+offset,process.env.IMPORT_HMAC_SECRET); }
      catch { report.rejected++; continue; }
      if(!record) continue;
      schools.set(record.school.id,record.school);
      const prior=students.get(record.student.id);
      if(prior && JSON.stringify(prior)!==JSON.stringify(record.student)) throw new Error('Conflito de matrícula/nome entre fontes; reconciliar antes da importação');
      students.set(record.student.id,record.student);
      for(const doc of record.documents) {
        const previous=documents.get(doc.id);
        if(previous && previous.fileId!==doc.fileId) throw new Error('Documento duplicado conflitante');
        if(!indexOnly && !checkedFiles.has(doc.fileId)) {
          await verifyPrivatePdf(doc.fileId,get);
          checkedFiles.add(doc.fileId);
        }
        documents.set(doc.id,doc);
      }
    }
  }
}
if(report.rejected) throw new Error(`${report.rejected} linhas rejeitadas; nenhum SQL emitido. Revisar a origem sem registrar dados pessoais.`);
await mkdir('private',{recursive:true});
if(approved) {
  const sql=[
    ...[...schools.values()].map(s=>`INSERT INTO schools(id,nre,name) VALUES(${[s.id,s.nre,s.name].map(quote)});`),
    ...[...students.values()].map(s=>`INSERT INTO students(id,school_id,name,grade) VALUES(${[s.id,s.schoolId,s.name,s.grade].map(quote)});`),
    ...[...documents.values()].map(d=>`INSERT INTO documents(id,student_id,kind,level,file_id,source_id,source_row) VALUES(${[d.id,d.studentId,d.kind].map(quote)},${d.level},${[d.fileId,d.source].map(quote)},${d.row});`)
  ].join('\n');
  await writeFile(path.join('private','staging.sql'),sql,{mode:0o600});
}
Object.assign(report,{schools:schools.size,students:students.size,documents:documents.size});
await writeFile('private/report.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({mode:report.mode,sources:report.sources.length,schools:schools.size,students:students.size,documents:documents.size}));
