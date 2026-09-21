# EXPERIMENTO D — Relaciones, conflicto, reglas y consecuencias

## 0. Configuración exacta

Seed `sanctuary-v2` (sin cambiar), 70 agentes, 9 localizaciones (igual que
el Experimento C), 365 días (8.760 ticks). Código: Sanctuary tras el
Experimento C más los cambios de la sección 2 de este informe.
Reproducir con `npm run reset && npm run sim -- 8760`.

## 1. Auditoría del estado actual (antes de tocar nada)

Verifiqué en el código, no en los informes anteriores, tres afirmaciones
que resultaron ciertas y una que resultó ser el hallazgo central de este
experimento:

- **`agent.reputation.global` sigue siendo un campo completamente muerto**
  (heredado de V1): se inicializa en 0 y no aparece en ningún otro lugar
  del motor. La posición institucional (`standing`) y las relaciones ya
  cubren esa función; no lo toqué.
- **`help_agent` transfería oro a un objetivo elegido casi solo por
  cercanía y afinidad, sin mirar si esa persona necesitaba algo.** El
  monto era un aleatorio fijo (3-10), sin relación con la riqueza del
  receptor. Esta es, verificado en el código, la causa exacta de la
  "riqueza social" documentada en los Experimentos B y C.
- **Las decisiones de `join_guild`, `proponer_grupo` y
  `respondToPartyInvite` ya eran razonablemente conscientes de instancia**
  (reputación del gremio, líder concreto, especialización, riesgo
  combinado) — no hizo falta rediseñarlas, solo extenderlas.
