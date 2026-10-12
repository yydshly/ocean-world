import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('native mapped baseColor keeps glTF UV orientation, sRGB factors, alpha masks/blending and legacy rows',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-native-base-color-'));
  const script=fileURLToPath(new URL('../scripts/rasterize-shallow-sample.py',import.meta.url));
  const code=String.raw`
import importlib.util,sys
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('native_raster',sys.argv[1]);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
root=Path(sys.argv[2]);file=root/'uv.png';blend_file=root/'blend.png'
Image.fromarray(np.array([[[255,0,0,255],[0,255,0,0]],[[0,0,255,255],[128,128,128,128]]],dtype=np.uint8),'RGBA').save(file)
Image.fromarray(np.array([[[0,0,255,128]]],dtype=np.uint8),'RGBA').save(blend_file)
tex=mod.load_texture(file,True)
assert abs(float(tex[1,1,0])-.2158605)<1e-6
assert abs(float(tex[1,1,3])-128/255)<1e-6, 'alpha was incorrectly sRGB decoded'
sample=lambda u,v,k,flip=False,rs=False,rt=False:mod.sample_uv_map(tex,u,v,k,flip,rs,rt)
assert sample(.25,.25,0)==1 and sample(.25,.25,2,True)==1, 'glTF flipY=false must use original top row'
assert sample(1.25,-.75,0,False,True,True)==1, 'repeat UV addressing changed'
assert sample(-2,.25,0)==1 and sample(2,.25,1)==1, 'clamp UV addressing changed'
for u,v in [(.25,.25),(-.3,1.4),(1.7,-2.2)]:
    for k in range(3):assert abs(mod.sample_map(tex,u,v,k)-sample(u,v,k,True,True,True))<1e-7, 'legacy sand/rock sampler changed'
entries=[{'kind':3,'file':str(file),'flipY':False,'wrapS':'clamp','wrapT':'clamp','alphaTest':.5,'transparent':False,'depthWrite':True},
         {'kind':4,'file':str(blend_file),'flipY':False,'wrapS':'clamp','wrapT':'clamp','alphaTest':0,'transparent':True,'depthWrite':False}]
textures,rules=mod.load_base_color_textures(entries)
camera=np.eye(4,dtype=np.float64).T.reshape(-1);white=np.ones((1,1,3),np.float32)
def row(kind=0,depth=0,uv=(.25,.25),color=(1,1,1),opacity=1):
    r=np.zeros(37,np.float32);r[:9]=[-1,-1,depth,9,-1,depth,-1,9,depth];r[9:12]=color;r[13]=opacity;r[14:17]=1;r[26:32]=uv*3;r[32]=kind;r[33]=1;r[35]=1;return r
def render(rows):return mod.raster(np.array(rows,np.float32),8,8,camera,white,white,textures,rules)
back=row(color=(1,0,0),depth=.4)
legacy14=mod.raster(np.array([back[:14]]),8,8,camera,white,white)
assert np.array_equal(legacy14,render([back])), '14-float compatibility changed'
assert np.array_equal(render([row(1)]),render([row(2)])), 'existing white sand/rock paths diverged'
background=render([back]);masked=render([row(3,depth=-.4,uv=(.75,.25)),back])
assert np.array_equal(masked,background), 'alpha mask obscured or wrote depth before discard'
perspective=row(3,depth=-.4);perspective[14:17]=[1,4,1];perspective[26:32]=[0,0,1,0,0,1]
assert np.array_equal(render([perspective,back])[1,1],background[1,1]), 'mapped alpha did not use perspective-correct UV'
blue=row(3,depth=-.4,uv=(.25,.75));opaque_blue=render([blue])
assert opaque_blue[1,1,2]>opaque_blue[1,1,0]+80
factor_blue=render([row(3,depth=-.4,uv=(.25,.75),color=(.5,.5,.5))])
assert 0<factor_blue[1,1,2]<opaque_blue[1,1,2], 'linear baseColor factor was ignored'
alpha=(128/255)*.5
mixed=render([row(4,depth=-.4,opacity=.5),back])
expected=opaque_blue[1,1].astype(float)*alpha+background[1,1].astype(float)*(1-alpha)
assert np.max(np.abs(mixed[1,1].astype(float)-expected))<=1.1, 'RGBA alpha and material opacity did not composite correctly'
assert np.array_equal(mixed,render([back,row(4,depth=-.4,opacity=.5)])), 'transparent material order changed the image'
print('UV/flipY/wrap, linear RGB/alpha, mask depth, factors, blend ordering, legacy 14/37 rows passed')
`;
  try{
    const result=spawnSync(process.env.SHALLOW_PYTHON??'python',['-c',code,script,temp],{encoding:'utf8',timeout:90000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    assert.equal(result.status,0,result.error?.message??`${result.stdout}\n${result.stderr}`);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
