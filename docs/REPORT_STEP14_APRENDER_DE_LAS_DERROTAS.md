# STEP 14 — Aprender de las derrotas

Protocolo `sanctuary-step`. Línea base: Step 13, tres seeds (`data_runtime_step13_a/b/c`).

## 1. Problema

En el Step 13, entre 361 y 416 derrotas en combate individual por corrida. Dos tercios
(230 a 278) eran repeticiones contra el mismo monstruo en menos de 7 días. Peor racha: 12
derrotas seguidas sin una victoria en medio. Un curandero perdió 114 peleas en una corrida.
La decisión de pelear no tenía en cuenta haber perdido antes.

## 2. Hipótesis

Si un agente recuerda sus derrotas contra un tipo de monstruo y eso le resta ganas de
volver a pelearlo solo, bajan las derrotas repetidas.

## 3. Intervención

Archivos del motor modificados: `src/engine/decision.js` y `src/engine/actions.js`.

1. `actions.js`: el recuerdo de una derrota individual guarda `family` y `rank` del monstruo.
2. `decision.js`, `defeatPenalty(agent, family, rank, tick)`: cada derrota propia contra ese
   mismo monstruo en los últimos 7 días (168 ticks) suma `1 - edad/168`. El total se
   multiplica por `1 - 0,5 × riskTolerance` y tiene tope de 4. Se resta de la puntuación de
   `fight_monster`.

No afecta al combate en grupo ni a monstruos contra los que el agente no perdió.

Hallazgo de la auditoría previa: el recuerdo se lee de `agent.memory` y no de
`agent.knowledge`. En una ciudad poblada el knowledge se renueva completo en unas 9 horas
(mediana) y ningún agente conservaba ahí una derrota propia; la memoria las conserva miles
de horas. Esto explica también por qué la percepción de peligro del Step 9 casi no se
activa. Registrado, no corregido.

## 4. Criterios y observabilidad

| Criterio | Prioridad | Dato | Clasificación |
|---|---|---|---|
| Derrotas repetidas contra el mismo monstruo en 7 días | critical | eventos `combat_loss` | OBSERVABLE |
| Peleas contra el mismo monstruo en las 48 h tras una derrota | critical | eventos `combat_win` y `combat_loss` | OBSERVABLE |
| Muertes, combate en grupo, niveles, clases | secondary | `state.json`, eventos | OBSERVABLE |

## 5. Tests

`src/engine/tests/defeat_memory.test.js` (nuevo), 9 casos. En el de integración, un
guerrero temerario elige pelear contra el bandido 169 veces de 200 sin recuerdos y 21 con
seis derrotas recientes. Suite completa: 13 archivos, todos pasan.

## 6. Simulación

Mismas tres seeds, 7200 ticks, 70 agentes, sin API key de DeepSeek y con Ollama apagado.
Datos en `data_runtime_step14_a/b/c`.

## 7. Resultados (Step 13 → Step 14)

| Métrica | Seed a | Seed b | Seed c |
|---|---|---|---|
| Derrotas individuales | 361 → 304 | 404 → 392 | 416 → 553 |
| Peleas individuales | 3.102 → 3.023 | 2.444 → 2.201 | 3.238 → 4.124 |
| Porcentaje de peleas perdidas | 11,6 % → 10,1 % | 16,5 % → 17,8 % | 12,8 % → 13,4 % |
| Derrotas repetidas en 7 días | 230 → 162 | 268 → 189 | 278 → 329 |
| Repetidas como parte del total | 64 % → 53 % | 66 % → 48 % | 67 % → 59 % |
| Peleas en las 48 h tras una derrota (mismo monstruo) | 799 → 497 | 672 → 453 | 979 → 939 |
| Peor racha de derrotas seguidas | 12 → 6 | 10 → 8 | 7 → 7 |
| Más derrotas de un solo agente | 114 → 69 | 71 → 102 | 71 → 81 |
| Agentes con 20 derrotas o más | 5 → 6 | 6 → 7 | 8 → 7 |
| Muertes por combate | 19 → 13 | 36 → 32 | 14 → 10 |
| Muertes definitivas | 2 → 3 | 8 → 5 | 2 → 1 |
| Combates en grupo ganados | 1.637 → 2.892 | 2.434 → 1.528 | 3.650 → 8.492 |

### Lectura

- El efecto va en la dirección esperada pero es chico. La parte de derrotas que son
  repeticiones baja en las tres seeds (de 64–67 % a 48–59 %) y las muertes por combate
  bajan en las tres (entre 4 y 6 menos).
- El porcentaje de peleas perdidas no mejora, y sigue habiendo agentes con 69 a 102
  derrotas en una corrida.
- Los combates en grupo varían mucho entre trayectorias (ver Step 11); no se pueden
  atribuir al cambio.

### Por qué el efecto es chico (hipótesis, sin verificar)

- **El peso es bajo para quienes más pierden.** Un temerario recibe unos 0,55 puntos por
  derrota fresca, contra una puntuación de pelear de entre 1,6 y 3.
- **El recuerdo no distingue al que casi siempre gana.** Con 10 % a 18 % de peleas
  perdidas en total, muchas "repeticiones" son de luchadores que ganan casi todo. El
  problema real son los que pierden 40 % o más, y la regla no mira esa proporción.
- **Es específico del monstruo.** Quien deja de pelear contra el bandido puede ir a perder
  contra el lobo.

## 8. Veredicto

**RESULTADO MIXTO.** El mecanismo funciona (tests) y mueve las métricas en la dirección
esperada, pero no resuelve el problema: los agentes que más pierden siguen perdiendo
decenas de veces. No se ajustaron los parámetros después de ver el resultado.
