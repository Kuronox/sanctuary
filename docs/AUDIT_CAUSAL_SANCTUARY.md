# SANCTUARY — Auditoría de Cadena Causal

**Diagnóstico crítico · Post Step 8**
Motor Steps 1–8 · 70 agentes (5 LLM) · Step 8 resultado: MIXTO

---

> **Diagnóstico de una línea:** SANCTUARY tiene el 70% de la plomería para producir
> emergencia narrativa y el 0% de las conexiones que hacen fluir esa plomería hacia las
> decisiones. Los eventos ocurren. Los agentes los observan. La información se almacena.
> Y luego, casi siempre, nada cambia en cómo deciden.

---

## §1 — Estado actual de SANCTUARY

Después de 8 Steps de desarrollo experimental, el engine corre de forma estable: 70 agentes,
personalidades fijas de 6 rasgos, dos ejes de progresión (baseLevel persistente + job.level
que se resetea en rebirth), 3 vidas por agente, economía circular cerrada, gremios con dues
y contratos de caza/recolección/fabricación, cohorte de 5 agentes LLM, motor 100%
determinista por seed.

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `actions.js` | 1059 | handleDeath, combate, broadcast, economía |
| `decision.js` | 580 | scoreAction, listCandidateActions, utility scoring |
| `world.js` | 389 | tick loop, survivalOverride, decay systems |
| `guilds.js` | 315 | dues, contratos, guerras, sucesión |
| `progression.js` | 212 | XP, levels, trials, cambio de clase |
| `llm/filteredWorldView.js` | 193 | Vista LLM: top-6 memorias, last-8 knowledge |
| `economy.js` | 120 | priceAt, tickMarkets, gold reserve circular |
| `knowledge.js` | 93 | addKnowledge (cap 60), shareRumor, broadcast |
| `institutions.js` | 43 | standing per-institution, decay 0.03/tick |
| `geo.js` | 33 | adjacency BFS, 8 nodos, trivialmente rápido |

El engine está en buena forma. No hay bugs de integridad conocidos: `deathHistory` cuadra
con `world.stats.deaths`, la suite completa pasa, la economía es estable.

**El problema no es lo que está roto. Es lo que no está conectado.**

---

## §2 — Qué significa "emergencia narrativa" en nuestro contexto

Definición operativa precisa: una historia emerge cuando un evento E₁ cambia el estado del
mundo de tal forma que los agentes que lo perciben toman decisiones distintas a las que
habrían tomado sin él, y esas decisiones producen eventos E₂ que no habrían existido si E₁
no hubiera ocurrido.

Tres propiedades mínimas para que esto cuente como emergencia real:

1. **Propagación:** E₁ llega a agentes que no lo causaron directamente.
2. **Cambio de comportamiento:** los agentes que lo conocen deciden distinto que los que no.
3. **Consecuencia diferenciada:** E₂ es causalmente específico de E₁, no solo temporal.

**El test operativo:** toma un evento real de la simulación — agent_31 muere en bosque_umbrio
en tick 1200. ¿Puedes trazar una cadena hasta un evento posterior en ticks 1250–1400 que
hubiera sido diferente si agent_31 no hubiera muerto? Si no puedes, no hay emergencia —
hay coincidencia temporal.

La distinción entre los dos caminos posibles:

- **A — Sistema emergente:** el diseñador define reglas. Las historias las genera el sistema.
  El diseñador genuinamente no sabe qué historia va a ocurrir.
- **B — RPG con agentes autónomos:** los agentes deciden solos, pero las motivaciones y el
  espacio de acción fueron diseñados. Las historias posibles están acotadas por ese diseño.

SANCTUARY está actualmente en B, más cerca de A que un RPG convencional, pero sin los
loops causales que lo cruzarían. Sus agentes deciden solos; sus decisiones son mayormente
independientes del historial del mundo que los rodea.

---

## §3 — Mapa actual de causalidad

### Loops que SÍ funcionan hoy

**Loop 1 — Arbitraje de precios:**
```
precio alto en mercado X
→ recordPriceObservation() → knowledge entry "precio"
→ arbitrageOpportunity() en destinationBonus() calcula ganancia
→ agente viaja hacia X para vender
✓ Loop cerrado
```

**Loop 2 — Pull social:**
```
amigo viaja a Y → "travel_end" en knowledge del testigo
→ destinationBonus() sube para Y si affinity alta
✓ Loop cerrado — la única señal social que llega a decisiones
```

