# STEP 12 — Regalar oro solo ante necesidad real

Protocolo `sanctuary-step`. Línea base: Step 11, tres seeds (`data_runtime_step11_a/b/c`).

## 1. Problema

En el Step 11, regalar oro (`help_agent`) era la segunda acción más común del mundo: entre
80.743 y 117.482 regalos en 300 días, más que jornadas de trabajo. Entre 67 % y 78 % eran
devoluciones a alguien que había regalado en las últimas 24 horas. Los agentes que más
regalaban hacían unos 6.600 regalos en 7.200 horas.

Causa: el regalo se ofrecía a cualquiera, y la puntuación contaba como "necesitado" a todo
el que tuviera menos de 40 de oro. Quien regala queda con menos oro (más "necesitado") y
quien recibe gana 20 de afinidad, así que devuelve el favor.

## 2. Hipótesis

Si regalar solo se ofrece cuando el otro tiene hambre y no puede pagar una comida,
desaparece el ping-pong y los regalos llegan a quien los necesita.

## 3. Intervención

Único archivo del motor modificado: `src/engine/actions.js`.

1. `needsFoodHelp(world, other)`: el otro tiene hambre (> 0,5, constante `HELP_HUNGER_MIN`),
   no lleva raciones y su oro no alcanza para una comida al precio de esa ciudad.
2. `help_agent` solo se ofrece si se cumple esa condición **y** quien regala tiene más de
   10 de oro.
3. Instrumentación: el evento `help` registra `targetGold` y `targetHunger` previos.

Hallazgos de la auditoría previa que definieron la forma del cambio:

- Cambiar solo el bono de necesidad en `decision.js` no alcanzaba: la puntuación base por
  empatía ya es alta sin él. Por eso la necesidad es una condición de la oferta. No se tocó
  `decision.js`.
- Antes bastaba tener inventario para "regalar", aun con 0 de oro; ese regalo vacío sumaba
  amistad igual (47 a 160 casos por corrida). Con la condición nueva habría creado un ciclo
  de regalos vacíos a un necesitado, así que se eliminó esa vía.

## 4. Criterios y observabilidad

| Criterio | Prioridad | Dato | Clasificación |
|---|---|---|---|
| Cantidad de regalos y porcentaje devuelto en 24 h | critical | eventos `help` | OBSERVABLE |
| A quién llegan los regalos | critical | `targetGold` y `targetHunger` en el evento (nuevo) | OBSERVABLE |
| Economía, muertes, relaciones, gremios, actividad | secondary | `state.json`, eventos | OBSERVABLE |

## 5. Tests

`src/engine/tests/help_need.test.js` (nuevo), 7 casos. Suite completa: 11 archivos, todos pasan.

## 6. Simulación

Seeds `sanctuary-v2` (a), `sanctuary-v2-step8-b` (b), `sanctuary-v2-step8-c` (c); 7200 ticks;
70 agentes; sin API key de DeepSeek y con Ollama apagado, igual que el Step 11.
Datos en `data_runtime_step12_a/b/c`.

## 7. Resultados (Step 11 → Step 12)

### Efectos buscados

| Métrica | Seed a | Seed b | Seed c |
|---|---|---|---|
| Regalos | 117.482 → 678 | 88.056 → 949 | 80.743 → 494 |
| Devueltos en 24 h | 78,4 % → 0 % | 68,9 % → 0 % | 67,4 % → 0 % |
| Hambre mínima del receptor | 0,50 | 0,50 | 0,50 |
| Oro máximo del receptor | 6,0 | 6,0 | 6,0 |
| El receptor comió en las 12 h siguientes | 308 de 678 | 353 de 949 | 225 de 494 |

### Efectos secundarios

| Métrica | Seed a | Seed b | Seed c |
|---|---|---|---|
| Mediana de oro | 79 → 13 | 144 → 15 | 82 → 20 |
| Oro total | 182.504 → 182.892 | 290.604 → 273.488 | 322.690 → 270.858 |
| Agentes con 0 de oro | 0 → 3 | 4 → 5 | 3 → 6 |
| Derrotas en combate individual | 233 → 595 | 242 → 569 | 232 → 532 |
| Muertes por combate | 6 → 21 | 21 → 27 | 20 → 16 |
| Muertes por hambre | 1 → 2 | 1 → 1 | 0 → 3 |
| Muertes definitivas | 0 → 4 | 3 → 2 | 1 → 2 |
| Conversaciones | 205.857 → 273.407 | 201.827 → 242.341 | 177.534 → 202.737 |
| Jornadas de trabajo | 46.997 → 61.844 | 66.630 → 62.266 | 67.697 → 85.243 |
| Combates en grupo ganados | 1.014 → 2.264 | 2.896 → 3.244 | 3.593 → 4.274 |
| Relaciones de amistad | 562 → 611 | 492 → 508 | 501 → 556 |
| Gremios activos | 17 → 10 | 19 → 18 | 18 → 16 |
| Novatos | 11 → 6 | 11 → 8 | 10 → 4 |
| Nivel base promedio | 4,11 → 4,89 | 5,00 → 5,10 | 5,37 → 5,84 |

