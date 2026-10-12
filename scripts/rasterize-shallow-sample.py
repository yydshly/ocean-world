"""New offline scene renders from actual projected triangles; no image edits."""
import json
import sys
from pathlib import Path
import numpy as np
from numba import njit
from numba.typed import List
from PIL import Image

@njit
def sample_map(texture,u,v,k):
    h,w=texture.shape[:2]
    px=(u-np.floor(u))*w-.5;py=(1-(v-np.floor(v)))*h-.5
    x=int(np.floor(px));y=int(np.floor(py));dx=px-x;dy=py-y
    return texture[y%h,x%w,k]*(1-dx)*(1-dy)+texture[y%h,(x+1)%w,k]*dx*(1-dy)+texture[(y+1)%h,x%w,k]*(1-dx)*dy+texture[(y+1)%h,(x+1)%w,k]*dx*dy

@njit
def sample_uv_map(texture,u,v,k,flip_y,repeat_s,repeat_t):
    h,w=texture.shape[:2]
    u=u-np.floor(u) if repeat_s else max(0.,min(1.,u))
    v=v-np.floor(v) if repeat_t else max(0.,min(1.,v))
    px=u*w-.5;py=(1-v if flip_y else v)*h-.5
    x=int(np.floor(px));y=int(np.floor(py));dx=px-x;dy=py-y
    x0=x%w if repeat_s else max(0,min(w-1,x));x1=(x+1)%w if repeat_s else max(0,min(w-1,x+1))
    y0=y%h if repeat_t else max(0,min(h-1,y));y1=(y+1)%h if repeat_t else max(0,min(h-1,y+1))
    return texture[y0,x0,k]*(1-dx)*(1-dy)+texture[y0,x1,k]*dx*(1-dy)+texture[y1,x0,k]*(1-dx)*dy+texture[y1,x1,k]*dx*dy

@njit
def _raster(rows,width,height,camera,sand,rock,textures,rules):
    fog=np.array([50.,110.,128.])/255
    pixels=np.empty((height,width,3),np.float32)
    depth=np.full((height,width),2.,np.float32)
    for y in range(height):
        for x in range(width):
            tx=(2*x/width-1)*.5543*width/height;ty=(1-2*y/height)*.5543
            direction_y=(ty*camera[5]-camera[9])/np.sqrt(tx*tx+ty*ty+1)
            up=max(0.,min(1.,(direction_y+.05)/.85));up=up*up*(3-2*up)
            upper=np.array([113.,178.,189.])/255
            for k in range(3):
                low=fog[k]/12.92 if fog[k]<=.04045 else ((fog[k]+.055)/1.055)**2.4
                high=upper[k]/12.92 if upper[k]<=.04045 else ((upper[k]+.055)/1.055)**2.4
                value=low*(1-up)+high*up
                pixels[y,x,k]=12.92*value if value<=.0031308 else 1.055*value**(1/2.4)-.055
    for row in rows:
        ax,ay,az,bx,by,bz,cx,cy,cz=row[:9]
        det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(det)<.001:continue
        x0=max(0,int(min(ax,bx,cx)));x1=min(width-1,int(max(ax,bx,cx))+1)
        y0=max(0,int(min(ay,by,cy)));y1=min(height-1,int(max(ay,by,cy))+1)
        color=np.empty(3,np.float32)
        haze=1-np.exp(-(.023*row[12])**2)
        for k in range(3):
            value=row[9+k]*.85
            value=max(0.,min(1.,(value*(2.51*value+.03))/(value*(2.43*value+.59)+.14)))
            value=12.92*value if value<=.0031308 else 1.055*value**(1/2.4)-.055
            color[k]=value*(1-haze)+fog[k]*haze
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/det
                v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/det
                w=1-u-v
                if u>=0 and v>=0 and w>=0:
                    z=u*az+v*bz+w*cz
                    if z<depth[y,x]:
                        opacity=row[13]
                        depth_write=opacity>.5
                        if len(row)>14 and row[32]>0:
                            q=u*row[14]+v*row[15]+w*row[16]
                            pa=u*row[14]/q;pb=v*row[15]/q;pc=w*row[16]/q
                            wx=pa*row[17]+pb*row[20]+pc*row[23];wy=pa*row[18]+pb*row[21]+pc*row[24];wz=pa*row[19]+pb*row[22]+pc*row[25]
                            tu=pa*row[26]+pb*row[28]+pc*row[30];tv=pa*row[27]+pb*row[29]+pc*row[31]
                            texture_id=int(row[32])-3
                            if texture_id>=0:
                                rule=rules[texture_id]
                                opacity*=sample_uv_map(textures[texture_id],tu,tv,3,rule[0]>0,rule[1]>0,rule[2]>0)
                                if opacity<rule[3]:continue
                                if rule[4]==0:opacity=1.
                                depth_write=rule[5]>0
                            for k in range(3):
                                if row[32]==1:albedo=sample_map(sand,tu,tv,k)
                                elif row[32]==2:
                                    albedo=sample_map(rock,wy*row[33],wz*row[33],k)*row[34]+sample_map(rock,wx*row[33],wz*row[33],k)*row[35]+sample_map(rock,wx*row[33],wy*row[33],k)*row[36]
                                    cover=max(0.,min(1.,pa*row[37]+pb*row[38]+pc*row[39]))*.78 if len(row)>=40 else 0.
                                    albedo=albedo*(1-cover)+.80*cover
                                else:albedo=sample_uv_map(textures[texture_id],tu,tv,k,rule[0]>0,rule[1]>0,rule[2]>0)
                                value=row[9+k]*albedo*.85
                                if texture_id>=0 and rule[6]<1:
                                    luma=0.
                                    for channel in range(3):
                                        texel=sample_uv_map(textures[texture_id],tu,tv,channel,rule[0]>0,rule[1]>0,rule[2]>0)
                                        weight=.2126 if channel==0 else .7152 if channel==1 else .0722
                                        luma+=row[9+channel]*texel*.85*weight
                                    value=luma+(value-luma)*rule[6]
                                value=max(0.,min(1.,(value*(2.51*value+.03))/(value*(2.43*value+.59)+.14)))
                                value=12.92*value if value<=.0031308 else 1.055*value**(1/2.4)-.055
                                value=value*(1-haze)+fog[k]*haze
                                pixels[y,x,k]=value*opacity+pixels[y,x,k]*(1-opacity)
                        else:
                            for k in range(3):pixels[y,x,k]=color[k]*opacity+pixels[y,x,k]*(1-opacity)
                        if depth_write:depth[y,x]=z
    return (np.clip(pixels,0,1)*255).astype(np.uint8)

