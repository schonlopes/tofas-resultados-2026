import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPrivatePdf} from '../src/drive-policy.js';
const metadata={mimeType:'application/pdf',trashed:false,capabilities:{canDownload:true}};
test('on-demand validation inspects metadata and all permission pages without downloading bytes',async()=>{
  const calls=[];
  await verifyPrivatePdf('synthetic-id',async url=>{
    calls.push(url);
    if(!url.includes('/permissions?'))return metadata;
    return url.includes('pageToken=')?{permissions:[{type:'group',role:'reader'}]}:{permissions:[{type:'user',role:'reader'}],nextPageToken:'page-two'};
  });
  assert.equal(calls.length,3);assert.ok(calls.every(u=>!u.includes('alt=media')));
});
test('public link on later permission page is refused',async()=>{
  await assert.rejects(()=>verifyPrivatePdf('synthetic-id',async url=>{
    if(!url.includes('/permissions?'))return metadata;
    return url.includes('pageToken=')?{permissions:[{type:'anyone',role:'reader'}]}:{permissions:[{type:'user',role:'reader'}],nextPageToken:'page-two'};
  }));
});
test('missing ACL, no download right, trash and non-PDF fail closed',async()=>{
  for(const value of [{...metadata,capabilities:{canDownload:false}},{...metadata,trashed:true},{...metadata,mimeType:'text/html'}]) {
    await assert.rejects(()=>verifyPrivatePdf('synthetic-id',async()=>value));
  }
  await assert.rejects(()=>verifyPrivatePdf('synthetic-id',async url=>url.includes('/permissions?')?{}:metadata));
});
