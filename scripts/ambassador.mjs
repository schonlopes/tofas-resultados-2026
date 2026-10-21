// Run locally by the coordinator. Never deploy this administration script as an API.
import {randomBytes,randomUUID,webcrypto} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {passwordHash} from '../src/accounts.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const [action,username]=process.argv.slice(2);
if(!['create','reset','disable'].includes(action)||!/^[a-z0-9._-]{3,80}$/.test(username||''))throw new Error('Uso: node scripts/ambassador.mjs create|reset|disable login');
await mkdir('private',{recursive:true});
let sql;
if(action==='disable')sql=`UPDATE ambassadors SET enabled=0 WHERE username='${username}';\nDELETE FROM sessions WHERE ambassador_id IN (SELECT id FROM ambassadors WHERE username='${username}');`;
else {
  const password=randomBytes(24).toString('base64url'),salt=randomBytes(24).toString('hex');
  const hash=await passwordHash(password,salt);
  sql=action==='create'?`INSERT INTO ambassadors(id,username,password_hash,salt) VALUES('${randomUUID()}','${username}','${hash}','${salt}');`:
    `UPDATE ambassadors SET password_hash='${hash}',salt='${salt}' WHERE username='${username}';\nDELETE FROM sessions WHERE ambassador_id IN (SELECT id FROM ambassadors WHERE username='${username}');`;
  // Password shown once to the operator; it never enters SQL or a source file.
  console.log(`Senha gerada para entrega privada: ${password}`);
}
await writeFile('private/account.sql',sql,{mode:0o600});
console.log('Aplicar private/account.sql no D1. Não compartilhar o arquivo SQL. Reset não reativa contas bloqueadas.');
