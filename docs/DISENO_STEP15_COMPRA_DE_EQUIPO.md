# Sanctuary — Diseño del Step 15: decisión de equipamiento (PO4)

Fecha: 2026-10-12. **Documento de diseño para revisión del Product Owner.** No se modificó
código, reglas, parámetros ni configuraciones; no se ejecutaron simulaciones; este documento
no está commiteado.

Pregunta que el diseño debe resolver:

> ¿Cómo puede un agente reconocer cuándo el equipo existente le aporta suficiente valor para
> justificar su compra, sin que todos terminen comprando indiscriminadamente?

Convención: **[Hecho]** leído en el código o medido; **[Inferencia]**; **[Hipótesis]**;
**[Propuesta]**.

## Revisión 2 (2026-10-12)

El PO aprobó la dirección general y pidió aclarar dos puntos. Cambios respecto a la primera versión:

| Sección | Cambio |
|---|---|
| 4.1 y 4.5 | **Armadura excluida** del primer experimento, con su justificación. Pasa a ser un segundo control. |
| 4.6 | **Condición precisa** para no ofrecer la venta del arma que el agente necesita. |
| 5 | Pseudocódigo actualizado: sin armadura, con la condición de venta. |
| 6 | Archivos afectados: son tres, no dos. **Corrección de un dato propio** sobre la oferta de armas. |
| 7 | Pruebas nuevas para la condición de venta. |
| 8 | **Sin cambios.** Las adiciones que propongo están aparte, en 8.1, pendientes de autorización. |
| 10 y 11 | Dependencia nueva (oferta fija de armas) y lista actualizada de decisiones del PO. |

## Revisión 3 (2026-10-12) — diseño final

El PO aprobó D1 a D5 y pidió aclarar dos detalles antes de autorizar la implementación.

| Sección | Cambio |
|---|---|
| 4.2 | **Límites de la reserva de 15 de oro:** qué coste se usa, los tres tramos, el salto en el umbral y su tamaño. La fórmula no cambió. |
| 4.7 | **Equipamiento posterior a la compra:** contra qué compite equipar, a quién puede no ocurrirle y cómo se mide. Sin bloqueos nuevos. |
| 7 | **Plan de pruebas final:** 11 pruebas de probabilidad y mejora, 10 de valor y asequibilidad, 7 de reserva de venta y 7 de integración que miden derrota → compra → equipamiento. |
| 8.1 | Los criterios 5b, 10 y 11 pasan de propuestos a aprobados. Los nueve originales, intactos. |
| 8.2 | Una ambigüedad encontrada en el criterio 1, sin modificarlo. |
| 11 | Decisiones aprobadas y las tres que quedan pendientes. |

## Resumen

- El agente no puede comprar bien porque **comprar no mira qué se compra**. El resto de la
  cadena (equipar, pelear, desgaste) ya existe y funciona.
- **[Propuesta]** Que el valor de comprar un arma salga de las **derrotas que el agente
  recuerda** (Step 14) y de **cuánto bajaría su probabilidad de perder** contra esos mismos
  enemigos, calculada con las reglas de combate que ya existen.
- La armadura queda fuera de este primer experimento: no hay forma defendible de valorarla
  con lo que el agente sabe (sección 4.5).
- Un agente que no pelea, o que ya gana siempre, obtiene valor 0 y no compra. Un comerciante
  que perdió varias veces contra el lobo obtiene valor alto.
- No se inventa una escala nueva: el tope es 2,5, lo que el motor ya asigna a equiparse.
- La herramienta de recolección no se paga sola a precio de mercado. Herramienta y armadura
  no reciben valoración nueva y sirven de control: sus compras no deben subir.
- Un agente en prueba de comercio revendería el arma que compró para usar. La sección 4.6
  define la condición para evitarlo.
- La oferta de armas es fija: nadie repone los mercados. Puede agotarse durante el experimento.

---

## 0. Verificación de las cifras del encargo

Todas se localizaron en `docs/ANALISIS_ARMAS_Y_TESORERIA.md` y en el código. Cuatro precisiones:

| Afirmación | Verificación |
|---|---|
| 405.517 decisiones analizadas; comprar no habría ganado en ninguna | Correcto (116.493 + 162.806 + 126.218). |
| Comprar tiene un máximo inferior a 0,7 | **Precisión.** La fórmula da un máximo de exactamente 0,7 (codicia 1 y riqueza como meta principal). El máximo *observado* fue 0,67. |
| La ganadora ronda 1,95 | Correcto: medianas 1,93, 1,99 y 1,96. |
| El arma añade 4 de poder; 33 % → 5 % y 56 % → 16 % | Correcto. Recalculado por enumeración de las 63 combinaciones. |
| La armadura reduce 15 % el daño y no participa en decisiones | Correcto. |
| Hay mantenimiento, desgaste y pérdida al morir | Correcto, con una **precisión nueva**: solo una institución del mundo repara (la Forja de Brynn). En las demás ciudades el equipo no se puede reparar. |
| La herramienta da "+25 % de recolección" (documento anterior) | **Precisión.** Da 25 % de probabilidad de obtener una unidad extra en cada recolección. |
| Hay stock de armas en los mercados | **Precisión nueva.** El equipo no se repone solo: cada mercado empieza con 10 y solo sube cuando alguien vende. Comprar exige más de 3 en stock. |

---

## 1. Diagnóstico del problema en el código

**[Hecho]** La puntuación de comprar es la misma para cualquier objeto:

```
codicia × 0,4 + peso de la meta "riqueza" × 0,3      (+ 2,5 si hay una prueba de comercio en curso)
```

No interviene el objeto, la ranura, el combate ni la salud. Las otras dos acciones de equipo
sí miran algo:

| Acción | Puntuación | Mira la ranura | Mira el combate |
|---|---|---|---|
| `trade_buy` | 0 a 0,7 | No | No |
| `craft` | margen de venta / 10, + 1,5 si la ranura está vacía | Sí | No |
| `equip_item` | 2,5 fijo | Solo se ofrece con la ranura vacía | No |

**[Hecho]** Fabricar solo lo pueden hacer novatos, herreros y maestros artesanos. Para las
demás clases, comprar es la única vía de conseguir equipo, y es la vía que no funciona.

**[Inferencia]** El defecto es de una sola pieza. No hace falta rediseñar la cadena.

---

## 2. Flujo actual de decisión

Referencias a archivos y funciones reales.

### A. Compra

