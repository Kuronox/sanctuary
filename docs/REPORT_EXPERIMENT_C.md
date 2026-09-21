# EXPERIMENTO C — Escala poblacional, nueva ciudad y comportamiento a largo plazo

## 1. Objetivo

Comprobar si los comportamientos observados en los Experimentos A y B
(gremios como instituciones, farming extremo, riqueza social pasiva,
progresión criminal) se mantienen, desaparecen, se complican o generan
comportamiento nuevo cuando Sanctuary pasa de 24 a **70 agentes** con una
**novena localización** y se corre un **año completo** (365 días / 8.760
ticks).

## 2. Hipótesis

Ninguna forzada de antemano. La pregunta se dejó abierta explícitamente:
¿70 agentes distribuyen mejor la población que 24, o la concentran más?
¿Los gremios crecen, la criminalidad aumenta, la riqueza social se repite?
El diseño del experimento fue medir, no predecir.

## 3. Configuración exacta (para reproducibilidad)

- Seed: `sanctuary-v2` (sin cambiar respecto a A/B).
- Población: 70 (antes: 24).
- Mapa: 9 localizaciones (antes: 8) — ver sección 4.
- Duración de la corrida principal: 8.760 ticks (365 días).
- Código base: Sanctuary tras el Experimento B, más los cambios de este
  informe (secciones 6-7).
- Reproducir con: `npm run reset && npm run sim -- 8760`.

## 4. Diseño de la nueva localización: Praderas de Vann

Novena localización, `praderas_vann`, tipo `pueblo_ganadero`. No es una
copia de otra ciudad con el nombre cambiado — su identidad económica y
geográfica es distinta de las 8 existentes:

- **Recursos**: `cuero` (ya existía, pero solo Aldea del Tejo lo producía
  en cantidad modesta) y **`lana`** (bien nuevo, materia prima negociable,
  sin receta de crafteo — igual que sal/piedra, aporta profundidad de
  mercado sin mecánica nueva).
- **Sin institución y sin monstruos**, a propósito: es la primera
  localización asentada que es puramente económica/logística, ni centro
  de instrucción ni zona de peligro — un contraste deliberado con el resto
  del mapa, donde toda ciudad asentada tenía una u otra cosa.
- **Ubicación estratégica real**: conecta con Puerto Grisal (5h), Aldea
  del Tejo (3h) y Ribera del Sauce (4h) — un nuevo nodo dentro del
  clúster occidental ya congestionado en experimentos anteriores, pensado
  para ofrecer una alternativa de asentamiento cercana a las rutas ya
  transitadas, no un lugar aislado que nadie tendría motivo de visitar.
- Gobierno `consejo_ganadero` (guardia 0,35, seguridad 0,7) — un dato
  nuevo, tratado por el motor exactamente como cualquier gobierno
  asentado (el código solo distingue `"ninguna"` de todo lo demás, así
  que no hizo falta tocar ninguna lógica).
- Se agregó también a `guildWar.contestedLocations`, dándole el mismo
  estatus que las demás zonas con recurso disputable.

**¿Se integró de verdad?** A los 30 días tenía 9 residentes (de 70,
proporción razonable). A los 365 días, **0** — se vació por completo (ver
sección 9). No la forcé a mantenerse poblada, y no lo hizo: es un
resultado real, documentado, no ocultado.

## 5. Generación de los 70 agentes

Mismo generador procedural que V2 (`createAgent`, `generatePersonality`,
`generateGoals`), sin ningún cambio de lógica — solo `AGENT_COUNT` pasó de
24 a 70 en `sim/run.js`. La reserva de nombres (33 nombres base × 13
epítetos ≈ 462 combinaciones) es suficiente para 70 identidades únicas sin
tocar `entities.js`. El sujeto de control **Ulra** se sigue sembrando
exactamente igual (mismos rasgos extremos, misma política general, sin
ninguna rama de código especial) — ver sección 11.

## 6. Bug #1 encontrado únicamente por la escala — reproducido, corregido, comparado

**Reproducido en la primera corrida de 365 días con 70 agentes.** Un
agente (Nyra la Gris) generó **1.547 eventos de viaje** en un año —
prácticamente uno cada 5-6 horas de juego, sin parar. Revisando su
registro de decisiones: cada uno de esos viajes fue el **instinto de
supervivencia forzado** (`survivalOverride`), alternando exclusivamente
entre Valdemarca y Aldea del Tejo.

