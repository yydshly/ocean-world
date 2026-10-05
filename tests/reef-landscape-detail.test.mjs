import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReefLandscapeDetail } from '../scripts/lib/inspect-reef-landscape-detail.mjs';
test('branching landscape detail preserves low buffers, honors viewing hysteresis and releases both shared detail owners once', () => {
  const report = inspectReefLandscapeDetail();
  assert.equal(report.status,'passed'); assert.equal(report.rows.length,8);
  assert.ok(report.rows.every(row => row.visibilityTransitions === 48 && row.hysteresisChecks === 48 && row.sharedDisposalsEach === 1));
  assert.equal(report.massiveColoniesRetainSingleFittedSurface,true);
});