| Paso | Dónde | Qué hace |
|---|---|---|
| Turno | `world.js`, `tick()` | Para cada agente vivo: necesidades, cárcel, invitaciones, actividad en curso; luego `survivalOverride()`; si no fuerza nada, `decide()`. |
| Candidatos | `actions.js`, `listCandidateActions()` | Recorre todos los bienes. Ofrece `trade_buy` de una unidad si el stock local es mayor que 3 y el oro alcanza para el precio × 1,05. |
| Precio | `economy.js`, `priceAt()` | `base × min(3, max(0,4, 25 / max(3, stock)))`. Con stock 10: × 2,5. |
| Impuesto | `economy.js`, `buy()` | 5 % en ciudades con gobierno (menos descuentos de oficio o de disputa). |
| Puntuación | `decision.js`, `scoreAction()`, `case "trade_buy"` | La fórmula de la sección 1, más `trialBonus()`. |
| Elección | `decision.js`, `decide()` | Ordena por puntuación. Elige la primera; con 8 % de probabilidad, la segunda. |
| Ejecución | `actions.js`, `trade_buy` | Descuenta oro, suma al inventario, cuenta como operación de comercio. |
| Equipar | `actions.js`, `equip_item` | Se ofrece en el turno siguiente si el objeto está en el inventario y la ranura está vacía. |

Precios efectivos con stock 10, con impuesto:

| Objeto | Base | Mercado | Con impuesto |
|---|---|---|---|
| Arma de hierro | 25 | 62,50 | 65,63 |
| Armadura de cuero | 20 | 50,00 | 52,50 |
| Herramienta de recolección | 18 | 45,00 | 47,25 |

**Información disponible al puntuar. [Hecho]** `scoreAction` recibe el agente completo
(equipo, inventario, oro, salud, necesidades, clase, niveles, memoria, últimas 20 decisiones)
y el mundo (mercados, mundo semilla). No hay nada que añadir al estado.

**Restricciones. [Hecho]** Equipar no tiene requisito de clase ni de nivel. La compra no
comprueba si el agente ya tiene el objeto: hoy podría comprar duplicados.

**Competencia. [Hecho]** Contra una ganadora de mediana 1,95, comprar (máximo 0,7) nunca gana.

### B. Equipo y supervivencia

| Elemento | Dónde | Regla |
|---|---|---|
| Poder de combate | `progression.js`, `effectiveCombatPower()` | base de clase × 3 + crecimiento por nivel de oficio + 4 si lleva arma con durabilidad |
| Resultado de la pelea | `actions.js`, `resolveSoloFight()` | (poder + azar de −3 a +5 − 1,5 por nivel base faltante) contra (poder del monstruo + azar de −2 a +4); × 0,55 si el enemigo es para grupo |
| Daño | `actions.js`, `applyCombatDamage()` | Al azar; la armadura con durabilidad resta 15 % |
| Estimación de peligro | `decision.js`, `case "fight_monster"` | Factor 1, 0,55 o 0,15 según el poder supere al del monstruo en 15 %, 75 %, o menos |
| Desgaste | `actions.js`, `wearEquipmentFromCombat()` | Arma y armadura pierden de 1 a 3 por pelea; a 0 desaparecen. Unas 60 peleas. |
| Herramienta | `actions.js`, `gather` | 25 % de probabilidad de +1 unidad; pierde de 1 a 3 por recolección. Unas 50 recolecciones. |
| Mantenimiento | `world.js`, `tickEquipmentMaintenance()` | 1 de oro por pieza equipada por día |
| Reparación | `listCandidateActions()` | Solo bajo la mitad de durabilidad y solo donde la institución repara: Brynn. Arma entera: 15 de oro. |
| Muerte | `actions.js`, `handleDeath()` | Se pierde todo el equipo y el oro |
| Presión económica | `decision.js`, `case "work"` | Bajo 15 de oro, trabajar gana hasta 2,5 puntos (Step 5) |
| Memoria de derrotas | `decision.js`, `defeatPenalty()` | Derrotas propias por monstruo, ventana de 7 días (Step 14) |

**Gastos repetitivos o compras sin utilidad. [Inferencia]** Con la lógica actual no ocurren
porque casi no se compra. Con una valoración nueva aparecen tres riesgos concretos, tratados
en la sección 6: duplicados, recompra tras cada rotura, y reventa del objeto recién comprado.

### C. Determinismo y arquitectura

- **[Hecho]** `availableEncounters()` consume números del generador de azar. **No debe
  llamarse desde la puntuación.** La propuesta usa solo datos fijos: definiciones de monstruos
  y la memoria del agente.
- **[Hecho]** `priceAt()`, `effectiveCombatPower()` y `goalWeight()` son funciones puras.
- **[Hecho — corregido tras la implementación]** `scoreAction()` suma a cada acción un ruido
  al azar de entre −0,3 y +0,3, y además hay un 8 % de probabilidad de elegir la segunda
  opción. Las versiones anteriores de este documento decían que no había ruido al puntuar; era
  un error mío de lectura. Consecuencias: el salto de 0,47 de la sección 4.2 es del mismo
  orden que el ruido, y la afirmación "comprar no habría ganado en ninguna de 405.517
  decisiones" se calculó sin ruido (ver el reporte de implementación).
- **[Inferencia]** Cualquier cambio de conducta altera la secuencia de azar del mundo y con
  ella toda la trayectoria. Por eso los resultados se atribuyen con métricas directas (compras,
  equipamientos) y tres seeds, no con cifras globales.

Tests que protegen hoy esta zona: `craft_instance.test.js` (fabricar y equipar),
`equipment_maintenance.test.js`, `defeat_memory.test.js`, `economic_pressure.test.js`.
Ningún test cubre la puntuación de `trade_buy`.

---

## 3. Alternativas de diseño

| | Qué hace | A favor | En contra |
|---|---|---|---|
| **1. Bono por ranura vacía** | Suma un valor fijo a comprar si la ranura está vacía, como ya hace fabricar | Una línea | Es la bonificación arbitraria que el encargo pide evitar. Compraría todo el que tenga oro, pelee o no. |
| **2. Valor económico completo** | Convierte todo a oro: salud ahorrada, riesgo de muerte, mantenimiento, vida útil | La más "racional" en apariencia | Exige inventar cuánto vale un punto de salud y estimar la probabilidad de morir. Muchos supuestos, difícil de auditar. |
| **3. Necesidad vivida (recomendada)** | El valor sale de las derrotas que el agente recuerda y de cuánto bajaría su probabilidad de perder contra esos enemigos | Usa memoria y reglas que ya existen. Selectiva por construcción. Fácil de explicar dentro del mundo. | Solo reacciona después de perder. No previene la primera derrota. |
| **4. Necesidad anticipada** | Como la 3, más un valor por los monstruos de las zonas vecinas aunque no haya perdido | Previene | Hay que decidir contra qué monstruo se evalúa a un agente que está en una ciudad sin monstruos. Tiende a que compre cualquiera que viva cerca de un bosque. |