**Loop 3 — Contratos de gremio:**
```
gremio crea contrato caza_gremial para zona X
→ guildContractBonus() suma a scoreAction(fight_monster@X)
✓ Loop cerrado — el único incentivo de coordinación colectiva
```

**Loop 4 — Traición bilateral:**
```
agent X traiciona a agent Y (roba, ataca)
→ hasSignificantBetrayal() baja score de party/ayuda con X
✓ Loop cerrado — pero solo bilateralmente. Agent Z no sabe nada.
```

### Plumbing que existe pero no llega a decisiones

**Loop abierto A:**
```
agente muere en combate en bosque_umbrio
→ broadcastLocalEvent → testigos reciben knowledge "muerte"
   [el broadcast funciona; el entry existe en agent.knowledge]
→ scoreAction(fight_monster@bosque_umbrio) más adelante
   ✗ nunca consulta ese knowledge
```

**Loop abierto B:**
```
huntPressure[bosque_umbrio][elite] = 0.8
→ destinationBonus(bosque_umbrio) al decidir travel
   ✗ huntPressure no es consultable por agentes
```

**Loop abierto C:**
```
shareRumor propaga knowledge de muerte a otro agente
→ receptor decide qué hacer
   ✗ el rumor llega, no cambia ningún score
```

---

## §4 — Dónde se rompen las cadenas causales

Seis puntos de ruptura. El primero es prerequisito para que los otros importen.

### Ruptura 1 — Evento → Comportamiento (la central)

`scoreAction()` en `decision.js` solo consulta tres tipos de knowledge: `"precio"`
(arbitraje), `"travel_end"` (pull social), y traición implícita en relaciones bilaterales.
Todo lo demás que un agente sabe — muertes, peleas, robos, guerras de gremio,
renacimientos — existe en `agent.knowledge` y **nunca se consulta al decidir**.

**Este es el bug de arquitectura central. No es un bug de código — es una conexión que
nunca se construyó.**

Evidencia directa en el código: `destinationBonus()` en `decision.js` — donde debería
aparecer "evitar zona peligrosa" — solo chequea job routes, arbitraje, y `"travel_end"`.
No hay ninguna llamada a `agent.knowledge.find(k => k.type === "muerte" && k.location === loc)`
en ningún lugar del archivo.

### Ruptura 2 — Hunt Pressure → Percepción de peligro

`huntPressure[loc][family]` existe y afecta qué rango de monstruo puede spawnear. Pero los
agentes no pueden consultarlo. La percepción de peligro basada en historial de combate
no existe.

### Ruptura 3 — Información → Oportunidad reactiva

`maybeGenerateOpportunity()` en `world.js` genera trabajos de transporte aleatoriamente.
No es event-reactive. La muerte de un agente rico, una victoria de gremio, un robo en un
mercado — ninguno genera ninguna oportunidad.

### Ruptura 4 — Monstruos → Estado persistente

Cada encuentro genera una instancia fresca basada en `worldSeed`. Un monstruo que mató
a tres agentes este mes es idéntico a uno recién creado. No tiene historia, no crece.
La cadena "monstruo con historial → percepción diferenciada → respuesta coordinada"
es estructuralmente imposible.

### Ruptura 5 — Reputación → Comportamiento de terceros

Las relaciones bilaterales funcionan. Pero agent Z, que nunca interactuó con X, no sabe
nada de lo que X hizo. No hay reputación pública ni regional. El comportamiento criminal
tiene costo local (testigos directos) y cero costo global.

### Ruptura 6 — Acción ajena → Oportunidad propia

Cuando un agente muere, su slot de gremio queda vacante. Cuando un agente pierde su ruta
por rebirth, esa ruta queda libre. Ninguno de estos hechos genera una señal que otros
agentes puedan ver y actuar sobre.

---

## §5 — Estado actual de información, memoria y reputación

### Knowledge (cap 60)

| Tipo | ¿Se almacena? | ¿Se usa en decisiones? |
|---|---|---|
| `"precio"` | ✓ sí | ✓ arbitraje |
| `"travel_end"` | ✓ sí | ✓ pull social |
| `"malversacion_descubierta"` | ✓ sí | ✓ penaliza join_guild |
| `"muerte"` / `"rebirth"` | ✓ sí | ✗ ignorado |
| `"combat_win"` / `"combat_loss"` | ✓ sí | ✗ ignorado |
| `"robo"` / `"arresto"` | ✓ sí | ✗ ignorado |
| `"guild_war_*"` / `"new_guild"` | ✓ sí | ✗ ignorado |

