# Sanctuary — Reporte del Step 15: compra de equipo por necesidad vivida

Fecha: 2026-10-12. Diseño: `docs/DISENO_STEP15_COMPRA_DE_EQUIPO.md`, revisión 3.
Estado: experimento ejecutado. Sin commit ni push. Ningún cambio de código, fórmula o
criterio durante el experimento.

## Resultado en una página

**Veredicto: RESULTADO MIXTO.**

- **El mecanismo funciona como se diseñó.** Las 89 compras por necesidad de los tres mundos
  terminaron equipadas en menos de 24 horas (100 %), ninguna se revendió y ninguna la hizo
  un agente sin derrotas recientes.
- **El daño que motivó el Step bajó.** Las derrotas sin arma de quien podía pagarla pasaron
  de 646 a 169 en total (−74 %), con baja en los tres mundos.
- **Dos salvaguardas fallan en su lectura literal.** Las muertes por hambre suben de 0 a 1 en
  los mundos b y c (criterio 6). Los agentes con menos de 5 de oro al final suben de 5 a 13
  en el mundo c (criterio 7).
- **No encontré vínculo directo entre esos fallos y las compras de armas** (detalle en la
  sección 4). Aun así, la tabla de decisión fijada antes de correr dice: "se cumple 4 pero
  falla alguna salvaguarda → rechazar". No la reinterpreto; la decisión es del PO.
- **Un hallazgo que el criterio 4 no ve:** la tasa de derrota en peleas individuales subió en
  los mundos a y c (10,1 % → 11,6 % y 13,4 % → 15,2 %) y bajó en b (17,8 % → 14,3 %). Muchos
  agentes ahora pierden con el arma puesta.

| # | Criterio | Mundo a | Mundo b | Mundo c | Veredicto |
|---|---|---|---|---|---|
| 1 | Compras por necesidad equipadas en 24 h (más de la mitad) | 32 de 32 | 27 de 27 | 30 de 30 | **Cumple** |
| 2 | Compras por necesidad sin derrotas recordadas (0) | 0 | 0 | 0 | **Cumple** (medido por aproximación) |
| 3 | Agentes con arma al final (más que la base, máximo 35) | 8 → 21 | 10 → 19 | 14 → 16 | **Cumple** |
| 4 | Derrotas sin arma de quien podía pagarla (baja en los tres, 25 % en total) | 149 → 38 | 158 → 71 | 339 → 60 | **Cumple** (−74 % en total) |
| 5 | Compras de herramienta (sin aumento atribuible) | 134 → 77 | 299 → 282 | 54 → 172 | Cumple en a y b. **No concluyente en c** |
| 5b | Compras de armadura (sin aumento atribuible) | 173 → 82 | 259 → 307 | 32 → 189 | Cumple en a. **No concluyente en b y c** |
| 6 | Muertes por hambre (no suben) | 2 → 0 | 0 → 1 | 0 → 1 | **Falla en b y c** |
| 7 | Agentes con menos de 5 de oro al final (no más de +5) | 18 → 18 | 13 → 15 | 5 → 13 | Cumple en a y b. **Falla en c** |
| 8 | Duración mediana de las rachas de pobreza (no se duplica) | 6 → 6 h | 9 → 9 h | 9 → 11 h | **Cumple** |
| 9 | Suite de tests | — | — | — | **Cumple**: 14 de 14 archivos, 0 fallos como conjunto |
| 10 | Armas compradas por necesidad y revendidas antes de equipar (0) | 0 | 0 | 0 | **Cumple** |
| 11 | Mercados con 3 armas o menos al final (solo se reporta) | 0 → 3 | 0 → 6 | 1 → 3 | Reportado: la oferta se agota |

---

## 1. Condiciones del experimento