Sobre la alternativa 2, un cálculo ilustrativo de por qué no la recomiendo. **[Inferencia]**
Si un punto de salud valiera lo que cuesta en pociones (35 de salud por 10 de oro base), un
arma le ahorraría a un comerciante unos 91 de oro en salud a lo largo de su vida útil, contra
66 de precio más el mantenimiento: prácticamente empate. El motivo real para armarse es no
morir, y eso requiere un modelo que hoy no existe.

---

## 4. Propuesta recomendada: necesidad vivida

**[Propuesta]** Tres piezas.

### 4.1 Necesidad, entre 0 y 1

Para un arma:

1. Si la ranura de arma está ocupada o ya hay un arma en el inventario: **0**.
2. Por cada derrota individual que el agente recuerda en los últimos 7 días (la misma memoria
   y la misma ventana del Step 14), calcular cuánto bajaría su probabilidad de perder contra
   ese mismo monstruo si llevara el arma.
3. Sumar esas mejoras, cada una pesada por lo reciente que es (1 hoy, 0 a los 7 días).
4. Tope en 1.

La probabilidad de perder se obtiene enumerando las 63 combinaciones de azar de la regla de
combate actual. **[Hecho]** Valores resultantes, sin arma / con arma:

| Clase | Lobo | Bandido | Trol | Espectro |
|---|---|---|---|---|
| Comerciante, curandero, erudito | 33 % / 5 % | 56 % / 16 % | 95 % / 67 % | 100 % / 95 % |
| Herrero, novato | 10 % / 0 % | 24 % / 2 % | 76 % / 33 % | 98 % / 76 % |
| Pícaro | 0 % / 0 % | 5 % / 0 % | 44 % / 10 % | 84 % / 44 % |
| Explorador (nivel de oficio 1) | 0 % / 0 % | 0 % / 0 % | 16 % / 0 % | 56 % / 16 % |
| Guerrero | 0 % / 0 % | 0 % / 0 % | 0 % / 0 % | 0 % / 0 % |

Lo que produce:

| Agente | Recuerdos | Necesidad |
|---|---|---|
| Comerciante que no pelea | ninguno | 0 |
| Guerrero | cualquiera | 0: el arma no le cambia nada |
| Comerciante, una derrota reciente contra el lobo | 1 | 0,29 |
| Comerciante, dos derrotas recientes contra el bandido | 2 | 0,79 |
| Comerciante, tres derrotas recientes | 3 | 1 (tope) |
| Herrero, una derrota reciente contra el bandido | 1 | 0,22 |

La armadura no usa esta fórmula. Ver sección 4.5.

### 4.2 Asequibilidad, entre 0 y 1

- **Reserva mínima:** si después de pagar le quedarían menos de 15 de oro, la necesidad no
  cuenta. 15 es el umbral que el motor ya usa para la presión económica (Step 5).
- **Parte de la riqueza:** `1 − coste / oro`. Gastar casi todo el oro vale poco; gastar una
  parte pequeña vale casi todo. Con 131 de oro, un arma de 65,63 da 0,5; con 656, da 0,9.

No se añade un término de hambre ni de salud. **[Hecho]** Comer ya puntúa `hambre × 3,5` y la
regla de supervivencia se impone antes de decidir; un agente hambriento ya prioriza comer.

#### Límites de la reserva mínima (revisión 3)

**Qué coste se usa. [Propuesta, precisa]** `precio local × 1,05`. Es la misma cuenta que
`listCandidateActions()` ya usa para decidir si ofrece la compra. Es un techo: lo que el
agente paga de verdad puede ser menos (un comerciante con descuento de impuesto, o un mercado
sin gobierno, que no cobra impuesto). Consecuencia: tras una compra con valor de necesidad, al
agente le quedan **siempre al menos 15 de oro**.

**Tres tramos de oro**, con el arma a 65,63 (stock 10):

| Oro del agente | La compra se ofrece | Valor por necesidad |
|---|---|---|
| Menos de 65,63 | No (regla actual) | — |
| De 65,63 a 80,62 | Sí | **0**: no le quedarían 15. La puntuación es la de hoy. |
| 80,63 o más | Sí | `2,5 × necesidad × (1 − 65,63 / oro)` |

**El salto.** En 80,63 el valor pasa de 0 a `2,5 × necesidad × 0,186`: como máximo **0,47**,
con necesidad plena.

| Oro | Parte de la riqueza | Valor máximo (necesidad 1) |
|---|---|---|
| 80,62 | — | 0 |
| 80,63 | 0,186 | 0,47 |
| 100 | 0,344 | 0,86 |
| 131 | 0,500 | 1,25 |
| 200 | 0,672 | 1,68 |
| 300 | 0,781 | 1,95 |
| 656 | 0,900 | 2,25 |
| 2.000 | 0,967 | 2,42 |

El umbral se mueve con el precio. Con stock 9 el arma cuesta 72,91 y el umbral es 87,91
(salto máximo 0,43); con stock 8 o menos cuesta 78,75 y el umbral es 93,75 (salto máximo 0,40).

**Qué significa el salto en la práctica.**

- **[Hecho]** En el umbral, la puntuación total de comprar es como máximo 0,7 + 0,47 = 1,17.
- **[Hecho]** La acción ganadora tuvo una mediana de 1,93 a 1,99 en las 405.517 decisiones medidas.
- **[Inferencia]** Justo por encima del umbral la compra casi nunca gana, así que el salto
  rara vez cambia una decisión. No puedo decir "nunca": solo medí la mediana de la puntuación
  ganadora, no su distribución.
- **[Inferencia]** Con necesidad plena, el valor por sí solo alcanza la mediana de la ganadora
  recién con unos 300 de oro. Los agentes con poco oro no comprarán aunque acumulen derrotas.
  Referencia: el oro mediano en las derrotas sin arma de agremiados fue 513, 301 y 1.143, y
  el percentil 25 fue 90, 36 y 307.

**Alternativa sin salto, documentada y no adoptada.** `máx(0, 1 − (coste + 15) / oro)` empieza
en 0 en el umbral y crece sin escalón. Usa los mismos dos números.

| Oro | Fórmula aprobada | Variante continua |
|---|---|---|
| 80,63 | 0,47 | 0 |
| 100 | 0,86 | 0,48 |
| 131 | 1,25 | 0,96 |
| 300 | 1,95 | 1,83 |
| 2.000 | 2,42 | 2,40 |

No la adopto: el PO aprobó la fórmula actual, el salto está acotado en 0,47 y la variante
vuelve la compra todavía más improbable para quien tiene entre 80 y 300 de oro. Queda a
disposición del PO (decisión D7).

### 4.3 Puntuación

```
valor de compra = 2,5 × necesidad × asequibilidad
```

2,5 no es un número nuevo: es lo que el motor asigna a equipar un objeto. Comprar un arma que
se necesita y equiparla son dos mitades del mismo acto, y la compra no debería valer más que
el equipamiento.

