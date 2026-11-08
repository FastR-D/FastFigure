#!/usr/bin/env python3
"""Verify the human layout-reading ledger; optionally fetch hash-pinned originals and rebuild sheets.
Requires Pillow for --sheets and rsvg-convert for SVG rendering. No OCR or automatic review labels.
"""
import argparse,concurrent.futures,hashlib,json,pathlib,subprocess,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--fetch',action='store_true');p.add_argument('--sheets',action='store_true');p.add_argument('--cache',type=pathlib.Path,default=ROOT/'test-results/gallery-study');args=p.parse_args()
folder=ROOT/'docs/research/gallery-study';top=json.loads((folder/'topconf.json').read_text());forge=json.loads((folder/'figureforge.json').read_text());index=json.loads((ROOT/'public/resources/topconf/figures.json').read_text())['figures'];templates=json.loads((ROOT/'public/resources/figureforge/templates.json').read_text())['templates']
assert len({r['id'] for r in top['images']})==len(top['images'])==len(index),'Duplicate or missing TopConf image'
assert {r['id']:r['path'] for r in top['images']}=={r['id']:r['image'] for r in index},'TopConf paths differ from pinned index'
for i,(r,f) in enumerate(zip(top['images'],index)):
 assert r['id']==f['id'] and r['sheet']==i//48+1 and r['cell']==i%48+1,'Review order changed'
 assert r['visual'] and all(c in top['legend'] for c in r['visual']),'Missing human visual annotation'
files=[r for r in forge['images'] if 'path' in r];ts=[r for r in forge['images'] if 'template' in r]
assert len(files)==forge['files']==len({r['path'] for r in files})
assert {r['template']:r['sha256'] for r in ts}=={r['id']:r['sha256'] for r in templates},'Template ledger differs from pinned resources'
for r in [*top['images'],*forge['images']]:assert len(r['sha256'])==64 and set(r['sha256'])<=set('0123456789abcdef')
print(f"Ledger complete: {len(top['images'])} TopConf images; {len(files)} FigureForge files + {len(ts)} templates.")
if not(args.fetch or args.sheets):raise SystemExit()
jobs=[('topconf',r,top['commit']) for r in top['images']]+[('nature',r,forge['commit']) for r in files]
repos={'topconf':'qwdwqfwq/topconf-paper-figure-gallery','nature':'jing1312/nature-figure-skill'}
def original(source,r):return args.cache/'originals'/source/r['path']
def fetch(job):
 source,r,commit=job;dest=original(source,r);dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()==r['sha256']:return
 if not args.fetch:raise RuntimeError(f'Missing/hash mismatch: {dest}; use --fetch')
 url=f"https://raw.githubusercontent.com/{repos[source]}/{commit}/{r['path']}"
 error=None
 for _ in range(3):
  try:
   data=urllib.request.urlopen(url,timeout=45).read()
   if hashlib.sha256(data).hexdigest()!=r['sha256']:raise RuntimeError(f'Hash mismatch: {url}')
   dest.write_bytes(data);return
  except Exception as cause:error=cause
 raise RuntimeError(f'Cannot fetch {url}: {error}')
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:list(pool.map(fetch,jobs))
print('All cached originals match the recorded SHA-256.')
if not args.sheets:raise SystemExit()
from PIL import Image,ImageOps,ImageDraw,ImageFont
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
def raster(file,key):
 if file.suffix.lower()!='.svg':return file
 output=args.cache/'rendered'/f'{key}.png';output.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['rsvg-convert','-w','1800',str(file),'-o',str(output)],check=True);return output
def sheets(items,name,per_page,cols):
 target=args.cache/'sheets'/name;target.mkdir(parents=True,exist_ok=True)
 for start in range(0,len(items),per_page):
  sheet=Image.new('RGB',(cols*640,((per_page+cols-1)//cols)*342),'#ccd2d9');d=ImageDraw.Draw(sheet)
  for i,(label,path) in enumerate(items[start:start+per_page]):
   x=i%cols*640;y=i//cols*342;d.rectangle((x+2,y+2,x+638,y+340),fill='white');d.text((x+8,y+4),f'{start+i+1:04d} {label}',font=font,fill='black')
   with Image.open(path) as im:
    im=im.convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);thumb=ImageOps.contain(bg.convert('RGB'),(624,304));sheet.paste(thumb,(x+(640-thumb.width)//2,y+30+(304-thumb.height)//2))
  sheet.save(target/f'{start//per_page+1:03d}.jpg',quality=94)
sheets([(r['id'],original('topconf',r)) for r in top['images']],'topconf',48,6)
ordered=sorted([r for r in forge['images'] if 'sheet'in r],key=lambda r:(r['sheet'],r['cell']));views=[]
for r in ordered:
 if 'template'in r:
  t=next(t for t in templates if t['id']==r['template']);path=args.cache/'templates'/f"{t['id']}.svg";path.parent.mkdir(parents=True,exist_ok=True);path.write_text(t['svg']);label='template-'+t['id']
 else:path=original('nature',r);label=path.stem
 views.append((label,raster(path,label)))
sheets(views,'forge-review',12,3)
print('Rebuilt review sheets. Atlas and five full gallery plates remain available in originals/nature/.')
