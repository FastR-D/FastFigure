// Render the native gallery-derived assets with the production renderer and actual browser fonts.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const output=join(process.cwd(),'docs/research/assets/gallery-study');mkdirSync(output,{recursive:true});
const cache=join(homedir(),'.cache/ms-playwright');
const candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()];
if(existsSync(cache))for(const n of readdirSync(cache).filter(n=>/^chromium-\d+$/.test(n)).sort().reverse())candidates.push(join(cache,n,'chrome-linux64/chrome'),join(cache,n,'chrome-linux/chrome'));
const executablePath=candidates.find(p=>p&&existsSync(p));assert(executablePath,'Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH');
const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:true}});let browser;
try{
 await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath});const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1});
 await page.goto(base);await page.getByTestId('figure-canvas').waitFor();
 const assets=await page.evaluate(async()=>{
  const {galleryBenchmarks}=await import('/src/data/galleryBenchmarks.ts'),{galleryPrimitives}=await import('/src/data/galleryPrimitives.ts'),{exportSceneSvg,exportSvg}=await import('/src/core/svg.ts'),{checkFigureText}=await import('/src/core/figureTextCheck.ts');
  await document.fonts.load('16px MiSans');await document.fonts.load('bold 25px MiSans');await document.fonts.ready;
  return[...galleryPrimitives(),...galleryBenchmarks()].map(asset=>{const root=asset.figure.containers[0];return{asset,svg:exportSvg(asset.figure),scene:exportSceneSvg(asset.figure,{x:0,y:0,width:root.width,height:root.height},root.width,root.height),textCheck:checkFigureText(asset.figure)}});
 });
 const errors=assets.filter(a=>a.textCheck.total);assert.deepEqual(errors.map(a=>({id:a.asset.id,issues:a.textCheck.issues})),[]);
 await page.evaluate(()=>{document.body.innerHTML='<div id="gallery-preview"></div>';document.documentElement.style.cssText='height:auto;overflow:visible';document.body.style.cssText='display:block;height:auto;overflow:visible;margin:0;background:white';});
 for(const {asset,svg,scene}of assets){
  writeFileSync(join(output,`${asset.id}.svg`),svg);writeFileSync(join(output,`${asset.id}.json`),JSON.stringify(asset.figure,null,2)+'\n');
  const root=asset.figure.containers[0];await page.setViewportSize({width:root.width,height:root.height});
  await page.locator('#gallery-preview').evaluate((el,s)=>{el.innerHTML=s;el.style.cssText='display:block;width:max-content;height:max-content;background:white';},scene);
  await page.locator('#gallery-preview').screenshot({path:join(output,`${asset.id}.png`),animations:'disabled'});
 }
 const panels=assets.filter(a=>a.asset.id.startsWith('gallery-benchmark-'));
 await page.setViewportSize({width:1048,height:2000});await page.locator('#gallery-preview').evaluate((el,items)=>{el.style.cssText='display:grid;grid-template-columns:500px 500px;gap:16px;padding:16px;background:#f4f6f4;width:1048px';el.innerHTML=items.map(a=>`<article style="background:white;border:1px solid #d5ded8;border-radius:10px;overflow:hidden">${a.scene.replace('<svg ','<svg style="width:500px;height:290px" ')}</article>`).join('');},panels);
 await page.locator('#gallery-preview').screenshot({path:join(output,'benchmarks-overview.png'),animations:'disabled'});
 await page.setViewportSize({width:960,height:2000});await page.locator('#gallery-preview').evaluate((el,items)=>{el.style.cssText='display:grid;grid-template-columns:440px 440px;gap:16px;padding:16px;background:#f4f6f4;width:928px';el.innerHTML=items.map(a=>`<article style="background:white;border:1px solid #d5ded8;border-radius:10px;overflow:hidden"><div style="font:17px MiSans;padding:8px 12px">${a.asset.name}</div>${a.scene.replace('<svg ','<svg style="width:440px;height:220px" ')}</article>`).join('');},assets.filter(a=>a.asset.id.startsWith('gallery-part-')));
 await page.locator('#gallery-preview').screenshot({path:join(output,'primitives-overview.png'),animations:'disabled'});
 writeFileSync(join(output,'validation.json'),JSON.stringify({renderer:'FastFigure production SVG + Chromium',assets:assets.map(a=>({id:a.asset.id,nodes:a.asset.figure.nodes.length,textCheck:a.textCheck})),scope:'Actual browser fonts; no text overflow. Visual inspection is recorded in gallery-study.md.'},null,2)+'\n');
 console.log(`Rendered ${assets.length} assets; actual-font text checks passed. ${output}`);
}finally{await browser?.close();await server.close();}
