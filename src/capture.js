export const localCaptureEnabled=import.meta.env.DEV||import.meta.env.VITE_VALIDATION_CAPTURE==='1';
export async function saveJson(data,name){
  if(localCaptureEnabled)return capture('telemetry',name,data);
  return downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name+'.json');
}
export async function saveVideo(blob,name){
  if(localCaptureEnabled){
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('录像读取失败'));reader.readAsDataURL(blob);});
    return capture('video',name,data);
  }
  return downloadBlob(blob,name+'.webm');
}
async function capture(kind,name,data){
  const response=await fetch('/__reef-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,name,data})});
  if(!response.ok)throw new Error('保存失败，请缩短录像或检查项目写入权限');
  return(await response.json()).file;
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return name;
}