**Causa exacta**: al momento de la observación, Nyra tenía 0 de oro, 7 de
salud (sobre un máximo mucho mayor) y hambre en 0,84. La reserva de
`racion_comida` estaba en **0 tanto en Valdemarca como en Aldea del
Tejo** — dos de las ciudades más pobladas, con 52 y varias decenas de
agentes respectivamente compitiendo por una tasa de reposición **fija**
(+0,6/tick, tope 30) pensada para poblaciones de 5-15 residentes por
ciudad. Sin oro para comprar y sin stock disponible aunque lo tuviera, el
instinto de huida la mandaba cada vez a la ciudad vecina más seguro, que
resultaba estar igual de vacía de comida — un bucle sin salida.

**Regla que lo produjo**: `economy.tickMarkets()` reponía comida a una
tasa fija, independiente de cuánta gente vivía ahí. A 24 agentes
repartidos, nunca se notó. A 70 concentrados, colapsó.

**¿Es un bug?** Sí — contradice la premisa básica de que el mundo debe
seguir siendo habitable, y es exactamente el tipo de bug "que aparece
únicamente por la escala" que este experimento pedía buscar
explícitamente.

**Corrección**: la reposición y el tope de `racion_comida` ahora escalan
con la población real presente en esa localización en ese tick
(`regen = 0.6 + poblacion×0,05`, `tope = max(30, poblacion×1,2)`),
calculada una vez por tick en `world.js` y pasada a `economy.tickMarkets`.

**Corrida posterior (365 días, misma semilla, misma población de 70)**:

| Métrica | Antes | Después |
|---|---|---|
| Viajes totales (`travel_start`) | 43.901 | 2.403 |
| Viajes del agente más viajero | 1.547 | 625 |
| Promedio de viajes por agente | 645,6 | 35,3 |
| Salud mínima en la población | 7 | 28 |
| Reserva de comida en Valdemarca (52 residentes) | 0 | 61,3 |

Una reducción del 94,5% en viajes totales — la inmensa mayoría del
"viaje" registrado en la primera corrida no era comportamiento
económico ni exploratorio: era gente muriéndose de hambre en bucle.

## 7. Gremios — sin rediseño, solo verificación a escala

No se tocó ninguna regla del Experimento A. Se corrió y se midió.

- **172 gremios fundados** en el año (vs. ~77-112 en las distintas
  corridas de 24 agentes) — más en términos absolutos, pero no
  proporcionalmente más per cápita (172/70 ≈ 2,5 por agente; 100/24 ≈
  4,2 por agente en Experimento A) — **con más gente, cada agente funda
  gremios con menos frecuencia relativa**, probablemente porque hay más
  gremios ya existentes y atractivos a los que unirse en vez de fundar
  uno propio.
- **Tamaños de gremios activos al cierre**: 20, 12, 8, 3, 2, 2, 1, 1 —
  los dos más grandes (20 y 12 miembros) **superan ampliamente** cualquier
  tamaño visto con 24 agentes (máximo histórico ~10). Esto sí es un
  cambio cualitativo real: la escala permite instituciones más grandes
  porque hay más gente co-ubicada dispuesta a unirse a la vez.
- El gremio más viejo activo se fundó en el **tick 1** y seguía activo al
  cierre del año — supervivencia institucional de larga duración
  confirmada también a esta escala.

## 8. Farming — el outlier más grande de todo el proyecto

**Quilan mató 1.405 monstruos** en el año — más que cualquier cifra
registrada en los Experimentos B (1.198 y 1.052). La competencia por los
mismos puntos de caza con una población 3× mayor no redujo el farming
extremo: lo aumentó. Otros seis agentes superaron las 200-800 muertes
(Isvel el Audaz 806, Jorun 791, Isvel 531, Isvel la Sabia 488, Chon 338,
Lyssa 299) — el farming intenso dejó de ser la conducta de un único
outlier aislado y se volvió una franja ancha de comportamiento
compartido por varios agentes simultáneamente, algo que con 24 agentes no
se había observado con esta amplitud.

**Clasificación**: A (estrategia racional) para el patrón en general — el
oro por victoria sigue sin depender del mercado, así que sigue siendo
rentable sin importar cuánta gente compita por el mismo monstruo.

## 9. Geografía — la pregunta más importante del experimento

> ¿70 agentes distribuyen mejor la población que 24?

**No. La distribuyen peor.** Al cierre del año: **52 de 70 agentes (74%)
vivían en Valdemarca**, la localización de mayor seguridad (0,9) y con
institución académica. Puerto Grisal (7) y Ribera del Sauce (9) tenían
algo de población; Colinas Rotas y Cruce de Fangoso, 1 cada una. **Aldea
del Tejo, Praderas de Vann, Bosque Umbrío y Ruinas de Kaltenhor
terminaron con 0 residentes.**

