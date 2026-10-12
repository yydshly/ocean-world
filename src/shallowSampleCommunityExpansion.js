// Finite reef/sand observation groups. These display patrols do not consume
// parasite/prey stocks or claim a measured cleaner-client interaction.
export function arrangeSampleCommunityExpansion(model,progress){
  const members=id=>model.agents.filter(a=>a.speciesId===id);
  function passage(agents,time,forward,lateral,lift,radius=.55,speed=.11,spacing=.75){
    const camera=model.path.getPointAt(progress(time));
    agents.forEach((a,i)=>{
      const angle=(i-(agents.length-1)/2)*.16;
      a.radius=radius;a.speed=speed;a.phase=angle-time*speed;a.sampleCommunityVisit=time;
      a.home={x:camera.x+forward+Math.abs(i-(agents.length-1)/2)*.24-radius*Math.cos(angle),
        z:camera.z+lateral+(i-(agents.length-1)/2)*spacing-radius*.56*Math.sin(angle)};
      a.lift=lift;
    });
  }
  const puffers=members('black-blotched-porcupinefish'),cleaners=members('cleaner-wrasse'),lions=members('lionfish');
  passage(puffers.slice(0,2),25,3.6,1.1,.82,.32,.10,1.1);
  passage(cleaners,25,3.1,1.05,1.05,.30,.16,.35);
  passage(puffers.slice(2),69,4.5,2.6,.7,.48,.11,.9);
  passage(lions.slice(0,1),25,5.7,2.8,.70,.38,.085);
  passage(lions.slice(1),69,4.8,2.1,.8,.45,.085,1.05);

  // A second bottom-level subject follows the rays instead of leaving the
  // entire middle passage visually empty. Keep existing identities and sizes.
  const cuttlefish=members('reef-cuttlefish');
  passage(cuttlefish,47,3.4,.5,.5,.7,.09,.85);
  passage(members('reef-goatfish').slice(0,5),42,4.5,-1.4,.22,.9,.11,.60);
  const starfish=members('chocolate-chip-sea-star');
  passage(starfish,47,3.3,1.3,0,.18,.025,.80);
  model.additionalCommunities=[
    {id:'reef-cleaner-station',time:25,label:'礁缘清洁鱼与二齿鲀',agents:[...puffers.slice(0,2),...cleaners]},
    {id:'sand-cephalopod-passage',time:47,label:'沙道乌贼与巡底羊鱼',agents:[...cuttlefish,...members('reef-goatfish').slice(0,5)]},
    {id:'reef-predator-margin',time:69,label:'礁缘蓑鲉与二齿鲀',agents:[...lions.slice(1),...puffers.slice(2)]},
  ];
}
