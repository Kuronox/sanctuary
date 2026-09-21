# SANCTUARY V2 — Informe

Continuación del experimento 4. V1 demostró que el motor funcionaba
técnicamente pero reveló un problema de diseño de fondo: los agentes podían
vivir indefinidamente, pero la mayor parte de su comportamiento era
repetitivo y muchos sistemas del mundo eran decorativos en vez de
consecuentes. Este informe documenta qué cambió, por qué, y qué ocurrió al
correr el mundo nuevo hasta 300 días de juego.

Todos los números citados vienen de corridas reales con la semilla
determinista `sanctuary-v2` (24 agentes, el mismo código produce siempre la
misma historia) a 30 días (720 ticks), 100 días (2.400 ticks) y 300 días
(7.200 ticks), reproducibles con `npm run reset && npm run sim -- <ticks>`.

---

## 1. Qué cambié

Dos causas raíz identificadas en el diagnóstico de V1 explican casi todo lo
demás, y todo lo que sigue existe para atacarlas directamente:

1. **El motor de decisión puntuaba tipos de acción, no instancias
   concretas.** "Viajar" no distinguía destinos; aceptar un trabajo no
   cambiaba a dónde se viajaba; las relaciones no tenían objetivo
   diferenciado más allá de con quién se hablaba.
2. **Casi todo era un trinquete de una sola dirección.** Relaciones,
   riqueza, nivel, tesoro de gremio: todo subía y casi nada bajaba.

Sistemas nuevos o reescritos:

- **Progresión de dos ejes** (`progression.js`): Nivel Base (amplio, lento,
  con retornos decrecientes) y Nivel de Oficio (específico del oficio
  actual). Reemplaza el `level`/`combatPower` sin techo de V1, que no tenía
  ningún efecto mecánico fuera de sí mismo.
- **Árbol de clases con pruebas reales** (`world_seed.json:jobs`, motor en
  `progression.js`/`actions.js`): Novato → 7 oficios de nivel 1 → 7
  especializaciones de nivel 2, cada transición gateada por nivel de oficio,
  a veces posición institucional, y una prueba concreta (matar N monstruos
  de cierto rango, visitar N lugares, fabricar N objetos, comerciar N
  veces, curar N veces, robar con éxito N veces).
- **Economía con sumideros y reserva finita** (`economy.js`): cada mercado
  tiene una reserva de oro limitada — vender le paga al agente DESDE esa
  reserva, así que un lugar sobrevendido se seca y hay que llevarse la
  mercancía a otro lado. Un impuesto sobre las compras se pierde de verdad
  (no se recicla). Equipo con reparación, posadas, entrenamiento pagado y
  mantenimiento de gremio son sumideros adicionales.
- **Equipo con efecto mecánico real** (`actions.js`, `world_seed.json`):
  arma sube poder de combate, armadura reduce el daño recibido, herramienta
  sube el rendimiento de recolección — los tres con durabilidad que baja
  con el uso y se puede reparar. En V1, craftear no afectaba nada; el
  crafteo nunca ocurrió ni una vez en un año.
- **Monstruos por rango** (común/élite/jefe) con tablas de botín
  probabilísticas y **presión de caza** (sobreexplotar un punto sube el
  riesgo y hace aparecer variantes más fuertes; los jefes son encuentros
  raros de verdad, con una probabilidad fija minúscula, no un premio por
  farmear).
- **Partidas temporales** (`proponer_grupo`/`resolvePartyFight`): sin
  entidad persistente ni roster que mantener — se forman cuando hace falta
  ayuda para un encuentro peligroso, reparten botín proporcional al aporte
  de poder, y se disuelven solas. Evita por construcción el bucle de
  fundar/abandonar que arruinó los gremios en V1: no hay nada que fundar.
- **Crimen con consecuencias reales** (`arrest` en `actions.js`): robar en
  una zona con guardia arriesga arresto — multa, cárcel temporal,
  confiscación de la ganancia, y golpe a la posición institucional.
