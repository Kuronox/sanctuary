# SANCTUARY — Informe del experimento

Experimento 4. Un mundo de laboratorio para observar agentes relativamente
autonomos bajo reglas, recursos y consecuencias persistentes — sin historia
predeterminada.

Todos los datos citados aqui provienen de una corrida real de 720 ticks
(30 dias de juego) con 24 agentes, seed determinista `sanctuary-v1`,
reproducible ejecutando `npm run sim -- 720` sobre un mundo vacio.

---

## 1. Que construiste

Un motor de mundo en Node.js (sin dependencias externas — cero coste, cero
riesgo de instalacion) con:

- **Motor de mundo** (`src/engine/world.js`): reloj de horas/dias, resolucion
  de acciones, actividades multi-tick (viajar), decaimiento de necesidades,
  generacion dinamica de oportunidades economicas.
- **Modelo de agente** (`src/engine/entities.js`): identidad, personalidad,
  objetivos, necesidades, relaciones, inventario, reputacion.
- **Sistema de conocimiento limitado** (`src/engine/knowledge.js`): cada
  agente solo sabe lo que observo, dedujo o le contaron, con confianza que se
  degrada al propagarse.
- **Economia** (`src/engine/economy.js`): mercados locales por localizacion,
  precios que responden a oferta/demanda.
- **Interfaz de accion** (`src/engine/actions.js`): unica superficie por la
  que un agente puede tocar el mundo (`move`, `talk`, `trade_buy/sell`,
  `work`, `gather`, `craft`, `fight_monster`, `steal`, `help_agent`,
  `create_guild`, `join_guild`, `leave_guild`, `accept_job`...).
- **Politica de decision mock** (`src/engine/decision.js`): un adaptador
  basado en utilidad, determinista, que ocupa el lugar donde iria un LLM.
- **Persistencia** (`src/engine/store.js`): estado en JSON, eventos y
  decisiones en JSONL append-only.
- **Servidor + dashboard** (`src/server`, `dashboard/`): HTTP puro (sin
  Express) que sirve el estado del mundo y una interfaz web de observacion.

Escala: 8 localizaciones, 7 clases, 4 tipos de monstruo, 13 bienes, 24
agentes generados proceduralmente con nombres y rasgos originales.

## 2. Por que elegiste esa arquitectura

- **Cero dependencias npm**: el presupuesto es $0 y no hay credenciales de
  ningun proveedor de LLM en este entorno. Usar solo `node:fs`/`node:http`
  elimina cualquier riesgo de instalacion, licencias o coste.
- **JSON/JSONL en vez de una base de datos**: a la escala de 24 agentes y
  unos pocos miles de eventos, un archivo es suficiente, legible a simple
  vista, y trivial de inspeccionar o resetear (`npm run reset`).
- **Separacion WORLD ENGINE → AGENT MODEL → DECISION INTERFACE → POLICY**: es
  un requisito explicito del encargo. `decision.js` es la unica pieza que
  "decide"; expone `decide(world, agent) -> { action, rationale }`. Cambiar
  el cerebro del agente (por un LLM real, si algun dia hay credenciales) es
  reemplazar ese archivo, no reconstruir el mundo.
- **RNG determinista con seed** (`rng.js`): toda la simulacion es
  reproducible. Esto fue clave para depurar: pude reproducir exactamente los
  mismos bugs corrida tras corrida.

## 3. Que reglas tiene el mundo

- El tiempo avanza en horas; 24 horas = 1 dia. El mundo avanza aunque nadie
  lo mire (`npm run sim`, o el boton "+1 dia" del dashboard vive sobre el
  mismo motor).
- Cada localizacion tiene seguridad (0–1), recursos que produce, y a veces
  monstruos.
- Las necesidades (hambre, fatiga, vida social) decaen cada hora. Si el
  hambre supera 0.85, la salud empieza a bajar.
- Instinto de supervivencia **programado explicitamente**: si la salud es
  critica o no hay comida accesible localmente, el agente huye hacia la
  conexion mas segura conocida, sin pasar por la funcion de utilidad. Esto
  no es "IA" — es una regla dura, y se documenta como tal (ver seccion 12).
- Combate PvE: se compara poder de combate contra el poder del monstruo mas
  ruido aleatorio; ganar da oro/botin y algo de daño, perder duele mucho mas.
