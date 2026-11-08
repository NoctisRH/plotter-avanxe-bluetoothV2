/* Nevada suave V3.2, independiente del control UART/FPGA.
 * Partículas decorativas dispersas: sin imágenes grandes ni sprites repetidos.
 * El movimiento se apaga si el usuario prefiere movimiento reducido.
 */
(() => {
  'use strict';
  const container = document.getElementById('snowfall');
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Secuencia pseudoaleatoria fija: reparto homogéneo sin cambios bruscos al recargar.
  let seed = 37061;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function between(min, max) { return min + (max - min) * random(); }

  const smallScreen = window.matchMedia('(max-width: 650px)').matches;
  const count = smallScreen ? 38 : 76;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const item = document.createElement('span');
    const dust = random() < .41;
    item.className = `snow-particle${dust ? ' snow-dust' : ''}`;
    if (!dust) item.textContent = '❄';

    // Los copos cercanos se ven un poco mayores, pero ninguno es gigante.
    const size = dust ? between(2.2, 5.0) : between(6.0, 14.0);
    const duration = between(15, 35);
    const alpha = dust ? between(.20, .46) : between(.27, .55);
    const wind = between(-95, 115); // un poco de brisa y desplazamiento diagonal
    const sway = between(12, 32); // oscilación lateral (zigzag suave)
    const color = random() < .32 ? '#98c9e8' : '#ffffff';

    item.style.setProperty('--left', `${between(1, 99).toFixed(2)}vw`);
    item.style.setProperty('--size', `${size.toFixed(1)}px`);
    item.style.setProperty('--alpha', alpha.toFixed(2));
    item.style.setProperty('--duration', `${duration.toFixed(2)}s`);
    item.style.setProperty('--delay', `${(-between(0, duration)).toFixed(2)}s`);
    item.style.setProperty('--wind', `${wind.toFixed(1)}px`);
    for (const fraction of [18, 38, 58, 78]) {
      item.style.setProperty(`--wind${fraction}`, `${(wind * fraction / 100).toFixed(1)}px`);
    }
    item.style.setProperty('--sway', `${sway.toFixed(1)}px`);
    item.style.setProperty('--snow-color', color);
    fragment.appendChild(item);
  }
  container.appendChild(fragment);
})();