El sistema de knowledge es funcionalmente un log de observaciones que solo alimenta 3 de
sus tipos de entrada al motor de decisiones. El resto es almacenamiento sin salida.

### Memoria (cap 50)

Autobiográfica. Se crea para eventos propios: victoria en combate, arresto, trabajo
completado, recibir un rumor. No existe memoria de "presencié la muerte de otro" o
"vi un crimen." La memoria sí alimenta la vista LLM (top 6 por importancia) pero los
agentes con política determinista nunca la leen directamente en `decision.js`.

### Reputación

| Tipo | Scope | ¿Se actúa sobre ella? |
|---|---|---|
| Relaciones bilaterales (`affinity`) | Par a par | ✓ party, ayuda, confianza |
| Guild reputation | Gremio | ✓ join_guild scoring |
| Standing institucional | Por institución | ✓ cambio de clase |
| Reputación pública regional | — | ✗ no existe |

### shareRumor — el eslabón perdido

El mecanismo de propagación existe y funciona: comparte un item aleatorio del pool de
knowledge (confidence > 0.15), con decay × 0.8 y 12% de distorsión. Dos problemas: (1) la
selección es completamente aleatoria — un aviso de muerte compite en igualdad con una
observación de precio; (2) sea cual sea el rumor que llegue, el receptor no cambia ningún
score de acción basándose en él.

---

## §6 — Análisis de stats

El sistema actual tiene dos ejes bien diseñados:

- **baseLevel:** crece lento, no se resetea en rebirth → valor que sobrevive la muerte.
  Incentivo estructural real.
- **job.level:** crece rápido, sí se resetea → costo real de morir. Un Guerrero nivel 8
  que muere vuelve a nivel 1.

Este diseño de dos ejes genera incentivos emergentes reales sin necesidad de código
adicional. Es el sistema más sólido del engine.

**¿Faltan STR/DEX/INT/WIS?** No. La pregunta correcta: ¿existe algún stat que, al cambiar,
cerraría un loop causal nuevo? Un stat de "Miedo" que aumenta con muertes presenciadas
y reduce la disposición a `fight_monster` cerraría la Ruptura 1 — pero el valor sistémico
está en el loop, no en el nombre del stat. Construir el loop primero.

**Diagnóstico:** los stats actuales son suficientes para Steps 9+. El problema no está en
el tablero de stats.

---

## §7 — Análisis de skills / Esencia

El sistema de progresión de oficios ya implementa "skills" funcionales: `combatPower`,
`gatherBonus`, `craftBonus`, `healBonus`, `stealthBonus`, `repairDiscount`, `taxDiscount`,
`knowledgeCapBonus`. Los trials de clase crean behavioral change real — `trialBonus()`
en `scoreAction()` es uno de los pocos lugares donde el estado de una meta afecta
activamente las decisiones.

Un nuevo sistema de skills añadiría valor sistémico solo si cambia *qué acciones están
disponibles* (amplía `listCandidateActions()`) o *cómo el agente interpreta eventos del
entorno*. Sin uno de esos efectos, es decoración que añade estado sin añadir generatividad.

**Esencia / Mana:** feature de RPG sin mecanismo sistémico definido. Sin loop causal
asociado, es overhead de estado puro. Prematuro hasta que las Rupturas 1–3 estén resueltas.

**Diagnóstico:** el sistema de progresión de oficios es sólido. No necesita más features —
necesita que sus outputs sean más usados como inputs de otros sistemas. Un Explorador de
nivel alto debería ser un signal de "información de zona confiable" en el sistema de
rumores. Eso no requiere una nueva clase — requiere que `shareRumor` pese la fuente.

---

## §8 — Análisis de monstruos persistentes

La propuesta con mayor potencial sistémico del catálogo. A diferencia del resto, cerraría
un loop causal completo sin depender de fixes previos al sistema de información:

```
monstruo persiste entre ticks (estado en world.js)
→ acumula kills → crece en poder y loot
→ knowledge específico del monstruo se propaga con su ID
  (no "un elite genérico" — "El Señor del Bosque Umbrio")
→ gremio puede generar contrato reactivo: matar a ese monstruo
→ agentes evalúan riesgo/recompensa → party formation → resolución
```

