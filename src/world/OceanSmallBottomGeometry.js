// Shapes use the established vertex-colour builder. Forward is +X; all
// appendages fit the independently checked controller clearance envelopes.
const green = [.40, .43, .29], cream = [.72, .68, .51], blue = [.22, .39, .46];
export function smallBottomBody(builder, id) {
  const b = builder();
  if (id === 'green-tiger-prawn') {
    b.ellipsoid([.24, .16, 0], [.16, .09, .09], green, 20, 10,
      (x, y) => y > .18 && (Math.abs(x - .17) < .016 || Math.abs(x - .31) < .016) ? cream : green);
    // Six abdominal somites, ending in the telson and two paired uropods.
    for (let i = 0; i < 6; i++) b.ellipsoid([.075 - i * .093, .13 - i * .006, 0],
      [.055, .067 - i * .005, .083 - i * .006], i % 2 ? cream : green, 14, 8);
    for (const side of [-1, 1]) {
      b.sheet([[-.41, .064, side * .03], [-.49, .045, side * .14], [-.50, .04, side * .035]], cream);
      b.sheet([[-.42, .063, side * .02], [-.48, .044, side * .10], [-.49, .04, side * .025]], green);
      b.tube([[.35, .18, side * .055], [.40, .225, side * .085]], [.008, .012], green);
      b.ellipsoid([.40, .225, side * .085], [.016, .016, .016], [.05, .045, .03], 10, 6);
    }
    b.sheet([[-.40, .065, -.015], [-.50, .042, 0], [-.40, .065, .015]], green);
    b.tube([[.28, .23, 0], [.40, .245, 0], [.50, .23, 0]], [.012, .010, .002], cream);
    for (let i = 0; i < 7; i++) b.sheet([[.29 + i * .027, .236, -.004], [.30 + i * .027, .27 - i * .004, 0],
      [.31 + i * .027, .236, .004]], green);
    for (let i = 0; i < 3; i++) b.sheet([[.39 + i * .025, .24, -.003], [.40 + i * .025, .21, 0], [.41 + i * .025, .235, .003]], green);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = .30 - i * .048, footX = .32 - i * .075;
      b.tube([[x, .13, side * .06], [x - .01, .065, side * .16], [footX, .003, side * .21]], [.007, .005, .003], cream);
      if (i < 3) b.tube([[footX, .015, side * .205], [footX + .020, .013, side * .215]], [.004, .002], green);
      if (i === 4) b.tube([[x, .12, side * .07], [x - .02, .09, side * .115]], [.004, .002], green);
    }
  } else {
    const spots = Array.from({length: 19}, (_, i) => [Math.cos(i * 2.4) * Math.sqrt((i + .5) / 19) * .20,
      Math.sin(i * 2.4) * Math.sqrt((i + .5) / 19) * .36]);
    b.ellipsoid([0, .17, 0], [.26, .09, .43], blue, 28, 12,
      (x, y, z) => y > .17 && spots.some(([sx, sz]) => (x - sx) ** 2 + (z - sz) ** 2 < .001) ? cream : blue);
    b.ellipsoid([-.02, .09, 0], [.21, .035, .31], [.37, .43, .38], 18, 8);
    for (const side of [-1, 1]) {
      // Nine anterolateral teeth; the ninth is the long lateral spine. Width
      // is measured between these tips, independently of legs and chelipeds.
      for (let i = 0; i < 9; i++) {
        const a = .28 + i * .14, x = Math.cos(a) * .23, z = Math.sin(a) * .43;
        const tipZ = i === 8 ? .5 : z + .034;
        b.sheet([[x + .014, .17, side * z], [x + .025, .19, side * tipZ], [x - .014, .17, side * z]], cream);
      }
      b.tube([[.20, .17, side * .10], [.30, .22, side * .15]], [.012, .012], blue);
      b.ellipsoid([.30, .22, side * .15], [.016, .016, .016], [.04, .04, .035], 10, 6);
      b.tube([[.22, .15, side * .06], [.37, .16, side * .095]], [.006, .002], cream);
      b.tube([[.17, .14, side * .24], [.40, .15, side * .43], [.58, .13, side * .33]], [.04, .028, .025], blue);
      b.ellipsoid([.64, .13, side * .30], [.075, .042, .036], blue, 14, 8);
      b.tube([[.67, .14, side * .28], [.77, .13, side * .27]], [.019, .004], cream);
      b.tube([[.68, .13, side * .33], [.76, .13, side * .29]], [.016, .003], cream);
      for (let i = 0; i < 3; i++) {
        const x = .08 - i * .10;
        b.tube([[x, .12, side * .33], [x - .07, .07, side * .53], [x + .01, .003, side * .67]], [.019, .012, .003], blue);
      }
      b.tube([[-.18, .12, side * .30], [-.28, .09, side * .47], [-.34, .065, side * .54]], [.02, .017, .014], blue);
      b.ellipsoid([-.36, .061, side * .59], [.065, .012, .072], cream, 14, 6);
    }
  }
  return b.finish();
}
export function smallBottomMovingParts(builder, id) {
  const b = builder();
  if (id === 'green-tiger-prawn') {
    for (const side of [-1, 1]) {
      b.tube([[.36, .17, side * .08], [.70, .22, side * .17], [1.10, .18, side * .40]],
        [.005, .003, .001], i => i % 2 ? cream : green);
      for (const branch of [0, 1]) b.tube([[.38, .19, side * .04], [.60, .20, side * (.09 + branch * .025)],
        [.76 - branch * .04, .19, side * (.17 + branch * .025)]], [.004, .002, .001], cream);
    }
  } else {
    // Mouth appendages only: walking foot contacts and paddle shapes stay
    // inside their actual static support envelope during this finite batch.
    for (const side of [-1, 1]) b.tube([[.18, .10, side * .026], [.28, .06, side * .044]], [.010, .006], cream);
  }
  return b.finish();
}
export function prawnPleopods(builder) {
  const b = builder();
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) b.sheet([
    [.055 - i * .093, .085 - i * .006, side * .045], [.01 - i * .093, .035, side * .080],
    [.035 - i * .093, .035, side * .060]], cream);
  return b.finish();
}