Se suma a la puntuación actual de comprar. Con necesidad 0 la puntuación no cambia, así que
**las compras de todos los demás bienes quedan idénticas**.

Efecto frente a la ganadora típica (1,95):

| Caso | Valor añadido | ¿Compra? |
|---|---|---|
| Sin derrotas recordadas | 0 | No |
| Una derrota contra el lobo, mucho oro | 0,7 | Casi nunca |
| Dos derrotas contra el bandido, mucho oro | 2,0 | A menudo |
| Tres o más derrotas, mucho oro | 2,5 | Casi siempre |
| Tres o más derrotas, oro justo | menos de 0,5 | No |

### 4.4 La herramienta de recolección

**[Hecho + cálculo]** Una herramienta dura unas 50 recolecciones y da 25 % de probabilidad de
una unidad extra: unas 12,5 unidades en toda su vida. Los recursos se venden al mercado a
85 % de su precio, y donde se producen el stock es alto y el precio bajo. Valor de esas 12,5
unidades: entre 9 y 40 de oro para los recursos comunes. Coste: 47,25.

No se paga sola, salvo para las reliquias de Kestal (base 40).

**[Propuesta]** En el primer experimento la herramienta **no recibe valoración nueva**. Las
compras de herramienta deben seguir en el nivel actual. Si suben, algo se filtró.

### 4.5 La armadura: excluida de este experimento

**El error de la primera versión.** Sumaba 0,15 por derrota recordada en la misma escala que
el arma. Eso mezclaba dos unidades: el arma se medía en probabilidad de perder y la armadura
en fracción de daño. El PO tiene razón: no son comparables y el 0,15 quedaba como un número
puesto a mano.

**Qué hace realmente la armadura. [Hecho]** No cambia quién gana. Reduce 15 % el daño
recibido. Ese daño menor solo tiene una consecuencia que el motor distingue: no morir.

**Cuándo evita una muerte. [Cálculo sobre las reglas]** Al perder una pelea individual el daño
va de 15 a 40; con armadura, de 13 a 34. El motor solo ofrece pelear con salud mayor que 20.
Probabilidad de morir al perder, según la salud con que se entra a la pelea:

| Salud al pelear | Sin armadura | Con armadura |
|---|---|---|
| 21 | 77 % | 62 % |
| 30 | 42 % | 23 % |
| 35 | 23 % | 0 % |
| 41 o más | 0 % | 0 % |

El beneficio existe solo cuando el agente pelea con entre 21 y 40 de salud. Con más salud, la
armadura no cambia nada que el motor registre.

**Por qué no se puede valorar de forma defendible hoy.**

1. El beneficio depende de la salud **en el momento de la pelea**, no en el de la compra. El
   agente compra en una ciudad, normalmente descansado.
2. El agente no guarda con qué salud peleó ni cuánto daño recibió. El recuerdo de una derrota
   tiene el monstruo y la fecha, nada más. Valorarlo exigiría guardar datos nuevos en la
   memoria, y el encargo pide no tocar la memoria de derrotas.
3. La alternativa sería convertir "salud ahorrada" en valor, y el motor no tiene ninguna
   equivalencia entre salud y utilidad. Habría que inventarla.
4. El daño que motivó este Step es perder peleas. La armadura no cambia eso, así que los
   criterios de aceptación no la miden.
5. **[Hecho]** La armadura ya es el objeto más llevado: 16, 17 y 27 agentes al final, contra
   8, 10 y 14 con arma. No hay evidencia de que falte.

**[Propuesta]** Excluir la armadura de este primer experimento. Sigue comprándose con la
puntuación actual, sin valoración nueva, y pasa a ser un **segundo control** junto con la
herramienta.

**Qué haría falta para incluirla después.** Medir, sobre las corridas existentes, cuántas
peleas se dan con salud entre 21 y 40 y cuántas muertes por combate ocurren con y sin
armadura. Con 55 muertes por combate entre los tres mundos la muestra es chica. No lo
propongo ahora.

### 4.6 Condición para no ofrecer la venta del arma que se necesita

**Cómo se ofrece vender equipo hoy. [Hecho, `listCandidateActions()`]** Se ofrece vender un
objeto de equipo si el agente lo tiene en el inventario y **no es igual a ninguno de los que
lleva equipados**. La venta es siempre por toda la cantidad que tiene.

**[Propuesta]** Una sola condición adicional, solo para armas.

**El arma queda reservada cuando se cumplen las tres cosas a la vez:**

1. La ranura de arma del agente está vacía.
2. Tiene al menos un arma en el inventario.
3. Su **mejora por arma** es mayor que 0.

**Mejora por arma** es la suma de la sección 4.1 (derrotas individuales recordadas en los
últimos 7 días, pesadas por lo reciente, por lo que el arma bajaría la probabilidad de perder
contra ese monstruo), calculada sin mirar el inventario. Es la misma cuenta que usa la compra.

**Qué pasa cuando está reservada:** la cantidad que se ofrece vender es el inventario menos
una unidad. Si eso da 0, no se ofrece vender. Si el agente tiene tres armas, se ofrecen dos.

**Cuándo deja de estar reservada, sin ninguna regla extra:**

| Situación | Por qué termina |
|---|---|
| El agente la equipa | La condición 1 deja de cumplirse. Desde ahí rige la regla actual. |
| Pasan 7 días sin nuevas derrotas | Los recuerdos vencen; la mejora vuelve a 0 y la venta se ofrece como hoy. |
| Cambia a una clase a la que el arma no le mejora nada | La mejora es 0. |
| Muere | Pierde el inventario. |

No es un bloqueo permanente ni toca la venta de ningún otro bien. La armadura y la
herramienta se venden como hoy.

**Por qué no hay riesgo de que la guarde para siempre. [Hecho]** Equipar se ofrece en cada
turno mientras tenga el arma y la ranura vacía, con puntuación fija de 2,5.

**Verificable con estos casos:**

| Caso | Resultado esperado |
|---|---|
| Ranura vacía, 1 arma, mejora mayor que 0 | No se ofrece vender el arma; sí equiparla |
| Ranura vacía, 1 arma, mejora 0 | Se ofrece vender, igual que hoy |
| Ranura vacía, 3 armas, mejora mayor que 0 | Se ofrece vender 2 |
| Arma equipada | Idéntico a hoy |
| Mismo agente, 8 días después sin nuevas derrotas | Se vuelve a ofrecer vender |
| Armadura, herramienta y demás bienes | Idéntico a hoy en todos los casos |

En la simulación: el número de armas compradas por un agente con mejora mayor que 0 y
revendidas antes de equiparlas debe ser 0 mientras la mejora siga activa.

### 4.7 Equipamiento posterior a la compra (revisión 3)

La reserva impide vender el arma necesaria. **No garantiza que se equipe.** No se propone
ningún bloqueo nuevo para forzarlo.

