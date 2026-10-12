import {livingShallowsSpeciesCatalog} from './sceneCatalog.js';

// Display selection for this finite sample only. No persistent-stock admission
// or legacy catalogue migration follows from adding a sample representative.
export const SHALLOW_EXTRA_SPECIES=Object.freeze([
  Object.freeze({id:'unidentified-reef-fish',commonName:'礁栖鱼（未定种）',scientificName:null,
    kind:'fish',guild:'reef-fish-display',lengthM:.32,sizeRangeM:[.28,.36],sizeMeasure:'total-length',
    habitat:'Artist source without taxonomic identification; authored reef-fish study, not a surveyed population.',sourceRecord:'assets/shallow-near-community/provenance.json'}),
  Object.freeze({id:'blacktail-snapper',commonName:'黑尾笛鲷',scientificName:'Lutjanus fulvus',
    kind:'fish',guild:'reef-small-animal-consumer',lengthM:.32,sizeRangeM:[.28,.36],sizeMeasure:'total-length',
    habitat:'Indo-Pacific reef and lagoon; authored group, not a population survey.',sourceRecord:'assets/shallow-open-community/provenance.json'}),
  Object.freeze({id:'giant-trevally',commonName:'浪人鲹',scientificName:'Caranx ignobilis',
    kind:'fish',guild:'reef-piscivore',lengthM:.68,sizeRangeM:[.58,.78],sizeMeasure:'total-length',
    habitat:'Indo-Pacific coastal reef visitor; authored group, not a predation or spawning simulation.',sourceRecord:'assets/shallow-open-community/provenance.json'}),
  Object.freeze({id:'yellow-tang',commonName:'黄高鳍刺尾鱼',scientificName:'Zebrasoma flavescens',
    kind:'fish',guild:'reef-algae-grazer',lengthM:.20,sizeRangeM:[.17,.23],sizeMeasure:'total-length',
    sizeMeasureDefinition:'Authored snout-to-tail length; original source proportions retained.',
    habitat:'Pacific shallow reef visitor; no local population survey or feeding process implied.',
    sourceRecord:'assets/shallow-artist/provenance.json'}),
  Object.freeze({id:'hawksbill-turtle',commonName:'玳瑁',scientificName:'Eretmochelys imbricata',
    kind:'turtle',guild:'reef-sponge-consumer',lengthM:.92,sizeRangeM:[.80,1.04],sizeMeasure:'total-length',
    sizeMeasureDefinition:'Authored complete snout-to-tail length, separate from carapace length; source proportions retained.',
    habitat:'Reef visitor beside the shallow live reef and grass edge; no feeding event or survey abundance claimed.',
    sourceRecord:'assets/shallow-source-turtle/provenance.json'}),
  Object.freeze({id:'black-blotched-porcupinefish',commonName:'黑斑二齿鲀',scientificName:'Diodon liturosus',
    kind:'fish',guild:'reef-benthic-animal-consumer',lengthM:.32,sizeRangeM:[.28,.36],sizeMeasure:'total-length',
    sizeMeasureDefinition:'Ordinary uninflated snout-to-tail length; spines remain part of the full display envelope.',
    sourceRecord:'assets/shallow-community-fish/provenance.json'}),
  Object.freeze({id:'barramundi',commonName:'尖吻鲈',scientificName:'Lates calcarifer',
    kind:'fish',guild:'coastal-fish-and-crustacean-consumer',lengthM:.64,sizeRangeM:[.58,.70],sizeMeasure:'total-length',
    sizeMeasureDefinition:'Snout-to-tail total length, including the source model rounded tail.',
    habitat:'Coastal marine visitor beside the shallow grass and sand margin; not a coral-obligate resident.',
    habitatSource:'https://era.dpi.qld.gov.au/id/eprint/11309/',
    sourceRecord:'assets/shallow-sourced-fish/provenance.json'}),
]);
const sampleSourceLabels={
  'day-octopus':{commonName:'章鱼（未定种模型）',scientificName:null,sourceRecord:'assets/shallow-contact-fauna/provenance.json',
    description:'Lukáš Marek 的完整章鱼雕塑，原法线图与自制自然色皮肤；未鉴定为日行章鱼。水平腕展作为展示尺度。',
    habitat:'Mixed-source shallow-water demonstration; no taxonomic or biogeographic certification.'},
  'spotted-reef-crab':{commonName:'蓝蟹（外形参考）',scientificName:null,sourceRecord:'assets/shallow-contact-fauna/provenance.json',
    description:'Julian Johnson-Mortimer 的完整蓝蟹艺术家模型，尺寸按原模型甲壳宽度计；不是原红斑瓢蟹。',
    habitat:'Coastal sand/grass visitor in this mixed-source demonstration; not a coral-obligate local resident.'},
};
export const shallowSampleSpeciesCatalog=Object.freeze([...livingShallowsSpeciesCatalog.map(s=>sampleSourceLabels[s.id]?Object.freeze({...s,...sampleSourceLabels[s.id],sources:[],nameNote:'仅本浅海样板替换展示外形；内部巡游轨迹键沿用旧值，持续探索的物种和存档不变。'}):s),...SHALLOW_EXTRA_SPECIES]);
