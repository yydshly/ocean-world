import * as THREE from 'three';

// The museum scan contains its artificial rectangular mount below 0.060 m
// in normalized coordinates. Keep the original file intact and record this
// authored display excision, which also leaves a cut basal stem surface.
export const REEF_SCAN_MOUNT_CUT_Y_M = .060;

export function prepareReefSkeletonDisplay(group) {
  const rows=[];
  group.traverse(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry,position=geometry.getAttribute('position'),index=geometry.getIndex();
    if(geometry.boundsTree||geometry.userData.scanDisplayCut)throw new Error('扫描底座排除必须在建树前且只执行一次');
    if(!position||!index||geometry.groups.length>0)throw new Error('扫描底座排除需要单一索引网格');
    const attributes=Object.entries(geometry.attributes),values=Object.fromEntries(attributes.map(([name])=>[name,[]]));
    const vertices=new Map(),edges=new Map(),indices=[];
    let removedTriangles=0,clippedTriangles=0,keptTriangles=0;
    const append=(a,b=null,t=0)=>{
      const outputIndex=values.position.length/3;
      for(const [name,attribute]of attributes){
        const out=values[name];
        for(let c=0;c<attribute.itemSize;c++){
          let value=attribute.getComponent(a,c);
          if(b!==null)value+=(attribute.getComponent(b,c)-value)*t;
          if(name==='position'&&c===1)value-=REEF_SCAN_MOUNT_CUT_Y_M;
          out.push(value);
        }
        if(name==='normal'&&b!==null){const k=out.length-3,n=Math.hypot(out[k],out[k+1],out[k+2]);if(n){out[k]/=n;out[k+1]/=n;out[k+2]/=n;}}
      }
      return outputIndex;
    };
    const original=a=>{if(!vertices.has(a))vertices.set(a,append(a));return vertices.get(a);};
    const crossing=(a,b)=>{
      const key=a<b?`${a}/${b}`:`${b}/${a}`;
      if(!edges.has(key)){
        const t=(REEF_SCAN_MOUNT_CUT_Y_M-position.getY(a))/(position.getY(b)-position.getY(a));
        edges.set(key,append(a,b,t));
      }
      return edges.get(key);
    };
    for(let k=0;k<index.count;k+=3){
      const triangle=[index.getX(k),index.getX(k+1),index.getX(k+2)],polygon=[];
      const inside=triangle.map(a=>position.getY(a)>=REEF_SCAN_MOUNT_CUT_Y_M);
      if(!inside.some(Boolean)){removedTriangles++;continue;}
      if(inside.every(Boolean))keptTriangles++;else clippedTriangles++;
      for(let j=0;j<3;j++){
        const a=triangle[j],b=triangle[(j+1)%3],keepA=inside[j],keepB=inside[(j+1)%3];
        if(keepA)polygon.push(original(a));
        if(keepA!==keepB)polygon.push(crossing(a,b));
      }
      for(let j=1;j<polygon.length-1;j++)indices.push(polygon[0],polygon[j],polygon[j+1]);
    }
    if(!indices.length)throw new Error('扫描底座排除未保留有效珊瑚面');
    for(const [name,attribute]of attributes)geometry.setAttribute(name,new THREE.Float32BufferAttribute(values[name],attribute.itemSize));
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const row={sourceTriangles:index.count/3,removedTriangles,clippedSourceTriangles:clippedTriangles,unchangedSourceTriangles:keptTriangles,
      displayTriangles:indices.length/3,sourceVertices:position.count,displayVertices:values.position.length/3,
      cutPlaneBeforeRecenteringM:REEF_SCAN_MOUNT_CUT_Y_M,recenterYTranslationM:-REEF_SCAN_MOUNT_CUT_Y_M,
      physicalScaleMultiplier:1,attributesRetained:attributes.map(([name])=>name),
      boundsM:{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray(),size:geometry.boundingBox.getSize(new THREE.Vector3()).toArray()},
      basalCutCapped:false};
    geometry.userData.scanDisplayCut=row;rows.push(row);
  });
  if(rows.length!==1)throw new Error('扫描底座排除只支持馆藏文件中的单一网格');
  return {schema:'reef-skeleton-display-excision-v1',sourceFileModified:false,method:'triangle clipping above authored 0.060 m normalized cut plane',
    rationale:'artificial rectangular museum mount is visible in original scan; excluded from natural substrate display',
    limitation:'cut basal surface retained open; no claim of recovered complete colony, living tissue or measured attachment',meshes:rows};
}