**Contra qué compite equipar. [Hecho, del código]** Equipar puntúa 2,5 fijo y se ofrece en
cada turno mientras el arma esté en el inventario y la ranura vacía.

| Acción rival | Puntuación | ¿Supera a equipar (2,5)? |
|---|---|---|
| Acción ganadora típica | mediana 1,93 a 1,99 | Normalmente no |
| Conversar | sociabilidad × 2 + pertenencia × 1,5 + necesidad social × 1,5 | A veces, en agentes muy sociables |
| Comer | hambre × 3,5 | Sí, con hambre sobre 0,71 |
| Comprar durante una prueba de comercio | hasta 0,7 + 2,5 = 3,2 | **Sí, siempre** |
| Vender durante una prueba de comercio | 1,3 + codicia × 0,5 + 2,5 = 3,8 a 4,3 | **Sí, siempre** |

**[Inferencia]** Un agente sin prueba de comercio activa equipará en pocos turnos. Un agente
con una prueba de comercio activa tiene casi siempre alguna compra o venta disponible que
puntúa más que equipar, así que puede quedarse con el arma reservada sin equiparla mientras
dure la prueba.

**A quién afecta. [Hecho]** Las pruebas de comercio son tres: Comerciante (10 operaciones,
desde novato), Mercader de Ruta (30) y Contrabandista (18). La de Comerciante se completa en
horas en los casos vistos. La de Mercader de Ruta no puede completarse sin una posición de 15
ante el mercado de Tejor: en el mundo a hay 4 agentes con esa prueba abierta de forma
permanente (no se midió en b ni c).

**[Hipótesis]** Esos agentes comprarán el arma, no la venderán y no la equiparán. Es una
limitación conocida de este experimento, causada por un defecto ya registrado (la prueba
imposible), no por la valoración.

**Qué hace el diseño al respecto:** medirlo, sin forzarlo.

- Las pruebas de integración miden la cadena **derrota → compra → equipamiento** y el tiempo
  de cada tramo, con y sin prueba de comercio activa (sección 7).
- En la simulación, el tiempo entre compra y equipamiento se reporta separado por "con prueba
  de comercio activa" y "sin ella". Los eventos de inicio de prueba y de cambio de clase
  permiten reconstruir cuándo estaba activa.
- Para distinguir una compra por necesidad de una compra de mercancía, la decisión agrega una
  razón de texto cuando el valor por necesidad es mayor que 0, igual que hizo el Step 14 con
  "recuerda derrotas recientes". Las razones ya se guardan en el log de decisiones. No cambia
  ninguna puntuación.

**Lo que no se hace:** no se bloquea comerciar, no se cambia la puntuación de equipar y no se
toca la prueba de Mercader de Ruta. Si los datos muestran que esos agentes nunca equipan, se
lleva al PO como decisión aparte.

---

## 5. Pseudocódigo ilustrativo

**Esto no es código del proyecto.** Es una ilustración del diseño; los nombres son provisionales.

```
// PROPUESTA — no existe en el repositorio

probabilidadDePerder(poder, monstruo, agente):
    poder = poder − 1,5 × niveles base que le faltan para ese monstruo
    derrotas = 0
    para cada azarAgente de −3 a +5:
        para cada azarMonstruo de −2 a +4:
            p = poder + azarAgente
            si el monstruo es para grupo: p = p × 0,55
            si p < monstruo.poder + azarMonstruo: derrotas += 1
    devolver derrotas / 63

// cuenta comun a la compra y a la reserva de venta; no mira el inventario
mejoraPorArma(mundo, agente):
    poderSinArma = poderDeCombate(agente) sin contar el arma
    bono = bono de poder del arma (4)
    total = 0
    para cada recuerdo de derrota individual del agente en los ultimos 7 dias:
        frescura = 1 − edad / 168
        monstruo = definicion(recuerdo.familia, recuerdo.rango)
        total += frescura × ( probabilidadDePerder(poderSinArma, monstruo)
                              − probabilidadDePerder(poderSinArma + bono, monstruo) )
    devolver min(1, total)

valorDeCompra(mundo, agente, objeto):
    si objeto no es un arma: devolver 0                     // armadura y herramienta: sin cambio
    si agente.equipo.arma existe o agente.inventario[objeto] > 0: devolver 0
    necesidad = mejoraPorArma(mundo, agente)
    si necesidad == 0: devolver 0
    coste = precioLocal(objeto) × 1,05                      // el mismo techo que usa la oferta de compra
    si agente.oro − coste < 15: devolver 0                  // tramo 65,63 a 80,62: valor 0
    devolver 2,5 × necesidad × (1 − coste / agente.oro)

// en la puntuacion de comprar, se sumaria:
valor = valorDeCompra(mundo, agente, objeto)
puntuacion += valor
si valor > 0: agregar la razon "necesita un arma: recuerda derrotas que un arma habria evitado"

// en la lista de acciones, al ofrecer vender un arma del inventario:
cantidad = agente.inventario[arma]
si agente.equipo.arma no existe y mejoraPorArma(mundo, agente) > 0:
    cantidad = cantidad − 1                                 // reserva una unidad
si cantidad > 0: ofrecer vender esa cantidad
```

---

## 6. Archivos afectados y riesgos de regresión

| Archivo | Cambio | Riesgo |
|---|---|---|
| `src/engine/progression.js` | Funciones puras nuevas: probabilidad de perder y mejora por arma | Bajo. No cambia ninguna función existente. |
| `src/engine/decision.js` | Una línea en `case "trade_buy"` | Bajo. Con necesidad 0 la puntuación es idéntica a la actual. |
| `src/engine/actions.js` | La condición de la sección 4.6 al ofrecer vender un arma | Medio: toca la lista de acciones ofrecidas |
| `src/engine/tests/` | Un archivo de test nuevo | Ninguno |

No cambian `economy.js`, `world.js`, el mundo semilla ni el formato del estado.

**Por qué tres archivos y no dos (cambio respecto a la primera versión). [Hecho]**
`decision.js` importa de `actions.js`. Si `actions.js` importara la cuenta desde
`decision.js`, la importación sería circular. `progression.js` ya lo importan los dos y ya
contiene el cálculo del poder de combate, así que es el lugar natural para la cuenta común.

### Riesgos

1. **Reventa del arma comprada para usar. [Hecho + inferencia]** Vender puntúa 1,3 más
   codicia × 0,5, y gana 2,5 adicionales durante una prueba de comercio: hasta 4,3, contra 2,5
   de equipar. Un comerciante en prueba compraría el arma por necesidad y la revendería antes
   de equiparla. La auditoría midió 4 agentes con esa prueba abierta de forma permanente y
   reventas de equipo en 1 a 2 horas. **Sin resolver esto, el experimento no es válido para
   los comerciantes, que son la clase que más pierde.** La condición de la sección 4.6 lo cubre.
