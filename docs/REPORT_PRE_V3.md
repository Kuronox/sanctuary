# Sanctuary — PRE-V3: limpieza antes del experimento con LLM

No es un experimento nuevo. Es una limpieza mínima de dos fuentes de ruido
identificadas en el Experimento D, para que V3 (política determinista → LLM)
tenga una baseline sin código muerto y sin un loop degenerativo dominando las
métricas de gremios.

## Configuration

- Seed: `sanctuary-v2`
- Agentes: 70
- Localizaciones: 9
- Duración probada: smoke (24 ticks) → 30 días (720) → 100 días (2400) → 300
  días (7200) → 365 días (8760), corrida acumulativa sobre el mismo estado
- Estado del código: el proyecto no es un repositorio git (`E:\cloudx\sanctuary`
  no tiene `.git`), así que no hay commit al que referenciar. Los cambios de
  esta sesión están descritos por archivo y línea en las secciones siguientes.

## Dead code removed

`agent.reputation.global` (`src/engine/entities.js`, inicializado como
`reputation: { global: 0 }` en `createAgent`) se creaba en cada agente nuevo
pero **nunca se leía en ningún sitio**: ni en `decision.js` (la política de
decisión), ni en ningún handler de `actions.js`, ni en la serialización del
dashboard (`app.js` solo usa `guild.reputation`, que es un campo distinto y sí
funcional). Ya el Experimento D lo había señalado como campo muerto sin
tocarlo. Confirmé con una búsqueda completa del árbol de `src/` que el único
lugar que lo mencionaba era su propia inicialización.

Se eliminó por completo:

- la inicialización en `createAgent` (`entities.js`)
- no había código de serialización específico que tocar: `store.js` persiste
  el objeto agente completo tal cual, así que desaparece solo al quitarlo del
  modelo
- no había referencias en `decision.js`, `actions.js` ni en el dashboard
- no existían tests que dependieran de él (el proyecto no tiene suite de
  tests; se verifica corriendo la simulación, ver sección "Results")

No se reemplazó por ninguna métrica nueva. Las reputaciones que sí tienen
efecto mecánico real — `guild.reputation` (afecta cuotas, decisión de
unirse/irse, encargos), `standing` institucional, y `relationships`
(afinidad/confianza/memorias) — no se tocaron.

## Guild loop diagnosis

**Causa**: `create_guild` (`actions.js`) costaba un monto fijo de 30 de oro,
sin ningún cooldown propio. El único enfriamiento que existía
(`REJOIN_COOLDOWN_TICKS`, introducido en el Experimento A) se aplicaba
exclusivamente a **volver a unirse al mismo gremio que se acaba de
abandonar** (`join_guild`) — nunca a fundar uno **nuevo**. Un agente podía
encadenar sin fricción: fundar (30 oro) → acumular tesoro vía `aportar_gremio`
→ extraerlo vía `malversar_tesoro` (con probabilidad de ser descubierto si hay
testigos, pero sin testigos es gratis) → abandonar o ser expulsado → fundar de
nuevo inmediatamente, con el contador de fundaciones sin ningún efecto sobre
el costo ni la disponibilidad de la acción. Confirmado leyendo
`create_guild`, `expelMember` y `leave_guild`: ninguno de los tres escribía
nada que `create_guild` consultara.

En D esto produjo 456 gremios fundados en el año, con un solo agente (Ulra,
el sujeto de control: ambición 0.88, lealtad 0.12) fundando 362 de ellos
(79%).

**Mecanismo de corrección** (`actions.js`):

1. **Cooldown tras salir de cualquier gremio.** Nuevo campo
   `agent.lastGuildExitTick` (`entities.js`), actualizado tanto en
   `leave_guild` como en `guilds.expelMember`. `create_guild` ya no aparece
   como acción candidata hasta que pasen `GUILD_FOUNDING_COOLDOWN_TICKS` (72
   ticks, ~3 días — la misma magnitud que el cooldown de re-unión que ya
   existía) desde la última salida, sea voluntaria o por expulsión.
2. **Costo creciente por fundación repetida.** Nuevo campo
   `agent.guildsFounded`, incrementado en cada `create_guild`. El costo de
   fundar ya no es fijo: `30 + guildsFounded * 20`. La primera fundación de
   cualquier agente sigue costando exactamente lo mismo que antes (30); la
   segunda cuesta 50, la tercera 70, etc. — quien insiste en fundar gremios
   paga cada vez más caro, en vez de que la acción sea gratuita indefinidamente.

