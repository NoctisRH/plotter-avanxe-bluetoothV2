/** Pruebas geometricas independientes de UART y del editor.
 * Coordenadas G-code absolutas en mm, pensadas para área útil 88x88 mm.
 * Siempre verificar con el margen y offset de la máquina ANTES de ejecutar.
 */
const path=(name,points)=>({id:`prueba-${name}`,points,generatedFrame:false});
function rounded(points){return points.map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]);}
const PI=Math.PI;
function arc(cx,cy,rx,ry,start,end,steps=64){
  return Array.from({length:steps+1},(_,i)=>{const a=start+(end-start)*i/steps;return [cx+rx*Math.cos(a),cy+ry*Math.sin(a)]});
}

/** Fuentes vectoriales monolineales: cada segmento es un recorrido único de pluma.
 * En lugar de rellenar letras, se dibujan exclusivamente trazos de líneas.
 */
function glyph(c,x,y,w=18,h=22){
 const p=(a,b)=>[x+a*w,y+b*h];
 const oval=(start,end,n=28)=>arc(x+w/2,y+h/2,w/2,h/2,start,end,n);
 switch(c){
  case 'F':return [[p(0,0),p(0,1),p(1,1)],[p(0,.52),p(.76,.52)]];
  case 'C':return [arc(x+w/2,y+h/2,w/2,h/2,PI*.24,PI*1.76,38)];
  case 'E':return [[p(1,1),p(0,1),p(0,0),p(1,0)],[p(0,.50),p(.78,.50)]];
  case 'Q':return [arc(x+w/2,y+h/2,w/2,h/2,0,2*PI,48),[p(.60,.24),p(1.10,-.12)]];
  case '3':{
   // Trazado continuo de doble arco abierto hacia la izquierda.
   const top=arc(x+w*.40,y+h*.75,w*.53,h*.25,PI*.72,-PI*.58,26);
   const bottom=arc(x+w*.40,y+h*.25,w*.53,h*.25,PI*.55,-PI*.72,26);
   return [top,bottom];
  }
  default:throw Error('Letra no soportada');
 }
}
function letterPaths(){
 const out=[];const rows=[['FCE',51],['EQ3',13]];
 rows.forEach(([text,y],r)=>{
  for(let i=0;i<text.length;i++){
   const x=7+i*25;
   glyph(text[i],x,y,18,22).forEach((points,j)=>out.push(path(`letra-${r}-${i}-${j}`,rounded(points))));
  }
 });
 return out;
}

/** Espiral de Fibonacci: arcos de cuarto de círculo sobre cuadrados de
 * lados 1,1,2,3,5,8,13,21,34,55. Los centros se escogen para que los arcos
 * sean continuos y con tangente común en sus uniones. Se escala dentro de 80x80.
 */
function fibonacciSpiral(){
 const sizes=[1,1,2,3,5,8,13,21,34,55];
 const centers=[[1,0],[1,0],[0,0],[0,1],[2,1],[2,-2],[-3,-2],[-3,6],[10,6],[10,-15]];
 const startAngles=[180,90,0,-90,180,90,0,-90,180,90];
 let pts=[];
 for(let i=0;i<sizes.length;i++){
  const s=sizes[i], [cx,cy]=centers[i],angle=startAngles[i]*PI/180;
  const seg=Math.max(9,Math.min(80,Math.round(s*1.8+9)));
  const portion=arc(cx,cy,s,s,angle,angle-PI/2,seg);
  if(i>0)portion.shift();
  pts.push(...portion);
 }
 const xx=pts.map(p=>p[0]),yy=pts.map(p=>p[1]);
 const lowx=Math.min(...xx),highx=Math.max(...xx),lowy=Math.min(...yy),highy=Math.max(...yy);
 const scale=Math.min(76/(highx-lowx),76/(highy-lowy));
 const baseX=(80-(highx-lowx)*scale)/2,baseY=(80-(highy-lowy)*scale)/2;
 pts=rounded(pts.map(([x,y])=>[baseX+(x-lowx)*scale,baseY+(y-lowy)*scale]));
 return [path('fibonacci',pts)];
}

const DEMOS=Object.freeze({
 rectangulo: {name:'Rectángulo de 60 × 40 mm', paths:()=>[path('rectangulo',[[10,20],[70,20],[70,60],[10,60],[10,20]])]},
 circulo: {name:'Círculo de Ø80 mm (80 × 80)', paths:()=>[path('circulo',rounded(arc(40,40,40,40,0,PI*2,200)))]},
 letras: {name:'Letras FCE / EQ3 en 80 × 80 mm', paths:letterPaths},
 triangulo: {name:'Triángulo de 60 × 60 mm',paths:()=>[path('triangulo',[[10,10],[70,10],[40,70],[10,10]])]},
 lineas: {name:'8 líneas de 5 mm separadas 4 mm',paths:()=>Array.from({length:8},(_,i)=>path(`linea-${i+1}`,[[37.5,26+i*4],[42.5,26+i*4]]))},
 fibonacci: {name:'Espiral de Fibonacci (hasta 80 × 80 mm)',paths:fibonacciSpiral}
});
export const demoTypes=Object.keys(DEMOS);
export function makeDemo(kind){
 const demo=DEMOS[kind];if(!demo)throw Error(`Prueba desconocida: ${kind}`);
 const paths=demo.paths();if(!paths.length)throw Error('Prueba sin trayectorias');
 for(const p of paths) for(const [x,y] of p.points)
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<-1e-5||y<-1e-5||x>80.00001||y>80.00001)
     throw Error('Prueba fuera de zona nominal 80 × 80');
 return {name:demo.name,paths};
}
