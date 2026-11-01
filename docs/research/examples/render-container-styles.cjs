/* Research rendering probe. No editor or file-format compatibility is implied.
 * Run: node render-container-styles.cjs /absolute/path/to/rough.cjs.js [output-dir]
 * Dependency used for the checked preview: roughjs 4.6.6 (MIT).
 * Source: https://github.com/rough-stuff/rough
 */
const fs = require('node:fs');
const path = require('node:path');
if (!process.argv[2]) throw new Error('Pass the path to roughjs bundled/rough.cjs.js');
const rough = require(path.resolve(process.argv[2]));
const out = path.resolve(process.argv[3] || path.join(__dirname, '../assets'));
const gen = rough.generator();
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ink = '#24424b';
const presets = [
  { id: 'precise', title: '规范细线', subtitle: '清楚的逻辑边界与轻量分组', fill: '#ffffff' },
  { id: 'soft', title: '柔和分组', subtitle: '淡色底与圆角强调模块归属', fill: '#eef6f5' },
  { id: 'header', title: '标题带', subtitle: '标题预留空间，内容保持整齐', fill: '#ffffff' },
  { id: 'dashed', title: '虚线边界', subtitle: '边界样式与科学含义分别保存', fill: '#ffffff' },
  { id: 'bracket', title: '括号分组', subtitle: '开放边界仍保留完整父子关系', fill: '#ffffff' },
  { id: 'sketch', title: '手绘与排线', subtitle: '固定笔触 seed，文字与端口清晰', fill: '#ffffff' },
];
const model = {
  container: { id: 'stage', bounds: [22, 83, 372, 194], title: 'Processing stage' },
  nodes: [
    { id: 'encoder', label: 'Encoder', box: [48, 164, 84, 44] },
    { id: 'fusion', label: 'Fusion', box: [166, 164, 84, 44] },
    { id: 'decoder', label: 'Decoder', box: [284, 164, 84, 44] },
  ],
  edges: [
    { id: 'e1', source: ['encoder', 'out'], target: ['fusion', 'in'] },
    { id: 'e2', source: ['fusion', 'out'], target: ['decoder', 'in'] },
  ],
  ports: [{ id: 'in', xy: [22, 186] }, { id: 'out', xy: [394, 186] }],
};
function text(x, y, label, size = 14, extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(label)}</text>`;
}
function paths(drawable) {
  return gen.toPaths(drawable).map((p) => `<path d="${esc(p.d)}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth}" fill="${esc(p.fill)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}
