// Explicit model experiment. --plan pauses for inspection before a separate generation call.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright-core';
const { values: args } = parseArgs({ options: { output: { type: 'string' }, model: { type: 'string' }, plan: { type: 'boolean', default: false }, 'color-roles': { type: 'boolean', default: false }, style: { type: 'string' } } });
assert(args.output, 'Pass a fresh --output');
const output = resolve(args.output), sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert(!existsSync(output));
mkdirSync(output, { recursive: true });
const save = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir: join(output, '.vite'), server: { host: '127.0.0.1', port: 0, watch: null } });
let service, browser, run, planningRun, calls = 0;
try {
    const { HarnessService } = await server.ssrLoadModule('/server/harness/service.ts'), { CodexAdapter } = await server.ssrLoadModule('/server/harness/adapters.ts'), { buildRecipe } = await server.ssrLoadModule('/src/data/recipes.ts'), { buildDataChart } = await server.ssrLoadModule('/src/core/dataChart.ts'), { chartExample } = await server.ssrLoadModule('/src/core/dataChartTable.ts'), { createBlank } = await server.ssrLoadModule('/src/core/model.ts'), { parseAsset, captureComponent } = await server.ssrLoadModule('/src/core/assets.ts'), { addComponentPort } = await server.ssrLoadModule('/src/core/componentPorts.ts');
    const probe = new CodexAdapter();
    let status;
    try {
        status = await probe.status();
    }
    finally {
        probe.dispose();
    }
    save('provider-status.json',status);
    assert.equal(status.state, 'ready');
    assert(!status.version?.includes('fixture'));
    const { routeFigure } = await server.ssrLoadModule('/src/core/routing.ts');
    const { styleAssetSchema } = await server.ssrLoadModule('/src/core/styleAssetContract.ts');
    const styleReference=args.style?styleAssetSchema.parse(JSON.parse(readFileSync(resolve(args.style),'utf8'))):undefined;
    if(styleReference)save('style.fastfigure-style.json',styleReference);
    const head = buildRecipe('mlp', { inputs: 3, hiddenLayers: 2, hidden: 3, outputs: 2 });
    head.id = 'authored-mlp-head';
    head.name = 'Authored MLP head';
    head.description = 'Fixed 3–3–3–2 neuron head with two declared group interfaces. Preserve its internal structure.';
    const root = head.figure.containers[0];
    root.role = 'component';
    root.visual = { fill: 'none', stroke: 'none' };
    head.figure.style = { ...head.figure.style, preset: 'precise', roughness: 0, paletteId: 'figureforge-publication-soft' };
    if(args['color-roles']){head.figure.style.colorIndex=1;for(const node of head.figure.nodes)if(node.kind==='neuron')node.visual={...node.visual,colorIndex:node.id.startsWith('neuron-0-')?0:node.id.startsWith('neuron-3-')?2:1};}
    head.figure.nodes.push({ id: 'head-title', parentId: 'stage', kind: 'text', label: 'MLP head', x: 24, y: 12, width: 300, height: 24, textStyle: { family: 'Inter', size: 19, weight: 600, color: '#253447' } });
    addComponentPort(head.figure, 'stage', 'input', 'features-port');
    addComponentPort(head.figure, 'stage', 'output', 'scores-port');
    const asset = parseAsset(head), savedAsset = JSON.stringify(asset);
    save('source.fastfigure-component.json', asset);
    const sources = [buildRecipe('pipeline', { stages: 3, direction: 'row' }), buildDataChart(chartExample('bar')), asset], titles = ['Authored horizontal flow', 'Authored palette and whitespace', 'Authored MLP structure'], purposes = ['layout', 'style', 'content'];
    await server.listen();
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page.getByTestId('figure-canvas').waitFor();
    const figure = createBlank(), sourceBytes = [];
    for (let i = 0; i < 3; i++) {
        const original = sources[i].figure, viewport = original.containers[0], width = 1000, height = Math.round(viewport.height / viewport.width * width), png = await page.evaluate(async ({ figure, viewport, width, height }) => { const { rasterizeFigure } = await import('/src/core/figureRaster.ts'), { canvas } = await rasterizeFigure(figure, viewport, width, height); return canvas.toDataURL('image/png').split(',')[1]; }, { figure: original, viewport, width, height }), bytes = Buffer.from(png, 'base64');
        sourceBytes.push(bytes);
        writeFileSync(join(output, `reference-${i + 1}.png`), bytes);
        figure.references.push({ id: `reference-${i + 1}`, title: titles[i], citation: 'Self-authored development image rendered from FastFigure native objects', fileName: `reference-${i + 1}.png`, sha256: sha(bytes), pixelWidth: width, pixelHeight: height, dataUrl: `data:image/png;base64,${png}`, placement: { x: 50, y: 100, width: 900, height: 900 * height / width } });
    }
    const referenceInputs = figure.references.map((ref, i) => ({ id: ref.id, purpose: purposes[i] })), savedFigure = JSON.stringify(figure);
    service = new HarnessService(() => { const adapter = new CodexAdapter(); return { kind: adapter.kind, status: () => adapter.status(), dispose: () => adapter.dispose(), send: async (turn) => { calls++; assert.equal(turn.images?.length, 3); turn.images.forEach((image, i) => assert.equal(sha(Buffer.from(image.dataUrl.split(',')[1], 'base64')), sha(sourceBytes[i]))); writeFileSync(join(output, args.plan?`prompt-${calls===1?'plan':'generate'}.txt`:'prompt.txt'), turn.content); return adapter.send(turn); } }; });
    const session = service.createSession('codex', 'Multiple reference composition'), input = { sessionId: session.id, figure, referenceInputs, selectedIds: [], catalogue: [{ kind: 'asset', asset }], ...(args.model ? { model: args.model } : {}), content: '请生成一个计算机论文风格的自制方法示意：输入特征向量 → 给定的 MLP 分类头 → 两个类别分数。请复用我选定的 MLP 素材，保留 3–3–3–2 神经元、内部连接和命名接口；不要用一个写着 MLP 的方框替代内部结构，也不增加 softmax、训练或损失等未提供内容。图 1 只参考从左到右的构图，图 2 只参考柔和配色、字体和留白，不参考其中柱状图或数值，图 3 对照 MLP 的结构语义。输入与输出用真实的特征 / 张量图示，文字简短。可将素材等比缩放至约 0.75 放在中央，两侧留足连接空间；整体放入一个完整的图件容器。逐图说明采用与不采用的部分以及不确定性。只返回待审阅候选，不写文件、不执行命令。' };
    if(styleReference)input.styleReference=styleReference;
    if(args['color-roles']){assert(args.plan&&styleReference?.paletteId==='figureforge-publication-soft','Color roles scenario requires --plan and Publication Soft style');input.content+=' 这份原生 MLP 使用不同语义色槽区分输入层、隐藏处理层和输出层。请逐角色规划颜色映射，让输入层青色、隐藏处理层蓝色、输出层橙色，内部连接随处理色；使用素材 colorSlots 清单，不把全组统一成单色，不改节点标签、固定 RGB 或结构。';}
    if(args.plan){input.intent='plan';input.content=input.content.replace('只返回待审阅候选，不写文件、不执行命令。','本轮只返回可审阅的绘图方案，不生成图体；明确采用后才绘制，不写文件、不执行命令。');}
    save('input.json', input);
    const paths = ['src/core/referenceInputs.ts', 'src/core/harness.ts', 'src/core/model.ts', 'src/core/assets.ts', 'src/core/catalogue.ts', 'src/core/componentPorts.ts', 'src/core/compositionPlan.ts','src/core/compositionPlanContract.ts','src/core/styleAsset.ts','src/core/styleAssetContract.ts','src/core/figureTextCheck.ts','src/core/svg.ts','src/core/containerSurface.ts','src/core/containerColor.ts','src/core/colorMapping.ts','src/core/colorMappingContract.ts','src/core/geometry.ts','src/core/paint.ts','src/core/typography.ts','src/components/figure/FigureRenderer.ts', 'server/harness/service.ts', 'server/harness/adapters.ts', 'experiments/multi-reference-live.mjs'];
    mkdirSync(join(output, 'source-snapshots'));
    save('source-sha256.json', Object.fromEntries(paths.map(path => { copyFileSync(path, join(output, 'source-snapshots', path.replaceAll('/', '__'))); return [path, sha(readFileSync(path))]; })));
    if(args.plan){
        planningRun=service.start(input);console.log(JSON.stringify({phase:'planning',runId:planningRun.id,output}));await planningRun.done;
        const planned=service.summary(planningRun.id);save('planning-run.json',{id:planningRun.id,status:planningRun.status,summary:planned,events:planningRun.events});writeFileSync(join(output,'planning-raw-response.txt'),planningRun.events.filter(e=>e.type==='assistant.delta').map(e=>e.text??'').join(''));
        assert.equal(planningRun.status,'completed',planned.error);assert.equal(planned.hasProposal,false);assert.equal(planned.compositionRecord.plan.status,'ready');save('plan.json',planned.compositionRecord);
        const components=planned.compositionRecord.plan.sections.flatMap(s=>s.components);assert.equal(components.length,1);assert.equal(components[0].key,'asset:authored-mlp-head');if(args['color-roles'])assert(components[0].colorMap?.length,'Color roles plan must declare reviewed source-to-target mappings');
        console.log(JSON.stringify({phase:'review-plan',runId:planningRun.id,title:planned.compositionRecord.plan.title,sections:planned.compositionRecord.plan.sections.map(s=>({id:s.id,title:s.title,components:s.components})),command:`generate ${planningRun.id}`,output}));
        const lines=createInterface({input:process.stdin});let timer;
        const command=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Plan inspection timed out without a generation command')),600_000);lines.once('line',resolve);lines.once('close',()=>reject(new Error('Plan saved; no explicit generation command received')))}).finally(()=>{clearTimeout(timer);lines.close()});
        assert.equal(command.trim(),`generate ${planningRun.id}`,'Inspect the plan, then explicitly enter the matching generation command');save('adoption.json',{planRunId:planningRun.id,at:new Date().toISOString(),reviewer:'assistant developer; not a human study',command});
    }
    const generationInput=args.plan?{...input,intent:undefined,styleReference:undefined,referenceInputs:undefined,catalogue:[],compositionPlanRunId:planningRun.id,content:'请按已采用方案生成可编辑候选。保留全部原生 MLP 结构、文字和命名接口；输入输出与注释按方案绘制，不增加未提供的科学内容。'}:input;
    save('generation-input.json',generationInput);
    run = service.start(generationInput);
    console.log(JSON.stringify({ phase: 'started', runId: run.id, output }));
    await run.done;
    const summary = service.summary(run.id);
    save('run.json', { id: run.id, status: run.status, summary, events: run.events });
    writeFileSync(join(output, 'raw-response.txt'), run.events.filter(e => e.type === 'assistant.delta').map(e => e.text ?? '').join(''));
    assert.equal(run.status, 'completed', summary.error);
    assert.equal(calls, args.plan?2:1);
    assert.equal(JSON.stringify(asset), savedAsset);
    assert.equal(JSON.stringify(figure), savedFigure);
    assert.equal(summary.referenceUse.length, 3);
    assert.deepEqual(summary.referenceInputs.map(r => r.purpose), purposes);
    for (let i = 0; i < 3; i++) {
        assert.equal(summary.referenceInputs[i].inputSha256, sha(sourceBytes[i]));
        assert.equal(summary.referenceUse[i].sha256, sha(sourceBytes[i]));
        assert.equal(sha(service.referenceImage(run.id, i + 1).bytes), sha(sourceBytes[i]));
    }
    const candidate = run.events.at(-1).proposal;
    assert(candidate);
    save('candidate.fastfigure.json', candidate);
    const use = summary.components.find(c => c.componentKey === 'asset:authored-mlp-head');
    assert(use, 'The selected head must be reused');
    const group = candidate.containers.find(c => c.id === use.instanceId);
    assert(group?.component);
    assert.equal(candidate.nodes.filter(n => n.parentId === group.id && n.kind === 'neuron').length, 11);
    assert.equal(candidate.edges.filter(e => candidate.nodes.some(n => n.parentId === group.id && n.id === e.source) && candidate.nodes.some(n => n.parentId === group.id && n.id === e.target)).length, 24);
    assert.equal(candidate.nodes.filter(n => n.interfaceFor === group.id && n.socket).length, 2);
    const headNodes=candidate.nodes.filter(n=>n.parentId===group.id),scale=group.width/root.width;
    assert.equal(headNodes.length,asset.figure.nodes.length);
    headNodes.forEach((node,i)=>{const source=asset.figure.nodes[i];assert.equal(node.kind,source.kind);assert.equal(node.label,source.label);assert.deepEqual(node.socket,source.socket);for(const key of ['colorIndex','fill','stroke','tone','textTone','opacity','fillOpacity','strokeOpacity'])assert.equal(node.visual?.[key],source.visual?.[key]);assert.equal(node.textStyle?.family,source.textStyle?.family);assert(Math.abs(node.x-group.x-source.x*scale)<1e-6);assert(Math.abs(node.y-group.y-source.y*scale)<1e-6);assert(Math.abs(node.width-source.width*scale)<1e-6);assert(Math.abs(node.height-source.height*scale)<1e-6)});
    if(args.plan)assert.deepEqual(candidate.compositionPlans,[service.summary(planningRun.id).compositionRecord]);
    if(styleReference){assert.deepEqual(candidate.styleUses.at(-1).asset,styleReference);assert.equal(candidate.style.preset,styleReference.preset);assert.equal(candidate.style.paletteId,styleReference.paletteId)}
    const inner = new Set(candidate.nodes.filter(n => n.parentId === group.id).map(n => n.id)), external = candidate.edges.filter(e => inner.has(e.source) !== inner.has(e.target));
    assert.equal(external.length, 2);
    const incoming = external.find(e => inner.has(e.target)), outgoing = external.find(e => inner.has(e.source));
    assert(incoming && outgoing);
    assert.equal(candidate.nodes.find(n => n.id === incoming.target)?.socket?.key, 'input-1');
    assert.equal(incoming.targetPort, 'left');
    assert.equal(candidate.nodes.find(n => n.id === outgoing.source)?.socket?.key, 'output-1');
    assert.equal(outgoing.sourcePort, 'right');
    save('routing-report.json', [...routeFigure(candidate)].map(([id, route]) => ({ id, ...route })));
    const adopted = summary.referenceUse.filter(r => r.decision === 'use');
    assert.deepEqual(candidate.referenceUses ?? [], adopted);
    const captured = captureComponent(candidate, 'stage', 'Multi-reference candidate');
    assert(adopted.every(ref => captured.sources.some(s => s.image?.sha256 === ref.sha256 && s.purpose === ref.purpose)));
    save('captured.fastfigure-component.json', captured);
    const png = await page.evaluate(async (doc) => { const { rasterizeFigure } = await import('/src/core/figureRaster.ts'), root = doc.containers.find(c => c.id === 'stage'), { canvas } = await rasterizeFigure(doc, root, 1200, Math.round(root.height / root.width * 1200)); return canvas.toDataURL('image/png').split(',')[1]; }, candidate);
    writeFileSync(join(output, 'candidate.png'), Buffer.from(png, 'base64'));
    assert.equal(summary.review, 'pending');
    if(styleReference)assert.deepEqual(captured.figure.styleUses.at(-1).asset,styleReference);
    let theme;
    if(args.plan){const {resolveStyle}=await server.ssrLoadModule('/src/core/geometry.ts'),{figurePaint}=await server.ssrLoadModule('/src/core/paint.ts'),component=service.summary(planningRun.id).compositionRecord.plan.sections.flatMap(s=>s.components)[0],actual=resolveStyle(candidate,group.id);assert.equal(use.instanceId,component.id);if(component.colorIndex!==undefined){assert.equal(actual.colorIndex,component.colorIndex);assert.equal(actual.paletteId,service.summary(planningRun.id).compositionRecord.plan.style.paletteId);theme={instanceId:component.id,paletteId:actual.paletteId,colorIndex:actual.colorIndex,color:figurePaint(actual).color};}}
    let colorRoles;
    if(args['color-roles']){
        const {resolveStyle}=await server.ssrLoadModule('/src/core/geometry.ts'),{figurePaint}=await server.ssrLoadModule('/src/core/paint.ts'),{exportSvg}=await server.ssrLoadModule('/src/core/svg.ts'),expected={0:'#66C2A5',1:'#8DA0CB',2:'#FC8D62'},svg=exportSvg(candidate),neurons=headNodes.filter(n=>n.kind==='neuron');
        for(const node of neurons)assert.equal(figurePaint(resolveStyle(candidate,node.parentId),node.visual.colorIndex).color,expected[node.visual.colorIndex]);
        const stroke=figurePaint(resolveStyle(candidate,group.id)).ink;assert.equal(figurePaint(resolveStyle(candidate,group.id)).color,'#8DA0CB');
        const rendered=await page.evaluate(({svg,ids,stroke})=>{const xml=new DOMParser().parseFromString(svg,'image/svg+xml');return{neurons:ids.filter(id=>Array.from(xml.querySelectorAll('[data-object-id]')).find(g=>g.getAttribute('data-object-id')===id)?.querySelector('ellipse')).length,blueInternalEdges:Array.from(xml.querySelectorAll('[data-edge-id]')).filter(e=>e.getAttribute('data-edge-id').startsWith(''+ids[0].split('-object-')[0]+'-object-')&&e.getAttribute('stroke')===stroke).length}}, {svg,ids:neurons.map(n=>n.id),stroke});
        assert.equal(rendered.neurons,11);assert.equal(rendered.blueInternalEdges,24);writeFileSync(join(output,'candidate.svg'),svg);colorRoles={...rendered,inputColor:expected[0],processingColor:expected[1],outputColor:expected[2],semanticColorFieldsPreserved:true,mapping:use.colorMap};
    }
    const metrics = { runId: run.id, calls,...(colorRoles?{colorRoles}:{}),...(theme?{theme}:{}),...(args.plan?{planRunId:planningRun.id,planSeconds:(Date.parse(service.summary(planningRun.id).finishedAt)-Date.parse(service.summary(planningRun.id).createdAt))/1000,explicitGenerationAfterInspection:true}:{}), seconds: (Date.parse(summary.finishedAt) - Date.parse(summary.createdAt)) / 1000, version: status.version, model: args.model ?? 'CLI configured default; identity not reported', referenceInputs: summary.referenceInputs, referenceUse: summary.referenceUse, component: use, headNeurons: 11,headGeometryAndLabelsPreserved:true, headInternalEdges: 24, namedInterfaces: 2,...(styleReference?{styleSnapshotRetained:true,styleName:styleReference.name}:{}),inputImageOrderAndHashesVerified: true, inputSourcesUnchanged: true, sourceComponentUnchanged: true, captureRetainsAdoptedSources: true, review: summary.review, note: 'Three self-authored development references and one native material, not a real-paper or independent visual-quality evaluation; no automatic retry or application' };
    save('metrics.json', metrics);
    console.log(JSON.stringify({ runId: run.id, calls, seconds: metrics.seconds, adopted: adopted.length, review: summary.review, output }));
}
catch (e) {
    save('failure.json', { message: e.message, runId: run?.id,planRunId:planningRun?.id, calls });
    throw e;
}
finally {
    await service?.dispose();
    await browser?.close();
    await server.close();
}
