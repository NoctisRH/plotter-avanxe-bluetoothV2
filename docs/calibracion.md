# Calibración del Plotter CNC AVANXE

[Volver al inicio](../README.md)

## Relación entre pasos y distancia

El sistema convierte la distancia deseada en pasos mediante:

```text
pasos = redondear(distancia_en_mm × pasos_por_mm)
```

Si una orden pide 20 mm y el carro se desplaza solo 18 mm, corregimos:

```text
escala_nueva = escala_anterior × (20 / 18)
```

En una prueba documentada del eje Y, una escala de 83.4467 pasos/mm produjo 18 mm para una orden de 20 mm. La escala corregida calculada es **92.7186 pasos/mm**, valor que todavía requiere comprobación mediante una nueva medición.

## Configuraciones utilizadas

Estas son configuraciones registradas durante el proyecto, **no valores universales**:

| Parámetro | Página web (captura) | Python (captura anterior) |
|:--|--:|--:|
| Escala X (pasos/mm) | 89.2857 | 89.2857 |
| Escala Y (pasos/mm) | 89.2857 | 83.4467 |
| Área de dibujo (mm) | 88 × 88 | 88 × 88 |

La versión web registró además un recorrido mecánico medido de 98 mm por eje y margen de 5 mm; estos parámetros deben verificarse en el dispositivo real.

## Recomendaciones

Usar el plumón levantado para calibrar, medir recorridos reales, evitar los extremos y actualizar el factor del eje que presenta error. Los valores de calibración afectan a la ejecución, mientras que el G-code describe trayectorias en milímetros.

El sistema funciona en lazo abierto. No hay confirmación automática de pérdidas de pasos.
