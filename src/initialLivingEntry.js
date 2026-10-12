// Direct demonstrations know their first destination before world construction.
// Ordinary exploration keeps its original observation entry.
export function initialLivingEntry(search = '') {
  const demo = new URLSearchParams(search).get('demo');
  if (['director', 'life-expedition', 'reef-valley-region'].includes(demo)) return 'reef-valley-region';
  return demo === 'seagrass-meadow-region' ? 'seagrass-meadow-region' : null;
}
