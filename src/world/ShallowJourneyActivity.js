import * as THREE from 'three';

// A small, bounded visual response to authored sand-probing. It is not a
// sediment transport simulation and never changes ecological resource stocks.
export class ShallowJourneyActivity {
  constructor(model) {
    this.model=model;
    this.agents=model.agents.filter(a=>a.speciesId==='reef-goatfish');
    this.perAnimal=8;
    const count=this.agents.length*this.perAnimal;
    this.positions=new Float32Array(count*3);this.opacity=new Float32Array(count);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('activityOpacity',new THREE.BufferAttribute(this.opacity,1).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,
      uniforms:{...THREE.UniformsLib.fog},
      vertexShader:`attribute float activityOpacity;varying float opacity;
#include <fog_pars_vertex>
void main(){opacity=activityOpacity;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(90.0/max(1.0,-mvPosition.z),1.0,22.0);
#include <fog_vertex>
}`,
      fragmentShader:`varying float opacity;
#include <fog_pars_fragment>
void main(){float r=length(gl_PointCoord-.5)*2.0;float a=opacity*pow(max(0.0,1.0-r*r),2.0);if(a<.003)discard;gl_FragColor=vec4(.63,.61,.49,a);
#include <fog_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
    this.root=new THREE.Points(this.geometry,this.material);this.root.name='Sand probing response / authored activity';this.root.frustumCulled=false;
  }
  update(time) {
    let visible=false;
    for(let i=0;i<this.agents.length;i++){
      const a=this.agents[i],strength=a.probeStrength??0;
      const x=a.position.x+Math.cos(a.heading)*a.sizeM*.38,z=a.position.z+Math.sin(a.heading)*a.sizeM*.38;
      const bed=this.model.floor(x,z),soft=this.model.surface(x,z)-bed<.025;
      const active=soft&&strength>.1;
      for(let j=0;j<this.perAnimal;j++){
        const k=i*this.perAnimal+j,phase=(time*.36+j/this.perAnimal+i*.17)%1,angle=j*2.39996+i;
        const radius=.035+phase*.18;
        this.positions.set([x+Math.cos(angle)*radius+phase*.09,bed+.025+phase*.18,z+Math.sin(angle)*radius],k*3);
        this.opacity[k]=active?strength*.16*Math.sin(phase*Math.PI):0;
      }
      visible||=active;
    }
    this.root.visible=visible;this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.activityOpacity.needsUpdate=true;
  }
  dispose(){this.root.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
