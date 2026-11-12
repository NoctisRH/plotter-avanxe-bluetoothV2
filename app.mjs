import {CMD, STATUS, paquete, parseGcode, validateGcode} from './protocolo.mjs';
import {actionsToPaths, pathsToGcode, createFrame, pickStroke} from './editor.mjs';
import {demoGcodeFiles} from './pruebas.mjs';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=(msg)=>{const el=$('registro');el.textContent+=`\n${new Date().toLocaleTimeString()} ${msg}`;el.scrollTop=el.scrollHeight;};
const error=e=>{log('ERROR: '+(e?.message||e));console.error(e)};
const n=id=>Number($(id).value);
const value=(id,v)=>{$(id).value=String(v)};
let connected=false, enabled=false, referenced=false, contactConfirmed=false, cancelRequested=false, running=false;
let pos={x:0,y:0,z:0}; // pasos COMANDADOS desde ZERO, nunca posicion fisica medida
let cal={x:0,y:0,left:null,right:null,bottom:null,top:null};
let gcodeText='', actions=[];
let trazos=[], seleccionado=null, undoStack=[], imagenURL=null;

function renderPos(){ $('px').textContent=referenced?(pos.x/n('sx')).toFixed(2):'sin ZERO';$('py').textContent=referenced?(pos.y/n('sy')).toFixed(2):'sin ZERO';$('pz').textContent=referenced?pos.z:'sin ZERO'; }
function renderConn(){ $('estadoTxt').textContent=connected?'Conectado al puerto seleccionado':'Desconectado';$('punto').className=connected?'ok':'';}
function config(){
 const c={sx:n('sx'),sy:n('sy'),mx:n('mx'),my:n('my'),margen:n('margen'),offset:n('offset'),contacto:n('contacto')};
 if(!Object.values(c).every(Number.isFinite)||c.sx<=0||c.sy<=0||c.mx<=0||c.my<=0||c.margen<0||c.margen>=Math.min(c.mx,c.my)/2||c.offset<0||c.contacto<1||c.contacto>600)throw new Error('Configuracion invalida (revisa mm, limites y contacto)');
 return c;
}
function saveSettings(){const c=config();localStorage.setItem('plotter_av_bt_settings_v1',JSON.stringify(c));log('Calibracion y margen guardados en este navegador.');renderPos();drawPreview();}
function restoreSettings(){try{const c=JSON.parse(localStorage.getItem('plotter_av_bt_settings_v1')||'null');if(c)for(const [k,v] of Object.entries(c))if($(k))value(k,v)}catch(e){error(e)}}

