// One explicit demonstration copy. The ordinary URL keeps its original save
// identity; this parameter never changes the terrain seed or clears a world.
export const HABITAT_LAYERS_WORLD_VARIANT = 'habitat-layers';
export function readOceanWorldVariant(search = '') {
  const variant = new URLSearchParams(search).get('world');
  return [HABITAT_LAYERS_WORLD_VARIANT, 'sand-corridor', 'reef-slope'].includes(variant) ? variant : null;
}