| | |
|---|---|
| Seeds | a `sanctuary-v2` (2789489010), b `sanctuary-v2-step8-b` (3240097812), c `sanctuary-v2-step8-c` (4218807298) |
| Duración y población | 7200 ticks (300 días), 70 agentes |
| Política de decisión | Determinista. `DEEPSEEK_API_KEY` vacía: 0 llamadas reales en las tres corridas (2419, 2093 y 2308 intentos, todos con la política determinista). Ollama apagado. |
| Línea base | `data_runtime_step14_a`, `_b` y `_c`, sin regenerar. Sus archivos conservan la fecha del 9 de octubre. |
| Corridas nuevas | `data_runtime_step15_a`, `_b` y `_c` |
| Código | El de la revisión de implementación: 84 líneas agregadas y 2 reemplazadas en `progression.js`, `decision.js` y `actions.js`. Sin cambios posteriores. |

Herramientas, todas de solo lectura:

- `tools/auditoria_po/step15_compras.mjs` (nueva): criterios 1, 2, 3, 5, 5b, 6, 7, 10 y 11.
- `tools/auditoria_po/step15_limites.mjs` (nueva): stock, prueba de comercio, roturas y
  detalle de las salvaguardas.
- `tools/auditoria_po/tesoreria_y_armas.mjs` (existente): criterio 4, mismo método de la base.
- `tools/auditoria_po/decisiones_po.mjs` (existente): criterio 8, mismo método de la base.

**Validación de las herramientas nuevas sobre la línea base.** Reproducen las cifras del
diseño en los criterios 3, 5, 5b, 6, 7 y 11. El stock de armas reconstruido desde los eventos
coincide con el estado final en los 9 mercados de las 6 corridas. Todas las compras de equipo
se emparejaron con su decisión.

**Una diferencia con el diseño.** El diseño cita 161, 270 y 25 compras de armas en la base.
La herramienta nueva cuenta 161, 272 y 30. No sé cómo se obtuvieron las cifras del diseño;
en este reporte uso las de la herramienta para ambos Steps.

---

## 2. Reporte comparativo del mundo a

| Métrica | Step 14 | Step 15 |
|---|---|---|
| Compras de armas, todas | 161 | 97 |
| — por necesidad | 0 | 32 (8 agentes) |
| — sin razón de necesidad | 161 | 65 |
| Por necesidad equipadas en 24 h | — | 32 de 32 |
| Todas equipadas en 24 h | 0 de 161 (0 %) | 34 de 97 (35 %) |
| Agentes con arma al final | 8 | 21 |
| Agentes que equiparon un arma alguna vez | 12 | 25 |
| Derrotas sin arma de quien podía pagarla | 149 | 38 |
| Derrotas individuales, total | 304 de 3023 peleas (10,1 %) | 364 de 3150 (11,6 %) |
| — sin arma | 254 | 107 |
| — con arma | 50 | 257 |
| Compras de herramienta | 134 | 77 |
| Compras de armadura | 173 | 82 |
| Muertes por hambre / por combate | 2 / 13 | 0 / 13 |
| Muertes definitivas | 3 | 1 |
| Agentes con menos de 5 de oro al final | 18 | 18 |
| Oro mediano de los vivos | 9 | 9 |
| Rachas de pobreza, duración mediana | 6 h | 6 h |
| Mercados con 3 armas o menos al final | 0 | 3 (Valdor, Tejor, Duren) |
| Armas en los mercados al final | 92 | 57 |
| Mantenimiento de equipo pagado | 6.276 | 8.632 |

Compras por necesidad por clase: comerciante 17, curandero 12, novato 1, erudito 1, mercader
de ruta 1. Oro al comprar: mediana 1.305, mínimo 100. Tiempo hasta equipar: mediana 1 hora,
máximo 10.

## 3. Reporte comparativo del mundo b

| Métrica | Step 14 | Step 15 |
|---|---|---|
| Compras de armas, todas | 272 | 110 |
| — por necesidad | 0 | 27 (11 agentes) |
| — sin razón de necesidad | 272 | 83 |
| Por necesidad equipadas en 24 h | — | 27 de 27 |
| Todas equipadas en 24 h | 1 de 272 (0,4 %) | 27 de 110 (25 %) |
| Agentes con arma al final | 10 | 19 (14 vivos) |
| Agentes que equiparon un arma alguna vez | 12 | 22 |
| Derrotas sin arma de quien podía pagarla | 158 | 71 |
| Derrotas individuales, total | 392 de 2201 peleas (17,8 %) | 380 de 2651 (14,3 %) |
| — sin arma | 339 | 218 |
| — con arma | 53 | 162 |
| Compras de herramienta | 299 | 282 |
| Compras de armadura | 259 | 307 |
| Muertes por hambre / por combate | 0 / 32 | 1 / 31 |
| Muertes definitivas | 5 | 8 |
| Agentes con menos de 5 de oro al final | 13 | 15 |
| Oro mediano de los vivos | 20 | 16 |
| Rachas de pobreza, duración mediana | 9 h | 9 h |
| Mercados con 3 armas o menos al final | 0 | 6 |
| Armas en los mercados al final | 87 | 38 |
| Mantenimiento de equipo pagado | 6.613 | 6.849 |

