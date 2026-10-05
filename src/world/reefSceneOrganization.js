// Authored display cover on the existing hard-substrate registry. This changes
// visual hierarchy, not species abundance, food, coral growth or terrain.
const SUPPORT_SEQUENCE = [1,0,1,0,1,0,1,0,1,0,1,0,3,4,3,4,2,2,5,6];

export function reefCoverOrganization(index,morphotype,angle,radius,scaleDraw){
  if(morphotype==='boulder'||index===144)return null;
  const serial=Math.floor(index/5)*4+index%5-1;
  const supportIndex=SUPPORT_SEQUENCE[serial%SUPPORT_SEQUENCE.length];
  const band=supportIndex<=1?'main':supportIndex===3||supportIndex===4?'foreground':'rear';
  const normalizedRadius=.16+(radius/.88)*(band==='rear'?.40:.43);
  let nx=Math.cos(angle)*normalizedRadius,nz=Math.sin(angle)*normalizedRadius;
  // Expose the sand-facing rock cheeks and place the crown behind the grazing
  // edge. The normalized samples remain well inside the existing shoulders.
  if(band==='main')nz-=.14;
  if(band==='rear')nz-=.10;
  const scale=band==='main'
    ?(morphotype==='branching'?1.35+scaleDraw*.75:1.65+scaleDraw*.70)
    :band==='foreground'
      ?(morphotype==='branching'?1.1+scaleDraw*.50:1.7+scaleDraw*.60)
      :(morphotype==='branching'?1.25+scaleDraw*.65:1.2+scaleDraw*.50);
  return {supportIndex,band,nx,nz,scale};
}

export function crossesReefSandCorridor(bounds){
  return bounds.max.x>-.65&&bounds.min.x<2.45&&bounds.max.z>-3.6&&bounds.min.z<3.8;
}