- **Posición institucional separada de las relaciones personales**
  (`institutions.js`): un escalar por (agente, institución) que decae hacia
  neutral sin actividad, distinto del afecto que le tienen otros agentes.
- **Relaciones con decaimiento y memoria ponderada** (`entities.js`): sin
  contacto reciente, la afinidad se enfría; los recuerdos de una relación
  llevan un peso (una traición pesa mucho más que una charla) y se podan
  por peso, no solo por antigüedad.
- **Decisiones por instancia** (`decision.js`): "viajar" puntúa cada
  conexión concreta según una razón real (ruta hacia un encargo aceptado,
  arbitraje de precios conocidos, un amigo que se mudó para allá); una
  prueba de clase activa sube la puntuación específicamente de las acciones
  que la avanzan (craftear si la prueba es de crafteo, cazar comunes si es
  de caza, etc.) — sin este empuje, iniciar una prueba nunca se traducía en
  terminarla (ver sección 8, primer bug encontrado).

## 2. Por qué

Cada pieza ataca una de las dos causas raíz de la sección 1, no una
carencia de contenido. El encargo pedía explícitamente "prioriza
interacciones entre sistemas sobre features aisladas" — por eso, por
ejemplo, el equipo no es un sistema nuevo aislado: conecta crafteo (V1,
muerto) con combate (progresión), y las partidas no son un sistema social
nuevo: conectan combate de alto riesgo (adventure) con relaciones
(compartir peligro pesa más que hablar) y con botín (economía).

## 3. Qué sistemas existentes preservé

La separación motor de mundo → modelo de agente → interfaz de decisión →
política → persistencia → dashboard se mantuvo intacta; `decision.js` sigue
siendo la única pieza reemplazable por un adaptador de LLM real sin tocar
el resto. El sistema de conocimiento limitado y rumores de V1
(`knowledge.js`) se conservó casi entero — solo se le agregó memoria de
precios para el arbitraje. El aislamiento de agentes (ninguna acción fuera
de `actions.js`) no cambió. La persistencia en JSON/JSONL append-only
tampoco.

## 4. Qué nuevas interacciones se volvieron posibles

- Aceptar un encargo cambia a dónde se viaja de verdad: en V1 solo el 5% de
  los encargos aceptados se completaban porque viajar no consideraba el
  destino del encargo. En V2, sobre 300 días, **327 de 343 encargos
  aceptados se completaron (95%)**.
- Craftear ahora compite de verdad contra vender la materia prima cruda,
  porque el equipo resultante afecta combate/recolección Y porque una
  prueba de clase activa penaliza vender lo que hace falta para completarla.
- Una prueba de clase iniciada empuja acciones concretas a completarla — sin
  este cambio, en una corrida de 30 días **13 de 13 cambios de clase fueron
  a Erudito** (la única prueba alcanzable pasivamente); con el empuje,
  la misma ventana produjo Comerciante, Curandero, Explorador y Erudito
  repartidos, y en 300 días aparecieron las 7 clases de nivel 1 y dos de
  nivel 2 (Archivista, Mercader de Ruta).
- Un agente con salud crítica y una poción en el inventario se la bebe antes
  que huir — la supervivencia ahora elige entre instrumentos concretos, no
  solo entre "descansar" o "huir" como en V1.
- El crimen ahora interactúa con geografía real: la guardia de cada
  localización (derivada de su gobierno) suprime el robo con fuerza
  distinta según el lugar — robar en Valdemarca (guardia 85%) no es la
  misma apuesta que en Cruce de Fangoso (30%).

## 5. Qué simulaciones corrí

| Duración | Ticks | Propósito |
|---|---|---|
| Humo | 24 | Verificar que el motor reescrito no rompía en el primer tick |
| 30 días | 720 | Primera corrida completa; aquí aparecieron los bugs de la sección 8 |
| 100 días | 2.400 | Verificar diversidad de clases y que el crimen del sujeto de control dejara huella |
| 300 días | 7.200 | Validación final citada en este informe |

Cada corrida se relanzó desde cero (`npm run reset`) tras cada corrección,
así que los números de "300 días" de este informe ya incluyen todas las
correcciones de la sección 8/9.