Esto contradice la intuición de que más agentes deberían dispersarse más
—simplemente por haber más gente y más lugares—. Lo que ocurre es lo
opuesto: el "tirón social" (relacionarse y ayudar a quien ya está cerca,
documentado desde V2) se **refuerza** con más población, porque cada
ciudad grande ofrece más candidatos concretos de `talk`/`help_agent` con
quienes ya hay afinidad, lo que hace que quedarse puntúe cada vez mejor
cuantos más agentes ya estén ahí — un ciclo que se retroalimenta con la
escala en vez de diluirse.

**Praderas de Vann sí se integró al principio** (9 residentes a los 30
días, prueba de que el diseño de la ciudad no era decorativo) **pero se
vació con el tiempo**, arrastrada por el mismo tirón hacia Valdemarca que
vació otras tres localizaciones asentadas. No es un fallo del diseño de
la ciudad — es el mismo patrón de concentración que ya afectaba a
localizaciones ya existentes, ahora también a la nueva.

## 10. Crimen — sigue sin escalar con la población

Solo **3 de 70 agentes** robaron con éxito alguna vez en el año — Ulra
(sujeto de control, 42 robos), y dos agentes más con 3 y 1 robo
respectivamente. Proporcionalmente, esto es **menor** concentración que
en el Experimento B (donde el crimen también era casi enteramente de un
solo agente, pero sobre una población de 24). El crimen no escala con el
tamaño de la población: sigue siendo función casi exclusiva de la
personalidad sembrada, no de cuánta gente hay alrededor para robarle.

**Ningún agente terminó en clase criminal** (Pícaro/Asesino/
Contrabandista) al cierre de esta corrida — ni siquiera Ulra, que con 42
robos exitosos superó su propio récord de Experimento B (30-96 según la
corrida) pero esta vez completó la prueba de Erudito primero (tick 679,
antes de alcanzar el umbral de Pícaro). Esto reafirma, a mayor escala, el
hallazgo estructural ya documentado en el Experimento B: qué clase
termina ocupando un agente ambicioso depende en buena medida de qué
prueba se desbloquea y se completa primero, no solo de qué actividad
practica más. Con 70 agentes generando más ruido en el conteo global de
conocimiento (más rumores circulando), la prueba de Erudito parece seguir
ganando la carrera con facilidad.

## 11. Trayectoria completa de Ulra (sujeto de control)

- Sembrado con los mismos rasgos extremos de siempre (codicia 0,92,
  ambición 0,88, tolerancia al riesgo 0,85, empatía 0,08, lealtad 0,12),
  usando la misma política general que los 69 agentes restantes — sin
  ninguna rama de código especial verificable (`grep` de "sujeto de
  control" en el motor de decisión no devuelve nada; el único lugar
  donde su identidad importa es la generación inicial en `sim/run.js`).
- **Tick 679 (día ~28)**: completa la prueba de Novato → **Erudito**.
- **Cierre del año**: Erudito, nivel de oficio 8, nivel base 2, 42 robos
  exitosos, 259 operaciones de comercio, 42 de oro.
- Comparado con la población general: sus 42 robos son, por lejos, el
  máximo de todo el mundo (el segundo más alto es 3). Su nivel de oficio
  (8) está dentro del rango medio-alto de la población, no es un outlier
  de progresión — su comportamiento distintivo es cualitativo (qué hace:
  robar sistemáticamente) más que cuantitativo (cuánto progresa).
- No se convirtió en criminal de clase esta vez, ni en la figura más rica
  ni más pobre, ni fundó el gremio más grande — un resultado modesto y
  específico, no una trayectoria dramática, y eso también es un
  resultado válido del experimento.

## 12. Riqueza y riqueza social

- Oro total en circulación: 169.514 (vs. ~50.000-95.000 en corridas de 24
  agentes) — más del doble, consistente con más faucets activos (más
  agentes trabajando/cazando).
- Mediana de riqueza: **0**. **36 de 70 agentes (51%) terminaron el año
  con exactamente 0 de oro.** La desigualdad no solo persiste a escala,
  se agudiza: con 24 agentes la mediana solía ser un número pequeño pero
  positivo (8-14); con 70, más de la mitad de la población está en cero.
- Los dos agentes más ricos (Chon: 57.267; Isvel: 38.001) superan
  ampliamente cualquier fortuna vista con 24 agentes (máximo histórico
  ~33.000). No confirmé con el mismo nivel de detalle que en el
  Experimento B si esta riqueza es "social" (vía `help_agent`) o de otro
  origen — es una limitación reconocida de esta corrida (ver sección 15),
  pero la desigualdad extrema en sí misma es un hallazgo firme y medido.