2. **Dos copias de la regla de combate.** La probabilidad de perder repetiría en `decision.js`
   la cuenta que hace `resolveSoloFight()`. Si un día cambia el combate, divergen en silencio.
   Mitigación: un test que compare la enumeración con la frecuencia real de la función de
   combate. No propongo refactorizar el combate en este Step.
3. **Recompra tras cada rotura.** Un arma dura unas 60 peleas y casi no se puede reparar. Tras
   romperse, la ranura queda vacía; el agente solo recompra si vuelve a acumular derrotas.
   **[Hipótesis]** Eso produce un ciclo comprar → pelear armado → romper → perder → comprar.
   Es coherente, pero hay que medir cuánto oro se lleva.
4. **Oferta de armas fija. Corrección de la primera versión.** Escribí que "solo los herreros
   que venden reponen" el stock. No lo había verificado y es incorrecto.
   - **[Hecho, del código]** Un agente no puede vender un objeto igual al que lleva equipado.
     Un herrero armado no puede vender las armas que fabrica.
   - **[Hecho, medido]** Ventas de equipo al mercado por clase en el Step 14: comerciantes
     439, 810 y 84; novatos 10, 4 y 4; herreros, ninguna. Se fabricaron 403, 278 y 1.219 armas.
   - **[Hecho]** El equipo no se repone solo. Cada mercado empieza con 10 armas y admite 7
     compras antes de dejar de ofrecerlas (de 10 a 3 en stock), con el precio subiendo a 75.
   - **[Inferencia]** Hay unas 42 armas comprables en las seis ciudades con gobierno para toda
     la corrida (63 contando las zonas salvajes). Un arma comprada y usada no vuelve al mercado.
   - **[Hipótesis]** La oferta se agotará en las ciudades más pobladas antes del día 300, y
     desde ahí la necesidad no podrá satisfacerse. El experimento lo mediría; no lo evita.
5. **Más agentes armados, más peleas.** Con arma, el factor de peligro contra el bandido pasa
   de 0,55 a 1 para un comerciante: pelear le resultará más atractivo. Es coherente, y sube
   el volumen de combate.
6. **Solo reacciona tras perder.** Entre 40 % y 52 % de las derrotas ocurren sin derrota previa
   reciente; esas no cambian.
7. **Efecto mariposa.** Las cifras globales (combate en grupo, oro total) variarán por la sola
   desviación de trayectoria.

---

## 7. Plan de pruebas y métricas

Plan final (revisión 3). Un archivo nuevo, `src/engine/tests/equipment_purchase.test.js`, con
el mismo estilo de los tests existentes (sin dependencias, seeds fijas).

### A. Pruebas unitarias: probabilidad de perder y mejora por arma

| # | Caso | Resultado esperado |
|---|---|---|
| U1 | Poder 6 contra lobo y bandido | 21/63 y 35/63 (33 % y 56 %) |
| U2 | Poder 10 contra lobo y bandido | 3/63 y 10/63 (5 % y 16 %) |
| U3 | Guerrero contra cualquier monstruo común | 0 con y sin arma |
| U4 | Monstruo con nivel base mínimo, agente por debajo | Se resta 1,5 por nivel faltante, como en el combate |
| U5 | Monstruo para grupo | Se aplica el factor 0,55, como en el combate |
| U6 | **Concordancia con el combate real** | Sobre miles de peleas con seed fija, la frecuencia de derrota de la función de combate queda dentro de un margen fijado de la enumeración |
| U7 | Sin derrotas recordadas | Mejora 0 |
| U8 | Comerciante: una derrota fresca contra el lobo; dos contra el bandido; tres | 0,29; 0,79; 1 (tope) |
| U9 | Derrota a mitad de la ventana; derrota de más de 7 días | La mitad del peso; 0 |
| U10 | Guerrero con derrotas recordadas | Mejora 0 |
| U11 | Recuerdo de victoria, o recuerdo sin monstruo | No cuenta |

### B. Pruebas unitarias: valor de compra y límites de asequibilidad

| # | Caso | Resultado esperado |
|---|---|---|
| A1 | Oro 65,62 | La compra del arma no se ofrece (regla actual, sin cambio) |
| A2 | Oro 65,63 y oro 80,62, con mejora 1 | Se ofrece; valor por necesidad **0**; puntuación idéntica a la de hoy |
| A3 | Oro 80,63, con mejora 1 | Valor `2,5 × 0,186` = 0,47. Es el salto documentado en 4.2 |
| A4 | Oro 80,63 → 100 → 131 → 300 → 2.000 | El valor crece de forma monótona y nunca llega a 2,5 |
| A5 | Stock 9 y stock 8 | El umbral pasa a 87,91 y 93,75 |
| A6 | Ranura ocupada, o arma ya en el inventario | Valor 0 (sin duplicados) |
| A7 | Mejora 0, con cualquier oro | Puntuación idéntica a la de hoy |
| A8 | Sal, grano, herramienta y **armadura**, con derrotas recordadas y oro de sobra | Puntuación idéntica a la de hoy (controles) |
| A9 | Tras ejecutar una compra con valor mayor que 0 | Al agente le quedan al menos 15 de oro, también con descuento de impuesto |
| A10 | Valor mayor que 0 | La razón de texto aparece en la decisión; con valor 0 no aparece |

### C. Pruebas unitarias: reserva de venta (sección 4.6)

| # | Caso | Resultado esperado |
|---|---|---|
| R1 | Ranura vacía, 1 arma, mejora mayor que 0 | No se ofrece vender el arma; sí equiparla |
| R2 | Ranura vacía, 1 arma, mejora 0 | Se ofrece vender, como hoy |
| R3 | Ranura vacía, 3 armas, mejora mayor que 0 | Se ofrece vender 2 |
| R4 | Arma equipada | Lista de acciones idéntica a la de hoy |
| R5 | El mismo agente de R1, 8 días después, sin derrotas nuevas | Se vuelve a ofrecer vender |
| R6 | Armadura, herramienta y demás bienes en todos los casos anteriores | Ventas idénticas a las de hoy |
| R7 | Con el arma reservada | Todas las demás acciones siguen ofreciéndose: no hay bloqueos nuevos |

### D. Pruebas de integración: derrota → compra → equipamiento

Mundo mínimo, seed fija, sin simulación completa. Cada prueba **mide e imprime** los turnos
entre los tres momentos. Se afirma solo lo que el diseño garantiza.