- **El hallazgo central de la auditoría**: `rel.memories` — el arreglo de
  recuerdos con peso que distingue una traición de una charla (creado en
  el Experimento A) — se escribía en cada evento relevante pero **nunca
  se leía en ningún lado excepto el dashboard**. Una relación podía tener
  siete recuerdos de "malversó el tesoro del gremio" y aun así puntuar
  exactamente igual que una relación sin ningún evento negativo, siempre
  que la afinidad numérica se hubiera recuperado. Esto contradice
  directamente la pregunta central del encargo ("¿un acontecimiento
  antiguo puede producir consecuencias mucho después?") — con el código
  tal cual estaba, la respuesta hubiera sido no, por diseño.

## 2. Cambios implementados

1. **`entities.js` — los recuerdos ahora guardan el signo del evento**
   (`affinityDelta`), no solo el texto y el peso. Nueva función exportada
   `hasSignificantBetrayal(rel)`: verdadero si existe algún recuerdo con
   peso ≥2,5 y efecto negativo (robo exitoso o fallido, malversación de
   tesoro) — deliberadamente no incluye eventos institucionales más
   suaves (como que el fundador abandone un gremio, peso 2) para que el
   umbral siga significando algo severo.
2. **`decision.js` — tres puntos de decisión ahora consultan la memoria,
   no solo el número acumulado**:
   - `help_agent`: ahora pondera cuánto necesita realmente el destinatario
     (inversamente proporcional a su oro) y penaliza ayudar a quien ya
     tiene de sobra; y resta puntuación si existe una traición
     significativa recordada, incluso con afinidad numérica alta.
   - `join_guild`: penaliza unirse a un gremio cuyo líder traicionó antes
     al agente, más allá de la afinidad actual con ese líder.
   - `respondToPartyInvite`: un agente es menos propenso a jugarse la vida
     en un combate junto a alguien que lo traicionó antes, aunque hablar
     con esa persona hoy puntúe neutral.

Ningún cambio tocó la separación mundo → agente → decisión → política →
persistencia → dashboard, ni introdujo ninguna rama de código específica
para Ulra ni para ningún otro agente.

## 3. Pruebas

Smoke test (24 ticks), 30 días, 100 días, 300 días y 365 días, todas sin
errores, misma semilla, misma población de 70, mismo mapa de 9
localizaciones que el Experimento C. Ningún bug nuevo apareció en esta
corrida — a diferencia de A, B y C, esta vez la auditoría no encontró
ningún comportamiento que rompiera la simulación, solo un sistema
(memoria de relaciones) que existía pero no producía efecto.

## 4. Resultados y métricas (365 días)

| Métrica | Experimento C (70 ag., sin memoria de traición) | Experimento D (70 ag., con memoria de traición) |
|---|---|---|
| Oro total en circulación | 169.514 | 134.676 |
| Mediana de riqueza | **0** | **15** |
| Agentes con 0 de oro | 36 de 70 (51%) | 31 de 70 (44%) |
| Riqueza máxima | 57.267 | 31.919 |
| Distribución de los 8 más ricos | caída abrupta tras los 2 primeros | descenso gradual (31.9k→6.5k) |
| Concentración geográfica máxima | 74% en una ciudad | 57% en una ciudad |
| Localizaciones con 0 residentes | 4 de 9 | 0 de 9 (todas tenían al menos 1) |
| Gremios fundados | 172 | 456 (79% por un solo agente, ver sección 6) |
| Gremios activos al cierre | 8 | 14 |
| Tamaño de gremios activos | 20, 12, 8, 3, 2, 2, 1×4 | 7, 6, 6, 5, 4, 4, 2, 1×7 |
| Clase criminal alcanzada | ninguna | **Asesino** (primera vez en todo el proyecto) |
| Relaciones con memoria de traición significativa | no medido en C | **67** |

**La mediana de riqueza pasó de 0 a 15, y la caída de riqueza entre el
primer y octavo agente más rico se volvió gradual en vez de un
precipicio.** No cambié ninguna regla de generación de riqueza — el único
cambio fue que `help_agent` ahora exige que el receptor lo necesite. Esto
es evidencia directa (no solo plausible) de que la desigualdad extrema de
B y C dependía en buena parte de un mecanismo de regalo sin criterio, no
solo de producción económica desigual.

## 5. Cinco trayectorias reconstruidas desde los logs

### 5.1 Ulra (sujeto de control) — obligatorio

- **Rasgos sembrados** (sin cambios entre experimentos): codicia 0,92,
  ambición 0,88, tolerancia al riesgo 0,85, empatía 0,08, lealtad 0,12.
  Misma política general que los 69 agentes restantes — verificado que no
  existe ninguna rama de código condicionada a su identidad.
- **Tick 329 (día ~14)**: completa Novato → Comerciante.
- **Estado final**: Comerciante, nivel de oficio 9, nivel base no
  registrado por separado en este resumen, **24 robos exitosos** (el
  máximo de la población, igual que en A, B y C), 16 de oro.
- **Patrón dominante de su año**: fundó **362 de los 456 gremios** de todo
  el mundo (79%) — el mismo patrón de fundar-malversar-ser expulsado-
  fundar de nuevo documentado en cada experimento anterior, aquí a mayor
  escala absoluta que nunca. Entre los ticks 164 y 504 malversó tesoros de
  al menos seis gremios distintos, siendo descubierto y expulsado en casi
  todos los casos.
- **Comparado con la población general**: sus robos siguen siendo, por
  lejos, el máximo del mundo (el segundo más alto, Elsvet, tiene 2). No es
  el más rico ni el más pobre, ni cambió de clase criminal esta vez — un
  año más de comportamiento consistente con sus rasgos, sin convertirse en
  protagonista ni en villano de manual.
- **Clasificación**: A/B — el patrón completo (codicia+ambición empujan a
  fundar y robar; empatía y lealtad bajas empujan a malversar y no
  quedarse) es programado en sus componentes individuales y derivado en
  su combinación sostenida durante un año — no requiere apelar a nada
  emergente para explicarlo.

### 5.2 Elsvet — la primera Asesina del proyecto

- **Tick 468 (día ~19)**: Novato → Pícaro.
- **Se queda como Pícaro casi todo el año** — de tick 468 a **tick 8.154**
  (día ~340, a solo 25 días de terminar la simulación), acumulando nivel
  de oficio hasta 22 antes de completar la prueba de Asesino (matar 2
  monstruos de rango élite).
- **Estado final**: Asesina, nivel de oficio 9 (se reinicia al cambiar de
  clase, como en todo el sistema), 14.902 de oro, miembro de un gremio.
- Su tolerancia al riesgo (0,36) es **moderada, no alta** — un dato
  honesto: no encaja con la intuición de "un asesino debe ser temerario".
  Lo que sí tiene es lealtad relativamente alta (0,64) y sociabilidad alta
  (0,62), y terminó perteneciendo a un gremio con relaciones activas — su
  camino hacia el combate parece haber sido gradual y sostenido en el
  tiempo, no una decisión temeraria puntual.
- **Qué solo puede inferirse, no afirmarse**: por qué tardó tanto en dar
  el salto de Pícaro a Asesino no se puede determinar con certeza desde
  los contadores — es consistente con que el sistema de pruebas (una a la
  vez, ver Experimento B) le hiciera falta acumular oportunidades reales
  de enfrentar monstruos de rango élite, algo poco frecuente para un
  pícaro sin fuerte inclinación al combate.
- **Clasificación**: C, con cautela — que la ruta de Asesino fuera
  alcanzable era una regla explícita (Experimento B); que *tardara casi
  un año entero* en completarse para la única agente que lo logró en
  cuatro experimentos no era predecible leyendo esa regla sola, y requirió
  correr la simulación completa para descubrirlo.

### 5.3 Isvel — la relación que perdona sin olvidar

- Personalidad: lealtad moderada (0,55), empatía baja (0,23), ambición y
  codicia moderadas-altas.
- Clase final: Herrera, 10.737 de oro (el sexto más rico del mundo),
  miembro activo de un gremio.
- **Su relación con Ulra**: afinidad actual **100 ("amigo")**, el máximo
  posible. Pero su registro de recuerdos contiene **siete entradas** de
  "Ulra malversó el tesoro del gremio" (peso 4 cada una, entre los ticks
  1.238 y 3.545) — presenciadas directamente, no rumores. La afinidad
  numérica se recuperó por completo con el tiempo; el recuerdo de la
  traición sigue ahí.
- **Consecuencia mecánica verificada**: con la corrección de la sección 2,
  si Isvel evaluara hoy unirse a un gremio liderado por Ulra, o ayudarlo
  económicamente, o jugarse la vida junto a él en un combate, la
  puntuación de esas decisiones llevaría una penalización explícita por
  esa memoria — invisible si solo se mira la etiqueta "amigo" de la
  relación, real si se mira lo que realmente recuerda.
- **Clasificación**: A para el mecanismo (la memoria se escribe y se
  puede consultar porque el código lo permite explícitamente); B para el
  resultado concreto (que la afinidad se recuperara del todo mientras el
  recuerdo severo seguía intacto es la consecuencia directa y esperable
  de separar ambos números, no algo que sorprenda una vez se entiende la
  regla).

### 5.4 Quilan — independencia, ambivalencia y una victoria compartida

- Personalidad: ambición muy baja (0,10), lealtad baja (0,24), tolerancia
  al riesgo alta (0,76).
- Clase final: Comerciante, nivel de oficio 10, pero con 263 muertes de
  monstruo registradas — un comerciante que también caza, sin haber
  cambiado nunca a una clase de combate.
- **Sin gremio al cierre del año** (`guildId: null`) — coherente con su
  baja lealtad y su objetivo primario declarado, exploración (no
  pertenencia ni prestigio).
- **Su relación con Ulra es la más compleja documentada en este
  experimento**: en su registro de recuerdos coexisten tres intentos de
  robo sufridos ("intento robarle"), un robo exitoso sufrido ("le
  robaron"), una malversación de tesoro presenciada, **y dos victorias
  compartidas contra un Lobo alfa** ("vencieron juntos"). El resultado
  neto es una afinidad de exactamente **0** — ni amigo ni enemigo,
  literalmente en el punto medio, reflejando una historia genuinamente
  mixta en vez de una etiqueta simple.
- **Clasificación**: B — cada evento individual es una consecuencia
  directa de una regla conocida (robo, malversación, combate en grupo);
  que se acumularan en direcciones opuestas hasta cancelarse en el número
  final es la consecuencia matemática esperable de sumar deltas con
  signos distintos, no algo emergente — pero es exactamente el tipo de
  "relación con historia real" que la sección 6 del encargo pedía poder
  observar, y antes de este experimento esa historia no habría tenido
  ningún efecto adicional más allá del número final.

### 5.5 "Ulra la Errante" — homónima, no la misma agente

**Aclaración necesaria**: este es un agente *distinto* de "Ulra (sujeto de
control)" — coincide el nombre base porque el generador procedural de
nombres reutiliza la misma lista de 33 nombres para 70 agentes, y "Ulra"
volvió a salir sorteada con un epíteto distinto. No comparten identidad ni
código.

- Personalidad: sociabilidad muy baja (0,14 — la más baja de las cinco
  trayectorias seleccionadas), codicia moderada-alta (0,60), lealtad
  moderada (0,49).
- Clase final: Comerciante, **nivel de oficio 24** (el más alto observado
  en esta corrida), nivel base 9, **31.919 de oro — la segunda mayor
  fortuna del mundo**.
- A diferencia de los casos de "riqueza social" documentados en B y C
  (donde la fortuna venía casi enteramente de `help_agent` recibido), esta
  agente tiene sociabilidad muy baja — no es plausible que su riqueza
  provenga mayormente de que otros la ayudaran por simpatía. Es
  consistente con una acumulación por comercio activo sostenido (nivel de
  oficio 24 en Comerciante implica una cantidad muy grande de operaciones
  de compra/venta a lo largo del año), aunque no medí el desglose exacto
  de sus fuentes de ingreso para afirmarlo con la misma certeza que en el
  Experimento B.
- **Clasificación**: B — una agente poco sociable que se vuelve rica por
  comercio sostenido es la consecuencia directa esperable de sus propios
  rasgos (codicia, ambición de riqueza) combinados con su oficio, no
  requiere ninguna interacción de sistemas sorprendente para explicarse.

## 6. Respuestas a las preguntas del encargo

### Relaciones

1. **¿Evolucionaron significativamente?** Sí — las cinco trayectorias
   muestran relaciones que suben, bajan, se recuperan parcialmente o
   quedan exactamente neutras por cancelación de eventos opuestos (Quilan).
2. **¿Amistades duraderas?** Sí, en volumen: 548 relaciones etiquetadas
   "amigo" al cierre del año (conteo direccional).
3. **¿Relaciones deterioradas?** Sí, aunque en menor volumen (4
   "rival", 0 "enemigo" al corte de esta foto puntual — la etiqueta
   numérica es volátil; lo más revelador está en los recuerdos, no en la
   etiqueta, ver siguiente pregunta).
4. **¿Un acontecimiento antiguo con consecuencias mucho después?**
   Sí, demostrado con evidencia concreta y mecanismo verificable: la
   relación de Isvel con Ulra (sección 5.3).
5. **¿Afectaron decisiones económicas o institucionales?** Sí, por
   diseño desde esta corrección: `help_agent` y `join_guild` ahora
   consultan la memoria de traición, no solo la afinidad.
6. **¿Conflictos derivados de relaciones anteriores?** El caso de Quilan
   (sección 5.4) es el ejemplo más claro: su relación con Ulra combina
   crimen sufrido y cooperación en combate, sin resolverse hacia ningún
   extremo.

### Conflicto

7. **¿Intereses incompatibles?** Sí — Ulra fundando y vaciando gremios
   que otros agentes (Isvel, Chon, Dessa, Varik el Manco, entre otros)
   intentaban sostener.
8. **¿Conflictos no relacionados con combate?** Sí — malversación de
   tesoro, robo, expulsión de gremios: ninguno de estos usa el sistema de
   combate.
9. **¿Algún agente sacrificó eficiencia por relaciones u otro objetivo?**
   No lo medí de forma aislada en esta corrida — es plausible dado que
   `help_agent` ahora penaliza ayudar a quien no lo necesita pero algunos
   agentes seguramente lo siguen haciendo por relación existente aun
   cuando el nuevo criterio de necesidad lo desaconseja levemente; no
   tengo evidencia cuantificada para afirmarlo con certeza.
10. **¿Alianzas temporales?** Las partidas (`party_proposed`: 1.118,
    `party_combat_win`: 976) son, por diseño, exactamente eso — alianzas
    que se disuelven después de resolver el encuentro.
11. **¿Rupturas o traiciones explicables por contexto?** Sí — cada
    malversación y robo queda con causa estructural clara (codicia alta,
    empatía/lealtad bajas del agente, oportunidad de testigos o su
    ausencia).

### Sistemas

12. **¿Los agentes respetaron las reglas?** Sí — no se encontró ningún
    caso de una acción ejecutándose fuera de las restricciones que
    `actions.js` impone.
13. **¿Nuevos exploits?** No se encontró ninguno nuevo en esta corrida —
    a diferencia de A, B y C, esta fue la primera corrida sin un bug
    nuevo de comportamiento roto.
14. **¿Qué reglas tuvieron impacto real?** La memoria de traición
    (sección 2) tuvo impacto medible y cuantificado (sección 4). La
    necesidad económica en `help_agent` cambió la mediana de riqueza de
    forma medible.
15. **¿Qué sistemas siguen siendo decorativos?** `agent.reputation.global`
    sigue muerto (documentado, no corregido — su función ya la cumple
    `standing`). No se investigó a fondo si otros sistemas menores lo son
    también en esta corrida.
16. **¿Predominan acciones genéricas o específicas?** Las acciones más
    frecuentes del mundo (`talk`: 308.556, `help`: 173.591) siguen siendo,
    en volumen, las mismas de siempre — pero varias de las decisiones que
    sí importan estructuralmente (`join_guild`, `steal`, `accept_guild_contract`,
    y ahora `help_agent`) evalúan instancias concretas, no un tipo
    genérico.

### Sociedades

17. **¿Las localizaciones desarrollaron perfiles diferentes?** Parcialmente
    observable: Valdemarca concentra el 57% de la población (capital,
    máxima seguridad, institución académica) — un perfil dominante de
    facto, aunque no se aisló con precisión metodológica si es
    "identidad" o solo gravedad social (ver limitaciones del Experimento
    C, no resuelto aquí tampoco).
18. **¿Diferencias colectivas no programadas?** La distribución de clases
    por ciudad no se midió de forma separada en esta corrida — limitación
    reconocida.
19. **¿Alguna institución domina una localidad?** La Academia de
    Valdemarca coincide con la ciudad más poblada, pero no se pudo
    determinar causalidad (¿la gente va por la institución, o la
    institución solo está en la ciudad que ya era popular por otras
    razones?) — pregunta abierta.

### Consecuencias

20. **¿Qué agentes perdieron realmente?** 31 de 70 (44%) terminaron el
    año con 0 de oro — una pérdida económica real y persistente para
    prácticamente la mitad de la población.
21. **¿Qué gremios desaparecieron?** 442 colapsos registrados sobre 456
    fundados — la inmensa mayoría de los gremios del año no sobrevivió.
22. **¿Qué actividades económicas dejaron de ser viables?** No se repitió
    el análisis detallado de agotamiento de mercado del Experimento B en
    esta corrida — limitación reconocida.
23. **¿Consecuencias que persistieron durante meses?** Sí, con evidencia
    directa: los recuerdos de Isvel sobre Ulra, de tick ~1.240 a la
    consulta final en tick 8.760 — más de 300 días de persistencia.
24. **¿Un acontecimiento temprano alteró una trayectoria posterior?** El
    caso más claro es el propio patrón de Ulra: sus expulsiones tempranas
    (ticks 164-504) no le impidieron seguir fundando gremios el resto del
    año, pero sí dejaron un rastro de relaciones dañadas (67 relaciones
    con memoria de traición en toda la población) que ahora, con la
    corrección de esta sección, tiene capacidad real de cerrarle puertas
    futuras (gremios, ayuda, invitaciones a grupo) que antes se le
    abrían sin fricción.

### Historias

25. **¿Las cinco trayectorias parecen historias emergentes?** Parecen
    trayectorias *coherentes* — con causa, consecuencia y una progresión
    reconstruible desde los logs — pero la mayoría de los eventos
    individuales que las componen son programados o derivados (ver
    clasificación en cada sección 5.x). Lo que sí es nuevo es que ahora
    *se acumulan* de forma legible en vez de perderse en el ruido de la
    afinidad.
26-28. Ver clasificación específica al final de cada trayectoria en la
    sección 5.
29. **¿Comportamientos nuevos respecto de A, B y C?** La primera clase
    Asesino de todo el proyecto (Elsvet); relaciones con afinidad
    numérica recuperada pero memoria de traición intacta y con efecto
    mecánico verificado (Isvel); una mediana de riqueza positiva por
    primera vez con 70 agentes (antes siempre 0).

## 7. Comparación histórica (A → B → C → D)

- **Se mantuvo**: el patrón de fundación compulsiva de gremios de Ulra
  (presente, con variaciones de escala, en los cuatro experimentos); la
  concentración geográfica en una ciudad dominante; el crimen como
  fenómeno casi exclusivo de la personalidad sembrada, no de la
  oportunidad disponible.
- **Desapareció**: ningún sistema desapareció — D es aditivo sobre C, no
  un reemplazo.
- **Se debilitó**: la concentración extrema de riqueza (mediana de 0 a
  15; máximo de 57k a 32k) y la concentración geográfica extrema (de 74%
  a 57% en la ciudad dominante, y de 4 ciudades vacías a ninguna) — ambas
  como consecuencia medible de un solo cambio de regla (`help_agent`
  consciente de necesidad), no de ningún ajuste directo a economía o
  geografía.
- **Aumentó**: el número de gremios activos (8→14) y su distribución de
  tamaños (de dos gigantes y el resto diminutos, a una curva más
  gradual); el número de relaciones con historia registrable y
  consultable.
- **Apareció por primera vez**: la clase Asesino; el uso mecánico
  (no solo decorativo) de la memoria de relaciones; una corrida completa
  de 365 días sin ningún bug nuevo de comportamiento roto.
- **Sigue sin resolverse**: por qué la población se concentra
  geográficamente en una sola ciudad en vez de distribuirse — el "tirón
  social" documentado desde V2 sigue dominando pese a que ahora
  `help_agent` es más selectivo; por qué la mayoría de los gremios
  colapsa casi de inmediato; si las diferencias "culturales" entre
  ciudades son reales o solo gravedad poblacional sin contenido
  cualitativo distinto.
- **Sigue siendo artificialmente dominante**: `talk` y `help` en volumen
  bruto de eventos, heredado sin cambios desde V1.

## 8. Evaluación crítica de Sanctuary como plataforma experimental

**¿Qué hemos demostrado realmente después de A, B, C y D?**

Que un conjunto relativamente pequeño de reglas —necesidades, personalidad,
objetivos, relaciones con memoria, conocimiento limitado, economía con
fricción, progresión por instancia— puede producir trayectorias
individuales *reconstruibles y explicables* con datos reales, no solo
plausibles a ojo. Las cinco trayectorias de la sección 5 no fueron
escritas: se armaron leyendo logs después de correr la simulación, y cada
una tiene una causa rastreable hasta una regla concreta o una combinación
de un puñado de ellas.

**Hipótesis confirmadas:**
- Que la memoria de relaciones, si se conecta a la toma de decisiones,
  produce comportamiento medible más allá de la afinidad numérica
  (sección 4-5.3).
- Que gran parte de la "riqueza social" observada en B y C era un
  artefacto de una regla sin criterio de necesidad, no una propiedad
  robusta de poblaciones grandes (sección 4).
- Que las trayectorias criminales alternativas (Pícaro/Asesino/
  Contrabandista) son alcanzables, aunque con baja frecuencia — un caso
  en cuatro experimentos completos.

**Hipótesis refutadas o debilitadas:**
- Que una población más diversa produciría automáticamente más
  diversidad de trayectorias por sí sola — la concentración geográfica y
  la fundación compulsiva de gremios por un solo agente persisten con
  fuerza pese a 70 agentes y correcciones sucesivas.

**Sigue sin respuesta:**
- Si las "sociedades diferentes" de Le Guin son alcanzables de verdad con
  esta arquitectura, o si el tirón social hacia una sola ciudad lo impide
  estructuralmente sin una intervención directa sobre esa regla.
- Cuánto de la coherencia narrativa de las cinco trayectorias es una
  propiedad real del sistema y cuánto es selección — elegimos agentes con
  historias que ya sabíamos, por los recuerdos registrados, que tenían
  algo que contar. No se intentó (ni se pidió) verificar qué fracción de
  los 70 agentes tiene una trayectoria igual de reconstruible.

**Comportamientos claramente artefactos del motor:**
- El volumen bruto de `talk`/`help` domina cualquier métrica de conteo de
  eventos desde V1 sin que eso refleje necesariamente lo que "importa" en
  una trayectoria — hay que mirar recuerdos y cambios de estado, no
  conteos.
- La fundación compulsiva de gremios de un agente de lealtad muy baja es
  reproducible en las cuatro corridas con la misma semilla — es un
  artefacto robusto de esa combinación de rasgos con la estructura de
  costos actual de fundar/abandonar, no ruido.

**Qué vale la pena conservar**: el patrón arquitectónico completo
(mundo→agente→decisión→política→persistencia→dashboard), el sistema de
memoria de relaciones ahora que tiene efecto real, la economía con
fricción real (reservas finitas, cuotas, impuestos).

**Qué necesita rediseño**: el mecanismo que produce concentración
geográfica — cuatro experimentos seguidos muestran el mismo patrón
resistiendo correcciones indirectas; probablemente necesite una
intervención directa sobre la regla de "tirón social" en vez de esperar a
que otra corrección lo alivie de rebote. El sistema de fundación de
gremios sigue sin fricción suficiente para un agente de lealtad muy baja
específicamente (no para la población general, que sí se comporta con
moderación).

**Qué debería eliminarse**: `agent.reputation.global` — cuatro
experimentos confirmando que es un campo muerto es evidencia suficiente
para quitarlo del modelo de datos en vez de seguir documentando que no
hace nada.

**¿Qué falta para introducir LLMs de forma experimental?** La interfaz
`decide(world, agent) -> { action, rationale }` sigue intacta y sin
ninguna dependencia de la implementación interna — reemplazarla por un
adaptador LLM en un subconjunto pequeño de agentes (la recomendación ya
hecha en el informe de V2 y repetida en A) sigue siendo técnicamente
directa. Lo que faltaría no es arquitectura sino instrumentación de
costo/latencia si se usa un proveedor real, y decidir qué subconjunto de
`world` pasarle a cada agente para no romper la regla de información
limitada (el `world` completo se le pasa hoy a la política determinista
porque confiamos en que no "mire" lo que no debería — un LLM con acceso al
mismo objeto no tendría esa garantía y necesitaría una vista filtrada
explícita antes de conectarse).

**¿La arquitectura es suficientemente sólida para un proyecto serio, o
seguimos teniendo una máquina de estados sofisticada?**

Ambas cosas a la vez, y no es una respuesta evasiva: es, mecánicamente,
una máquina de estados con una función de utilidad determinista — eso no
ha cambiado ni cambiará hasta que se conecte una política distinta. Pero
cuatro experimentos demuestran que esa máquina de estados, con memoria
persistente, información limitada real y suficiente fricción sistémica,
produce secuencias de eventos que se pueden leer después como una
historia con causa y efecto, sin haber sido escritas como tal. Eso es
exactamente lo que el encargo pidió comprobar, ni más ni menos — no que
Sanctuary "tenga historias", sino que las condiciones para que aparezcan,
si aparecen, sean reales y no decorativas. Con la corrección de esta
sección, al menos una de esas condiciones (que el pasado importe más allá
del promedio reciente) dejó de ser decorativa y pasó a tener efecto
verificado.
