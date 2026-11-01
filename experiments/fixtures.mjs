export async function reconstructionFixture(page) {
  const png=await page.evaluate(async()=>{
    await document.fonts.load('20px Inter')
    const c=document.createElement('canvas');c.width=800;c.height=400
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,800,400)
    ctx.fillStyle='#e9f1fb';ctx.strokeStyle='#4c78a8';ctx.lineWidth=1
    ctx.beginPath();ctx.roundRect(40,70,280,220,8);ctx.fill();ctx.stroke()
    ctx.font='20px Inter';ctx.fillStyle='#233247';ctx.fillText('Encoder',70,108)
    ctx.beginPath();ctx.moveTo(80,210);ctx.quadraticCurveTo(130,120,180,210);ctx.bezierCurveTo(200,240,230,240,260,210);ctx.strokeStyle='#4c78a8';ctx.lineWidth=2;ctx.stroke()
    ctx.beginPath();ctx.ellipse(590,185,70,35,0,0,Math.PI*2);ctx.fillStyle='#f2d8c7';ctx.strokeStyle='#9b6240';ctx.lineWidth=1;ctx.fill();ctx.stroke()
    ctx.beginPath();ctx.moveTo(335,185);ctx.lineTo(500,185);ctx.strokeStyle='#334155';ctx.stroke()
    ctx.beginPath();ctx.moveTo(500,185);ctx.lineTo(490,180);ctx.lineTo(490,190);ctx.closePath();ctx.fillStyle='#334155';ctx.fill()
    return c.toDataURL('image/png').split(',')[1]
  })
  return {name:'reconstruction-source.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}
}