| # | Escenario | Qué se afirma | Qué se mide y reporta |
|---|---|---|---|
| I1 | Comerciante sin prueba de comercio, 500 de oro, en ciudad con mercado, con tres derrotas frescas contra el bandido | Compra el arma y la equipa dentro de un máximo de turnos fijado | Turnos hasta la compra; turnos de la compra al equipamiento |
| I2 | El mismo agente, sin recuerdos de derrota | No hay compra con valor por necesidad | — |
| I3 | **Cadena completa con combate real:** un comerciante pierde peleas reales en zona de monstruos (los recuerdos los crea el código del Step 14), llega a una ciudad con mercado, compra y equipa | El recuerdo existe, la compra ocurre con la razón de necesidad y el arma termina equipada | Turnos de la primera derrota a la compra, y de la compra al equipamiento |
| I4 | **Con prueba de comercio activa** y necesidad mayor que 0 | Solo los invariantes: el arma **no se vende** mientras la mejora sea mayor que 0, y ninguna acción queda bloqueada | Si llega a equiparla dentro del máximo de turnos, y cuándo. **No se afirma que la equipe.** |
| I5 | Oro 80 y oro 81, con mejora 1 | Con 80 no hay valor por necesidad | Si compra o no con 81 y con 300 |
| I6 | El arma se rompe (durabilidad a 0) sin derrotas nuevas; después con derrotas nuevas | Sin derrotas nuevas no hay recompra por necesidad | Turnos hasta la recompra cuando vuelve a perder |
| I7 | Agente con arma equipada que sigue perdiendo | No compra una segunda arma | — |

La prueba I4 documenta la limitación de la sección 4.7 en vez de ocultarla: si el agente no
equipa, el test lo reporta y no falla.

### E. Regresión

La suite completa (13 archivos) debe pasar **sin modificar ningún test existente**. Los que
tocan esta zona: `craft_instance`, `equipment_maintenance`, `defeat_memory` y
`economic_pressure`.

### F. Verificación de alcance antes de simular

- El diff del motor contiene solo `progression.js` (funciones nuevas), `decision.js` (el caso
  de comprar y la razón de texto) y `actions.js` (la cantidad ofrecida al vender un arma).
- Ninguna función existente de combate, memoria, mercado o economía cambia.
- No se añade ninguna llamada al generador de azar.

### Métricas del experimento

| Métrica | Fuente | Tipo |
|---|---|---|
| Compras de arma, armadura y herramienta, por clase | eventos `trade_buy` | Directa |
| Compras seguidas de un `equip` del mismo objeto en 24 h | eventos | Directa |
| Compras revendidas sin equipar | eventos `trade_buy` y `trade_sell` | Directa |
| Agentes que equipan alguna vez; tiempo desde la primera derrota hasta el primer `equip` | eventos | Directa |
| Oro antes y después de cada compra | log de decisiones (`oro=`) | Directa |
| Mantenimiento pagado | `stats.equipmentMaintenancePaid` | Directa |
| Reparaciones | eventos `repair` | Directa |
| Stock y precio de armas por mercado al final | `state.json` | Directa (solo el valor final) |
| Derrotas individuales con y sin equipo | eventos | **Aproximada**: "con equipo" es haber equipado desde el último renacimiento; no ve roturas |
| Roturas de equipo | — | **No medible hoy**: la rotura no emite evento |
| Derrotas de quien podía pagar el arma | eventos + log | Aproximada, mismo método del análisis previo |
| Muertes por combate y por hambre | `deathHistory` | Directa |
| Agentes con menos de 5 de oro; duración de las rachas de pobreza | log de decisiones | Directa |
| Reparto de acciones: trabajar, comerciar, recolectar, conversar | eventos | Directa |
| Diferencias por clase y por cuartil de riqueza | eventos + log | Directa |

Las roturas pueden estimarse (un `equip` nuevo en una ranura sin muerte intermedia implica una
rotura previa), pero no observarse.

---

## 8. Criterios de aceptación

**Propuestos por el equipo. No son resultados demostrados.** El PO puede cambiarlos antes de
ver datos. Línea base: las tres corridas del Step 14.

| # | Criterio | Línea base | Umbral propuesto | Por qué |
|---|---|---|---|---|
| 1 | Compras de arma que terminan equipadas en 24 h | Casi ninguna: se revenden | Más de la mitad, en los tres mundos | Mide que se compra para usar |
| 2 | Compras con valor de necesidad por parte de agentes sin derrotas recordadas | — | 0 | Es una propiedad del diseño; si falla, hay un error |
| 3 | Agentes con arma al final | 8, 10 y 14 de 70 | Más que la línea base y **no más de 35** en ningún mundo | Por encima de la mitad sería compra indiscriminada |
| 4 | Derrotas sin arma de quien podía pagarla | 149, 158 y 339 | Baja en los tres mundos y al menos 25 % en total | Es el daño que motivó el Step |
| 5 | Compras de herramienta | 134, 299 y 54 | Sin aumento atribuible | Control: no recibe valoración nueva |
| 6 | Muertes por hambre | 2, 0 y 0 | No suben | Salvaguarda |
| 7 | Agentes con menos de 5 de oro al final | 18, 13 y 5 | No suben más de 5 en ningún mundo | Que equiparse no los deje sin recursos |
| 8 | Duración mediana de las rachas de pobreza | 6, 9 y 9 horas | No se duplica | Misma salvaguarda |
| 9 | Suite de tests | 13 de 13 | 13 de 13 más los nuevos | Sin regresiones |

**Decisión según el resultado:**

| Resultado | Decisión |
|---|---|
| Se cumplen 1 a 5 y ninguna salvaguarda (6 a 8) falla | Aceptar |
| Se cumple 4 pero falla alguna salvaguarda | Rechazar: la mejora se pagó con supervivencia |
| Se cumplen 1 a 3 pero 4 no baja | Revisar: se equipan y no pierden menos; apunta a roturas o al cálculo de peligro |
| Falla 3 por exceso | Revisar: el diseño no es selectivo |
| Falla 1 | Revisar la reventa (sección 10) antes de cualquier otra cosa |

Una reducción de derrotas no cuenta como éxito si las salvaguardas 6 a 8 fallan.

### 8.1 Criterios añadidos (aprobados por el PO en la revisión 3)

Los nueve criterios de arriba quedan **exactamente como estaban**. El PO aprobó sumar estos tres.

| # | Criterio | Línea base | Umbral | Por qué |
|---|---|---|---|---|
| 5b | Compras de armadura | 173, 259 y 32 | Sin aumento atribuible | Segundo control: la armadura no recibe valoración nueva |
| 10 | Armas compradas por un agente con mejora mayor que 0 y revendidas antes de equipar | — | 0 | Comprueba la condición de la sección 4.6 |
| 11 | Mercados con 3 armas o menos al final (oferta agotada) | 0, 0 y 1 | Solo se reporta, sin umbral | Indica si la oferta fija limitó el resultado |

