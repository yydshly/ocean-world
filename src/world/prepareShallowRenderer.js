import {Vector4} from 'three';

// compileAsync prepares programs, but does not upload off-camera buffers or
// textures. Draw all existing batches behind the loading state once, then
// restore exact visibility. No geometry, placement or tour time is changed.
export async function prepareShallowRenderer(renderer,scene,camera,isDisposed=()=>false){
  const saved=[],ranges=new Map();
  scene.traverse(object=>{if(object.isMesh){
    saved.push([object,object.visible,object.frustumCulled]);
    object.visible=true;object.frustumCulled=false;
  }});
  const started=performance.now();
  const viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4());
  const scissorTest=renderer.getScissorTest();
  try{
    // Start parallel shader compilation before texture allocation. Previously
    // the loading path waited for compilation and only then began every image
    // upload in the warm-up draw. The final draw still prepares custom uniform
    // textures and all buffers, so readiness keeps its original meaning.
    const compilation=renderer.compileAsync(scene,camera);
    let textureUploadMs=0,textureCount=0;
    try{
      const textures=new Set();
      for(const [object]of saved)for(const material of Array.isArray(object.material)?object.material:[object.material]){
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      }
      const textureStarted=performance.now();
      if(renderer.initTexture)for(const texture of textures){if(isDisposed())break;renderer.initTexture(texture);textureCount++;}
      textureUploadMs=performance.now()-textureStarted;
    }catch(error){await compilation;throw error;}
    await compilation;
    if(isDisposed())return null;
    const compileMs=performance.now()-started,uploadStarted=performance.now();
    // Use the real canvas and its original shadow/program variants, but avoid
    // rasterizing every hidden batch across the entire loading canvas. All
    // buffers/textures and shadow casters still upload before the tour starts.
    renderer.setViewport(0,0,1,1);renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
    // WebGLObjects uploads full attributes/instances before renderBufferDirect;
    // that method prepares programs, uniforms/textures and bindings even for
    // a zero draw count. Warm every colour/shadow batch without executing the
    // millions of hidden vertices. Restore original ranges before the real draw.
    for(const [object]of saved)if(!ranges.has(object.geometry)){
      const geometry=object.geometry;ranges.set(geometry,{...geometry.drawRange});geometry.setDrawRange(0,0);
    }
    renderer.render(scene,camera);
    return {compileMs,textureUploadMs,textureCount,preparationMs:performance.now()-started,
      uploadMs:performance.now()-uploadStarted,batches:saved.length,uploadViewport:1,uploadTriangles:0};
  }finally{
    for(const [geometry,range]of ranges)geometry.setDrawRange(range.start,range.count);
    for(const [object,visible,frustumCulled]of saved){object.visible=visible;object.frustumCulled=frustumCulled;}
    renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
  }
}
