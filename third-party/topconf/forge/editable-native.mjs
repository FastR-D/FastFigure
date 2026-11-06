// Adapted from Top-Conf Figure Gallery (MIT); see third-party/topconf/LICENSE.
// FastFigure retains path geometry helpers; PPTX export and its QA reader are removed.
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const point = (x,y) => ({x:num(x),y:num(y)});

// Normalize SVG commands into lines and cubic Beziers. Arc conversion follows
// the SVG endpoint parameterization and retains editable curve geometry.
export function parseEditablePath(d) {
  const tokens=String(d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
  const size={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  const paths=[];let i=0,cmd='',cur=point(0,0),start=cur,run=null,previous=null,previousKind='';
  const begin=p=>{if(run&&run.commands.length)paths.push(run);run={start:p,commands:[],closed:false};start=p;cur=p;};
  const add=(type,end,c1,c2)=>{if(!run)begin(cur);run.commands.push({type,end,...(c1?{c1,c2}:{})});cur=end;};
  const cubic=(c1,c2,end)=>add('cubic',end,c1,c2);
  const arc=(rx0,ry0,angle,large,sweep,end)=>{
    let rx=Math.abs(rx0),ry=Math.abs(ry0);
    if(!rx||!ry||Math.hypot(end.x-cur.x,end.y-cur.y)<1e-9){add('line',end);return;}
    const phi=angle*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi);
    const dx=(cur.x-end.x)/2,dy=(cur.y-end.y)/2;
    const xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;
    const lambda=xp*xp/(rx*rx)+yp*yp/(ry*ry);
    if(lambda>1){const scale=Math.sqrt(lambda);rx*=scale;ry*=scale;}
    const sign=!!large===!!sweep?-1:1;
    const numerator=Math.max(0,rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp);
    const denominator=rx*rx*yp*yp+ry*ry*xp*xp;
    const factor=sign*Math.sqrt(numerator/Math.max(denominator,1e-12));
    const cxp=factor*rx*yp/ry,cyp=-factor*ry*xp/rx;
    const cx=cos*cxp-sin*cyp+(cur.x+end.x)/2;
    const cy=sin*cxp+cos*cyp+(cur.y+end.y)/2;
    const unit=(x,y)=>point((cos*(x-cx)+sin*(y-cy))/rx,(-sin*(x-cx)+cos*(y-cy))/ry);
    const u=unit(cur.x,cur.y),v=unit(end.x,end.y);
    let theta=Math.atan2(u.y,u.x),delta=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
    if(!sweep&&delta>0)delta-=2*Math.PI;
    if(sweep&&delta<0)delta+=2*Math.PI;
    const count=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/2))),step=delta/count;
    const map=(x,y)=>point(cx+rx*cos*x-ry*sin*y,cy+rx*sin*x+ry*cos*y);
    for(let k=0;k<count;k++){
      const a=theta+k*step,b=a+step,t=4/3*Math.tan((b-a)/4);
      cubic(map(Math.cos(a)-t*Math.sin(a),Math.sin(a)+t*Math.cos(a)),
        map(Math.cos(b)+t*Math.sin(b),Math.sin(b)-t*Math.cos(b)),
        k===count-1?end:map(Math.cos(b),Math.sin(b)));
    }
  };
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i])){
      cmd=tokens[i++];
      if(cmd.toUpperCase()==='Z'){
        if(run){run.closed=true;paths.push(run);run=null;}cur=start;previous=null;previousKind='';cmd='';continue;
      }
    }
    const upper=cmd.toUpperCase(),count=size[upper];
    if(!count||i+count>tokens.length||tokens.slice(i,i+count).some(t=>/^[a-zA-Z]$/.test(t)))break;
    const v=tokens.slice(i,i+count).map(Number);i+=count;
    const rel=cmd!==upper,old=cur;
    const xy=(x,y)=>point(rel?old.x+x:x,rel?old.y+y:y);
    if(upper==='M'){begin(xy(v[0],v[1]));cmd=rel?'l':'L';previous=null;previousKind='';continue;}
    if(upper==='L')add('line',xy(v[0],v[1]));
    else if(upper==='H')add('line',point(rel?old.x+v[0]:v[0],old.y));
    else if(upper==='V')add('line',point(old.x,rel?old.y+v[0]:v[0]));
    else if(upper==='C'){const c1=xy(v[0],v[1]),c2=xy(v[2],v[3]);cubic(c1,c2,xy(v[4],v[5]));previous=c2;}
    else if(upper==='S'){
      const c1=['C','S'].includes(previousKind)&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;
      const c2=xy(v[0],v[1]);cubic(c1,c2,xy(v[2],v[3]));previous=c2;
    }else if(upper==='Q'){
      const q=xy(v[0],v[1]),end=xy(v[2],v[3]);
      cubic(point(old.x+2*(q.x-old.x)/3,old.y+2*(q.y-old.y)/3),
        point(end.x+2*(q.x-end.x)/3,end.y+2*(q.y-end.y)/3),end);previous=q;
    }else if(upper==='T'){
      const q=['Q','T'].includes(previousKind)&&previous?point(2*old.x-previous.x,2*old.y-previous.y):old;
      const end=xy(v[0],v[1]);cubic(point(old.x+2*(q.x-old.x)/3,old.y+2*(q.y-old.y)/3),
        point(end.x+2*(q.x-end.x)/3,end.y+2*(q.y-end.y)/3),end);previous=q;
    }else if(upper==='A'){arc(v[0],v[1],v[2],v[3],v[4],xy(v[5],v[6]));previous=null;}
    if(!['C','S','Q','T'].includes(upper))previous=null;
    previousKind=upper;
  }
  if(run&&run.commands.length)paths.push(run);
  return paths;
}