Compras por necesidad por clase: comerciante 14, curandero 10, novato 2, erudito 1. Oro al
comprar: mediana 416, mínimo 107. Tiempo hasta equipar: mediana 1 hora, máximo 11.

En este mundo 23 armas compradas sin razón de necesidad quedaron en el inventario de un solo
comerciante con prueba de comercio activa (Brannok), sin venderse ni equiparse. No investigué
la causa.

## 4. Reporte comparativo del mundo c

| Métrica | Step 14 | Step 15 |
|---|---|---|
| Compras de armas, todas | 30 | 202 |
| — por necesidad | 0 | 30 (12 agentes) |
| — sin razón de necesidad | 30 | 172 |
| Por necesidad equipadas en 24 h | — | 30 de 30 |
| Todas equipadas en 24 h | 2 de 30 (7 %) | 30 de 202 (15 %) |
| Agentes con arma al final | 14 | 16 (15 vivos) |
| Agentes que equiparon un arma alguna vez | 18 | 24 |
| Derrotas sin arma de quien podía pagarla | 339 | 60 |
| Derrotas individuales, total | 553 de 4124 peleas (13,4 %) | 384 de 2519 (15,2 %) |
| — sin arma | 411 | 178 |
| — con arma | 142 | 206 |
| Compras de herramienta | 54 | 172 |
| Compras de armadura | 32 | 189 |
| Muertes por hambre / por combate | 0 / 10 | 1 / 26 |
| Muertes definitivas | 1 | 4 |
| Agentes con menos de 5 de oro al final | 5 | 13 |
| Oro mediano de los vivos | 31 | 14 |
| Rachas de pobreza, duración mediana | 9 h | 11 h |
| Mercados con 3 armas o menos al final | 1 | 3 (Valdor, Duren, Brynn) |
| Armas en los mercados al final | 80 | 60 |
| Mantenimiento de equipo pagado | 10.031 | 7.974 |

Compras por necesidad por clase: curandero 22, comerciante 4, novato 2, archivista 2. Oro al
comprar: mediana 1.889, mínimo 88. Tiempo hasta equipar: mediana 1 hora, máximo 11.

Este es el mundo que más cambió de trayectoria: las victorias en grupo pasan de 8.492 a 3.482
y las muertes por combate de 10 a 26. Es un **hecho** de la comparación; no puedo atribuirlo
al cambio ni descartarlo con una sola corrida por seed.

---

## 5. Veredicto por criterio

### Criterio 1 — Cumple

**Hecho.** Sobre las compras por necesidad (lectura aprobada en D6): 32 de 32, 27 de 27 y 30
de 30 equipadas en 24 horas.

Sobre todas las compras de armas, como pidió el PO:

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Todas | 34 de 97 (35 %) | 27 de 110 (25 %) | 30 de 202 (15 %) |
| Sin prueba de comercio activa | 33 de 33 | 26 de 28 | 28 de 28 |
| Con prueba de comercio activa | 1 de 64 | 1 de 82 | 2 de 174 |
| Por necesidad, con prueba de comercio activa | 1 de 1 | 1 de 1 | 2 de 2 |

Con la lectura sobre todas las compras, el criterio fallaría en los tres mundos. Las compras
que no se equipan son las de agentes con prueba de comercio activa, que compran como
mercancía y revenden.

**Una predicción del diseño que no se confirmó.** La sección 4.7 anticipaba que un agente con
prueba de comercio activa compraría el arma por necesidad y no la equiparía. Hubo 4 compras
así en los tres mundos y las 4 se equiparon. La muestra es pequeña.