## 13. Clasificación de comportamientos

| Comportamiento | Clasificación |
|---|---|
| Concentración geográfica más fuerte con más agentes | **C — razonablemente emergente**: requiere la interacción sostenida de la puntuación social (`talk`/`help_agent`) con la densidad poblacional; no se podía predecir sin correr la simulación, y una vez observado se explica del todo por reglas ya existentes. |
| Farming de 1.405 muertes | **A — estrategia racional**, más extremo que en poblaciones menores por mayor densidad de agentes explotando el mismo incentivo simultáneamente. |
| Gremios de 20 y 12 miembros | **B — consecuencia derivada** directa de tener más candidatos co-ubicados disponibles para unirse. |
| Colapso de comida en ciudades superpobladas | **E — bug**, encontrado y corregido (sección 6). |
| Crimen que no escala con la población | **B — derivado**: sigue siendo función de personalidad sembrada, no de oportunidad disponible. |
| Praderas de Vann vaciándose con el tiempo | **B — derivado** del mismo tirón social que ya afectaba ciudades existentes, no un fallo de diseño de la ciudad nueva. |

## 14. Comparación directa con 24 agentes

1. **¿Qué se mantiene?** El farming extremo (A), la concentración de
   crimen en la personalidad sembrada (B), la supervivencia
   institucional de gremios de larga duración (A).
2. **¿Qué desaparece o se debilita?** Nada desapareció; la trayectoria
   criminal completa de Ulra (Novato→Pícaro→Contrabandista) del
   Experimento B no se repitió en esta corrida — variación entre
   corridas, no una tendencia poblacional.
3. **¿Qué aumenta?** El tamaño máximo de gremio (de ~10 a 20), la
   magnitud del outlier de farming (de ~1.200 a 1.405), la desigualdad de
   riqueza (mediana de un número pequeño a directamente 0), y sobre todo
   la concentración geográfica (de "2-3 ciudades dominantes" a "una sola
   ciudad con 74% de la población").
4. **¿Qué aparece por primera vez?** El colapso de comida por densidad
   (bug de escala, corregido) y guilds de tamaño >15 miembros.
5. **Sobre la pregunta central**: 70 agentes no produjeron un mundo
   cualitativamente distinto por generar más sistemas o más tipos de
   comportamiento — produjeron una versión **más extrema** de los mismos
   patrones ya vistos con 24: más concentrados geográficamente, más
   desiguales económicamente, con instituciones más grandes pero
   crimen igual de raro. La escala amplificó, no diversificó.

## 15. Qué NO funcionó / limitaciones

- No repetí el análisis detallado de origen de riqueza (`help_agent`
  vs. producción activa) que hice en el Experimento B para el caso de
  70 agentes — confirmé la desigualdad extrema pero no diseccioné su
  causa exacta para los dos agentes más ricos de esta corrida.
- No investigué por qué Valdemarca específicamente (y no otra ciudad
  igual de seria) se convirtió en el imán casi total — probablemente
  una combinación de alta seguridad + institución académica + quién
  llegó primero, pero no lo aislé con precisión.
- Solo se corrió una semilla. La variación observada entre corridas del
  mismo experimento (p. ej., si Ulra termina Erudito o Contrabandista)
  sugiere que varias de las cifras concretas de este informe podrían no
  ser representativas de "qué pasa siempre a 70 agentes" sino de "qué
  pasó esta vez" — ya señalado como recomendación pendiente desde el
  Experimento B.

## 16. Recomendaciones para el siguiente experimento

- Correr esta misma configuración (70 agentes, 9 ciudades) con 3-5
  semillas distintas para separar qué de lo observado aquí es un patrón
  robusto (la concentración geográfica parece serlo, dado que ocurrió en
  ambas corridas de este experimento con intensidad creciente) de lo que
  es ruido de una única tirada (la trayectoria de clase de Ulra sí
  varió entre corridas).
- Investigar directamente por qué la concentración geográfica empeora
  con la escala en vez de mejorar — podría ser un experimento propio:
  ¿qué pasa si el bono de "tirón social" en `talk`/`help_agent` se
  satura (rendimientos decrecientes por exceso de gente ya cercana) en
  vez de crecer sin límite con la densidad local?
- Repetir el análisis de riqueza social del Experimento B (rastrear el
  origen exacto de cada fortuna vía `help_agent` recibido) sobre esta
  población de 70 para confirmar si sigue siendo el mecanismo dominante
  de las grandes fortunas a esta escala.
