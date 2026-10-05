import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReefLandscapeFocusV1 } from '../scripts/lib/inspect-reef-landscape-focus-v1.mjs';
const report=inspectReefLandscapeFocusV1();
test('candidate LOD focus uses exactly the prospective visible detail and respects hidden ancestors/children',()=>{
  assert.equal(report.status,'passed');assert.equal(report.rows.length,8);
  assert.ok(report.rows.every(r=>r.actualVisibilityStateChecksPassed&&r.selectedParentOnlyIgnoresVisibility&&r.hiddenAncestorsAndMeshChildrenExcluded&&r.buffersAndOwnerReferencesUnchanged));
  const ghost=report.rows.find(r=>r.ghostCheck).ghostCheck;assert.equal(ghost.filteredVisibleLowHits,0);assert.ok(ghost.hiddenMediumHits>0&&ghost.unfilteredRecursiveHits>0);
});
test('the previous erroneous 5-of-5 focus claim is corrected to agree with five actual final-detail rays',()=>{
  const c=report.rows.find(r=>r.counterexample).counterexample;assert.equal(c.originalFullSourceSnapshotRetained,false);
  assert.equal(c.originalCurrentLodPolicyReplay.predictedVisibleSamples,5);assert.equal(c.originalCurrentLodPolicyReplay.actualAfterLinearApproach[0].visible,false);
  assert.equal(c.fixed.centerVisible,c.fixed.actualAfterLinearApproach[0].visible);assert.equal(c.fixed.visibleSamples,c.fixed.actualAfterLinearApproach.filter(r=>r.visible).length);
});
test('prospective hysteresis agrees with linear paths crossing or avoiding the near band',()=>{
  assert.equal(report.rows.reduce((sum,r)=>sum+r.lineCases.length,0),24);
  for(const row of report.rows)for(const line of row.lineCases)assert.equal(line.predicted,line.actualFinalLevel);
});
