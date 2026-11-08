/** Editor de trayectorias del plotter AVANXE.
 *  La vectorización avanzada permanece en Python. Este módulo edita G-code
 *  ya generado, sin depender de Web Serial ni de librerías externas.
 */
export function actionsToPaths(actions) {
  const paths=[]; let cursor=[0,0], drawing=false, current=[];
  const finish=()=>{ if(current.length>=2) paths.push({id:uniqueId(), points:current, generatedFrame:false}); current=[]; };
  for(const a of actions){
    if(a.kind==='pen'){
      if(a.down&&!drawing){drawing=true;current=[cursor.slice()];}
      if(!a.down&&drawing){finish();drawing=false;}
      continue;
    }
    if(a.kind!=='move')continue;
    const pt=[a.x,a.y];
    if(a.rapid&&drawing){finish();drawing=false;}
    if(drawing&&!a.rapid){
      const last=current[current.length-1];
      if(!last||last[0]!==pt[0]||last[1]!==pt[1])current.push(pt);
    }
    cursor=pt;
  }
  if(drawing)finish();
  return paths;
}
let counter=0;
function uniqueId(){return `t${++counter}`}

export function pathsToGcode(paths){
  const lines=['; Plotter CNC AVANXE Web - G-code compatible con Python V6.3','G21','G90','M5'];
  let count=0;
  for(const t of paths){
    if(!t.points||t.points.length<2)continue;
    const [[x,y],...rest]=t.points;
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Coordenadas no finitas');
    lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`,'M3');
    for(const [xx,yy] of rest){
      if(!Number.isFinite(xx)||!Number.isFinite(yy))throw Error('Coordenadas no finitas');
      lines.push(`G1 X${xx.toFixed(3)} Y${yy.toFixed(3)} F240.0`);
      count++;
      if(count>30000)throw Error('Demasiados segmentos; reduce el detalle del G-code');
    }
    lines.push('M5');
  }
  lines.push('G0 X0 Y0');
  return `${lines.join('\n')}\n`;
}

// Trabaja con coordenadas del G-code (no coordenadas de motor): el desplazamiento
// offset se aplica una única vez en el ejecutor, igual que en la versión Web original.
export function createFrame(paths, separation, config){
  if(!paths.length)throw Error('Carga un dibujo antes de añadir un marco');
  if(!Number.isFinite(separation)||separation<0||separation>30)throw Error('Separación del marco: usa 0 a 30 mm');
  const pts=paths.flatMap(t=>t.points||[]);
  if(!pts.length)throw Error('No hay puntos de trazos');
  const minAllowedX=config.margen-config.offset;
  const minAllowedY=config.margen-config.offset;
  const maxAllowedX=config.mx-config.margen-config.offset;
  const maxAllowedY=config.my-config.margen-config.offset;
  const minx=Math.max(minAllowedX,Math.min(...pts.map(p=>p[0]))-separation);
  const miny=Math.max(minAllowedY,Math.min(...pts.map(p=>p[1]))-separation);
  const maxx=Math.min(maxAllowedX,Math.max(...pts.map(p=>p[0]))+separation);
  const maxy=Math.min(maxAllowedY,Math.max(...pts.map(p=>p[1]))+separation);
  if(maxx-minx<0.5||maxy-miny<0.5)throw Error('El dibujo no cabe en el área segura al crear el marco');
  return {id:'marco-web',generatedFrame:true,points:[[minx,miny],[maxx,miny],[maxx,maxy],[minx,maxy],[minx,miny]]};
}

export function pointSegmentDistance(x,y,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy;
  if(len===0)return Math.hypot(x-x1,y-y1);
  const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/len));
  return Math.hypot(x-(x1+t*dx),y-(y1+t*dy));
}

export function pickStroke(paths,mouseX,mouseY,transform,maxPixels=13){
  let closest=null,dist=maxPixels;
  for(const t of paths){
    for(let i=1;i<t.points.length;i++){
      const a=t.points[i-1],b=t.points[i];
      const d=pointSegmentDistance(mouseX,mouseY,transform.fx(a[0]),transform.fy(a[1]),transform.fx(b[0]),transform.fy(b[1]));
      if(d<dist){dist=d;closest=t.id;}
    }
  }
  return closest;
}
