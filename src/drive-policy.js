// Shared by the importer and the download route. Never modifies permissions.
export async function verifyPrivatePdf(fileId, get) {
  const base=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  const file=await get(base+'?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canDownload)');
  if(file.mimeType!=='application/pdf' || file.trashed || file.capabilities?.canDownload!==true) throw new Error('PDF indisponível');
  let page;
  do {
    const acl=await get(base+'/permissions?supportsAllDrives=true&pageSize=100&fields=permissions(type,role),nextPageToken'+(page?'&pageToken='+encodeURIComponent(page):''));
    if(!Array.isArray(acl.permissions) || acl.permissions.length===0 || acl.permissions.some(p=>p.type==='anyone')) throw new Error('Permissões não validadas');
    page=acl.nextPageToken;
  } while(page);
  // Domain/group membership still requires institutional review before approval.
}