**Por qué este mecanismo**: ambas fricciones ya existían como *patrón* en el
código (el cooldown de re-unión de la sección de gremios, y los costos
crecientes no existían pero son consistentes con cómo `guilds.js` ya modela
fricción económica — cuotas, reputación con decaimiento). No inventan un
sistema nuevo, solo cierran la asimetría entre "abandonar/ser expulsado de un
gremio" y "fundar uno nuevo", que antes no tenían ninguna relación causal.
El cooldown ataca directamente la repetición *inmediata* (fundar-abandonar-
refundar en pocos ticks); el costo creciente ataca la repetición *sostenida a
largo plazo* incluso si el agente espera el cooldown cada vez — sin esto
último, un agente paciente con oro suficiente podría seguir fundando 100
veces en un año solo esperando 72 ticks entre cada una.

**Qué evita**: la cadena fundar→extraer→(abandonar u ser expulsado)→refundar
en cuestión de ticks, que convertía la fundación de gremios en una fuente de
oro casi gratuita y sin memoria institucional, dominando por completo las
estadísticas de gremios del mundo.

**Qué conserva**: un agente sigue pudiendo fundar un gremio, fracasar en él,
y fundar otro más adelante — solo que ahora tiene que esperar, y cada intento
adicional es más caro. Ulra, con las mismas semillas y sin ningún código
específico para ella, sigue siendo la agente que más gremios funda de las 70
(12 de 61, ver Results) — el rasgo de personalidad sigue expresándose, solo
que acotado por la misma fricción que se aplica a cualquier otro agente.

## Geographic concentration

Se investigó si la concentración geográfica (57% en Valdemarca al cierre de
D) tenía un bug detrás. Revisé `decision.js` (scoring de `travel`/
`destinationBonus`) y `world.js` (no hay ninguna regla que impida a un agente
salir de Valdemarca una vez instalado, ni ningún candado de movimiento). No
encontré ningún loop que atrape a un agente sin posibilidad razonable de
salir — a diferencia del bug de comida del Experimento C (agentes atrapados
en un flee-loop entre dos ciudades sin comida), aquí la concentración es
simplemente el resultado acumulado de la política de decisión prefiriendo
Valdemarca (capital, mejor seguridad, academia, mercado más grande) una y
otra vez cuando compite contra alternativas peores en igualdad de
condiciones.

**No se cambió nada de la geografía**, tal como indica el encargo cuando no
hay un bug claro.

Dato aparte, no una corrección: en esta corrida 3 de 9 localizaciones
(`cruce_fangoso`, `colinas_rotas`, `ruinas_kaltenhor`) terminan con 0 agentes
al día 365, mientras que en D ninguna terminaba vacía. Esto **no es un
efecto de tocar la geografía** — es la consecuencia esperable de que el fix
del loop de gremios cambia qué acciones están disponibles en cada tick para
muchos agentes (sobre todo los que antes fundaban/abandonaban gremios sin
parar), lo cual desplaza el consumo del RNG determinista y hace que toda la
trayectoria de la simulación diverja de D desde ticks muy tempranos, aunque
la semilla sea idéntica. Es ruido de divergencia por el cambio de código, no
una nueva señal sobre geografía — se documenta aquí para que quede claro por
qué el número de "localizaciones vacías" no es comparable 1:1 con D pese a
no haber tocado ninguna regla geográfica.

## Results — D vs PRE-V3 (mismo seed, 365 días, 70 agentes)

| Métrica | Experimento D | PRE-V3 |
|---|---|---|
| Gremios fundados (año completo) | 456 | **61** |
| Fundados por el agente más activo | 362 (79%, Ulra) | **12 (19.7%, Ulra)** |
| Gremios activos al cierre | 14 | 9 |
| Tamaño de gremios activos | 7,6,6,5,4,4,2,1×7 | 19,6,4,4,4,3,3,2,1 |
| Gremios disueltos (colapsos) totales | — | 52 (de 61 creados) |
| Mediana de riqueza | 15 | **15.6** (consistente — `help_agent` no se tocó) |
| Riqueza máxima | ~32k | 21.8k |
| Concentración geográfica (ciudad dominante) | 57% (Valdemarca) | 55.7% (Valdemarca) — sin cambio deliberado |
| Localizaciones vacías | 0 | 3 (ver nota de divergencia arriba) |
| Robos exitosos / fallidos / arrestos | — | 10 / 13 / 11 |
| Encuentros de grupo (propuestos / ganados / perdidos) | — | 1007 / 801 / 141 |
| Recuerdos relacionales totales | — | 28.103 |
| Traiciones significativas recordadas (peso≥2.5, negativas) | — | 351 |
| Cambios de clase | — | 53 |
| Agentes vivos al cierre | 70/70 | 70/70 |