El monstruo pasa de instancia anónima a actor con historia.

| Pregunta de hipótesis | Respuesta |
|---|---|
| ¿Qué ruptura resuelve? | Ruptura 4 completamente. Parcialmente Rupturas 1 y 3. |
| ¿Cierra un loop hoy abierto? | Sí. Sobrevivir un combate → crecer → presionar más → motivar respuesta organizada. |
| ¿Requiere cambios en engine? | Sí. Estado persistente en world.js; modificar combat resolution. |
| ¿Riesgo principal? | Monstruo sin cap se convierte en singleton que domina el mundo. Necesita techo de poder. |
| ¿Cómo medir su efecto? | H: zonas con monstruo persistente generan más proponer_grupo que zonas sin él, controlando por huntPressure base. |
| ¿Reversible? | Sí — estado aditivo en world.js, no modifica el engine base si se elimina. |

**Diagnóstico:** máximo ROI sistémico. El único feature propuesto que, por sí mismo, crea
un loop causal nuevo de principio a fin. Candidato natural para Step 9 o Step 10.

---

## §9 — Análisis de rumores / información

El plumbing de información es el mejor activo subutilizado del engine. Tres capas ya
funcionan:

1. **Broadcast local:** `broadcastLocalEvent()` → todos los presentes en la misma location.
2. **Rumores:** `shareRumor()` durante `talk` → propagación con confidence × 0.8 y 12% de distorsión.
3. **Almacenamiento:** knowledge entries con tipo, agente, tick, confidence, location.

Lo que falta no es nueva plumbing. Es la conexión de salida.

**Cambio concreto (≈25–35 líneas en decision.js):**

En `destinationBonus(candidate)`: antes de retornar, buscar en `agent.knowledge` entries
recientes (<200 ticks) de tipo `"muerte"` o `"combate_elite"` cuya `location` coincida con
el destino. Si hay ≥1 entry, aplicar penalización proporcional a confidence para agentes
con `riskTolerance` baja. Para agentes con `riskTolerance` alta o con bounty activo en esa
zona, aplicar bonus en su lugar. Esto no es una nueva feature. Es usar datos que ya existen.

**shareRumor priorizado:** la selección aleatoria en `shareRumor()` es el cuello de botella
de propagación. Añadir un campo `urgency` computado como función de tipo + confidence
permitiría que muertes y ataques de elite propaguen más eficientemente que observaciones
de precio rutinarias.

**Diagnóstico:** ROI más alto del catálogo completo. La plomería existe. El costo de
implementación es bajo. El efecto sistémico — cerrar la Ruptura 1, la central — es el más
importante de todos los fixes posibles.

---

## §10 — Análisis de bounty, fama y parties

### Bounties / recompensas de caza

No existe como mecanismo. Los ingredientes están: sistema de oportunidades, guild contracts
(`caza_gremial`), trigger natural (muerte de agente en zona de monstruos). La implementación
mínima reutiliza lo existente: cuando un agente muere en combate en zona X, si existe un
gremio con treasury suficiente en la nearest settlement, su líder emite un contrato
`caza_gremial` para esa zona. El mecanismo de contratos ya existe; solo falta el trigger
event-reactive.

### Fama / reputación pública

Para que la fama sea sistémicamente útil, tiene que: (a) ser observable por agentes que no
participaron en el evento, y (b) cambiar sus decisiones. Sin (b) — sin la Ruptura 1
resuelta — la fama es un número que nadie actúa sobre.

**El orden de implementación importa:** Ruptura 1 primero, fama después.

Una vez resuelta, la fama mínima es un `world.publicRecord`: log de últimos N eventos
significativos que `decision.js` consulta al evaluar confianza en agentes no conocidos.

### Parties persistentes

El sistema actual es one-shot: se forma para un combate, se disuelve de inmediato. Parties
persistentes con objetivo compartido, loot split y relaciones que evolucionan durante el
viaje son el feature narrativamente más rico del catálogo — y también el más complejo.

| Propuesta | Loops nuevos | Costo | Depende de |
|---|---|---|---|
| Bounties (via guild contract) | 1 | Bajo | Ruptura 1 para máximo efecto |
| Fama pública | 1 | Medio | Ruptura 1 obligatoriamente |
| Parties persistentes | 2–3 | Alto | Independiente; complejo |

---

## §11 — Ejemplos de cadenas causales deseables

### Cadena A — El Boss del Bosque

