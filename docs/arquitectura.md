# Arquitectura del Plotter CNC AVANXE

[Volver al inicio](../README.md)

## Flujo del sistema

1. La aplicación Python puede procesar una imagen y exportar trayectorias en G-code.
2. La interfaz web o la aplicación Python interpreta los movimientos y calcula desplazamientos relativos.
3. Se envían tramas binarias UART de 10 bytes: `A5 CMD XH XL YH YL ZH ZL RATE XOR`.
4. El receptor C1 reconstruye los bytes. C2 interpreta la instrucción y comprueba el XOR.
5. C3 coordina los pulsos de paso mediante acumuladores enteros DDA, y C7 valida límites y registra pasos comandados.
6. C4, C5 y C6 producen secuencias de medio paso para los drivers ULN2003; C8 transmite respuestas.

## Archivos VHDL

Los archivos fuente están en [fpga/](../fpga/). El TOP suministrado actualmente incluye `uart_rx`, `uart_tx`, `estop_n` y `limit_*_n`, con opción `USE_LIMIT_SWITCHES`. **No tiene los puertos Bluetooth independientes de la variante comentada en la documentación del proyecto.** No se afirma que ambas variantes sean idénticas.

## Firmware y hardware

- Plataforma: Spartan-6, reloj de 50 MHz.
- Motores de la configuración documentada: 28BYJ-48, drivers ULN2003.
- Ejes XY: interpolación por acumuladores enteros y movimiento Z por separado.
- Seguimiento de posición: pasos comandados, sin encoders.
- Comunicación: UART; la interfaz web emplea Web Serial sobre un puerto expuesto por el sistema operativo.

## Consideraciones de seguridad

No conectar bobinas directamente a la FPGA. Las señales `motor_x/y/z` son niveles lógicos para los drivers. Verificar tensión de alimentación, tierra común, límites mecánicos y tiempos antes de operar.
