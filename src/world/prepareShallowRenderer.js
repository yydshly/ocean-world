// compileAsync prepares programs, but does not upload off-camera buffers or
// textures. Draw all existing batches behind the loading state once, then
// restore exact visibility. No geometry, placement or tour time is changed.
export async function prepareShallowRenderer(renderer,scene,camera,isDisposed=()=>false){
  const saved=[];
  scene.traverse(object=>{if(object.isMesh){
    saved.push([object,object.visible,object.frustumCulled]);
    object.visible=true;object.frustumCulled=false;
  }});
  const started=performance.now();
  try{
    await renderer.compileAsync(scene,camera);
    if(isDisposed())return null;
    const compileMs=performance.now()-started,uploadStarted=performance.now();
    renderer.render(scene,camera);
    return {compileMs,uploadMs:performance.now()-uploadStarted,batches:saved.length};
  }finally{
    for(const [object,visible,frustumCulled]of saved){object.visible=visible;object.frustumCulled=frustumCulled;}
  }
}