**Advertencia sobre los criterios 3 y 4, sin modificarlos.** Con la oferta fija de la sección
6, el número de agentes armados y la baja de derrotas pueden quedar limitados por el stock y
no por la decisión. Si el criterio 11 muestra mercados agotados, un resultado flojo en 3 o 4
no debe leerse como fallo de la valoración.

### 8.2 Una ambigüedad en el criterio 1, sin modificarlo (revisión 3)

El criterio 1 dice: "compras de arma que terminan equipadas en 24 h: más de la mitad, en los
tres mundos". Al preparar las pruebas encontré que su denominador no está definido, y eso
decide si puede cumplirse.

- **[Hecho]** En la línea base ya hay 161, 270 y 25 compras de armas por corrida, hechas por
  comerciantes como mercancía y revendidas en 1 a 2 horas.
- **[Inferencia]** Esas compras de mercancía van a seguir ocurriendo: este Step no toca el
  bono de la prueba de comercio. Si el criterio cuenta **todas** las compras de armas, las de
  mercancía dominarán el denominador y el criterio fallará aunque la valoración funcione.

No cambié el criterio. Propongo que el PO elija cómo leerlo (decisión D6):

| Lectura | Qué mide | Consecuencia |
|---|---|---|
| **Solo compras por necesidad** (las que llevan la razón de texto de la sección 4.7) | Si quien compra porque lo necesita termina usándolo | Es lo que el criterio quería medir. Recomendada. |
| Todas las compras de armas | El conjunto, incluida la mercancía | Probablemente falle por un comportamiento ajeno a este Step |

En cualquiera de las dos lecturas se reportarán ambas cifras, y por separado los agentes con
prueba de comercio activa (sección 4.7).

---

## 9. Control experimental

**Procedimiento propuesto. No ejecutado.**

1. **Línea base:** `data_runtime_step14_a`, `_b` y `_c`. No se regeneran.
2. **Condiciones constantes:** seeds `sanctuary-v2`, `sanctuary-v2-step8-b` y
   `sanctuary-v2-step8-c`; 7200 ticks; 70 agentes; `DEEPSEEK_API_KEY` vacía; Ollama apagado.
3. **Un solo cambio:** la valoración de compra del arma y la reserva de venta de la sección
   4.6, que es parte del mismo mecanismo. Nada más en el mismo Step.
4. **Comprobación de que no se tocó otra cosa:**
   - el diff del motor se limita a los archivos de la sección 6;
   - test de identidad: con necesidad 0, la puntuación de comprar no cambia;
   - en cada corrida, las compras de bienes que no son armas se comparan con la línea base
     por clase; armadura y herramienta son los dos controles.
5. **Resultados a comparar:** las métricas de la sección 7, por mundo, con las herramientas de
   `tools/auditoria_po/` ya usadas, para que el método sea el mismo.
6. **Lectura:** los criterios de la sección 8, fijados antes de correr.
7. **Reporte:** `docs/REPORT_STEP15_*.md` con el formato de los Steps anteriores.

---

## 10. Dependencias pendientes

| Dependencia | Estado | Efecto sobre este Step |
|---|---|---|
| Calibración del peligro (opción A del Step 14) | Pendiente de decisión | Usaría la misma probabilidad de perder que este diseño. Hacerla después permite reutilizarla; hacerla a la vez impide separar los efectos. **Recomiendo este Step primero.** |
| Prueba de Mercader de Ruta imposible de completar | Registrada, sin corregir | Mantiene a 4 agentes del mundo a (no se midió en b ni c) con el bono de comercio activo de forma permanente; son los que revenderían el arma. |
| Rotura de equipo sin evento | Sin instrumentar | Impide medir roturas directamente. |
| Oferta fija de armas (los herreros no pueden vender lo que fabrican si van armados) | Hallazgo de esta revisión, sin corregir | Puede limitar cuántos agentes logran armarse. Corregirlo sería otro Step. |
| Valoración de la armadura | Excluida de este experimento | Requeriría medir primero peleas con salud baja y muertes con y sin armadura. |
| Reparación solo en Brynn | Rasgo del mundo semilla | Hace que el equipo sea, en la práctica, consumible. |
| Armería de gremio | Aplazada por el PO hasta después de este Step | Ninguno. |

---

## 11. Decisiones del PO

### Aprobadas

| # | Decisión | Estado |
|---|---|---|
| — | Dirección general; sin valorar la herramienta; sin modificar el combate; tres mundos como línea base | Aprobada |
| D1 | Armadura fuera de la valoración; armadura y herramienta como controles | Aprobada |
| D2 | Reserva contextual de una unidad de arma según la sección 4.6 | Aprobada |
| D3 | Cálculo compartido en `progression.js`; `decision.js` y `actions.js` solo para lo descrito | Aprobada |
| D4 | Oferta fija de armas: se mide el agotamiento, no se corrige | Aprobada |
| D5 | Criterios 5b, 10 y 11 añadidos; los nueve originales intactos | Aprobada |

### Pendientes

| # | Decisión | Recomendación | Si la respuesta es no |
|---|---|---|---|
| D6 | **Cómo leer el criterio 1** (sección 8.2): sobre las compras por necesidad, o sobre todas las compras de armas | Sobre las compras por necesidad, reportando ambas cifras | Con "todas", el criterio probablemente falle por las compras de mercancía, que este Step no toca |
| D7 | **Fórmula de asequibilidad** (sección 4.2): mantener la aprobada, con su salto máximo de 0,47, o pasar a la variante continua | Mantener la aprobada | La variante elimina el salto y hace la compra más improbable entre 80 y 300 de oro |
| D8 | **Autorización explícita para implementar** | — | No se toca el código |

Limitación que el PO debe conocer antes de autorizar (sección 4.7): los agentes con una
prueba de comercio activa probablemente compren el arma, no la vendan y no la equipen. No se
fuerza; se mide y se reporta aparte.

Nota sobre la sección 8: la última fila de su tabla de decisión remite a "la reventa (sección
10)". El tema está en la 4.6. No edité esa fila para no alterar los criterios.

## Recomendación única

**Autorizar el Step 15 con la alternativa 3 (necesidad vivida) solo para el arma, con la
reserva de venta de la sección 4.6, la armadura y la herramienta como controles, y los
criterios de la sección 8 fijados antes de correr.**

Por qué:

- Ataca la causa mejor medida del proyecto: el 52 % de las derrotas individuales las sufre
  alguien que podía pagar el arma.
- Usa una sola unidad, la probabilidad de perder, calculada con las reglas de combate actuales.
  Sin la armadura, todos los números de la valoración vienen de reglas que ya existen: el
  bono del arma (4), la ventana de recuerdo (7 días), el umbral de reserva (15) y la
  puntuación de equipar (2,5).
- Es selectivo por construcción y deja intacta toda compra que no sea de un arma.

Lo que puede limitar el resultado, y no depende de la valoración: la oferta fija de armas.

No toco el código hasta recibir la autorización.