## 6. Qué ocurrió

**Trayectorias de vida distintas, con causa legible.** A los 300 días, de
24 agentes que empezaron todos como Novato: 6 se quedaron Novato, 6 se
volvieron Comerciante, 2 Herrero, 2 Explorador, 2 Erudito, 1 Curandero, 1
Guerrero, y dos llegaron a nivel 2 — **Archivista** (Hilda, tick 2.169,
tras ser Erudito) y **Mercader de Ruta** (Elsvet, tick 3.153, tras ser
Comerciante). La riqueza terminó muy desigual sin que nadie lo programara:
Isvel (Curandero) terminó con 21.866 de oro, la mediana de la población
fue 11. Eso es información real: revisando su historial, Isvel se asentó
temprano en una ciudad con institución que reconocía su oficio, curó
mucho (398 curaciones registradas a sanador_mayor+curandero en total) y
nunca dejó de trabajar su oficio ahí — una trayectoria coherente, no un
bug de wealth.

**El crimen ocurrió, y con consecuencias que se sostuvieron.** El sujeto de
control sembrado a propósito con codicia 0.92 / empatía 0.08 / lealtad 0.12
(sección 9) sí robó (29 intentos en 100 días, 11 exitosos) y sí fue
arrestado. En la corrida de 300 días con toda la población: **10 robos
exitosos, 28 intentos fallidos, 20 arrestos, 20 liberaciones** — nadie
quedó atascado en la cárcel para siempre.

**Las partidas se formaron por una razón concreta y no se volvieron
decorativas ni omnipresentes.** 478 propuestas de grupo, 370 victorias
conjuntas, 63 derrotas conjuntas, sobre 300 días. Los combates de rango
élite fueron comunes (491) y hubo **un solo encuentro contra un jefe** en
300 días — el diseño de "raro de verdad" se sostuvo: no apareció ni una
vez en la corrida de 30 días, y solo una vez en 300.

**Las 8 localizaciones se visitaron todas**, incluida Ruinas de Kaltenhor
(23 llegadas en 300 días, la más peligrosa y menos poblada por diseño), algo
que en la primera corrida de 30 días no ocurría en absoluto (la población
se concentraba en 2-3 ciudades).

**La economía dejó de inflarse sin control.** El oro total en circulación
creció de forma mucho más moderada que en V1 (que llegó a 80x su valor
inicial en un año); acá, con sumideros reales (reparación, posadas,
impuestos, entrenamiento, mantenimiento de gremio) y una reserva de mercado
finita, el crecimiento fue sustancial pero visiblemente amortiguado por
esos sumideros — se puede ver directamente en el dashboard cómo la reserva
de Bosque Umbrío (zona salvaje, sin reposición) bajó de 40 a 3 oro en 100
días de uso real.

## 7. Qué no esperaba

- **Que la prueba de Erudito dominara TODO el árbol de clases en la
  primera corrida real.** Su prueba (acumular 12 entradas de conocimiento)
  se cumple pasivamente solo por existir y socializar, mientras que las
  demás requieren una acción deliberada (craftear, curar, comerciar,
  matar, robar). En 30 días, **13 de 13 cambios de clase fueron a
  Erudito**. No lo anticipé al diseñar las pruebas — lo encontré jugando
  la simulación, no leyendo el código.
- **Que Herrero y Curandero fueran matemáticamente inalcanzables desde
  Novato.** Sus pruebas (craftear 3 veces, curar 3 veces) requerían la
  acción de crafteo/curación — pero esas acciones estaban gateadas a
  agentes que YA fueran Herrero/Curandero. Una prueba de clase que exige
  ya pertenecer a la clase que habilita es un candado sin llave. Esto pasó
  la revisión de código sin que lo notara; solo se hizo visible al ver que
  esas dos clases nunca aparecían tras 30 días de simulación.