class SerialLink {
 constructor(){this.port=null;this.reader=null;this.writer=null;this.pending=null;this.tail=Promise.resolve();this.loop=null;this.expectStatus=false;}
 async open(){
  if(!('serial' in navigator))throw Error('Este Chrome no tiene Web Serial. Usa Chrome actualizado en Android o PC.');
  // El selector nativo muestra puertos serie, incluido HC-06 emparejado mediante Bluetooth SPP.
  this.port=await navigator.serial.requestPort();
  await this.port.open({baudRate:n('baudios'),bufferSize:4096});
  this.writer=this.port.writable.getWriter();
  this.loop=this.readLoop();connected=true;renderConn();log(`Puerto abierto a ${n('baudios')} bps; ajusta S3 segun USB/Bluetooth.`);
 }
 async readLoop(){
  try{
   this.reader=this.port.readable.getReader();
   while(true){
    const {value,done}=await this.reader.read();if(done)break;
    for(const b of value){
     if(!this.expectStatus){if(b===0x5A)this.expectStatus=true;continue}
     this.expectStatus=false;
     const p=this.pending;
     if(p){this.pending=null;clearTimeout(p.timer);if(b===0||p.allowE2&&b===0xE2)p.resolve(b);
       else p.reject(Error(`FPGA 0x${b.toString(16).toUpperCase()}: ${STATUS[b]||'respuesta desconocida'}`));}
     else log(`Respuesta sin orden pendiente: 5A ${b.toString(16).padStart(2,'0')}`);
    }
   }
  }catch(e){if(connected)error(e)}finally{
   if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Puerto cerrado durante una orden'));this.pending=null;}
   try{this.reader?.releaseLock()}catch{}
   this.reader=null;connected=false;enabled=false;referenced=false;contactConfirmed=false;renderConn();renderPos();
  }
 }
 async close(){
  if(!this.port)return;
  if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Desconectado'));this.pending=null}
  try{await this.reader?.cancel()}catch{}
  try{await this.loop}catch{}
  try{this.writer?.releaseLock()}catch{}
  try{await this.port.close()}catch(e){error(e)}
  this.port=null;this.writer=null;connected=false;enabled=false;referenced=false;contactConfirmed=false;renderConn();renderPos();
  log('Puerto desconectado. Referencia invalida hasta nuevo ZERO.');
 }
 request(cmd,x=0,y=0,z=0,rate=1,{allowE2=false}={}){
  const packet=paquete(cmd,x,y,z,rate);
  const execute=()=>{
   if(!connected||!this.writer)throw Error('Conecta primero el HC-06');
   // La frecuencia minima del VHDL es 80 pasos/s; el timeout se adapta al recorrido.
   const ms=Math.max(4500,Math.ceil(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))/80*1000+10000));
   return new Promise((resolve,reject)=>{
    const p={resolve,reject,allowE2,timer:0};
    p.timer=setTimeout(()=>{
      if(this.pending===p)this.pending=null;
      connected=false;referenced=false;contactConfirmed=false;renderConn();renderPos();
      reject(Error('Timeout UART; desincronizacion posible. Desconecta y vuelve a referenciar.'));
    },ms);
    this.pending=p;
    this.writer.write(packet).catch(e=>{if(this.pending===p)this.pending=null;clearTimeout(p.timer);reject(e)});
   });
  };
  const job=this.tail.then(execute,execute);
  this.tail=job.catch(()=>{});
  return job;
 }
 async stopNow(){
  cancelRequested=true;
  if(!connected||!this.writer)return;
  // STOP fuera de la cola de solicitudes. C3 responde E5 si interrumpe RUN.
  await this.writer.write(paquete(CMD.STOP,0,0,0,0));
  referenced=false;contactConfirmed=false;renderPos();
  log('STOP enviado directamente. Verifica mecanismo y vuelve a establecer ZERO.');
 }
}
const link=new SerialLink();
async function cmd(c,x=0,y=0,z=0){const code=await link.request(c,x,y,z,n('nivel'),{allowE2:c===CMD.STATUS});if(c===CMD.STATUS)log(`STATUS: ${STATUS[code]||code}`);return code}
async function jogPhysical(dx,dy,dz,calibration=false){
 if(!enabled)throw Error('Primero HABILITAR');
 if(!calibration&&!referenced)throw Error('Para movimiento normal establece ZERO despues de alinear las marcas');
 if(calibration&&referenced)throw Error('Calibracion manual solo ANTES de ZERO. Reinicia la referencia de manera controlada.');
 const c=config();
 if(!calibration){
  const nx=pos.x+dx,ny=pos.y+dy,nz=pos.z+dz;
  if(nx<0||ny<0||nz<0||nx>Math.round(c.mx*c.sx)||ny>Math.round(c.my*c.sy)||nz>600)throw Error('Movimiento excede limites configurados (mecanicos/Z)');
 }
 await cmd(calibration?CMD.CAL_JOG:CMD.MOVE,dx,dy,dz);
 if(calibration){cal.x+=dx;cal.y+=dy;renderCal();}
 else{pos.x+=dx;pos.y+=dy;pos.z+=dz;renderPos()}
 log(`${calibration?'CAL_JOG':'MOVE'} X${dx>=0?'+':''}${dx} Y${dy>=0?'+':''}${dy} Z${dz>=0?'+':''}${dz}`);
}
function renderCal(){ $('calEstado').textContent=`Pasos relativos de calibracion: X ${cal.x}, Y ${cal.y} · Izq:${cal.left??'—'} Der:${cal.right??'—'} Abajo:${cal.bottom??'—'} Arriba:${cal.top??'—'}`; }
async function moveTo(x,y){
 const c=config(),targetX=Math.round(x*c.sx),targetY=Math.round(y*c.sy),dx=targetX-pos.x,dy=targetY-pos.y;
 if(dx||dy)await jogPhysical(dx,dy,0,false);
}
async function setPen(down){
 if(!referenced)throw Error('Primero establece ZERO XYZ');
 if(down&&!contactConfirmed)throw Error('Verifica la altura y pulsa Guardar contacto Z EN ESTA SESION antes de bajar el plumon');
 const target=down?n('contacto'):0;
 if(target!==pos.z){await jogPhysical(0,0,target-pos.z,false)}
}
async function jobSafe(fn){try{await fn()}catch(e){error(e)}}
const attach=(id,fn)=>$(id).addEventListener('click',()=>jobSafe(async()=>{if(running && !['stop','cancelar'].includes(id))throw Error('Hay un dibujo en curso; usa DETENER si necesitas abortar');await fn();}));
attach('conectar',async()=>{await link.open()});
attach('desconectar',async()=>{if(running)throw Error('Deten el movimiento antes de desconectar');await link.close()});
attach('status',async()=>{await cmd(CMD.STATUS)});
attach('enable',async()=>{await cmd(CMD.ENABLE);enabled=true;log('Motores habilitados')});
attach('disable',async()=>{if(running)throw Error('Deten el dibujo primero');await cmd(CMD.DISABLE);enabled=false;referenced=false;contactConfirmed=false;renderPos();log('Motores deshabilitados; se pierde referencia');});
attach('zero',async()=>{if(!enabled)throw Error('Primero HABILITAR');if(running)throw Error('No hagas ZERO durante un dibujo');if(!confirm('Confirma: X/Y estan en las marcas fisicas (0,0), Z elevado y no hay movimiento. ¿Establecer ZERO XYZ?'))return;await cmd(CMD.ZERO);referenced=true;pos={x:0,y:0,z:0};contactConfirmed=false;renderPos();log('ZERO XYZ confirmado. Contacto Z requiere nueva verificacion');});
attach('stop',async()=>{await link.stopNow()});attach('cancelar',async()=>{await link.stopNow()});
for(const [id,dx,dy] of [['xp',1,0],['xm',-1,0],['yp',0,1],['ym',0,-1]])attach(id,async()=>{const c=config(),d=n('pasomm');await jogPhysical(Math.round(dx*d*c.sx),Math.round(dy*d*c.sy),0)});
for(const [id,d] of [['zp',1],['zm',-1]])attach(id,async()=>{await jogPhysical(0,0,d*n('pasoz'))});
attach('guardarZ',async()=>{if(!referenced||pos.z<=0)throw Error('Primero ZERO, luego baja Z hasta contacto positivo');value('contacto',pos.z);contactConfirmed=true;saveSettings();log(`Contacto Z guardado: ${pos.z} medios pasos (solo confiable en esta sesion)`);});
attach('plumaUp',async()=>{await setPen(false)});attach('plumaDown',async()=>{await setPen(true)});
attach('guardarAjustes',async()=>{saveSettings()});
for(const [id,dx,dy] of [['cxp',1,0],['cxm',-1,0],['cyp',0,1],['cym',0,-1]])attach(id,async()=>{const s=n('calStep');await jogPhysical(dx*s,dy*s,0,true)});
for(const [id,key] of [['left','left'],['right','right'],['bottom','bottom'],['top','top']])attach(id,async()=>{if(referenced)throw Error('Marca extremos ANTES de ZERO');if(!enabled)throw Error('Primero HABILITAR');cal[key]=(key==='left'||key==='right')?cal.x:cal.y;renderCal();log(`Extremo ${key} registrado en ${cal[key]} medios pasos acumulados`)});
attach('calcXY',async()=>{
 if(cal.left===null||cal.right===null||cal.bottom===null||cal.top===null)throw Error('Marca los cuatro extremos primero');
 if(cal.right<=cal.left||cal.top<=cal.bottom)throw Error('Direccion invalida: X+ debe ir derecha, Y+ arriba');
 const c=config();const sx=(cal.right-cal.left)/c.mx,sy=(cal.top-cal.bottom)/c.my;
 if(sx<=0||sy<=0)throw Error('Medicion invalida');value('sx',sx.toFixed(5));value('sy',sy.toFixed(5));saveSettings();log(`Calibracion: X=${sx.toFixed(4)} Y=${sy.toFixed(4)} medios pasos/mm`);
});
attach('volverCal',async()=>{
 if(referenced)throw Error('El retorno de calibracion se usa ANTES de ZERO');if(cal.left===null||cal.bottom===null)throw Error('Marca primero X izquierda e Y abajo');
 const dx=cal.left-cal.x,dy=cal.bottom-cal.y;
 if(!confirm(`Regresar XY simultaneos (${dx}, ${dy}) medios pasos por conteo. Vigila los topes. ¿Continuar?`))return;
 // Calibracion en paquetes, ambos ejes coordinados. Para distancias largas se generan bloques DDA proporcionales.
 let remX=dx,remY=dy;const total=Math.max(Math.abs(dx),Math.abs(dy));let done=0;
 while(done<total){const next=Math.min(total,done+3000);const ax=Math.round(dx*next/total)-Math.round(dx*done/total);const ay=Math.round(dy*next/total)-Math.round(dy*done/total);
   await jogPhysical(ax,ay,0,true);done=next;
 }
 log('Regreso estimado completo. Comprueba marcas fisicas ANTES de pulsar ZERO XYZ.');
});