- Robo (`steal`): probabilidad de exito por clase (picaro > resto), riesgo de
  ser descubierto: si te descubren, la relacion de la victima contigo se
  desploma y lo recuerda.
- Los gremios se fundan pagando 30 de oro; se disuelven solos cuando pierden
  a su ultimo miembro.
- El mercado de cada localizacion sube o baja de precio segun su stock: mas
  stock, mas barato; escasez, mas caro.

## 4. Como funcionan los agentes

Cada agente tiene:

- **Personalidad** (6 rasgos en [0,1]: ambicion, sociabilidad, tolerancia al
  riesgo, codicia, lealtad, empatia), generada con sesgo segun su clase pero
  con variacion individual real.
- **Objetivos**: uno primario y uno secundario, elegidos (no puramente al
  azar) de un pool de 10 posibles segun su personalidad — un agente codicioso
  tiende a terminar con "riqueza", uno empatico con "ayudar a otros", etc.
  No todos los objetivos son heroicos: "vida_tranquila" es un objetivo valido
  y varios agentes lo tienen como primario.
- **Necesidades, salud, oro, inventario, ubicacion, estado.**
- Cada hora, si no esta ocupado (viajando) y sus necesidades no son
  criticas, el motor pide a `decision.js` una accion. La politica puntua
  cada accion candidata segun necesidad, objetivo, personalidad y riesgo, y
  elige la de mayor puntuacion (con ~8% de probabilidad de explorar la
  segunda mejor opcion, para que no sean robots perfectamente optimos).

## 5. Como funciona la memoria

Dos estructuras separadas y acotadas (no hay transcript infinito):

- **`knowledge`** (hasta 60 entradas): hechos que el agente sabe, con
  `source` (observado / rumor de X), `confidence` y el tick en que se
  aprendieron. Cuando se llena, se descarta primero lo de menor confianza y
  mas viejo.
- **`memory`** (hasta 50 entradas): eventos personalmente significativos
  (una victoria en combate, que lo traicionaron, completar un trabajo), con
  una `importance` explicita. Cuando se llena, se descarta lo de **menor
  importancia** entre lo mas antiguo — no es un buffer FIFO ciego.
- **`relationships[otroId]`**: afinidad y confianza acotadas en [-100,100],
  contador de interacciones, y hasta 8 notas recientes ("le robaron",
  "conversacion", "le ayudo con oro"). La etiqueta (`desconocido` →
  `conocido` → `aliado`/`rival` → `amigo`/`enemigo`) es una funcion pura de
  la afinidad — nunca se guarda por separado, asi que no puede desincronizarse.

## 6. Como funciona la informacion limitada

El motor (`world.js`) conoce el estado completo. Los agentes no tienen
acceso directo a `world.agents` mas alla de lo que el propio motor les deja
observar:

- Todo evento que ocurre en una localizacion se transmite (`broadcastLocalEvent`)
  **solo** a los agentes que estan fisicamente ahi en ese momento, como una
  entrada de conocimiento con `source: "observado"` y confianza 1.0.
- Cuando dos agentes hablan (`talk`), uno puede compartirle al otro un hecho
  de su propio conocimiento (`shareRumor`). La confianza baja (x0.8 por
  salto) y hay 12% de probabilidad de que el detalle se distorsione
  ("(detalles inciertos)"). Esto es literalmente un telefono descompuesto
  implementado como dato, no como narrativa.
- Resultado verificable en el dashboard: seleccionar a "Arin el Manco" en la
  corrida de referencia muestra que su conocimiento reciente son puros
  eventos de viaje de otros agentes que **coincidieron con el en su
  localizacion** — nunca sabe de eventos ocurridos en Colinas Rotas o las
  Ruinas si nunca estuvo ahi ni nadie se lo conto.

## 7. Como funcionan economia y recursos

