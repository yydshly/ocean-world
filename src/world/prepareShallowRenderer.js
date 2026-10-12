import {Vector4} from 'three';

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
  const viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4());
  const scissorTest=renderer.getScissorTest();
  try{
    await renderer.compileAsync(scene,camera);
    if(isDisposed())return null;
    const compileMs=performance.now()-started,uploadStarted=performance.now();
    // Use the real canvas and its original shadow/program variants, but avoid
    // rasterizing every hidden batch across the entire loading canvas. All
    // buffers/textures and shadow casters still upload before the tour starts.
    renderer.setViewport(0,0,1,1);renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
    renderer.render(scene,camera);
    return {compileMs,uploadMs:performance.now()-uploadStarted,batches:saved.length,uploadViewport:1};
  }finally{
    for(const [object,visible,frustumCulled]of saved){object.visible=visible;object.frustumCulled=frustumCulled;}
    renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
  }
}