### Criterio 2 — Cumple, medido por aproximación

**Hecho.** Las 89 compras por necesidad tienen al menos una derrota individual del mismo
agente en las 168 horas previas. La medición usa los eventos de derrota, no la memoria del
agente, que el log no guarda en cada tick.

### Criterio 3 — Cumple

**Hecho.** 21, 19 y 16 agentes con arma al final, contra 8, 10 y 14. Ningún mundo supera 35.
En el mundo c la subida es de solo 2 agentes.

### Criterio 4 — Cumple, con una reserva importante

**Hecho.** 149 → 38 (−74 %), 158 → 71 (−55 %) y 339 → 60 (−82 %). Total: 646 → 169 (−74 %).

**Hecho que el criterio no ve.** Las derrotas individuales totales suben en el mundo a (304 →
364), bajan poco en b (392 → 380) y bajan en c (553 → 384) con muchas menos peleas. La tasa
de derrota sube en a y en c.

| Tasa de derrota en peleas individuales | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Sin arma, Step 14 → Step 15 | 13,9 % → 22,7 % | 30,6 % → 29,8 % | 32,6 % → 28,3 % |
| Con arma, Step 14 → Step 15 | 4,2 % → 9,6 % | 4,8 % → 8,4 % | 5,0 % → 10,9 % |

**Hecho.** De las derrotas "con arma" del Step 15, 150, 121 y 138 ocurrieron con menos de 40
peleas desde que el agente equipó o reparó el arma. Un arma no puede romperse antes de 40
peleas, así que esas derrotas fueron con el arma en uso.

**Inferencia.** En el Step 14 los pocos armados eran sobre todo clases de combate. Ahora se
arman comerciantes y curanderos, que con arma siguen perdiendo parte de sus peleas. El
criterio 4 mide derrotas sin arma, y por eso baja aunque el agente siga perdiendo.

**Límite del método.** "Con arma" significa haber equipado una desde el último renacimiento;
no ve roturas. Es la misma aproximación de la línea base.

### Criterios 5 y 5b — Cumple en parte; no concluyente donde sube

**Hecho.** Herramienta: baja en a y b, sube en c (54 → 172). Armadura: baja en a, sube en b
(259 → 307) y en c (32 → 189).

**Hecho.** Ninguna compra de herramienta o armadura lleva la razón de necesidad. Casi todas
las hacen comerciantes: 171 de 172 herramientas y 188 de 189 armaduras en el mundo c.

**Hecho.** En el mundo c también suben las compras de armas sin razón de necesidad (30 → 172)
y las compras totales al mercado (6.736 → 9.343).

**Inferencia.** La subida corresponde a más comercio de mercancía por parte de comerciantes,
no a la valoración nueva. No puedo demostrar que sea solo efecto de trayectoria: en la línea
base estas compras ya variaban entre 54 y 299 según el mundo.

### Criterio 6 — Falla en b y c

**Hecho.** Muertes por hambre: 2 → 0 en a, 0 → 1 en b y 0 → 1 en c.

| Mundo | Agente | Tick | Compras por necesidad antes de morir |
|---|---|---|---|
| b | Renna (`agent_1`, sujeto de control), comerciante | 5994, en Brynn | 3; la última, 2.562 horas antes |
| c | Yosef la Sabia (`agent_46`), herrero | 2630, en Brynn | 0 |

**Hecho.** En las últimas decisiones registradas de Renna, su oro baja de 272 a 2 al fundar un
gremio en el tick 5947.

**Inferencia.** Ninguna de las dos muertes sigue a una compra de arma. No lo investigué más
allá de estos datos. El criterio dice "no suben" y suben: lo reporto como fallo.

### Criterio 7 — Cumple en a y b, falla en c

**Hecho.** 18 → 18, 13 → 15 y 5 → 13. En c la subida es de 8, por encima del margen de 5.

**Hecho.** De los 13 agentes pobres al final en c, 1 hizo alguna compra por necesidad, en el
tick 57. En a y b, ninguno de los pobres compró por necesidad.

**Hecho.** Las compras por necesidad se hacen con oro de sobra: oro previo mínimo 100, 107 y
88; mediano 1.305, 416 y 1.889.