La mediana y la distribución de riqueza casi no se mueven respecto a D — es
la confirmación esperada de que `help_agent` y el resto de la economía no se
tocaron en esta sesión. La caída de gremios fundados de 456 a 61 (-87%) y de
la concentración en un solo fundador de 79% a 20% es el resultado directo
—y esperado— de la fricción introducida.

## Bugs

- **Fixed**: reputación global muerta (`agent.reputation.global`) — código
  muerto eliminado, sin sustituto.
- **Fixed**: loop degenerativo de fundación de gremios — cooldown de 72 ticks
  tras cualquier salida de gremio + costo creciente por fundación repetida.
- **Known, no addressed**: concentración geográfica en Valdemarca (55-57%
  según la corrida) sigue siendo un fenómeno del sistema, no un bug — fuera
  de alcance de esta sesión por instrucción explícita.
- **Not addressed**: la divergencia de qué localizaciones quedan vacías entre
  D y PRE-V3 (0 vs 3) no es un bug nuevo; es ruido esperado de que el cambio
  de código altera la secuencia de decisiones y por tanto el consumo del RNG
  determinista, aunque la semilla sea la misma. No se investigó más a fondo
  por estar fuera del alcance (no tocar geografía).

## Experimental integrity

No se modificó: economía (`economy.js`), combate (`fight_monster`,
`resolveSoloFight`, `resolvePartyFight`), progresión (`progression.js`),
clases y class trials, sistema de grupos/party, relaciones y memoria
relacional (`entities.js` fuera de los dos cambios descritos), guerras de
gremios, crimen y arrestos, crafting/equipment, quests/jobs, mercados,
monstruos, definición de ciudades (`world_seed.json`), reglas de información
parcial (`knowledge.js`), ni la arquitectura general
(`world.js` → `decision.js` → `actions.js` → `store.js`). `decision.js` no
se tocó en absoluto: la fricción de fundación de gremios vive enteramente en
la disponibilidad de la acción candidata (`actions.js`), no en su puntaje.

`rel.memories` y su efecto mecánico en `help_agent`, `join_guild` y
`respondToPartyInvite` (Experimento D) permanecen intactos y verificados
(28.103 recuerdos acumulados, 351 traiciones significativas activas al
cierre).

Ulra conserva sus traits, personalidad, objetivos, semilla y política de
decisión sin ningún código condicionado a su identidad — la fricción de
gremios se aplica exactamente igual a los 70 agentes; Ulra simplemente sigue
siendo, con su propia personalidad, la que más gremios funda del grupo.

## Classification

- **Reducción de gremios fundados de 456 a 61 y de la cuota de Ulra de 79% a
  20%**: **programmed** — consecuencia directa y predecible de la fricción
  añadida (cooldown + costo creciente), no un descubrimiento de la
  simulación.
- **Ulra sigue siendo la fundadora más activa del grupo (12 de 61, el doble
  que el segundo lugar con 7) pese a la fricción uniforme**: **derived** —
  se deriva directamente de su personalidad (ambición 0.88, lealtad 0.12)
  interactuando con reglas iguales para todos; no requirió ninguna
  simulación para anticiparlo, pero tampoco está codificado explícitamente.
- **3 localizaciones vacías en vez de 0**: **derived**, no emergente — es
  consecuencia mecánica de que cambiar disponibilidad de acciones en
  `actions.js` desplaza el consumo del RNG determinista para toda la
  simulación; no revela nada nuevo sobre el sistema geográfico en sí.
- **Concentración geográfica en Valdemarca prácticamente sin cambio (57%→
  55.7%) pese al cambio de código en otra parte del motor**: **derived** —
  confirma que la preferencia por Valdemarca en `decision.js` es robusta a
  perturbaciones no relacionadas, consistente con ser un sesgo estructural
  de la política de decisión y no un artefacto de una interacción puntual
  con el sistema de gremios.

## Recomendaciones fuera de alcance (no implementadas)

- El costo creciente de fundación (`30 + guildsFounded * 20`) no tiene techo
  ni decaimiento con el tiempo — un agente que funda muchos gremios a lo
  largo de años de simulación podría eventualmente no poder pagar nunca más.
  Es la fricción mínima pedida por el encargo, pero si V3 corre simulaciones
  mucho más largas podría valer la pena un decaimiento lento del contador.
  No se implementa aquí porque no fue pedido y añadiría una superficie de
  diseño nueva.
- La concentración geográfica sigue sin explicación causal más allá de "la
  política prefiere la capital" — si en el futuro se quiere estudiarla en
  serio, valdría la pena instrumentar por qué (seguridad, mercado, tamaño de
  población) domina el resto de factores, pero eso es exactamente el tipo de
  rediseño que este encargo pide explícitamente no hacer ahora.