```
✓ Tick 120: monstruo elite mata a Isvel (agent_31) en bosque_umbrio
✓ Testigos (agent_7, agent_22) reciben knowledge "muerte_combate"
✗ El rumor se propaga a aldea_tejo — shareRumor puede propagar,
  pero el receptor no cambia nada
✗ Guild leader genera contrato caza_gremial reactivo — no hay trigger
  event-reactive para contratos
✗ Agentes con knowledge del monstruo evalúan riesgo → party → resolución
  — knowledge de monstruo no afecta scoreAction
```

La cadena se rompe en tres lugares distintos, todos resolvibles. El último link — una party
que viaja al bosque motivada por el conocimiento del monstruo — es la definición de
emergencia narrativa.

### Cadena B — El Monopolio del Rebirth

Agent_42 (Quilan) muere de hambre por segunda vez en 27 días → pierde gold y equipment →
su ruta comercial queda libre → un competidor con greed alta en la misma zona lo observa →
toma los contratos que Quilan habría tomado → acumula ventaja → la desigualdad crece con
cada ciclo de Quilan.

*Se rompe:* la muerte de Quilan no genera ninguna señal de "oportunidad libre." El
competidor no sabe que Quilan murió a menos que estuviera presente. Y aunque lo supiera,
ese knowledge no cambiaría su scoring de acciones económicas.

### Cadena C — El Costo Social del Crimen

Agent_1 (control, greed 0.92) roba de agent_7 → testigos saben → el rumor se propaga →
agentes en otras ciudades lo evitan para party y gremio → agent_1 opera solo en zonas
peligrosas → su mayor tasa de muerte es la consecuencia social acumulada de sus elecciones
previas.

*Se rompe:* el knowledge de robo existe en los testigos. `respondToPartyInvite()` y
`joinGuild()` no lo consultan para agentes que no vivieron el evento directamente.
La información existe; el efecto sobre terceros no.

---

## §12 — Qué NO debemos construir

**La prueba de fuego:** si no puedes explicar en dos frases concretas qué loop causal cierra
una feature, la feature no está lista para implementarse.

- **STR/DEX/INT/WIS adicionales.** El sistema de dos ejes ya provee diferenciación. Más
  números no crean más causalidad.
- **Esencia / Mana.** Feature de RPG sin loop sistémico definido. Sin conexión a decisiones
  de otros agentes, es overhead de estado.
- **Crafting trees elaborados.** El crafting ya existe. Ampliar sin conectar outputs al
  sistema de información es complejidad cosmética.
- **Quests con estructura narrativa explícita.** Si los agentes siguen quests diseñadas,
  ejecutan el script del diseñador. Opuesto a emergencia.
- **Más clases / subclases.** El sistema de clases funciona. Sus outputs no se usan como
  inputs de otros sistemas — ese es el problema, no la cantidad de clases.
- **Reputación global antes de resolver la Ruptura 1.** Un número que nadie actúa sobre
  no es reputación — es un log.
- **Interfaz de jugador único sin decisión de producto explícita.** Convierte SANCTUARY
  en un RPG de perspectiva única. Las otras 69 vidas se vuelven NPCs. Requiere una
  decisión deliberada, no solo una implementación.
- **NPC dialogue / flavor text narrativo.** SANCTUARY no es una narración con texto — es
  un fenómeno observado. Añadir texto cosmético confunde el propósito.

---

## §13 — Arquitectura conceptual propuesta

No una reescritura. Un conjunto de conexiones en el grafo que ya existe. Cuatro niveles
construibles en orden:

### Nivel 0 — Estado actual

Eventos emiten → testigos almacenan knowledge → decisions usan knowledge de precios
únicamente → acciones ejecutan → mundo cambia.

### Nivel 1 — Conectar eventos a decisiones *(Rupturas 1 y 2)*

Knowledge entries de muerte/combate/peligro alimentan `destinationBonus()` y
`scoreAction(fight_monster)`. `huntPressure` se hace observable como señal de peligro
percibido. `shareRumor` prioriza por urgency.

**Costo:** ~40–60 líneas en `decision.js`. Sin cambios al engine. Estrictamente aditivo.

### Nivel 2 — Actores del mundo con historia *(Ruptura 4)*

Monstruos persistentes con estado acumulable. Cada zona tiene un encuentro activo que
persiste entre ticks, crece si no es derrotado, y genera knowledge específico y referenciable.

