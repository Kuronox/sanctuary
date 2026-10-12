# STEP 11 — Comer antes que huir

Protocolo `sanctuary-step`. Corrección de una regla de supervivencia, sin mecánicas nuevas.

## 1. Problema

La crónica de Isvel el Audaz (`docs/CRONICAS_STEP10.md`) mostró que murió de hambre dos
veces caminando sin parar entre Valdor y Tejor. En la línea base (Step 10) hubo 8 muertes
por hambre en 300 días, 7 de ellas en esas dos ciudades.

Causa en `survivalOverride` (`src/engine/world.js`):

- Con salud bajo 20, el agente huía a la ciudad vecina más segura. Esa regla se evaluaba
  antes que la de comer.
- La salud bajaba por hambre, no por peligro. En Tejor había comida, pero la regla lo
  mandaba a Valdor (más segura).
- En Valdor, sin comida en el mercado, la misma regla lo devolvía a Tejor aunque no
  tuviera hambre.
- Mientras rebotaba no descansaba, y descansar es lo único que devuelve salud sin oro.

## 2. Hipótesis

Si un agente con hambre crítica come cuando hay comida en su ciudad, y un agente débil se
queda a descansar cuando su ciudad es segura, desaparecen los rebotes entre ciudades
seguras y las muertes por hambre que provocan.

## 3. Intervención (opción B, aprobada)

Único archivo del motor modificado: `src/engine/world.js`, función `survivalOverride`.

1. Hambre crítica (> 0,9) y comida en la ciudad: come, antes de evaluar la huida.
2. Un agente débil (salud < 20) solo huye si su ciudad es peligrosa
   (seguridad < 0,7, constante `SAFE_CITY_SAFETY`). Hoy eso es Brynn, Duren, Morvane y Kestal.
3. La falta de comida local solo lo hace viajar si de verdad tiene hambre crítica.
4. Débil en ciudad segura: descansa hasta recuperarse.

No se tocó `help_agent`, gremios, economía ni ningún otro mecanismo.

## 4. Criterios y observabilidad

| Criterio | Prioridad | Dato | Clasificación |
|---|---|---|---|
| Muertes por hambre, cuántas y dónde | critical | `deathHistory` de cada agente | OBSERVABLE |
| Episodios de rebote (4 o más viajes seguidos sin otra acción) | critical | `events.jsonl` | OBSERVABLE |
| Muertes totales y por combate | secondary | `deathHistory`, `stats` | OBSERVABLE |
| Economía, distribución, niveles, actividad | secondary | `state.json`, `events.jsonl` | OBSERVABLE |

## 5. Tests

`src/engine/tests/survival_override.test.js` (nuevo), 6 casos: come en vez de huir;
descansa si está débil en ciudad segura; sigue huyendo de ciudad peligrosa; sigue viajando
si tiene hambre y no hay comida; no viaja por falta de comida si no tiene hambre; un agente
sano decide normalmente. Suite completa: 10 archivos, todos pasan.

## 6. Simulación

Seed `sanctuary-v2`, 7200 ticks (300 días), 70 agentes. Datos en `data_runtime_step11_a/`.

Condiciones replicadas de la línea base (`data_runtime_step10_a/`): sin llamadas reales a
DeepSeek (la API key se desactivó solo para esta corrida; en ambas el 100 % de los intentos
de la cohorte LLM cayó a la política determinista). Diferencia: Ollama estaba apagado, así
que esta corrida no generó frases del narrador. El narrador no afecta decisiones.

## 7. Resultados

### Efectos buscados

| Métrica | Step 10 | Step 11 |
|---|---|---|
| Muertes por hambre | 8 (7 en Valdor/Tejor, 1 en Brynn) | 1 (en Duren) |
| Episodios de rebote | 20 | 2 |
| Muertes totales | 16 | 7 |
| Agentes con 1 vida restante | 5 | 1 |
| Oro perdido por muertes | 67.371 | 744 |

Isvel el Audaz no murió ninguna vez en esta corrida. La única muerte por hambre ocurrió en
Duren, un lugar sin mercado de comida.

### Efectos secundarios

| Métrica | Step 10 | Step 11 |
|---|---|---|
| Oro total | 154.075 | 182.504 |
| Mediana de oro | 71 | 79 |
| Agentes con 0 de oro | 1 | 0 |
| Muertes por combate | 8 | 6 |
| Viajes | 1.616 | 1.552 |
| Comidas | 21.985 | 22.135 |
| Stock de comida final en Valdor | 4,5 | 28,2 |
| Nivel base promedio | 4,99 | 4,11 |
| Victorias de combate en grupo | 4.236 | 1.014 |
| Regalos de oro (`help`) | 103.522 | 117.482 |
| Malversaciones de gremio | 229 | 329 |

### Anomalías y cosas sin resolver

- **Las victorias en grupo cayeron a la cuarta parte** y el nivel promedio bajó. No
  investigué la causa. Con una sola seed no se puede separar un efecto del cambio de una
  trayectoria distinta de la misma simulación (un cambio temprano altera todo lo que sigue).
- Quedan 2 episodios de rebote sin analizar.
- Los regalos de oro y las malversaciones siguen dominando la actividad; no eran parte de
  este Step.
- Registrado, no corregido: al comer por emergencia el motor no verifica que el agente
  tenga oro suficiente; come igual y queda en 0.

## 8. Investigación de la caída del combate en grupo

Se corrió el Step 11 en dos seeds más que ya tenían corrida con la regla vieja
(`data_runtime_step95_b` y `_c`; el código de decisión del Step 9.5 y el del Step 10
producen exactamente los mismos conteos en la seed a, así que sirven de línea base).

| Seed | Combates en grupo (antes → después) | Muertes por hambre | Rebotes | Muertes por combate | Muertes totales |
|---|---|---|---|---|---|
| a `sanctuary-v2` | 4.236 → 1.014 | 8 → 1 | 20 → 2 | 8 → 6 | 16 → 7 |
| b `sanctuary-v2-step8-b` | 2.013 → 2.896 | 7 → 1 | 27 → 3 | 26 → 21 | 33 → 22 |
| c `sanctuary-v2-step8-c` | 2.798 → 3.593 | 9 → 0 | 19 → 4 | 8 → 20 | 17 → 20 |

- El combate en grupo **subió** en dos de las tres seeds. No hay una caída sistemática.
- Casi todo el combate en grupo es una sola actividad: cazar Capitanes bandidos en Brynn.
  El total depende de si se forma o no una cuadrilla estable allí. En la seed a de la
  línea base eran 15 agentes con más de 100 combates cada uno; en el Step 11, solo 3.
- Ese número ya variaba mucho sin tocar esta regla: en la seed a fue 1.908 (Step 5),
  2.776 (Step 6) y 4.259 (Step 7); entre seeds con la regla vieja va de 639 a 4.259.
- La primera diferencia entre las dos corridas de la seed a ocurre el día 1 (tick 17): un
  agente débil descansa en Tejor en vez de viajar a Valdor. Todo lo demás se desvía desde ahí.

Conclusión: la caída de la seed a es sensibilidad a la trayectoria, no un efecto del cambio.

Observación nueva, sin investigar: en la seed c las muertes por combate subieron de 8 a 20.
Con tres seeds no se puede decir si es ruido o si, al morir menos de hambre, más agentes
llegan a pelear.

## 9. Veredicto

**HIPÓTESIS APOYADA.** En tres seeds, las muertes por hambre pasaron de 24 a 2 y los
episodios de rebote de 66 a 9.
