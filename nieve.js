
/*
 * Nevada visible V3.3 — Plotter CNC AVANXE
 *
 * Copos de distintos tamaños, caída suave, brisa lateral
 * y mayor contraste sobre fondos claros.
 *
 * Independiente del control UART, Bluetooth y FPGA.
 * Respeta la preferencia de movimiento reducido.
 */

(() => {
  'use strict';

  const container = document.getElementById('snowfall');

  if (!container) return;

  if (
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
  ) {
    return;
  }

  // Generador pseudoaleatorio reproducible.
  let seed = 37061;

  function random() {
    seed = (
      Math.imul(1664525, seed) + 1013904223
    ) >>> 0;

    return seed / 4294967296;
  }

  function between(min, max) {
    return min + (max - min) * random();
  }

  // Cantidad de partículas.
  const smallScreen = window.matchMedia(
    '(max-width: 650px)'
  ).matches;

  const count = smallScreen ? 44 : 86;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {

    const item = document.createElement('span');

    // Un 23 % son partículas redondas pequeñas.
    const dust = random() < 0.23;

    item.className = dust
      ? 'snow-particle snow-dust'
      : 'snow-particle';

    if (!dust) {
      item.textContent = '❄';
    }

    // Tamaños visibles sin ser demasiado grandes.
    const size = dust
      ? between(4.0, 7.0)
      : between(13.0, 23.0);

    // Caída lenta y natural.
    const duration = between(18, 38);

    // Mayor opacidad para fondos claros.
    const alpha = dust
      ? between(0.42, 0.66)
      : between(0.62, 0.86);

    // Brisa lateral.
    const wind = between(-95, 115);

    // Oscilación lateral suave.
    const sway = between(12, 32);

    // Tonos blancos y azules.
    const color = random() < 0.66
      ? '#6aafd5'
      : '#e9f7ff';

    // Posición horizontal inicial.
    item.style.setProperty(
      '--left',
      `${between(1, 99).toFixed(2)}vw`
    );

    // Tamaño.
    item.style.setProperty(
      '--size',
      `${size.toFixed(1)}px`
    );

    // Transparencia.
    item.style.setProperty(
      '--alpha',
      alpha.toFixed(2)
    );

    // Duración de caída.
    item.style.setProperty(
      '--duration',
      `${duration.toFixed(2)}s`
    );

    // Retraso negativo para llenar la pantalla
    // desde el primer momento.
    item.style.setProperty(
      '--delay',
      `${(-between(0, duration)).toFixed(2)}s`
    );

    // Desplazamiento horizontal.
    item.style.setProperty(
      '--wind',
      `${wind.toFixed(1)}px`
    );

    // Desplazamientos intermedios.
    for (const fraction of [18, 38, 58, 78]) {
      item.style.setProperty(
        `--wind${fraction}`,
        `${(wind * fraction / 100).toFixed(1)}px`
      );
    }

    // Oscilación.
    item.style.setProperty(
      '--sway',
      `${sway.toFixed(1)}px`
    );

    // Color.
    item.style.setProperty(
      '--snow-color',
      color
    );

    fragment.appendChild(item);
  }

  container.appendChild(fragment);

})();
