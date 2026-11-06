import { chromium } from 'playwright-core'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases, datasetVersion } from '../benchmarks/cs-figures-v1/cases.mjs'

const root=fileURLToPath(new URL('..',import.meta.url)),directory=join(root,'benchmarks',datasetVersion),base=process.env.FASTFIGURE_TEST_URL??'http://127.0.0.1:5178',cache=join(homedir(),'.cache/ms-playwright')
const candidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromium.executablePath()]
if(existsSync(cache))for(const dir of readdirSync(cache).filter(x=>/^chromium-\d+$/.test(x)).sort().reverse())candidates.push(join(cache,dir,'chrome-linux64/chrome'),join(cache,dir,'chrome-linux/chrome'))
const browser=await chromium.launch({headless:true,executablePath:candidates.find(p=>p&&existsSync(p))}),manifest={version:datasetVersion,rights:'Self-authored test assets; no separate public redistribution license declared.',provenance:'Self-authored synthetic CS diagrams, no paper images; rendered independently of FigureIR and reconstruction code.',renderer:await browser.version(),cases:[]},previews=[]
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
mkdirSync(join(directory,'sources'),{recursive:true});mkdirSync(join(directory,'images'),{recursive:true})
try{
  const page=await browser.newPage({viewport:{width:1000,height:600},deviceScaleFactor:2});await page.goto(base);await page.getByTestId('figure-canvas').waitFor()
  await page.evaluate(async()=>{await document.fonts.load('400 16px MiSans');await document.fonts.load('600 16px MiSans');await document.fonts.load('16px MiSans');document.querySelector('#app')?.remove();document.body.style.cssText='margin:0;background:white;overflow:hidden'})
  for(const sample of cases){
    writeFileSync(join(directory,'sources',`${sample.id}.svg`),sample.svg)
    const objects=await page.evaluate(({svg,labels})=>{
      document.querySelector('#benchmark-source')?.remove();const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;root.id='benchmark-source';root.style.display='block';document.body.append(root);const origin=root.getBoundingClientRect()
      return labels.map(label=>{const el=root.querySelector(`[data-truth-id="${label.id}"]`),box=el.getBoundingClientRect(),result={...label,box:{x:box.x-origin.x,y:box.y-origin.y,w:box.width,h:box.height}}
        const style=getComputedStyle(el);result.fill=style.fill;result.stroke=style.stroke
        if(label.kind!=='text'){const length=el.getTotalLength(),samples=Array.from({length:65},(_,i)=>{const p=el.getPointAtLength(length*i/64);return{x:p.x,y:p.y}});result.samples=samples;if(label.arrow){result.tip=samples.at(-1);const previous=samples.at(-2),last=result.tip;const norm=Math.hypot(last.x-previous.x,last.y-previous.y);result.direction={x:(last.x-previous.x)/norm,y:(last.y-previous.y)/norm}}}
        return result
      })
    },sample)
    const png=await page.locator('#benchmark-source').screenshot({path:join(directory,'images',`${sample.id}.png`),animations:'disabled'});previews.push({id:sample.id,png:png.toString('base64')})
    manifest.cases.push({id:sample.id,title:sample.title,split:sample.split,canvas:{width:1000,height:600},image:{path:`images/${sample.id}.png`,width:2000,height:1200,sha256:sha(png)},source:{path:`sources/${sample.id}.svg`,sha256:sha(sample.svg)},objects})
  }
  manifest.fonts=['misans-regular.woff2','misans-semibold.woff2'].map(name=>({name,sha256:sha(readFileSync(join(root,'public/fonts',name)))}))
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2))
  const sheet=await page.evaluate(async previews=>{const c=document.createElement('canvas');c.width=1500;c.height=688;const ctx=c.getContext('2d');ctx.fillStyle='#edf0f5';ctx.fillRect(0,0,c.width,c.height);ctx.font='17px MiSans';for(let i=0;i<previews.length;i++){const img=new Image();img.src=`data:image/png;base64,${previews[i].png}`;await img.decode();const x=i%3*500,y=Math.floor(i/3)*344;ctx.fillStyle='#29435c';ctx.fillText(previews[i].id,x+12,y+27);ctx.drawImage(img,x,y+36,500,300)}return c.toDataURL('image/png').split(',')[1]},previews)
  mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results','reconstruction-benchmark-contact.png'),Buffer.from(sheet,'base64'))
  console.log(JSON.stringify(manifest.cases.map(c=>({id:c.id,split:c.split,objects:c.objects.length,texts:c.objects.filter(o=>o.kind==='text').length,arrows:c.objects.filter(o=>o.arrow).length}))))
}finally{await browser.close()}
