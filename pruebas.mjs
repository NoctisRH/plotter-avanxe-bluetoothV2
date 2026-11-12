/** Biblioteca de las seis pruebas predeterminadas como archivos G-code externos.
 * Los archivos se ubican en /gcode junto a app.mjs.
 * Para cambiar una prueba, reemplazar su .gcode (G21, G90, G0/G1, M3/M5).
 */
export const demoGcodeFiles = Object.freeze({
  rectangulo: {name:'Rectángulo de 60 × 40 mm', file:'gcode/rectangulo_60x40.gcode'},
  circulo: {name:'Círculo de Ø80 mm', file:'gcode/circulo_80mm.gcode'},
  letras: {name:'Letras FCE / EQ3 en 80 × 80 mm', file:'gcode/letras_FCE_EQ3.gcode'},
  triangulo: {name:'Triángulo de 60 × 60 mm', file:'gcode/triangulo_60x60.gcode'},
  lineas: {name:'8 líneas de 5 mm separadas 4 mm', file:'gcode/ocho_lineas_5mm.gcode'},
  fibonacci: {name:'Espiral de Fibonacci (hasta 80 × 80 mm)', file:'gcode/espiral_fibonacci.gcode'}
});
