// Historical render fingerprints may project the explicitly corrected sediment
// contact Y back to the old analytic bed. Preserve the old hash of every other
// byte; current contact correctness is checked against actual ray hits separately.
export function historicalGroundContactMatrices(mesh, chunk, generator) {
  if (!['seagrass', 'rubble'].includes(mesh.userData.landscapeKind)) return mesh.instanceMatrix.array;
  const result = mesh.instanceMatrix.array.slice();
  const elements = chunk.elements.filter(element => element.kind === mesh.userData.landscapeKind);
  for (let index = 0; index < elements.length; index++) result[index * 16 + 13] = generator.sample(elements[index].x, elements[index].z).floorY;
  return result;
}
