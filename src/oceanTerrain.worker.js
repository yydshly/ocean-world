import { createOceanTerrainJobs, oceanTerrainTransferList } from './oceanTerrainJobs.js';
const run=createOceanTerrainJobs();
self.onmessage=({data:{id,kind,payload}})=>{
  try {
    if(kind!=='terrain')throw new TypeError('Unknown terrain preparation job.');
    const value=run(payload); self.postMessage({id,value},oceanTerrainTransferList(value));
  } catch(error) { self.postMessage({id,error:{name:error.name,message:error.message}}); }
};