const canvas=$('visor'),ctx=canvas.getContext('2d');
function getTransform(){
 const c=config(), w=canvas.width,h=canvas.height,pad=36;
 const scale=(w-2*pad)/Math.max(c.mx,c.my);
 const fx=x=>pad+(x+c.offset)*scale, fy=y=>h-pad-(y+c.offset)*scale;
 return {fx,fy,scale,c,pad,w,h};
}
function drawPreview(){
 const {fx,fy,scale,c,pad,w,h}=getTransform();
 ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#d5e8f7';ctx.lineWidth=2;ctx.strokeRect(pad,pad,w-2*pad,h-2*pad);
 ctx.strokeStyle='#aad9f8';ctx.lineWidth=1.5;ctx.setLineDash([5,6]);
 ctx.strokeRect(fx(c.margen-c.offset),fy(c.my-c.margen-c.offset),(c.mx-2*c.margen)*scale,(c.my-2*c.margen)*scale);
 ctx.setLineDash([]);
 ctx.font='15px system-ui';ctx.fillStyle='#4f91b7';ctx.fillText('Y+',pad+7,pad+22);
 ctx.fillText('X+',w-pad-28,h-pad-10);ctx.fillText('(0,0)',pad+7,h-pad-10);
 let previous=[0,0];let drawn=0;
 const diameter=Number($('diametro').value);
 const fat=$('grosor').checked&&Number.isFinite(diameter)&&diameter>0;
 for(const t of trazos){
  if(t.points.length<2)continue;
  const [sx,sy]=t.points[0];
  ctx.beginPath();ctx.setLineDash([4,6]);ctx.lineWidth=.85;ctx.strokeStyle='rgba(130,178,207,.25)';
  ctx.moveTo(fx(previous[0]),fy(previous[1]));ctx.lineTo(fx(sx),fy(sy));ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(fx(sx),fy(sy));for(let i=1;i<t.points.length;i++){const [x,y]=t.points[i];ctx.lineTo(fx(x),fy(y))}
  ctx.lineWidth= t.id===seleccionado ? Math.max(3, fat?diameter*scale:2.4): (fat?Math.max(1,diameter*scale):1.8);
  ctx.strokeStyle=t.id===seleccionado?'#f39b42':(t.generatedFrame?'#209eb0':'#196fbb');ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  previous=t.points[t.points.length-1];drawn++;
 }
 $('cuenta').textContent=drawn?`${drawn} trazos · ${actions.filter(a=>a.kind==='move').length} movimientos`:'Sin trazos';
 const idx=trazos.findIndex(t=>t.id===seleccionado);
 $('trazoInfo').textContent=idx>=0?`Trazo ${idx+1}/${trazos.length} seleccionado · Naranja = seleccionado · ${trazos[idx].points.length} puntos`:'Toca un trazo azul en la vista previa para seleccionarlo.';
}
function syncActions(){
  // Misma fuente de verdad para previsualización, G-code y el comando real.
  gcodeText=trazos.length?pathsToGcode(trazos):'';
  actions=gcodeText?parseGcode(gcodeText):[];
  drawPreview();
}
function parseCurrent(){
  const imported=parseGcode(gcodeText);
  trazos=actionsToPaths(imported);seleccionado=null;undoStack=[];
  $('marcoWeb').checked=false;syncActions();
}
function applyFrame(){
 if(running)throw Error('No se puede editar el dibujo durante un movimiento real');
 const inner=trazos.filter(t=>!t.generatedFrame);
 if($('marcoWeb').checked){
  const v=Number($('sepMarco').value);
  const frame=createFrame(inner,v,config());
  trazos=[frame,...inner];
  log(`Marco Web añadido AL PRINCIPIO con separación de ${v} mm.`);
 }else{trazos=inner;log('Marco Web desactivado; se conservaron los trazos del archivo original.');}
 seleccionado=null;syncActions();
}
$('archivo').addEventListener('change',async e=>{try{
 if(running)throw Error('No cambies el G-code durante un dibujo');
 const file=e.target.files?.[0];if(!file)return;
 gcodeText=await file.text();parseCurrent();
 const c=config();validateGcode(actions,{offset:c.offset,mechanicalX:c.mx,mechanicalY:c.my,margin:c.margen});
 log(`${file.name}: ${trazos.length} trazos cargados. Importación V6.3 compatible. Revisa si el archivo ya incluye marco.`);
 }catch(e){error(e);trazos=[];seleccionado=null;syncActions()}});
