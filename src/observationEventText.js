const driftUnits = value => value < .000001 ? value.toExponential(2) : value.toFixed(6);

/** Event types are shared by different simulations; a type alone does not
 * establish the units or numerical fields of a particular producer. */
export function observationEventCause(event, resourceNames = {}) {
  if (!event) return undefined;
  if (event.type === 'kelp-drift-feeding' && Number.isFinite(event.removedUnits) && event.removedUnits > 0) {
    return `接近实际落料点后摄入 ${driftUnits(event.removedUnits)} 相对藻料，来源为已有巨藻组织的自然脱落。`;
  }
  if (event.type === 'predation') {
    if (event.unit === 'dimensionless-condition-index'
      && Number.isFinite(event.removedUnits) && Number.isFinite(event.gainUnits)) {
      return `吻端接触海葵触手后，海葵体况减少 ${event.removedUnits.toFixed(5)}，海蜘蛛获得 ${event.gainUnits.toFixed(5)}。这是无量纲条件能量转移，双方保留身份。`;
    }
    return event.cause;
  }
  if (Number.isFinite(event.actualIntake) && event.actualIntake > 0) {
    return `接近${resourceNames[event.foodPool] || '局部食物'}后摄入 ${event.actualIntake.toFixed(5)} 相对有机代理量，消耗来自附近食物斑块。`;
  }
  const bite = typeof event.cause === 'string' ? event.cause.match(/接近局部 (\w+) 斑块后移出 ([\d.]+)/) : null;
  return bite
    ? `在附近找到${resourceNames[bite[1]] || '食物'}并摄食，本次消耗 ${bite[2]} 相对资源量；摄食所得进入个体能量收支。`
    : event.cause;
}