**Inferencia.** La compra de armas no explica de forma directa la pobreza final en c. El oro
mediano de ese mundo baja de 31 a 14, junto con el cambio de trayectoria descrito arriba.

### Criterio 8 — Cumple

**Hecho.** 6 → 6, 9 → 9 y 9 → 11 horas. No se duplica en ningún mundo.

### Criterio 9 — Cumple

**Hecho.** Los 14 archivos terminan con salida 0, uno por uno y como conjunto (0 fallos de
14). Los 13 archivos anteriores no se modificaron.

### Criterio 10 — Cumple

**Hecho.** Ninguna de las 89 armas compradas por necesidad se vendió antes de equiparse.

### Criterio 11 — Reportado

**Hecho.** Mercados con 3 armas o menos al final: 3, 6 y 3 de 9. El primero se agota en los
ticks 2840, 1852 y 4126.

---

## 6. Cuánto limitaron el stock y la prueba de comercio

Medí las decisiones en que un agente estaba sin arma, tenía una derrota individual en las
168 horas previas y oro por encima del umbral de 80,63. Son las decisiones en que la
valoración podía actuar.

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Decisiones en esa situación, Step 14 | 11.437 | 13.463 | 21.083 |
| Decisiones en esa situación, Step 15 | 2.204 | 6.552 | 4.235 |
| — en un lugar sin mercado | 291 (13 %) | 767 (12 %) | 547 (13 %) |
| — en un mercado con 3 armas o menos | 100 (5 %), 4 agentes | 1.458 (22 %), 9 agentes | 67 (2 %), 4 agentes |
| — con arma disponible | 1.813 | 4.327 | 3.621 |
| — con arma disponible y prueba de comercio activa | 24 | 2 | 9 |

**Hechos.**

- El stock agotado limitó sobre todo al mundo b: 22 % de las decisiones con necesidad y oro
  ocurrieron en un mercado sin armas a la venta. En a y c fue 5 % y 2 %.
- La prueba de comercio activa casi no limitó: 24, 2 y 9 decisiones.
- Quedan 1.813, 4.327 y 3.621 decisiones con arma disponible en las que el agente no compró
  en ese turno. La compra del arma estuvo entre las seis mejores acciones en 181, 337 y 234.

**Inferencia.** En el mundo b, el resultado más flojo del criterio 4 (−55 % contra −74 % y
−82 %) coincide con el mayor agotamiento. No debe leerse solo como un defecto de la
valoración.

**No lo sé.** Por qué en las decisiones restantes con arma disponible la compra no gana. El
log solo guarda las seis mejores acciones, y la compra casi nunca está entre ellas.

**Dónde están las armas.** Al final hay 182, 270 y 67 armas sin equipar en inventarios, casi
todas de herreros. Es la oferta fija ya registrada en la sección 10 del diseño: no se corrigió
en este Step.

---

## 7. Qué queda sin responder

- Si el arma reduce las derrotas de quien la compra. El criterio 4 mide derrotas sin arma, no
  derrotas del mismo agente antes y después de armarse.
- Si las dos muertes por hambre y la pobreza del mundo c son efecto del cambio o de la
  trayectoria. Con una corrida por seed no se puede separar.
- Las roturas de equipo: siguen sin emitir evento.
- La causa de las 23 armas retenidas por un comerciante en el mundo b.

## 8. Lectura según la tabla de decisión del diseño

| Resultado previsto en el diseño | ¿Ocurre? |
|---|---|
| Se cumplen 1 a 5 y ninguna salvaguarda falla → aceptar | No: fallan 6 (b y c) y 7 (c) |
| Se cumple 4 pero falla alguna salvaguarda → rechazar | **Sí, en lectura literal** |
| Se cumplen 1 a 3 pero 4 no baja → revisar | No: 4 baja |
| Falla 3 por exceso → revisar | No |
| Falla 1 → revisar la reventa | No |

La tabla lleva a "rechazar". Los datos de la sección 5 no muestran que la mejora se haya
pagado con supervivencia, que es el motivo que la tabla da para rechazar. No propongo cambios:
quedo a la espera de la revisión del PO.