**Costo:** estado nuevo en `world.js`, modificación en combat resolution. Una semana de
development experimental.

### Nivel 3 — Oportunidades reactivas *(Rupturas 3 y 6)*

`maybeGenerateOpportunity()` se vuelve event-reactive: muertes generan bounties/contratos,
vacíos de poder generan oportunidades de expansión.

**Costo:** modificar world.js + lógica de trigger en events. Medio-alto.

### Nivel 4 — Reputación pública *(Ruptura 5)*

`world.publicRecord`: log de últimos N eventos significativos con decay. Los agentes
consultan el historial público al decidir cómo interactuar con desconocidos.

**Costo:** estado en world, field en entities, queries en decision.js. Alto pero directo.

**El orden importa:** el Nivel 1 es prerequisito para que los Niveles 3 y 4 tengan efecto
real. Un sistema de oportunidades reactivas sin que los agentes actúen sobre la información
es infrastructure sin usuario.

---

## §14 — Máximo 5 posibles grandes pasos futuros

| Paso | Intervención | Ruptura | Esfuerzo | Bloquea a |
|---|---|---|---|---|
| **A** | Conectar knowledge de peligro a decision.js — danger perception en destinationBonus y scoreAction | R1, R2 | Bajo | Todo lo demás |
| **B** | Monstruos persistentes — estado acumulable por zona, crece si no es derrotado | R4 | Medio | Bounties, parties coordinadas |
| **C** | Bounties reactivos — muerte de agente → guild contract de caza en nearest settlement | R3 | Bajo-medio | Fama pública |
| **D** | shareRumor priorizado por urgency — alto impacto propaga más eficientemente | R1 parcial | Bajo | — |
| **E** | Reputación pública efímera — world.publicRecord con decay, consultable en decisiones de confianza | R5 | Alto | — |

Los pasos A y B son los únicos que pueden ejecutarse de forma relativamente independiente.
C, D, E se potencian con A resuelto primero.

---

## §15 — Qué hipótesis debería probar cada paso

### Paso A — Danger Perception

**H0:** Añadir danger perception no cambia significativamente la distribución de agentes
en zonas de alta huntPressure respecto al baseline de Step 8.

**H1:** Agentes con knowledge de muertes recientes en zona X viajan y pelean ahí menos que
agentes sin esa información, controlando por riskTolerance.

**Métrica:** tasa de `fight_monster` en zonas con eventos de muerte reciente, stratificado
por si el agente tiene/no tiene knowledge del evento. 5 seeds × 300 días.

### Paso B — Monstruos persistentes

**H0:** Zonas con monstruo persistente tienen la misma tasa de party formation que zonas
equivalentes sin él.

**H1:** La presencia de un monstruo acumulado (poder >1.5× base) aumenta significativamente
la tasa de `proponer_grupo` en agentes con knowledge del monstruo.

**Métrica:** count(proponer_grupo targeting zona) vs. count(proponer_grupo targeting otras
zonas), per-seed, 600 días.

### Paso C — Bounties reactivos

**H1:** El Δticks entre "agente muere en zona X" y "primer agente viaja hacia zona X con
motivación de combate" es significativamente menor con bounties reactivos que en el
baseline.

**Métrica:** Δticks entre death_event y first fight_monster en la misma zona, por seed
y causa de muerte.

---

## §16 — Riesgos de convertir SANCTUARY en un RPG convencional

### Riesgo 1 — La narrativa pasa a ser diseñada, no emergente

Añadir quests con estructura explícita convierte a los agentes en ejecutores de un script.
La diferencia es epistemológica: en un sistema emergente, el diseñador genuinamente no sabe
qué historia va a ocurrir. En un RPG con quests, el diseñador ya escribió las historias
posibles.

### Riesgo 2 — Un protagonista mata la perspectiva sistémica

Una interfaz de jugador que "encarna" a un agente filtra el mundo a través de esa
perspectiva. Las otras 69 vidas se vuelven NPCs funcionales. SANCTUARY es interesante como
fenómeno observado desde fuera. Con un protagonista, ese fenómeno se convierte en telón de
fondo.

*Nota: la idea de SANCTUARY CHARACTER MODE (el mundo no trata al jugador como protagonista)
es la forma de preservar la diferencia si se decide ir por este camino.*

### Riesgo 3 — "Satisfying gameplay" distorsiona el diseño del sistema

