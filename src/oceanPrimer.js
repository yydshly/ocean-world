import { shallowNarrationTimeline } from './shallowNarrationTimeline.js';
import primer from './data/oceanPrimerNarration.json' with { type: 'json' };

export const OCEAN_PRIMER_SECONDS = 450;
export const OCEAN_PRIMER_CHAPTERS = Object.freeze([
  { id: 'surface', title: '海面与下潜', start: 0, end: 45, place: '热带近岸 · 海面到浅水', lesson: '大海有海面，也有广阔的水体和海底。' },
  { id: 'shallow', title: '浅海栖息地', start: 45, end: 285, place: '印度—太平洋浅海 · 代表性群落', lesson: '礁谷、沙道、草床，为动物提供不同的生活空间。' },
  { id: 'pelagic', title: '大型动物与水层', start: 285, end: 365, place: '加勒比海 · 代表性鲸豚观察', lesson: '用真实体长看鲸与海豚，观察浮出、下潜和群游。' },
  { id: 'deep', title: '走进深海', start: 365, end: 430, place: '东北太平洋 · 中层与海床观察点', lesson: '深度改变光照；海底与水层都有生命。' },
  { id: 'recap', title: '回望整个海洋', start: 430, end: 450, place: '海洋空间回顾', lesson: '记住海面、水层、海床，以及不同生境的生命。' },
].map(Object.freeze));

export function oceanPrimerChapter(time) {
  if (!Number.isFinite(time)) throw new TypeError('Ocean primer time must be finite.');
  return OCEAN_PRIMER_CHAPTERS.find(c => time < c.end) ?? OCEAN_PRIMER_CHAPTERS.at(-1);
}
export const OCEAN_PRIMER_CLIPS = Object.freeze([
  ...primer.clips,
  ...shallowNarrationTimeline().clips.map(clip => ({ ...clip, id: `primer-shallow-${clip.id}`, start: clip.start + 45, chapterId: 'shallow', reused: true })),
].sort((a, b) => a.start - b.start));

export function oceanPrimerTransition(time) {
  let opacity = 0;
  for (const boundary of [45, 285, 365, 430]) opacity = Math.max(opacity, Math.max(0, 1 - Math.abs(time - boundary) / .7));
  return opacity;
}

export function oceanPrimerDepthMarker(depthM) {
  return Math.min(1, Math.log1p(Math.max(0, depthM)) / Math.log1p(3500));
}
