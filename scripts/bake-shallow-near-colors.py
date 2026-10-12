"""Sample source texture pixels into fallback mesh colours; no image editing."""
import base64, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image

source=Path('src/world/shallowNearCommunityData.js')
text=source.read_text(encoding='utf8')
data=json.loads(text.split('export default ',1)[1].rstrip(';\n'))
for model in data.values():
    for rows in model['variants'].values():
        for row in rows:
            raw=base64.b64decode(row['data']); views=row['views']; v=views['uv']
            uv=np.frombuffer(raw,dtype='<f4',count=v['count']*2,offset=v['offset']).reshape(-1,2)
            pixels=np.asarray(Image.open(Path('public/assets/shallow-near-community')/row['file']).convert('RGB'),dtype=np.float32)/255
            h,w=pixels.shape[:2]; coords=uv.copy()
            for axis,wrap in enumerate([row['wrapS'],row['wrapT']]):
                coords[:,axis]=coords[:,axis]%1 if wrap=='repeat' else np.clip(coords[:,axis],0,1)
            x=np.minimum(w-1,(coords[:,0]*w).astype(int)); y=np.minimum(h-1,(coords[:,1]*h).astype(int))
            rgb=pixels[y,x]; linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4).astype('<f4')
            index=views['index']; start=index['offset']; indices=raw[start:start+index['count']*(4 if row.get('indexType')=='uint32' else 2)]
            # Repeated runs replace the previous fallback, rather than append.
            end=views.get('color',{'offset':start})['offset']
            new=raw[:end]+linear.tobytes()+indices
            views['color']={'offset':end,'count':len(linear),'size':3};index['offset']=end+linear.nbytes
            row['data']=base64.b64encode(new).decode()
source.write_text('// Three public source models; licences and alterations in assets/shallow-near-community/provenance.json.\nexport default '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
p=Path('public/assets/shallow-near-community/provenance.json');d=json.loads(p.read_text(encoding='utf8'))
d['fallback']='Source UV/image samples in linear vertex colours when optional textures are absent or late.'
d['generatedData']['sha256']=hashlib.sha256(source.read_bytes()).hexdigest();p.write_text(json.dumps(d,indent=2),encoding='utf8')
print('Baked original source colours for fallback materials.')