canvas.addEventListener('click',e=>{
 if(running||!trazos.length)return;
 try{
  const b=canvas.getBoundingClientRect();
  const x=(e.clientX-b.left)*canvas.width/b.width;
  const y=(e.clientY-b.top)*canvas.height/b.height;
  seleccionado=pickStroke(trazos,x,y,getTransform(),Math.max(11,(Number($('diametro').value)||1)*getTransform().scale/2+5));
  drawPreview();
 }catch(e){error(e)}
});
$('archivoDetalles').addEventListener('change',async e=>{
 try{
  if(running)throw Error('No edites trazos durante el dibujo');
  const f=e.target.files?.[0];if(!f)return;
  const extra=actionsToPaths(parseGcode(await f.text()));
  if(!extra.length)throw Error('No se encontraron trazos en el G-code adicional');
  // Mantener el marco al inicio, si está presente.
  trazos.push(...extra);syncActions();
  log(`${extra.length} trazos de detalle agregados desde ${f.name}.`);
 }catch(e){error(e)}
 e.target.value='';
});
attach('borrarTrazo',async()=>{
 const i=trazos.findIndex(t=>t.id===seleccionado);
 if(i<0)throw Error('Primero toca en la vista previa el trazo que deseas eliminar');
 undoStack.push({index:i,path:trazos[i]});
 if(trazos[i].generatedFrame)$('marcoWeb').checked=false;
 trazos.splice(i,1);seleccionado=null;syncActions();log('Trazo excluido del dibujo y del G-code.');
});
attach('deshacerTrazo',async()=>{
 const last=undoStack.pop();if(!last)throw Error('No hay ninguna eliminación para deshacer');
 trazos.splice(last.path.generatedFrame?0:Math.min(last.index,trazos.length),0,last.path);
 if(last.path.generatedFrame)$('marcoWeb').checked=true;
 syncActions();log('Eliminación deshecha.');
});
attach('invertirSeleccion',async()=>{seleccionado=null;drawPreview()});
attach('aplicarMarco',async()=>applyFrame());
$('marcoWeb').addEventListener('change',()=>jobSafe(async()=>applyFrame()));
$('sepMarco').addEventListener('change',()=>{if($('marcoWeb').checked)jobSafe(async()=>applyFrame())});
$('grosor').addEventListener('change',drawPreview);
$('diametro').addEventListener('input',()=>{try{drawPreview()}catch{}});
$('archivoImagen').addEventListener('change',e=>{
 const f=e.target.files?.[0];if(!f)return;
 if(imagenURL)URL.revokeObjectURL(imagenURL);
 imagenURL=URL.createObjectURL(f);
 $('imagenOriginal').src=imagenURL;$('imagenOriginal').hidden=false;
 $('imagePlaceholder').hidden=true;
 log(`Imagen ${f.name} cargada solo como referencia visual.`);
});
attach('clearLog',async()=>{$('registro').textContent='Registro reiniciado manualmente.'});
attach('simular',async()=>{
 if(!actions.length)throw Error('Abre o genera un G-code antes de verificar');
 const c=config();validateGcode(actions,{offset:c.offset,mechanicalX:c.mx,mechanicalY:c.my,margin:c.margen});
 drawPreview();log(`G-code verificado: ${trazos.length} trazos, ${actions.filter(x=>x.kind==='move').length} movimientos, rango seguro ${c.mx-2*c.margen}×${c.my-2*c.margen} mm.`);
});
async function loadDemo(kind){
 if(running)throw Error('Espera a terminar o detener el dibujo antes de cambiar la prueba');
 const demoFile=demoGcodeFiles[kind];
 if(!demoFile)throw Error(`Prueba desconocida: ${kind}`);
 {
  if(trazos.length&&!confirm(`La prueba «${demoFile.name}» sustituirá el G-code y los trazos actuales. ¿Continuar?`))return;
  // GitHub Pages publica desde HTTPS. fetch no puede cargar archivos locales file://.
  const url=new URL(demoFile.file,import.meta.url);
  let response;
  try{response=await fetch(url,{cache:'no-cache'});}catch(e){throw Error(`No se pudo leer ${demoFile.file}. Abre la página publicada por HTTPS o desde localhost.`)}
  if(!response.ok)throw Error(`No se encontró ${demoFile.file} (HTTP ${response.status}). Revisa que subiste la carpeta gcode/ a GitHub.`);
  const source=await response.text();
  const parsed=parseGcode(source);
  const c=config();validateGcode(parsed,{offset:c.offset,mechanicalX:c.mx,mechanicalY:c.my,margin:c.margen});
  const paths=actionsToPaths(parsed);
  if(!paths.length)throw Error(`${demoFile.file} no contiene trayectorias dibujables`);
  // Mantener la arquitectura de editor: la vista, exportación y ejecución comparten los mismos trazos.
  trazos=paths;seleccionado=null;undoStack=[];$('marcoWeb').checked=false;
  syncActions();
  log(`Prueba cargada desde ${demoFile.file}: ${trazos.length} trazo(s). Lista para verificar.`);
  return;
 }
}
for(const [id,kind] of [
 ['testRectangulo','rectangulo'],['testCirculo','circulo'],['testLetras','letras'],
 ['testTriangulo','triangulo'],['testLineas','lineas'],['testFibonacci','fibonacci']
])attach(id,async()=>loadDemo(kind));
attach('guardarGcode',async()=>{if(!gcodeText)throw Error('Primero genera o abre un archivo');const a=document.createElement('a'),b=new Blob([gcodeText],{type:'text/plain'});a.href=URL.createObjectURL(b);a.download='plotter_hc06.gcode';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)});
attach('dibujar',async()=>{
 if(running)throw Error('Ya hay un dibujo ejecutandose');if(!connected||!enabled||!referenced)throw Error('Conecta, habilita y establece ZERO antes de dibujar');if(!contactConfirmed)throw Error('Verifica y guarda CONTACTO Z en esta sesion');if(!actions.length)throw Error('Carga G-code primero');
 const c=config();validateGcode(actions,{offset:c.offset,mechanicalX:c.mx,mechanicalY:c.my,margin:c.margen});
 if(!confirm(`Ejecutar ${actions.filter(a=>a.kind==='move').length} movimientos reales con contacto Z=${c.contacto}? Aleja manos y vigila topes.`))return;
 running=true;cancelRequested=false;let count=0;let down=false;
 try{
  await setPen(false);
  for(const a of actions){if(cancelRequested)break;
   if(a.kind==='pen'){down=a.down;await setPen(down);if(down){const p=n('pausaZ');if(!Number.isFinite(p)||p<0||p>3)throw Error('La pausa Z debe estar entre 0 y 3 s');if(p>0)await wait(p*1000);}continue}
   if(a.rapid)await setPen(false);
   await moveTo(a.x+c.offset,a.y+c.offset);
   count++;if(count%25===0)log(`Dibujo: ${count} movimientos completados`);
  }
  if(!cancelRequested){await setPen(false);await moveTo(0,0);log(`Dibujo completado: ${count} segmentos, regreso (0,0) por conteo`)}
  else log(`Dibujo detenido tras ${count} segmentos; referencia requiere ZERO`);
 }catch(e){error(e);referenced=false;contactConfirmed=false;log('Revisa la posicion fisica y vuelve a ZERO.');}
 finally{running=false;renderPos()}
});
restoreSettings();
try{const u=JSON.parse(localStorage.getItem('plotter_web_editor_v3')||'null');if(u){if(Number.isFinite(u.pausaZ))value('pausaZ',u.pausaZ);if(Number.isFinite(u.diametro))value('diametro',u.diametro);$('grosor').checked=Boolean(u.grosor);}}catch{}
for(const id of ['pausaZ','diametro','grosor'])$(id).addEventListener('change',()=>{
  localStorage.setItem('plotter_web_editor_v3',JSON.stringify({pausaZ:n('pausaZ'),diametro:n('diametro'),grosor:$('grosor').checked}));
});
renderPos();renderConn();renderCal();drawPreview();
const secure=window.isSecureContext;const support=('serial' in navigator);
$('compat').textContent=secure&&support?'Web Serial disponible. Si no aparece HC-06, vincula primero el módulo en Bluetooth del sistema.':(!secure?'La pagina necesita HTTPS o http://localhost para acceder a los puertos.':'Este navegador no tiene Web Serial; usa Chrome actualizado (Android 138+ o PC).');
window.addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue='Hay un dibujo en curso'}});