- **Que fundar y malversar el tesoro del propio gremio en solitario fuera
  gratis.** Un agente sin más miembros en su gremio no tiene testigos
  posibles, así que "malversar" su propio dinero recién puesto era
  indetectable por construcción — un agente de control llegó a
  fundar/malversar/abandonar 172 veces en 100 días antes de la corrección.
- **Que la posición institucional se quedara en cero para todo el mundo
  incluso a 300 días.** La única vía diseñada para ganarla
  (`entrenar`, una acción pagada) resultó demasiado poco atractiva frente a
  otras opciones (solo se eligió 2 veces en 300 días), así que nadie nunca
  alcanzaba el umbral que habilita el nivel 2 de clase. No lo detecté
  diseñando el sistema — lo vi al revisar por qué nadie alcanzaba tier 2
  después de 300 días de simulación real.

## 8. Qué falló (bugs encontrados jugando, no leyendo código)

1. **Prueba de clase sin empuje de decisión.** Iniciar una prueba puntuaba
   alto por ambición, pero nada después empujaba las acciones que
   realmente la completaban — se iniciaban 90 pruebas en 30 días y solo
   las de Erudito (pasivas) llegaban a término.
   *Corrección:* `trialBonus()` en `decision.js` — una prueba activa sube
   la puntuación específicamente de las acciones que la avanzan.
2. **Herrero y Curandero inalcanzables** (candado sin llave, sección 7).
   *Corrección:* un Novato puede intentar craftear/curar con menos gracia
   (sin los bonos de `perJobLevel`), demostrando aptitud antes de que se
   le reconozca el título — coherente con la idea de "prueba" del encargo.
3. **Malversación de tesoro sin testigos posibles cuando el gremio tiene
   un solo miembro.** *Corrección:* `malversar_tesoro` ahora exige más de
   un miembro en el gremio.
4. **Posición institucional inalcanzable en la práctica.**
   *Corrección:* ejercer el propio oficio en la ciudad de la institución
   que lo reconoce genera posición local de a poco, no solo entrenar.
5. **`broadcastLocalEvent` no adjuntaba quién ni dónde a las entradas de
   conocimiento generadas.** Esto habría hecho inútil la señal de "un
   amigo se mudó hacia allá" en la puntuación de viaje (nunca habría datos
   que leer). *Corrección:* la entrada de conocimiento ahora incluye
   `actorId`/`location` del evento original.
6. **(Heredado, ya corregido en V1 y verificado que se mantiene corregido
   en V2)** oro negativo por instinto de supervivencia sin chequeo de
   fondos, y el bucle de hambre sin salida en zonas sin mercado de comida.

## 9. Qué decisiones tomé sin preguntarte

- **Sujeto de control deliberado** (`sim/run.js`): en vez de esperar a que
  la cola de la distribución aleatoria produjera un agente con perfil
  criminal, sembré uno con rasgos extremos a propósito (codicia 0.92,
  ambición 0.88, tolerancia al riesgo 0.85, empatía 0.08, lealtad 0.12) —
  pasa por la misma función de utilidad que todos los demás; en ningún
  lugar del código hay un `if (esMalo)`.
