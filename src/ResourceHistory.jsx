import React, { useEffect, useRef } from 'react';

export function ResourceHistory({ data, biome }) {
  const ref = useRef(null);
  const foodKey = biome === 'deep' ? 'suspendedPrey' : biome === 'kelp' ? 'smallPrey' : 'plankton';
  const baseKey = biome === 'deep' ? 'surfaceDetritus' : 'algae';
  const baseLabel = biome === 'deep' ? '沉积碎屑' : '藻类';
  const foodLabel = biome === 'deep' ? '悬浮食物' : biome === 'kelp' ? '小型食物' : '浮游资源';
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const left = 35, right = width - 10, top = 8, bottom = height - 29;
    const series = [[baseKey, '#b7c698'], [foodKey, '#8fbfc4'], ['averageEnergy', '#e0c69b']];
    const max = Math.max(1, ...data.flatMap(d => series.map(([key]) => Number(d[key]) || 0)));
    const ceiling = Math.ceil(max * 2) / 2;
    const start = data[0]?.timeSec || 0, end = data.at(-1)?.timeSec || start;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '16px sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) {
      const y = bottom - i / 2 * (bottom - top);
      ctx.strokeStyle = '#cee2d51a';
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillStyle = '#a6b8af'; ctx.textAlign = 'right';
      ctx.fillText((ceiling * i / 2).toFixed(1), left - 6, y);
    }
    for (const [key, color] of series) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      data.forEach((d, i) => {
        const x = left + (end > start ? (d.timeSec - start) / (end - start) : 0) * (right - left);
        const y = bottom - Math.max(0, Number(d[key]) || 0) / ceiling * (bottom - top);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.fillStyle = '#a6b8af';
    ctx.textAlign = 'left'; ctx.fillText(`${Math.round(start)} s`, left, height - 10);
    ctx.textAlign = 'right'; ctx.fillText(`${Math.round(end)} s`, right, height - 10);
  }, [data, foodKey, baseKey]);
  return <canvas ref={ref} width="580" height="172" className="history-plot"
    aria-label={`资源与平均能量随模拟秒变化：绿色${baseLabel}参考量、蓝色${foodLabel}参考量、米色归一化平均能量。纵轴从零起，按数据范围调整。`}/>;
}