export function transformEditablePath(d,sx=1,sy=1,dx=0,dy=0){
  const fmt=p=>`${+(p.x*sx+dx).toFixed(4)} ${+(p.y*sy+dy).toFixed(4)}`;
  return parseEditablePath(d).map(path=>`M ${fmt(path.start)} `+path.commands.map(c=>
    c.type==='cubic'?`C ${fmt(c.c1)} ${fmt(c.c2)} ${fmt(c.end)}`:`L ${fmt(c.end)}`).join(' ')+(path.closed?' Z':'')).join(' ');
}

const cubicPoint=(a,b,c,d,t)=>{
  const u=1-t;return point(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
    u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y);
};
export function editableShapeFrame(n) {
  if(['path','polyline','line'].includes(n.type)){
    const paths=n.type==='path'?parseEditablePath(n.d):null;
    const coords=paths?paths.flatMap(p=>[p.start,...p.commands.flatMap(c=>
      c.type==='cubic'?[c.c1,c.c2,c.end]:[c.end])]):geometrySegments(n).flatMap(p=>p.points);
    if(!coords.length)return null;
    const x=Math.min(...coords.map(p=>p.x)),y=Math.min(...coords.map(p=>p.y));
    return {x,y,w:Math.max(.001,Math.max(...coords.map(p=>p.x))-x),
      h:Math.max(.001,Math.max(...coords.map(p=>p.y))-y)};
  }
  return {x:num(n.x),y:num(n.y),w:num(n.w),h:num(n.h)};
}
export function geometrySegments(n) {
  if (n.type === 'polyline' || n.points) {
    const values = String(n.points || '').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
    const points=[];
    for(let i=0;i+1<values.length;i+=2) points.push(point(values[i],values[i+1]));
    return points.length>1 ? [{points,closed:!!n.closed}] : [];
  }
  if (n.type === 'line') return [{points:[point(n.x,n.y),point(n.x2,n.y2)],closed:false}];
  if (n.type !== 'path') return [];
  return parseEditablePath(n.d).map(path=>{
    const points=[path.start];let current=path.start;
    for(const command of path.commands){
      if(command.type==='cubic')for(let j=1;j<=16;j++)points.push(cubicPoint(current,command.c1,command.c2,command.end,j/16));
      else points.push(command.end);
      current=command.end;
    }
    return {points,closed:path.closed};
  }).filter(p=>p.points.length>1);
}
