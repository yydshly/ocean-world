// One explicit demonstration copy. The ordinary URL keeps its original save
// identity; this parameter never changes the terrain seed or clears a world.
export const HABITAT_LAYERS_WORLD_VARIANT = 'habitat-layers';
export function readOceanWorldVariant(search = '') {
  const variant = new URLSearchParams(search).get('world');
  return [HABITAT_LAYERS_WORLD_VARIANT, 'sand-corridor', 'reef-slope', 'depth-community', 'reef-filter-life', 'reef-suspension-life', 'reef-mobile-benthos', 'reef-grazers', 'reef-color-fish', 'reef-schooling', 'reef-foraging', 'meadow-foraging', 'meadow-food-web', 'small-bottom-life', 'meadow-water-life', 'sand-bottom-life', 'coastal-schools', 'reef-bottom-life', 'animal-communities', 'whole-seabed'].includes(variant) ? variant : null;
}