- **Alcance recortado en partidas:** las partidas solo se forman para
  encuentros resolubles en el mismo lugar y turno (élite/jefe presente
  ahí); no implementé viaje sincronizado en grupo (una escolta de varios
  días con dos agentes moviéndose juntos tick a tick). Es una decisión de
  alcance explícita, no un olvido: resolver combate conjunto sin necesitar
  sincronizar viajes cubre el caso central pedido ("no puedo solo, pido
  ayuda, peleamos juntos, repartimos, lo recordamos") sin construir un
  segundo sistema de coordinación multi-agente.
- **Nombres y balance de las 7+7 clases/especializaciones** son originales,
  no de ninguna obra existente, con nombres funcionales en español
  (Caballero, Guía de Expedición, Maestro Artesano, Mercader de Ruta,
  Sanador Mayor, Asesino, Archivista).

## 10. Qué queda débil

- **Crafteo y equipo siguen siendo raros en términos absolutos** (8
  crafteos y 4 equipamientos en 300 días, sobre miles de acciones totales)
  aunque ya no están en cero como en V1 — la corrección de la sección 8
  los hizo alcanzables, no dominantes. Herrero sigue siendo la clase menos
  común.
- **El robo sigue siendo marginal** (10 éxitos en 300 días entre 24
  agentes) — es una consecuencia legítima de la función de utilidad (el
  trabajo legal compite bien, y la guardia en las ciudades donde se
  concentra la población es alta), no un bug, pero significa que la
  mecánica de cárcel/arresto se ejerció poco.
- **La población sigue concentrándose en 2-3 ciudades** la mayor parte del
  tiempo, aunque a 300 días las 8 localizaciones terminan visitadas al
  menos alguna vez — el "tirón social" (quedarse donde ya hay amigos y
  oportunidades de ayuda mutua) sigue siendo más fuerte que el tirón de
  arbitraje o exploración para la mayoría de la población.
- **Solo 1 gremio seguía activo a los 300 días** en la corrida final,
  pese a que 169 se fundaron en total a lo largo de la partida — el
  mantenimiento periódico y el costo real de fundar filtran mejor que en
  V1 (ya no hay un solo agente acaparando el 94% de las fundaciones), pero
  la mortalidad de gremios sigue siendo alta.
- **`respondToPartyInvite` y el resto de la política siguen siendo
  deterministas basadas en utilidad**, no un LLM — la interfaz está lista
  para reemplazarla, pero eso no se probó porque no hay credenciales
  disponibles en este entorno.

## 11. Clasificación de comportamientos (programado / derivado / razonablemente emergente)

**Programado explícitamente:** el instinto de beber una poción antes de
huir si la salud es crítica; el requisito de más de un miembro para poder
malversar; el decaimiento de relaciones y de posición institucional sin
contacto reciente; la reserva de oro finita por mercado.

**Derivado directamente de las reglas** (consecuencia predecible, no
diseñada caso por caso): que Isvel (Curandero) terminara siendo la más rica
por asentarse en una ciudad con institución que reconocía su oficio y
trabajar ahí sin parar; que Herrero siguiera siendo la clase menos común
porque su materia prima (mineral de hierro) solo abunda en zonas que la
mayoría de la población no visita; que el robo fuera raro en las ciudades
de alta guardia y algo menos raro en las de guardia baja.

**Razonablemente emergente** (patrón no diseñado que surge de la
interacción de varias reglas y agentes, difícil de re-derivar a mano sin
simular): el ciclo específico de fundar/malversar/abandonar del sujeto de
control (172 veces en 100 días) — no es un rasgo por sí solo, sino la
intersección de codicia alta, lealtad baja, el costo de fundar, y la falta
original de un requisito de testigos, todo mediado por cómo la función de
utilidad compara esa opción contra las demás tick a tick. Lo llamo
"razonablemente emergente" con la misma cautela que en V1: una vez
encontrado, se pudo explicar completamente — pero encontrarlo requirió
correr la simulación, no fue previsto en el diseño.

## 12. Qué experimento haría después

- Correr la misma semilla con la reserva de mercado y el costo de fundar
  gremio calibrados a la mitad y al doble, para ver en qué rango aparece
  competencia genuina entre gremios por territorio/recursos en vez de
  colapso por insolvencia.
- Añadir viaje sincronizado en grupo (la partida recortada en la sección 9)
  específicamente para encargos de escolta de varios días, y medir si eso
  cambia la tasa de formación de partidas fuera de encuentros
  resolubles-en-el-momento.
- Aumentar la población a 60-80 agentes y correr 300 días para ver si la
  concentración en 2-3 ciudades se mantiene (tirón social gana) o si con
  más agentes la presión de caza y la escasez de materia prima empujan una
  dispersión geográfica más pareja.
- Si en algún momento hay credenciales de un proveedor de LLM disponibles
  sin costo, sustituir `decision.js` en un subconjunto pequeño de agentes
  (por ejemplo, 2 de 24) y comparar sus trayectorias contra el resto bajo
  el mismo mundo y semilla — la interfaz ya está lista para ese
  experimento sin tocar el motor.
