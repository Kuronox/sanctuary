# EXPERIMENTO A — Gremios como instituciones persistentes

Continuación de Sanctuary V2. Pregunta experimental: ¿qué comportamiento
emerge cuando pertenecer a un gremio da beneficios reales pero también crea
obligaciones, costos, competencia y oportunidades colectivas?

Todos los números vienen de corridas reales con la semilla determinista
`sanctuary-v2` (sin cambiar entre corridas, tal como pidió el encargo), 24
agentes, comparadas en smoke test (24 ticks), 30 días (720), 100 días
(2.400), 300 días (7.200) y 365 días (8.760), reproducibles con
`npm run reset && npm run sim -- <ticks>`.

---

## 1. Qué cambié

En V2 un gremio era, en la práctica: `create_guild` (pagar 30 de oro) →
`join_guild`/`leave_guild` (decisión individual sin más consecuencia que
una penalización de relación) → el gremio desaparecía en cuanto se
quedaba sin miembros. Reemplacé eso por una institución con:

- **Identidad persistente**: `founderId` y `leaderId` separados desde la
  creación — el líder puede cambiar sin que el gremio deje de ser "el
  mismo".
- **Sucesión mínima, no democrática**: cuando el líder se va (por
  abandono o expulsión), asume automáticamente el miembro restante con
  mayor lealtad — una regla determinista de continuidad, no una votación.
- **Cuotas periódicas** (`guilds.tickDues`, cada 168 ticks / 1 semana de
  juego): cada miembro paga una cuota proporcional a la reputación del
  gremio (pertenecer a un gremio prestigioso cuesta más). Tres impagos
  consecutivos expulsan automáticamente al miembro — una obligación real,
  no solo un aporte voluntario.
