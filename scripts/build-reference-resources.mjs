// Offline, pinned-source conversion. No upstream code is executed in the browser.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
const sources=JSON.parse(readFileSync(new URL('../third-party/sources.json',import.meta.url),'utf8'))
function source(project,path){const bytes=readFileSync(new URL(`../third-party/${project}/${path}`,import.meta.url));if(createHash('sha256').update(bytes).digest('hex')!==sources[project].files[path])throw new Error(`Source fingerprint changed: ${project}/${path}`);return bytes.toString()}
function output(path,value){const file=new URL(`../${path}`,import.meta.url);mkdirSync(new URL('.',file),{recursive:true});writeFileSync(file,JSON.stringify(value)+'\n')}
const retrieval=source('topconf','forge/retrieval.mjs'),vectorCheck='IE.length !== ids.length * 512 || TE.length !== ids.length * 512 ||'
for(const file of ['reconstruction-core.mjs','reconstruction-pipeline.mjs','editable-native.mjs','container-geometry.mjs'])writeFileSync(new URL(`../src/vendor/topconf/${file}`,import.meta.url),source('topconf',`forge/${file}`))
if(!retrieval.includes(vectorCheck))throw new Error('Upstream retrieval shape changed; review the CPU adapter')
writeFileSync(new URL('../src/vendor/topconf/retrieval.mjs',import.meta.url),'// Adapted from Top-Conf Figure Gallery (MIT). See third-party/topconf/LICENSE and docs/development/reference-ecosystem.md.\n// FastFigure: vector arrays are optional for title/author-only CPU retrieval.\n'+retrieval.replace(vectorCheck,'(IE && IE.length !== ids.length * 512) || (TE && TE.length !== ids.length * 512) ||'))
const figures=JSON.parse(source('topconf','data/figures.json'))
output('public/resources/topconf/figures.json',{version:1,commit:sources.topconf.commit,figures})
for(const [project,files] of [['topconf',['LICENSE','NOTICE.md','IMAGES_POLICY.md']],['nature',['LICENSE','DERIVATIVE_NOTICE.md']]])for(const file of files){const folder=project==='nature'?'figureforge':'topconf',path=new URL(`../public/resources/${folder}/${file}`,import.meta.url);mkdirSync(new URL('.',path),{recursive:true});writeFileSync(path,source(project,file))}
const context=vm.createContext({window:{}})
vm.runInContext(source('nature','figureforge/js/templates.js'),context,{timeout:3000})
const unavailable={violin:'上游模板含负尺寸矩形，待校正数据几何','comp-ab':'上游模板含负尺寸矩形，待校正数据几何'}
const templates=Object.entries({...context.window.getChartTemplates(),...context.window.getLayoutTemplates()}).map(([id,t])=>{const svg=t.svg.replaceAll("'Arial',sans-serif",'MiSans,MiSans,sans-serif');return {id,name:t.name,svg,sha256:createHash('sha256').update(svg).digest('hex'),...(unavailable[id]?{unavailable:unavailable[id]}:{})}})
output('public/resources/figureforge/templates.json',{version:1,commit:sources.nature.commit,templates})
vm.runInContext(source('nature','figureforge/js/palettes.js'),context,{timeout:3000})
const palettes=vm.runInContext('PALETTES',context)
output('src/data/materials/figureforge-palettes.json',Object.entries(palettes).map(([id,p])=>({id:`figureforge-${id.replaceAll('_','-')}`,title:p.name,family:'FigureForge',kind:'categorical',colors:p.defaultSequence,source:'FigureForge',sourceUrl:'https://jing1312.github.io/nature-figure-skill/figureforge/',license:'MIT',tags:['科研',p.description]})))
console.log(`Pinned resources: ${figures.length} paper records, ${templates.length} templates, ${Object.keys(palettes).length} palettes`)