### Lectura

- **La mediana de oro cayó a la quinta parte en las tres seeds con casi el mismo oro
  total.** El ping-pong funcionaba como redistribución: mantenía a casi todos cerca de 80
  de oro. Sin él aparece la distribución real: la mayoría con 13 a 20 de oro y unos pocos
  con decenas de miles.
- **Las derrotas en combate individual se duplicaron en las tres seeds.** Es el único
  efecto secundario claramente sistemático. No investigué la causa; es compatible con
  agentes más pobres que pelean peor equipados o que pelean más para conseguir oro.
- Las amistades no cayeron: el tiempo liberado se fue sobre todo a conversar.
- Menos novatos y más nivel promedio en las tres seeds.

### Anomalías y cosas sin resolver

- Menos de la mitad de los regalos terminan en una comida dentro de las 12 horas. El umbral
  de hambre de 0,5 puede ser bajo: el receptor todavía no prioriza comer.
- En la seed c reapareció el rebote Valdor ↔ Tejor (18 episodios) y hubo 3 muertes por
  hambre. Esas dos ciudades concentran 61 de 68 agentes y quedaron casi sin comida
  (stock final 3,2 y 0,3). Es escasez por concentración, no la regla que corrigió el Step 11.
- La métrica "episodios de rebote" (4 viajes seguidos) también cuenta viajes largos de
  exploradores por 3 o 4 ciudades; en la seed b casi todos los episodios son de ese tipo.
  Hay que afinarla antes de volver a usarla.
- Seed a: gremios activos de 17 a 10. Una sola seed; sin investigar.
- Sigue pendiente la corrección 3 (los gremios readmiten a quien les robó).

## 8. Investigación: por qué se duplicaron las derrotas individuales

"Con equipo" es una aproximación: el agente tuvo un evento `equip` desde su último
renacimiento. No detecta equipo roto.

| | Seed a | Seed b | Seed c |
|---|---|---|---|
| Peleas individuales totales | 2.811 → 3.089 | 3.381 → 3.538 | 2.931 → 3.261 |
| Peleas con equipo, % perdidas | 6 % → 3 % | 4 % → 6 % | 4 % → 6 % |
| Peleas sin equipo | 1.831 → 1.539 | 451 → 1.420 | 618 → 984 |
| Peleas sin equipo, % perdidas | 10 % → 36 % | 25 % → 30 % | 23 % → 39 % |
| Regalos recibidos en los 10 días tras renacer (promedio) | 57 → 0,2 | 47 → 0,2 | 43 → 0 |
| Peleas sin equipo en los 10 días tras renacer (promedio) | 1,4 → 7,3 | 2,9 → 4,8 | 1,7 → 2,5 |
| Renacidos que se re-equipan en 10 días | 1 de 7 → 2 de 19 | 7 de 19 → 4 de 26 | 4 de 19 → 5 de 17 |

Lo establecido:

- Se pelea casi lo mismo (5 % a 10 % más). Lo que cambió es que más peleas se dan sin
  equipo, y esas se pierden entre 30 % y 39 % de las veces. Con equipo se pierde igual que antes.
- No es pobreza. Entre quienes más pierden hay agentes con 40.184, 46.223 y 10.636 de oro.
  El perfil común es clase no combatiente (curandero, comerciante, novato), tolerancia al
  riesgo alta y meta de exploración.
- Los regalos no estaban comprando equipo: en el Step 11 un renacido recibía unos 300 de
  oro en 10 días y aun así pocos se re-equipaban.
- Hipótesis más consistente con los datos: el ping-pong ocupaba los turnos. Sin él, los
  agentes temerarios gastan esos turnos en pelear, estén equipados o no.

No establecido: por qué subió la tasa de derrota sin equipo en la seed a (10 % → 36 %); en
esa seed cambió quién pelea (un guerrero hizo 1.264 peleas en el Step 11 y 90 en el Step 12).

Debilidades del motor que esto deja a la vista, anteriores al Step 12:

- La decisión de pelear no considera estar desarmado ni las derrotas recientes. Un
  curandero perdió 193 peleas individuales en una corrida y siguió yendo.
- Casi nadie se equipa: al final de cada corrida solo 10 a 13 de 70 agentes llevan arma,
  antes y después del cambio.

## 9. Veredicto

**HIPÓTESIS APOYADA.** El ping-pong desapareció en las tres seeds y todos los regalos
llegaron a agentes con hambre y sin oro para comer.

El resultado deja una decisión de producto abierta: la mediana de 80 de oro era un
artefacto del ping-pong. Con 13 a 20 de oro de mediana, la economía del agente común es
precaria.
