import { shallowLiveReefGeometries } from './ShallowLiveReefAssets.js';
import { shallowScannedReefGeometries } from './ShallowScannedReefAssets.js';
import { shallowBranchingCoralGeometries } from './ShallowBranchingCorals.js';
import { shallowOpenCoralGeometries } from './ShallowOpenCommunity.js';
import {nearColonyGeometries} from './ShallowNearCommunity.js';
import {shallowBenthicCoralGeometries} from './ShallowBenthicCorals.js';

// A display asset selection only. The source colonies are not new biological
// stock, and their authored world widths are not measured scan dimensions.
export function shallowSampleCoralGeometries(detail, includeScanned = true) {
  const authored = shallowLiveReefGeometries(detail);
  const specimens = {...shallowBranchingCoralGeometries(detail),...shallowOpenCoralGeometries(detail),...nearColonyGeometries(detail)};
  for(const [key,geometry] of Object.entries(specimens)){authored[key]?.dispose();authored[key]=geometry;}
  for(const [key,geometry] of Object.entries(shallowBenthicCoralGeometries(detail))){authored[key]?.dispose();authored[key]=geometry;}
  return includeScanned ? {...authored, ...shallowScannedReefGeometries(detail === 'distant')} : authored;
}

export function shallowSampleCoralKey(colony, index = 0) {
  return colony.scanAsset ?? `${colony.form}-${colony.assetVariant ?? (colony.form === 'fan' ? 0 : index % 2)}`;
}
