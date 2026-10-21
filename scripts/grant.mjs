import { keyed,quote } from './normalize.mjs';
// Admin-only offline provisioning; never expose this as a public endpoint.
const [scope,target,expiry]=process.argv.slice(2);
if(!['school','student'].includes(scope) || !/^[a-f0-9-]{1,100}$/.test(target||'') || !(Date.parse(expiry)>Date.now()) || !process.env.ACCESS_SUB) throw new Error('Uso: npm run grant -- school|student ID DATA_ISO; definir ACCESS_SUB e HMAC_SECRET');
const actor=keyed(process.env.ACCESS_SUB,process.env.HMAC_SECRET);
console.log(`INSERT INTO grants(subject,scope,target_id,expires) VALUES(${[actor,scope,target].map(quote)},${Math.floor(Date.parse(expiry)/1000)}) ON CONFLICT(subject,scope,target_id) DO UPDATE SET expires=excluded.expires;`);
