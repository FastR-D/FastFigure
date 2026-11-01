import { expect, it } from 'vitest'
import { rasterDimensions } from './raster'
function webp(kind:string,body:Buffer){const bytes=Buffer.alloc(20+body.length+(body.length%2));bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WEBP',8);bytes.write(kind,12);bytes.writeUInt32LE(body.length,16);body.copy(bytes,20);return `data:image/webp;base64,${bytes.toString('base64')}`}
it('reads PNG and lossy, lossless and extended WebP crop dimensions',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1200,16);png.writeUInt32BE(900,20);expect(rasterDimensions(`data:image/png;base64,${png.toString('base64')}`)).toEqual({width:1200,height:900})
  const lossy=Buffer.alloc(10);lossy.set([0x9d,1,0x2a],3);lossy.writeUInt16LE(1200,6);lossy.writeUInt16LE(900,8);expect(rasterDimensions(webp('VP8 ',lossy))).toEqual({width:1200,height:900})
  const lossless=Buffer.alloc(5);lossless[0]=0x2f;lossless.writeUInt32LE((1199|(899<<14))>>>0,1);expect(rasterDimensions(webp('VP8L',lossless))).toEqual({width:1200,height:900})
  const extended=Buffer.alloc(10);extended.writeUIntLE(1199,4,3);extended.writeUIntLE(899,7,3);expect(rasterDimensions(webp('VP8X',extended))).toEqual({width:1200,height:900})
})
it('rejects mismatched media, truncated and corrupt crop headers',()=>{
  for(const input of ['data:image/png;base64,aGVsbG8=',webp('VP8X',Buffer.alloc(2)),webp('VP8 ',Buffer.alloc(10)),webp('JUNK',Buffer.alloc(10)).replace('image/webp','image/png')])expect(()=>rasterDimensions(input)).toThrow('图片头')
})
