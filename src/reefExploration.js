// Authored, metre-based observation stops over the existing shallow reef.
// Changing a camera never advances the model or triggers animal behaviour.
const stop = (id, label, hint, position, target, observationSpeciesIds) => Object.freeze({
  id, label, hint,
  position: Object.freeze(position), target: Object.freeze(target),
  observationSpeciesIds: Object.freeze(observationSpeciesIds),
});

export const REEF_EXPLORATION_STOPS = Object.freeze([
  stop('route-main', '主礁', '观察主礁上方的鱼群，再沿礁面寻找觅食的倒吊。',
    [-.5, 2.3, 1.3], [-3.75, 1.2, -1.75], ['green-chromis', 'lined-tang']),
  stop('route-sand', '沙地通道', '沿沙面寻找海参，留意它贴底移动和摄取沉积食物。',
    [1.65, 1.3, 3.35], [.25, -.03, 1.55], ['black-cucumber']),
  stop('route-crevice', '岩隙口', '观察岩隙外的清洁鱼与虾，等待附近客户鱼自然靠近。',
    [-.7, 1.05, -.15], [1.2, .4, -2.0], ['cleaner-wrasse', 'cleaner-shrimp']),
]);

export const REEF_EXPLORATION_PRESETS = Object.freeze(Object.fromEntries(
  REEF_EXPLORATION_STOPS.map(({ id, position, target }) => [id, Object.freeze({ position, target })]),
));