function card(skin, i) {
  const x = 24 + (i % 3) * 428;
  const y = 111 + Math.floor(i / 3) * 334;
  const { id } = skin;
  let s = `<g id="${id}" data-preset="${id}" transform="translate(${x},${y})">`;
  s += '<rect width="416" height="318" rx="14" fill="#fff" stroke="#dce5e7"/>';
  s += text(18, 30, skin.title, 19, 'font-weight="650"');
  s += text(18, 53, skin.subtitle, 12.5, 'fill="#667b82"');
  const border = { x: 22, y: 83, w: 372, h: 194 };
  if (id === 'sketch') {
    s += paths(gen.rectangle(border.x, border.y, border.w, border.h, {
      seed: 38191, roughness: 1.5, bowing: 1.2, stroke: ink, strokeWidth: 1.3,
      fill: '#d4e4e1', fillStyle: 'hachure', hachureGap: 10,
      hachureAngle: -45, fillWeight: 0.6, preserveVertices: false,
    }));
    s += '<rect x="32" y="94" width="160" height="25" rx="4" fill="#fff"/>';
  } else if (id === 'bracket') {
    s += `<path d="M43 83 H22 V277 H43 M373 83 H394 V277 H373" fill="none" stroke="${ink}" stroke-width="1.5"/>`;
  } else {
    const radius = id === 'precise' || id === 'dashed' ? 3 : 11;
    const dash = id === 'dashed' ? 'stroke-dasharray="7 5"' : '';
    s += `<rect x="22" y="83" width="372" height="194" rx="${radius}" fill="${skin.fill}" stroke="${ink}" stroke-width="1.25" ${dash}/>`;
    if (id === 'header') {
      s += '<path d="M34 84 H382 Q393 84 393 96 V123 H23 V96 Q23 84 34 84Z" fill="#e1efed"/>';
      s += `<path d="M23 123 H393" stroke="${ink}" stroke-width="1"/>`;
    }
  }
  s += text(38, 110, model.container.title, 13, 'font-weight="600"');
  model.nodes.forEach((node, n) => {
    const [nx, ny, w, h] = node.box;
    s += `<g id="${id}-${node.id}" data-node="${node.id}">`;
    if (id === 'sketch') {
      // An exact background protects the text from the parent's hachure.
      s += `<rect x="${nx - 2}" y="${ny - 2}" width="${w + 4}" height="${h + 4}" fill="#fff"/>`;
      s += paths(gen.rectangle(nx, ny, w, h, {
        seed: 4181 + n, roughness: 1, bowing: 0.8,
        stroke: ink, strokeWidth: 1.25, preserveVertices: false,
      }));
    } else {
      s += `<rect x="${nx}" y="${ny}" width="${w}" height="${h}" rx="5" fill="#fff" stroke="${ink}" stroke-width="1.15"/>`;
    }
    s += text(nx + w / 2, ny + 27, node.label, 12.6, 'text-anchor="middle"');
    s += '</g>';
  });
  model.edges.forEach((edge) => {
    const source = model.nodes.find((n) => n.id === edge.source[0]);
    const target = model.nodes.find((n) => n.id === edge.target[0]);
    const start = source.box[0] + source.box[2];
    const end = target.box[0] - 2;
    s += `<path data-edge="${edge.id}" d="M${start} 186 H${end}" fill="none" stroke="${ink}" stroke-width="1.4" marker-end="url(#arrow)"/>`;
  });
  s += `<path d="M22 186 H46 M368 186 H394" fill="none" stroke="${ink}" stroke-width="1.3"/>`;
  for (const port of model.ports) {
    s += `<circle data-port="${port.id}" cx="${port.xy[0]}" cy="${port.xy[1]}" r="3.3" fill="#fff" stroke="${ink}" stroke-width="1.3"/>`;
  }
  s += text(18, 300, '3 modules · 2 internal edges · stable logical ports', 11.5, 'fill="#6a7c82"');
  return s + '</g>';
}
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="840" viewBox="0 0 1320 840" role="img" aria-labelledby="title desc">';
svg += '<title id="title">同一科研图结构的六种容器样式</title><desc id="desc">科研容器样式研究：仅切换皮肤，保留三个模块、两条内部连接和外部逻辑端口。手绘皮肤使用 Rough.js 4.6.6。</desc>';
svg += `<metadata>${esc(JSON.stringify({ kind: 'research-rendering-probe', dependency: 'roughjs@4.6.6', model, presets: presets.map((x) => x.id) }))}</metadata>`;
svg += `<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8Z" fill="${ink}"/></marker></defs>`;
svg += `<rect width="1320" height="840" fill="#f4f7f8"/><g font-family="Noto Sans CJK SC, sans-serif" fill="${ink}">`;
svg += text(26, 44, '同一结构，六种容器皮肤', 28, 'font-weight="700"');
svg += text(27, 77, '逻辑关系保持不变；边界、标题与填充独立渲染。文字保留为文字。', 15, 'fill="#617981"');
presets.forEach((preset, i) => { svg += card(preset, i); });
svg += text(27, 810, 'FastFigure · 容器样式研究探针 · 手绘示例使用 Rough.js 4.6.6 与固定 seed · 尚未验证目标编辑软件', 12.5, 'fill="#617981"');
svg += '</g></svg>\n';
fs.mkdirSync(out, { recursive: true });
const output = path.join(out, 'container-style-comparison.svg');
fs.writeFileSync(output, svg);
console.log(output);