Un sistema emergente puede producir historias aburridas, injustas, o sin arco. Eso es
correcto — así funciona el mundo. Un RPG necesita experiencias satisfactorias. Estas
presiones son contradictorias; si se mezclan sin decisión explícita, la segunda mata a la
primera.

### Riesgo 4 — Features sin loops son deuda técnica

Cada feature que no cierra un loop causal es código que hay que mantener sin valor
sistémico. El engine crece en complejidad sin crecer en generatividad. En 12 meses: un
codebase de 12.000 líneas que produce las mismas historias que uno de 4.000.

### Riesgo 5 — Pérdida de la propiedad observacional

SANCTUARY ahora mismo es una herramienta científica — observable, medible, reproducible.
Los RPGs son herramientas de juego. La perspectiva interna que da sentido al juego oscurece
la observación externa. No hay nada malo en convertirse en un juego — pero es una decisión
de producto, no un paso más de desarrollo.

---

## §17 — Veredicto: ¿dónde estamos realmente?

**Métricas de estado:**
- Rupturas causales abiertas: **6**
- Loops causales funcionando: **4**
- Plomería en su lugar: **~70%**
- Knowledge no-precio que llega a decisiones: **~0%**

---

La pregunta honesta, después de 8 Steps: ¿estamos construyendo un sistema que genera
historias, o un conjunto de sistemas que simulan cosas al mismo tiempo?

La respuesta: **lo segundo, con el potencial real de convertirse en lo primero.**

Lo que SANCTUARY tiene y funciona:

- Sistema de eventos que emite y propaga localmente ✓
- Sistema de knowledge con decay y distorsión ✓
- Motor de decisiones basado en utilidad con ruido real ✓
- Progresión de dos ejes con incentivos genuinos ✓
- Gremios con instituciones, contratos y consecuencias ✓
- Economía circular estable ✓
- `huntPressure` por zona y familia — *existe, no llega a decisiones*

**Lo que falta no es más plomería. Es instalar las llaves de paso en la plomería que ya
existe.**

El knowledge system guarda combates, muertes, crímenes, guerras de gremio. Ninguno de esos
datos llega a `scoreAction()`. Esto no es un bug — es una conexión que nunca se construyó,
probablemente porque la prioridad siempre fue el siguiente mecanismo nuevo, no cerrar el
loop del anterior.

**La distancia al objetivo no es grande en líneas de código. Es grande en claridad de qué
loop cerrar primero.**

El primer loop que hay que cerrar es el más pequeño de todos: un agente que vio morir a
otro en el bosque debería decidir diferente respecto a ese bosque que un agente que no lo
vio. Veinte líneas en `decision.js`. Todo lo que se quiere construir después — bounties,
fama, parties coordinadas, monstruos legendarios — se apoya en ese loop mínimo.

### La distinción A/B en términos concretos

Los cuatro loops que ya funcionan (arbitraje, pull social, contratos de gremio, traición
bilateral) producen exactamente el tipo de causalidad que queremos. No son accidentales —
son el resultado de conectar deliberadamente un evento a un cambio de decisión. Lo mismo
aplica para los seis puntos de ruptura. La técnica está demostrada. Falta aplicarla a los
seis inputs que el engine ya genera pero aún ignora.

### Una decisión de producto que vale la pena hacer explícita

Antes del Step 9 o cualquier feature nueva, esta pregunta: ¿SANCTUARY sigue siendo una
herramienta de investigación (Steps metodológicos, hipótesis falsificables, resultados
abiertos), o se convierte en una plataforma de simulación narrativa donde el objetivo es
observar historias que emergen?

Las dos trayectorias son compatibles con los pasos técnicos de §13. Pero la primera
privilegia la capacidad de medir y comparar; la segunda privilegia la densidad y coherencia
de las historias producidas. La diferencia no está en el código — está en qué preguntas te
importa responder cuando termina una corrida.

Ahora mismo, SANCTUARY hace las dos cosas bien porque el sistema es suficientemente pequeño.
A medida que crece, esa tensión se vuelve difícil de ignorar.

---

*Diagnóstico basado en lectura directa del código: actions.js (1059), decision.js (580),
world.js (389), knowledge.js (93), entities.js, guilds.js (315), progression.js (212),
economy.js (120), geo.js, institutions.js, filteredWorldView.js (193). Informes Steps 7 y 8.
Sin suposiciones ni memoria de conversaciones anteriores sobre el código.*