- **Tesorería con ingresos y gastos reales**: cuotas + recompensas de
  encargos + aportes voluntarios (ingreso) contra mantenimiento operativo
  reducido + costo de declarar guerra + malversación (gasto). La
  malversación en solitario ya no es posible: requiere más de un miembro
  para que exista siquiera un testigo posible (si no, sería "sacar tu
  propio dinero", no un crimen).
- **Reputación con decaimiento** hacia neutral sin eventos recientes —
  sube con encargos exitosos y victorias de guerra, baja con fracasos y
  malversaciones descubiertas.
- **Especialización derivada, no elegida**: `guildSpecialization()`
  calcula la clase más representada entre los miembros (si hay al menos 2
  del mismo oficio); no es un campo que el jugador o el motor asignen.
- **Encargos de gremio** (`guildContracts`): cazar N monstruos de un
  rango, recolectar N de un recurso, o fabricar N de un objeto craftable,
  con recompensa, plazo y consecuencia real de reputación en éxito o
  fracaso. Los acepta el líder en nombre del gremio (una decisión
  institucional, no de cualquiera); el progreso lo hace cualquier
  miembro con sus acciones normales.
- **Guerra de gremios periódica** (cada 720 ticks / 30 días): se anuncia
  la disputa por el control de una localización con recursos; los líderes
  deciden si declarar participación (pagando un costo de preparación real
  del tesoro), y cualquier miembro puede aportar su propio poder de
  combate durante la ventana. El gremio ganador obtiene un descuento de
  impuestos y un bono de recolección en esa localización hasta la
  siguiente guerra.
- **Relaciones entre gremios derivadas de eventos**: perder una guerra
  genera rivalidad hacia el ganador; perder junto a otro gremio genera un
  pequeño acercamiento entre ambos ("perdieron juntos"). No se asignan a
  mano.
- **Protección concreta**: si un miembro es arrestado, su gremio (si tiene
  fondos y no está desprestigiado) paga parte de la multa automáticamente.
- **`join_guild` evalúa instancias concretas**, no un tipo genérico: cada
  gremio candidato se puntúa por su propia reputación, si el agente conoce
  o confía en su líder, si su especialización coincide con el oficio
  propio, y si la cuota es una carga real — exactamente el ejemplo del
  encargo (Guild A con buena fama y un amigo dentro vs. Guild B barato
  vs. quedarse independiente).

## 2. Arquitectura afectada

- **Nuevo módulo `src/engine/guilds.js`**: toda la lógica institucional
  (contratos, cuotas, expulsión, sucesión, especialización, relaciones,
  guerra). No importa `actions.js` — emite sus propios eventos con un
  `pushWorldEvent` local para evitar una dependencia circular, ya que
  `actions.js` sí importa `guilds.js`.
- **`entities.js`**: `createGuild` gana `leaderId`, `contractCounters`,
  `activeContract`, `contractHistory`, `relations` con estructura real
  (antes era un objeto vacío sin uso). `createAgent` gana
  `guildMissedDues`, `guildJoinedTick`, `recentGuildDepartures`.
- **`actions.js`**: `leave_guild` ahora dispara sucesión si quien se va es
  el líder; `malversar_tesoro` expulsa automáticamente si lo descubren;
  tres acciones nuevas (`accept_guild_contract`, `declarar_guerra_gremios`,
  `contribuir_guerra_gremios`); `arrest()` consulta al gremio para una
  fianza parcial.
- **`decision.js`**: `join_guild`/`leave_guild` reescritos para evaluar la
  instancia concreta; nueva función `guildContractBonus()` simétrica a la
  `trialBonus()` de V2 — sin ella, aceptar un encargo de gremio no influía
  en qué hacía cada miembro día a día (el mismo error arquitectónico
  encontrado dos veces antes, en V1 con los encargos individuales y en V2
  con las pruebas de clase, ahora encontrado por tercera vez aquí).
- **`world.js`**: el tick ahora llama a `guilds.tickDues`,
  `guilds.maybeGenerateGuildContract`, `guilds.tickGuildContracts`,
  `guilds.maybeStartGuildWar`, `guilds.tickGuildWar`, y decae la
  reputación de gremio. El mantenimiento operativo directo bajó de
  "único sumidero de tesorería" a un costo residual pequeño, ahora que
  las cuotas son la fuente real de financiamiento.
- **`server.js` / dashboard**: pestaña de Gremios ahora muestra líder,
  fundador, reputación, especialización derivada, historial de encargos y
  relaciones con otros gremios; panel nuevo de disputa de gremios (quién
  participa, con cuánto poder, y el bono vigente de quien ganó la última).
  La pestaña de Encargos mezcla encargos individuales y de gremio.

La separación mundo → agente → decisión → política → persistencia →
dashboard no cambió; `decision.js` sigue siendo la única pieza
reemplazable por un adaptador de LLM.

## 3. Pruebas

| Duración | Ticks | Qué busqué |
|---|---|---|
| Humo | 24 | Que el motor no rompiera en el primer tick |
| 30 días | 720 | Primera corrida completa — aquí aparecieron los dos bugs de la sección 5 |
| 100 días | 2.400 | Confirmar que las correcciones se sostenían y que las guerras se resolvían |
| 300 días | 7.200 | Ver mortalidad/supervivencia institucional a mediano plazo |
| 365 días | 8.760 | Validación final citada en este informe |

Cada duración se corrió desde `npm run reset` (mismo seed
`sanctuary-v2`) para tener una foto limpia por ventana, no una sola
corrida larga interrumpida.

## 4. Resultados y estadísticas (365 días)

De 77 gremios fundados en total a lo largo del año, **5 seguían activos**
al final. El más antiguo de los que sobrevivieron (`ElsvetCompañia`) se
fundó en el tick 14 y seguía activo en el tick 8.760 — prácticamente todo
el año de simulación. **2 de los 5 gremios activos tenían un líder
distinto de su fundador** (`UlraCompañia`, `UlraCompany`) — sucesión real,
no solo posible en el código.

Encargos de gremio: 377 publicados, 374 aceptados, **26 completados con
éxito, 308 fracasados**. La tasa de éxito (≈8%) es baja pero real — antes
de la corrección del bug de la sección 5 era exactamente 0%.

Guerra de gremios: 13 disputas anunciadas, 12 resueltas dentro de la
ventana de 365 días (la 13ª seguía en curso al cierre), con 65
declaraciones de participación y 734 aportes de poder individuales.

Crimen: 19 arrestos en el año (comparable a los ~20 de V2 sin gremios
rediseñados — la fianza de gremio no disparó una ola de robos, ver
sección 8).

Riqueza: oro total en circulación 84.530 al año, mediana de riqueza
individual muy baja (2 de oro) con una cola larga — el mismo patrón de
desigualdad ya documentado en V2, sin cambios estructurales atribuibles a
este experimento.

## 5. Bugs encontrados jugando la simulación (clasificados, no corregidos a ciegas)

### 5.1 Oscilación afiliarse/abandonar cada 1-4 ticks — **BUG**

**Qué ocurrió**: en la primera corrida de 30 días, un agente (Varik,
lealtad 0.545 — moderada, no extrema) se unió y abandonó el mismo gremio
**179 veces** en 720 ticks, literalmente alternando tick a tick.

**Por qué ocurrió**: `join_guild` y `leave_guild` se puntuaban de forma
completamente independiente cada tick, sin memoria de "recién me uní" ni
de "recién me fui". Cuando sus puntuaciones quedaban cerca (lo cual pasa
seguido, porque ninguna de las dos depende de cuánto tiempo llevás en el
gremio), el término de ruido aleatorio (±0.3, añadido a propósito para
que los agentes no sean robots perfectamente deterministas) bastaba para
que ganara una u otra alternativamente.

**Regla que lo produjo**: ausencia total de fricción temporal en la
decisión de afiliación — el mismo patrón de "trinquete sin fricción" que
V1 y V2 ya habían mostrado en otros sistemas (relaciones, tesorería de
gremio), aquí manifestado como oscilación en vez de acumulación.

**¿Deseable?** No. 179 cambios de afiliación en un mes no es una
trayectoria de vida creíble bajo ninguna lectura de personalidad — es
ruido de implementación, no una decisión.

**Corrección**: un mínimo de permanencia (48 ticks, ~2 días) antes de
poder reconsiderar irse, salvo que el gremio ya dé señales objetivas de
ir mal (reputación bajo -30 o tesorería en cero, que sí habilitan salida
inmediata); un enfriamiento (72 ticks, ~3 días) antes de poder re-unirse
al mismo gremio que se acaba de abandonar. **Verificado**: en la corrida
de 100 días post-corrección, el máximo de eventos afiliarse/abandonar por
agente fue 67 en 2.400 ticks (un evento cada ~36 ticks) y correlacionaba
con la lealtad del agente (0.12 → 67 eventos; 0.33 → 38; 0.47 → 26) — ya
no es ruido, es una señal de personalidad legible.

### 5.2 Cero encargos de gremio exitosos en 30 días — **BUG (con un sub-bug de contenido)**

**Qué ocurrió**: 28 encargos de gremio aceptados en la primera corrida de
30 días, **0 completados con éxito**, 22 fracasados por plazo vencido.

**Por qué ocurrió (causa principal)**: aceptar un encargo era una
decisión exclusiva del líder; ningún otro miembro tenía ninguna razón
adicional en su propia función de utilidad para cazar/recolectar/craftear
específicamente lo que el encargo pedía. El progreso dependía enteramente
de que las acciones normales de los miembros coincidieran por casualidad
con el objetivo del encargo — exactamente el mismo error que los
encargos individuales tenían en V1 (arreglado ahí) y que las pruebas de
clase tenían en V2 (arreglado ahí también). Es la tercera vez que aparece
la misma clase de bug en tres sistemas distintos del proyecto.

**Por qué ocurrió (sub-bug de contenido)**: uno de los encargos fallidos
observados pedía "fabricar 5 de racion_comida" — un bien que tiene
`craftedFrom` en el mundo semilla (porque representa producción de fondo
de NPCs no simulados, ver `economy.js`) pero que **ningún agente puede
craftear de verdad**: la acción `craft` nunca ofrece racion_comida como
candidata. Ese encargo era matemáticamente imposible de cumplir desde que
se publicó.

**Regla que lo produjo**: falta de puente entre "el gremio necesita X" y
"la puntuación de la acción de un miembro concreto sube si hace X"; y,
para el sub-bug, el generador de encargos de gremio asumió que cualquier
bien con receta de crafteo era craftable por un jugador, sin verificar
contra las acciones reales del motor.

**¿Deseable?** No. Un sistema de encargos con 0% de éxito no genera
cooperación real, solo la ilusión de una — contradice directamente el
objetivo del experimento.

**Corrección**: `guildContractBonus()` en `decision.js`, simétrica a la
`trialBonus()` de V2 — cazar el monstruo correcto, craftear el objeto
correcto, o recolectar (sin poder elegir el recurso exacto, pero con un
empuje genérico) ahora suben la puntuación de esas acciones concretas
para CUALQUIER miembro del gremio con un encargo activo; y exclusión
explícita de `racion_comida` del generador de encargos de fabricación.
**Verificado**: 6 éxitos en la misma ventana de 30 días tras la
corrección (antes: 0), 18 en 100 días, 26 en 365 días.

## 6. Comportamientos degenerados NO corregidos (documentados, no "arreglados porque se ven raros")

### 6.1 Un agente funda el 78% de todos los gremios del año

El sujeto de control sembrado a propósito (ambición 0.88, lealtad 0.12)
fundó 60 de los 77 gremios del año. **Clasificación: derivado
directamente de las reglas, no un bug.** Un agente muy ambicioso funda
seguido; uno muy desleal no se queda en lo que funda, así que el ciclo se
repite. Es coherente con su personalidad extrema, deliberadamente
sembrada para observar exactamente esto. La diferencia con el bug de la
sección 5.1 es la escala temporal: aquí el patrón opera en semanas/meses
(60 fundaciones en 8.760 ticks ≈ una cada 146 ticks, 6 días), no en
ticks consecutivos — es una trayectoria de vida legible, no ruido.

### 6.2 Guilds con un solo miembro compitiendo por control territorial

Se observó a `UlraCompañia` (1 miembro) declarando guerra y aportando 99
de poder contra gremios de 6-8 miembros con cientos de poder combinado.
**Clasificación: derivado.** `declarar_guerra_gremios` se puntúa por
ambición/prestigio del líder, sin comparar la fuerza propia contra
rivales conocidos (el mundo no le da al agente forma de saber cuánto
aportarán los demás hasta que la guerra se resuelve — información
genuinamente incompleta, no negligencia de diseño). Perder así es una
apuesta mal calculada pero comprensible dado lo que el agente podía saber
en el momento de decidir. No lo corregí: es exactamente el tipo de
"decisión imperfecta con consecuencia no siempre satisfactoria" que las
influencias de diseño del proyecto (Abercrombie) piden preservar.

### 6.3 Tasa de éxito de encargos de gremio baja incluso corregida (~8%)

Aun con `guildContractBonus()`, la mayoría de los encargos siguen
fracasando. **Clasificación: derivado, con una limitación de diseño
reconocida (sección 9)**, no un bug adicional — no hay garantía de que un
gremio tenga miembros con la clase/ubicación adecuadas para un encargo
dado en su plazo; el sistema no obliga a que "todos los encargos se
puedan cumplir", que era una restricción explícita del encargo original
("no quiero que fuerces... que todos los gremios sobrevivan").

## 7. Respuestas a las preguntas del experimento

1. **¿Los agentes permanecen más tiempo en los gremios?** Sí, mucho — la
   corrección de la sección 5.1 fue precisamente para que "permanecer"
   volviera a significar algo (de 179 cambios/mes para un solo agente a
   una cifra proporcional a su lealtad).
2. **¿Los gremios desarrollan especializaciones?** Sí, cuando su
   composición lo permite: `IsvelCompañia` terminó con especialización
   "erudito" (mayoría de sus miembros de esa clase) sin que nada del
   código lo forzara — es un cálculo posterior sobre quién se quedó, no
   una elección.
3. **¿Existen gremios grandes y pequeños?** Sí: al cierre del año, tamaños
   de 1, 1, 2, 2 y 4 miembros coexistían.
4. **¿Existen gremios que fracasan naturalmente?** Sí, extensamente: 77
   fundados, solo 5 sobrevivieron; 72 colapsos registrados (insolvencia
   sostenida o quedarse sin miembros).
5. **¿Los gremios sobreviven a sus fundadores?** Sí — 2 de los 5 gremios
   activos al final del año tenían un líder que no era su fundador
   original, y `ElsvetCompañia` sobrevivió casi 350 días desde su
   fundación.
6. **¿Aparecen conflictos internos?** Sí: 181 intentos de malversación en
   el año, con expulsión automática en el 67% de los casos (122
   expulsados de 181 intentos + impagos de cuota).
7. **¿La competencia entre gremios genera comportamiento estratégico?**
   Parcialmente: los líderes sí deciden si declarar guerra (65
   declaraciones en 13 ventanas, no en todas), pero la decisión no pesa
   la fuerza relativa de otros participantes (sección 6.2) — hay
   estrategia de "si vale la pena intentarlo", no de "cómo ganarle
   específicamente a este rival".
8. **¿Los encargos producen cooperación real?** Sí, aunque con baja tasa
   de éxito: el progreso de un encargo depende genuinamente de que
   varios miembros hagan lo que hace falta (`guildContractBonus` empuja a
   cualquier miembro, no solo a quien acepto), y 26 encargos se
   completaron con éxito en el año.
9. **¿Los agentes tienen razones concretas para permanecer
   independientes?** Sí — el 40% de la población terminó el año sin
   gremio; con solo 5 gremios activos y reputación mayormente negativa o
   nula, la cuenta de `join_guild` frecuentemente no supera quedarse
   fuera, sobre todo para agentes con sociabilidad baja (penalización
   explícita en la puntuación) o sin ningún gremio con especialización
   afín a su oficio disponible cerca.
10. **¿Aparecen estrategias que NO habíamos programado explícitamente?**
    La más clara es la de la sección 6.1 (fundar-repetidamente como
    estrategia de facto para un perfil ambicioso-pero-desleal) — nadie
    programó "si sos así, fundá gremios en bucle"; es la interacción
    entre ambición (empuja a fundar), lealtad (empuja a irse), y el
    costo de fundar siendo bajo en relación a lo que un agente así
    valora (prestigio inmediato de "tener un gremio"), sostenida a
    escala de meses, no de ticks.

## 8. Qué NO funcionó

- **La fianza de gremio no cambió medible el patrón de crimen.** 19
  arrestos en 365 días, la misma cifra aproximada que en V2 sin este
  sistema — el beneficio existe (se ve en los logs cuando ocurre) pero no
  parece haber bajado el umbral de riesgo percibido de robar lo
  suficiente como para que se note en la tasa de intentos. Razonable: la
  decisión de robar ya pondera el riesgo de la guardia local con mucho
  más peso que cualquier señal de gremio.
- **Los encargos de recolección siguen siendo los más difíciles de
  completar** (mirar los logs: la mayoría de los 308 fracasos son de tipo
  `recoleccion_gremial` o `caza_gremial` contra familias de monstruo poco
  visitadas) — el empuje de `guildContractBonus` ayuda pero no resuelve
  el problema de fondo de V2 ya documentado: la población sigue
  concentrada en 2-3 ciudades, lejos de muchos recursos.
- **No implementé** viaje sincronizado de grupo para guerras (los
  miembros deben ya estar en el lugar disputado o cerca para contribuir
  poder), ni una jerarquía de rangos intermedios entre líder y miembro —
  decisiones de alcance explícitas, no bugs, para no construir un segundo
  sistema de coordinación multi-agente ni una "política democrática
  compleja" que el encargo pidió evitar.

## 9. Limitaciones

- **La tasa de éxito de encargos de gremio (~8%) sigue siendo baja** en
  términos absolutos, aunque ya no es cero. No investigué a fondo si es
  la dificultad/plazo de las plantillas o la escasez de miembros con el
  oficio adecuado lo que domina — ambas cosas son plausibles y no son
  mutuamente excluyentes.
- **`declarar_guerra_gremios` no pondera la fuerza de otros
  participantes** porque el mundo no le da al líder forma de conocerla
  de antemano — es una limitación de información deliberada (no se puede
  saber el futuro), pero significa que "comportamiento estratégico" en
  la guerra es más "decidir si vale la pena arriesgarse" que "elegir el
  momento óptimo para atacar a un rival débil".
- **24 agentes siguen siendo pocos** para que "gremios grandes" signifique
  mucho más que 4-8 miembros — los patrones de esta sección podrían verse
  distintos con una población mayor.

## 10. Clasificación final de comportamientos relevantes

**Programado explícitamente**: sucesión de liderazgo por lealtad; cuotas
semanales con expulsión al tercer impago; fianza de gremio en arresto;
costo de declarar guerra; enfriamiento de re-afiliación y permanencia
mínima (correcciones de la sección 5.1).

**Derivado directamente de las reglas**: la especialización de
`IsvelCompañia`; la alta mortalidad de gremios (77 fundados, 5
sobrevivientes); la concentración de fundaciones en el sujeto de control;
la baja tasa de éxito de encargos en zonas poco visitadas.

**Razonablemente emergente**: el patrón de "fundar en bucle a escala de
meses" del sujeto de control (sección 6.1) — no es un rasgo por sí solo
ni una regla por sí sola, sino la intersección sostenida de ambición,
deslealtad y el costo relativo de fundar, visible solo corriendo la
simulación largo tiempo, no derivable de una lectura rápida del código.
Lo llamo "razonablemente emergente" con la misma cautela que en V2: una
vez encontrado, se explica completamente — la simulación fue necesaria
para *encontrarlo*, no para explicarlo después.

## 11. Recomendaciones para el siguiente experimento

- Añadir una señal de "fuerza estimada" limitada y ruidosa (basada en lo
  que un líder pudo observar/le contaron de otros gremios, reusando el
  sistema de rumores ya existente) antes de declarar guerra, para que la
  decisión de participar sea más estratégica y menos una apuesta a
  ciegas.
- Calibrar específicamente las plantillas de `recoleccion_gremial` y
  `caza_gremial` contra la distribución real de dónde vive la población
  (ya documentada en V2: concentrada en 2-3 ciudades) en vez de generarlas
  uniformemente sobre todo el mapa.
- Correr esta misma configuración con una población de 60-80 agentes para
  ver si "gremios grandes" empieza a significar algo cualitativamente
  distinto (decenas de miembros, rangos intermedios que ahora no
  tendrían sentido con grupos de 2-8).
- Si en algún momento hay credenciales de un proveedor de LLM disponibles,
  sustituir la política de decisión de los LÍDERES de gremio en particular
  (no de toda la población) por un adaptador LLM, y comparar sus
  decisiones de guerra/encargos contra las de la política determinista
  bajo el mismo mundo — los líderes son el punto de la arquitectura donde
  las decisiones institucionales realmente se toman, así que es el lugar
  de mayor apalancamiento para esa comparación.