def load_texture(file,rgba=False):
    with Image.open(file) as image:
        value=np.asarray(image.convert('RGBA' if rgba else 'RGB'),dtype=np.float32)/255
    # glTF baseColor RGB is sRGB, while alpha is linear coverage.
    value[:,:,:3]=np.where(value[:,:,:3]<=.04045,value[:,:,:3]/12.92,((value[:,:,:3]+.055)/1.055)**2.4)
    return value.astype(np.float32)

def load_base_color_textures(entries):
    textures=List();rules=[];images={}
    for i,entry in enumerate(entries):
        if entry['kind']!=i+3:raise ValueError('Non-contiguous native baseColor kinds')
        if entry['file'] not in images:images[entry['file']]=load_texture(entry['file'],True)
        textures.append(images[entry['file']])
        rules.append([entry.get('flipY',False),entry.get('wrapS','clamp')=='repeat',entry.get('wrapT','clamp')=='repeat',
                      entry.get('alphaTest',0),entry.get('transparent',False),entry.get('depthWrite',True),entry.get('marineSaturation',1)])
    if not len(textures):textures.append(np.ones((1,1,4),np.float32));rules.append([0,0,0,0,0,1,1])
    return textures,np.array(rules,dtype=np.float64)

def raster(rows,width,height,camera,sand,rock,textures=None,rules=None):
    if textures is None:textures,rules=load_base_color_textures([])
    if rows.shape[1]>14:
        ids=rows[:,32].astype(np.int64)-3
        mapped=ids>=0
        if np.any(mapped):
            if np.max(ids[mapped])>=len(rules):raise ValueError('Unknown native baseColor kind')
            blend=np.zeros(len(rows),dtype=np.bool_);blend[mapped]=rules[ids[mapped],4]>0
            if np.any(blend):
                # Opaque/masked surfaces establish depth first; source BLEND
                # triangles use far-to-near alpha compositing, an approximation.
                translucent=rows[blend];translucent=translucent[np.argsort(-translucent[:,12],kind='stable')]
                rows=np.concatenate((rows[~blend],translucent))
    return _raster(rows,width,height,camera,sand,rock,textures,rules)

def main():
    root=Path(sys.argv[1] if len(sys.argv)>1 else 'output/validation/shallow-sample')
    meta=json.loads((root/'render.json').read_text())
    maps=meta.get('albedoFiles');sand=load_texture(maps['sand']) if maps else np.ones((1,1,3),np.float32);rock=load_texture(maps['rock']) if maps else sand
    # Same linear-space carbonate weathering transform as the runtime shader.
    # Source pixels are read unchanged; this is scene shading, not an image edit.
    amount=meta.get('rockDesaturation',0)
    if amount:
        luminance=rock@np.array([.2126,.7152,.0722],dtype=np.float32)
        rock=rock*(1-amount)+luminance[:,:,None]*amount
    textures,rules=load_base_color_textures(meta.get('baseColorTextures',[]))
    for frame in meta['frames']:
        data=np.fromfile(frame['file'],dtype=np.float32).reshape(-1,meta.get('stride',14))
        output=root/f"preview-{frame['time']}.png"
        Image.fromarray(raster(data,frame['width'],frame['height'],np.array(frame['cameraMatrix']),sand,rock,textures,rules)).save(output)
        print(output,flush=True)

if __name__=='__main__':main()