Cada localizacion tiene un mercado propio (`markets[locationId].stock`). El
precio de un bien sube cuando el stock esta por debajo de un nivel de
referencia y baja cuando hay excedente. Los recursos que una localizacion
produce se regeneran solos con el tiempo; los consumibles (comida, pociones)
se consumen. Las localizaciones asentadas (no zonas salvajes) reabastecen
racion de comida pasivamente, representando produccion de fondo de NPCs no
simulados — sin esto, la comida se agotaba permanentemente (ver seccion 12,
bug #2).

Los agentes generan ingresos trabajando (segun oficio), recolectando
recursos en zonas salvajes, vendiendo lo recolectado, o combatiendo. Los
herreros pueden fabricar armas/armaduras a partir de mineral y cuero; los
curanderos, pociones a partir de hierbas.

## 8. Como funcionan relaciones y gremios

Las relaciones son **direccionales**: lo que A piensa de B no es
necesariamente lo que B piensa de A (relevante tras un robo: la victima
guarda un rencor fuerte; el ladron, si tuvo exito, puede no registrar nada
especial). Cambian con cada interaccion: hablar sube afinidad un poco,
ayudar sube mucho, robar con exito hunde la afinidad de la victima, un robo
fallido hunde la relacion de la victima Y (tras el ajuste de la seccion 12)
la vista del propio ladron sobre ese objetivo, para que deje de intentarlo
obsesivamente.

Los gremios no estan guionizados: la decision de fundar uno compite por
utilidad contra todas las demas acciones (ponderada por ambicion y el
objetivo "prestigio"), y solo aparece en la lista de acciones disponibles si
el agente tiene ≥30 de oro y no pertenece a ninguno. Unirse a un gremio
existente requiere estar en la misma localizacion que un miembro Y tener
afinidad >15 con su fundador — no es una lista abierta a cualquiera.

## 9. Como funciona la persistencia

`data_runtime/state.json` es una foto completa y re-cargable del mundo
(agentes, gremios, mercados, trabajos, reloj). `events.jsonl` y
`decisions.jsonl` son logs append-only — nunca se reescriben, asi que sirven
de auditoria completa de la corrida. `npm run sim` retoma el ultimo estado
guardado si existe; `npm run reset` limpia todo para empezar de cero.

## 10. Como puedo observar la simulacion

`npm run server` (o el boton de preview) levanta un dashboard en
`http://localhost:5177` con: mapa de localizaciones y cuantos agentes hay en
cada una, lista de agentes con barras de salud/hambre, panel de detalle por
agente (ubicacion, objetivos, personalidad, inventario, relaciones,
conocimiento reciente, memoria, y sus **ultimas 10 decisiones estructuradas**
con el formato Goal/Situacion/Razones/Accion elegida/Resultado esperado —
instrumentacion observable, no chain-of-thought del modelo), lista de
gremios, oportunidades de trabajo activas, y una linea de tiempo de eventos
recientes. Los botones "+1 dia" / "+7 dias" avanzan la simulacion en vivo
desde el navegador.

## 11. Que ocurrio durante las primeras simulaciones

30 dias de juego (720 ticks), 24 agentes, sin ninguna intervencion manual en
las decisiones:

**Distribucion de eventos (corrida final, ya con los bugs corregidos):**

| tipo | conteo |
|---|---|
| talk | 11.361 |
| rest | 1.660 |
| help | 1.226 |
| eat | 718 |
| combat_win | 326 |
| work | 307 |
| trade_sell | 280 |
| gather | 207 |
| travel_start/end | 189/188 |
| theft_failed | 44 |
| job_posted | 59 |
| guild_founded | 14 |
| theft | 23 |
| combat_loss | 3 |

**Que hicieron los agentes.** La mayoria se establecio rapido en una
localizacion "de origen" y se quedo ahi: la distribucion de agentes por
localizacion casi no cambio entre el dia 15 y el dia 31. Dentro de esa
localizacion, el patron dominante fue social: hablar, descansar, comer,
trabajar, en ese orden de frecuencia. Ocho gremios se fundaron a lo largo de
la corrida; algunos sobrevivieron 30 dias con 2-3 miembros, otros se
disolvieron en horas al quedarse sin gente.

**Lo que no esperaba.**

- Una desigualdad de riqueza marcada y no guionizada: un herrero
  (`Renna de Sauce`, en Cruce de Fangoso, pueblo minero) termino con ~2.360
  de oro, dos ordenes de magnitud por encima de la mediana, simplemente por
  estar en la localizacion correcta para su oficio (mineral abundante y
  barato ahi mismo) y repetir fabricar-vender cientos de veces. Nadie
  programo "el herrero debe ser rico"; es una consecuencia derivada de que
  la curva de precios y el coste de materia prima favorecen mucho mas a la
  fabricacion que a otros oficios en esa localizacion concreta.
- Un agente (`Quilan`, explorador) fundo y abandono gremios repetidamente —
  `QuilanCompany` (tick 56 → abandonado tick 97), `QuilanHermandad` (tick 98
  → abandonado tick 158, dejando atras a dos miembros que se habian unido),
  `QuilanCompañia` (tick 351 → abandonado tick 403), y mas. Su rasgo de
  lealtad resulto bajo en la generacion procedural, y la funcion de utilidad
  penaliza baja lealtad favoreciendo `leave_guild`; combinado con alta
  ambicion que favorece `create_guild`, el resultado es un ciclo de fundar y
  abandonar. Es gracioso visto desde fuera, pero es una consecuencia logica
  y coherente de sus propios rasgos, no un guion.
- Solo un puñado de agentes llego alguna vez a las zonas mas peligrosas
  (Colinas Rotas, Ruinas de Kaltenhor). La mayoria de los "exploradores" de
  clase nunca las visito ni una vez en 30 dias — exploraron poco a pesar de
  tener "exploracion" como objetivo posible, porque la utilidad de viajar
  compite contra el coste inmediato de fatiga y contra la gran cantidad de
  interacciones sociales disponibles localmente.

**Patrones que aparecieron.** Cooperacion espontanea vecinal (`help_agent`
fue el segundo evento mas comun, 1.226 veces) entre agentes con afinidad ya
alta — la ayuda tiende a reforzar relaciones ya buenas, no a crearlas de la
nada. Robo casi exclusivamente por parte de agentes clase picaro con codicia
alta y empatia baja (comportamiento derivado de la funcion de utilidad, no
de una regla "los picaros roban").

**Que fue aburrido.** El dia a dia tipico de un agente en una ciudad segura
es, honestamente, repetitivo: hablar con los mismos 2-3 vecinos, descansar,
comer, trabajar, otra vez. Ningun agente inicio una guerra de gremios; ningun
territorio cambio de manos. Con 24 agentes y recursos relativamente
abundantes, nunca hubo suficiente escasez o choque de intereses directo como
para que el conflicto territorial (que el motor permite, ver `guild.claims`
en el modelo de datos, aunque no llegue a implementarse su resolucion) tuviera
motivo de aparecer. Esto es exactamente el tipo de resultado "aburrido" que
la seccion 27 del encargo pide no maquillar: no ocurrio, y eso tambien es
informacion.

**Loops encontrados (y corregidos, ver seccion 12):** un bucle de hambre sin
salida en zonas salvajes sin mercado de comida, y un bucle de robo fallido
repetido contra el mismo objetivo ya alertado.

**Clasificacion honesta (seccion 28 del encargo):**

- *Programado explicitamente*: el instinto de huida por salud/hambre
  critica; el limite de 60/50 entradas en conocimiento/memoria; el requisito
  de 30 de oro para fundar gremio.
- *Derivado directamente de las reglas* (no especificado caso por caso): la
  concentracion de riqueza en el herrero de Cruce de Fangoso; que los
  picaros sean casi los unicos ladrones; que casi nadie visite las Ruinas de
  Kaltenhor.
- *Razonablemente emergente* (patron no diseñado que surge de la interaccion
  de varias reglas y varios agentes): el ciclo de fundar/abandonar gremios de
  Quilan es el caso mas claro — no es un rasgo, es la interaccion entre dos
  rasgos de personalidad opuestos (ambicion alta + lealtad baja) mediada por
  la funcion de utilidad y el estado social de otros agentes (los miembros
  que se unen y quedan huerfanos). Lo llamo "razonablemente emergente" con
  cautela: con solo 24 agentes y una politica determinista, es dificil
  descartar del todo que sea una consecuencia mecanica facil de re-derivar a
  mano — y de hecho, arriba, la re-derive a mano. Por esa razon no llamaria
  emergente a la mayoria de lo demas: son consecuencias razonablemente
  predecibles de reglas conocidas.

## 12. Que fallo

Tres bugs reales aparecieron al jugar la simulacion (no en revision de
codigo estatica), los tres corregidos y verificados con una re-corrida
completa:

1. **Oro negativo.** `economy.buy()` no verificaba el oro del comprador —
   solo el stock del mercado. El instinto de supervivencia forzaba `eat`
   cuando el hambre era critica, sin pasar por el filtro de "¿puedo pagarlo?"
   que si tenia la seleccion normal de acciones. Resultado: agentes con oro
   negativo. Arreglado limitando el gasto a `Math.max(0, gold - costo)`
   (credito de emergencia implicito, sin deuda).
2. **Bucle de hambre sin comida.** Las zonas salvajes (`governance: "ninguna"`)
   nunca reabastecian su mercado de raciones de comida, asi que un agente
   que pasaba por ahi y se quedaba sin comida local quedaba con hambre al
   maximo indefinidamente, perdiendo salud tick tras tick, sin comida que
   comprar. Arreglado con reabastecimiento pasivo de comida en localizaciones
   asentadas + un instinto explicito de huir hacia la conexion mas segura
   cuando la salud es critica o no hay comida accesible.
3. **Robo obsesivo.** El ajuste de relacion tras un robo fallido solo
   actualizaba la vista de la *victima* sobre el ladron, nunca la vista del
   ladron sobre la victima. Sin retroalimentacion propia, la funcion de
   utilidad del ladron no tenia motivo para dejar de intentarlo contra el
   mismo objetivo ya alertado, y en una corrida temprana un agente
   (`Fenna`) intento robarle al mismo agente (`Eiran`) decenas de veces
   seguidas. Arreglado con un ajuste de relacion simetrico y una penalizacion
   de utilidad cuando el objetivo ya esta muy alertado.

No corregido / limitación conocida: el "trabajo" (`work`) genera oro segun
un rango fijo por clase sin relacion con oferta/demanda real de servicios;
es la parte mas "de juego" y menos "de simulacion" de la economia.

## 13. Que limitaciones tiene

- **La politica de decision es una funcion de utilidad, no un LLM.** No hay
  credenciales de ningun proveedor disponibles en este entorno y el
  presupuesto es $0, asi que el "cerebro" de cada agente es determinista y
  explicable, no un razonamiento libre. La interfaz esta diseñada para que
  sustituir `decision.js` por un adaptador LLM real sea un cambio localizado,
  pero **eso no se probo** — es una posibilidad de diseño, no un resultado
  verificado.
- **Combate y territorio son simples.** No hay guerras de gremios ni
  reclamo/perdida de territorio implementados mas alla de un campo de datos
  (`guild.claims`) sin logica asociada — nunca aparecieron condiciones de
  escasez suficientes para que valiera la pena construirlo en esta corrida.
- **24 agentes es poco para estadistica robusta.** Los patrones descritos
  arriba son observaciones de una corrida (mas dos previas usadas para
  depurar), no promedios sobre muchas semillas.
- **Sin muerte permanente** (deliberado, seccion 18 del encargo): un agente
  con salud critica queda "incapacitado" y se recupera con el tiempo. Esto
  suaviza el riesgo real de explorar zonas peligrosas.
- **El trabajo (`work`) es la parte menos simulada de la economia**: genera
  oro por un rango fijo segun clase, sin relacion con demanda real de
  servicios.

## 14. Que experimento harias despues

- Correr la misma semilla con **multiples politicas de decision** en
  paralelo (la actual basada en utilidad vs. una variante con mas ruido vs.,
  si hay credenciales disponibles algun dia, un adaptador LLM real) y
  comparar metricas agregadas: numero de gremios, desigualdad de riqueza,
  tasa de exploracion.
- Introducir **escasez real** (menos localizaciones productoras de un
  recurso critico, mas agentes que lo necesitan) para ver si aparece
  conflicto territorial genuino entre gremios sin tener que forzarlo.
- Añadir un mecanismo de **memoria colectiva de gremio** (no solo individual)
  para observar si gremios desarrollan reputacion propia que sobreviva a la
  rotacion de miembros.
- Aumentar a 60-80 agentes y correr 90 dias para ver si la desigualdad de
  riqueza observada con 24 agentes se profundiza o se autoregula por
  competencia de mercado (mas herreros compitiendo bajarian el precio del
  arma de hierro).
