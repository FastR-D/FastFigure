/** Inspect bounded PNG/WebP headers; clients already decode the source before cropping. */
export function rasterDimensions(dataUrl:string){
  const bytes=Buffer.from(dataUrl.split(',')[1]??'','base64')
  if(dataUrl.startsWith('data:image/jpeg;')&&bytes[0]===255&&bytes[1]===216){for(let at=2;at+4<bytes.length;){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++]!;if(marker===217||marker===218)break;if(marker>=208&&marker<=215)continue;const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return{width:bytes.readUInt16BE(at+5),height:bytes.readUInt16BE(at+3)};at+=length}}
  if(dataUrl.startsWith('data:image/png;')&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}
  if(dataUrl.startsWith('data:image/webp;')&&bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length){
    for(let at=12;at+8<=bytes.length;){const length=bytes.readUInt32LE(at+4),start=at+8,end=start+length;if(end>bytes.length)break;const chunk=bytes.toString('ascii',at,at+4)
      if(chunk==='VP8X'&&length>=10)return {width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1}
      if(chunk==='VP8L'&&length>=5&&bytes[start]===0x2f){const bits=bytes.readUInt32LE(start+1);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1}}
      if(chunk==='VP8 '&&length>=10&&bytes[start+3]===0x9d&&bytes[start+4]===1&&bytes[start+5]===0x2a)return {width:bytes.readUInt16LE(start+6)&0x3fff,height:bytes.readUInt16LE(start+8)&0x3fff}
      at=end+(length%2)
    }
  }
  throw new Error('裁片图片头无效，请重新生成图片')
}
