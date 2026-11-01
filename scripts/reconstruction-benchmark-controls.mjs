// Scoring controls from independent source SVG geometry, never model-performance results.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),directory=join(root,'benchmarks/cs-figures-v1'),manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8')),base=process.env.FASTFIGURE_TEST_URL??'http://127.0.0.1:5178',cache=join(homedir(),'.cache/ms-playwright'),candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()]
if(existsSync(cache))for(const dir of readdirSync(cache).filter(x=>/^chromium-\d+$/.test(x)).sort().reverse())candidates.push(join(cache,dir,'chrome-linux64/chrome'),join(cache,dir,'chrome-linux/chrome'))
const browser=await chromium.launch({headless:true,executablePath:candidates.find(p=>p&&existsSync(p))})
try{
  const page=await browser.newPage({viewport:{width:1000,height:600}});await page.goto(base);await page.getByTestId('figure-canvas').waitFor();await page.evaluate(async()=>{await document.fonts.load('400 16px Inter');await document.fonts.load('600 16px Inter');await document.fonts.load('16px MiSans');document.querySelector('#app')?.remove();document.body.style.margin='0'})
  for(const sample of manifest.cases){const scene=await page.evaluate(svg=>{
    document.querySelector('#control-source')?.remove();const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;root.id='control-source';document.body.append(root);const origin=root.getBoundingClientRect(),color=s=>s==='none'?'none':`#${s.match(/[\d.]+/g).slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('')}`
    return {canvas:{width:1000,height:600},regions:[],nodes:[...root.querySelectorAll('[data-truth-id]')].map(el=>{const style=getComputedStyle(el),base={id:el.getAttribute('data-truth-id'),version:0,fill:color(style.fill),stroke:color(style.stroke),strokeWidth:parseFloat(style.strokeWidth)},number=n=>Number(el.getAttribute(n))
      if(el.tagName==='text'){const b=el.getBoundingClientRect(),matrix=el.getCTM(),x=number('x'),y=number('y'),anchor=new DOMPoint(x,y).matrixTransform(matrix);return {...base,type:'text',x:b.x-origin.x,y:b.y-origin.y,w:b.width,h:b.height,text:el.textContent,fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight),fontFamily:'Inter',align:style.textAnchor==='middle'?'center':style.textAnchor==='end'?'right':'left',anchor:{x:(anchor.x-(b.x-origin.x))/b.width,y:(anchor.y-(b.y-origin.y))/b.height},matrix:[matrix.a,matrix.b,matrix.c,matrix.d]}}
      if(el.tagName==='rect')return {...base,type:'rect',x:number('x'),y:number('y'),w:number('width'),h:number('height'),rx:number('rx')}
      if(el.tagName==='ellipse')return {...base,type:'ellipse',x:number('cx')-number('rx'),y:number('cy')-number('ry'),w:number('rx')*2,h:number('ry')*2}
      if(el.tagName==='polyline')return {...base,type:'polyline',points:el.getAttribute('points'),arrow:el.hasAttribute('marker-end')}
      return {...base,type:'path',d:el.getAttribute('d'),arrow:el.hasAttribute('marker-end')}
    })}
  },readFileSync(join(directory,sample.source.path),'utf8'))
    for(const mode of ['oracle','missing-text','missing-strokes','missing-arrows']){const value=structuredClone(scene);if(mode==='missing-text')value.nodes=value.nodes.filter(n=>n.type!=='text');if(mode==='missing-strokes')value.nodes=value.nodes.filter(n=>!n.arrow&&!(n.type==='polyline'||n.type==='path'&&n.fill==='none'));if(mode==='missing-arrows')value.nodes.forEach(n=>{if(n.arrow)n.arrow=false});const output=join(root,'test-results/benchmark-controls',mode);mkdirSync(output,{recursive:true});writeFileSync(join(output,`${sample.id}.json`),JSON.stringify({scene:value,referenceSha256:sample.image.sha256,control:mode,note:'Derived from source SVG; scoring calibration only, not a model result.'},null,2))}
  }
  console.log('Created independent SVG oracle and deliberate omission controls for all six cases. No model calls.')
}finally{await browser.close()}
