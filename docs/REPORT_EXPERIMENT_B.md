# EXPERIMENTO B — Farming, economía, estrategias degeneradas y progresión criminal

Continuación de Sanctuary tras el Experimento A. Pregunta central: ¿qué
hace el sistema cuando una estrategia rentable aparece y luego modifica el
mundo que la hacía rentable? La inspiración declarada es Cartman matando
al mismo enemigo un número absurdo de veces en la parodia de World of
Warcraft de South Park.

Todos los números vienen de corridas reales con la semilla determinista
`sanctuary-v2` (sin cambiarla entre comparaciones), 24 agentes, en smoke
test (24 ticks), 30 días (720), 100 días (2.400), 300 días (7.200) y 365
días (8.760), reproducibles con `npm run reset && npm run sim -- <ticks>`.

---

## 1. Qué encontré antes de tocar nada (auditoría de la sección 10)

Verifiqué cada conexión en el código, no la asumí:

1. **Acciones que generan Base XP**: `fight_monster`/combate en grupo (solo
   si gana), `work`, `accept_job`→completar transporte. Nada más.
2. **Acciones que generan Job XP**: las anteriores más `gather`, `craft`,
   `curar_aliado`, `trade_buy`, `trade_sell`, `train`. **`steal` no estaba
   en esta lista.**
3. **Acciones que alimentan contadores de prueba de clase**: `steal` (éxito)
   sí incrementaba `stealSuccess`, pero eso solo alimenta la prueba de
   clase, no el nivel.
4. **Acciones que cambian de clase**: `cambiar_clase`, gateado por
   requisito + prueba completa.
5. **Acciones que suben Job Level**: las del punto 2. Robar no estaba.
6. **Acciones que suben Base Level**: mismo patrón — robar no aportaba.
7. **Consecuencias del arresto**: multa (con posible fianza parcial del
   gremio), condena de 18-48 horas, golpe de -25 a la posición
   institucional local (que decae con el tiempo), un recuerdo de alta
   importancia. Ningún antecedente permanente en ningún lado del código.
8. **Consecuencias de la cárcel**: el bucle salta por completo el turno del
   agente mientras `agent.prison` está activo (`world.js`) — ninguna
   acción se ejecuta, así que ninguna XP se genera durante la condena.
9. **Progresión durante la condena**: XP, nivel y clase quedan exactamente
   como estaban al entrar — no se tocan en ningún punto del código.

**Conclusión de la auditoría**: la asimetría descrita en la sección 11 del
encargo existía tal cual — un agente podía desbloquear una clase criminal
robando, pero robar después de eso no lo volvía mejor criminal en
términos de nivel.

## 2. Qué cambié y por qué

### 2.1 Robar ahora genera progresión real

`steal()` en `actions.js` ahora llama a `addJobXp`/`addBaseXp` en caso de
éxito, con una fórmula que escala con el riesgo real —monto robado y
fuerza de la guardia local—, igual que un combate escala con el poder del
monstruo. Un robo fallido sigue sin dar XP, por el mismo precedente que
ya existía en combate (perder no da experiencia).

### 2.2 Dos rutas criminales distintas, no una "clase criminal" única

`Asesino` (violencia): su prueba pasó de "6 robos exitosos" a "derrotar 2
monstruos de rango élite" — reutilizando el tipo de prueba `defeat_rank`
que ya existía para Caballero. Ahora exige demostrar capacidad de combate
real, no solo sigilo.

`Contrabandista` (utilidad, nueva): de Pícaro, requiere 18 operaciones de
comercio (`trade_count`, tipo ya existente), reflejando a alguien que
mueve valor mediante el comercio en vez de la violencia — sin inventar
ningún mecanismo nuevo, solo reutilizando la maquinaria de pruebas ya
construida en V2/Experimento A. Ambas heredan el bono de sigilo de Pícaro
(antes solo lo tenían Pícaro y Asesino; el candado que excluía a
Contrabandista era un descuido, corregido de paso).

### 2.3 Dos bugs encontrados JUGANDO la simulación (no los dos de arriba — esos eran diseño; estos son bugs reales)

Documentados con el mismo rigor pedido: reproducción, causa, corrección,
corrida antes/después.

## 3. Arquitectura afectada

`progression.js` gana `lifetimeTrialReadiness()`. `decision.js` gana
puntuación de instancia para `iniciar_prueba_clase` (cuánto camino ya
recorrido hacia cada prueba concreta) y para `trade_sell` (si el mercado
local puede pagar de verdad). `actions.js` gana la línea de XP en `steal`.
`world_seed.json` gana `contrabandista` y el nuevo requisito de `asesino`.
La separación mundo → agente → decisión → política → persistencia →
dashboard no cambió; nada de esto toca `decision.js` de forma que impida
reemplazarlo por un adaptador de LLM.

## 4. BUG #1 — El mercado sin reserva seguía pareciendo un buen lugar para vender

**Reproducido en la corrida de 300 días.** Un agente (Quilan, clase
Novato) acumuló 696 muertes de lobo en Bosque Umbrío en 300 días —
farming sostenido, justo la hipótesis del experimento. Pero terminó con
solo 89 de oro y 9 colmillos de lobo + 10 cueros sin vender en el
inventario. Encontré **52 intentos de venta fallidos seguidos**, todos con
el mismo mensaje: *"el mercado de bosque_umbrio no tiene fondos"*.

**Causa**: la reserva de oro de Bosque Umbrío (zona salvaje, no se repone
nunca por diseño desde V2) se secó a 0,05 de oro tras meses de venta local
sostenida. `decision.js` puntuaba "vender aquí" usando solo el precio de
catálogo (`economy.priceAt`), **sin mirar nunca si la reserva podía pagarlo
de verdad**. El agente no tenía ningún conocimiento de precio en otro
lugar para ese bien específico (nunca lo había vendido con éxito en otra
parte, o esa memoria fue desplazada por rumores más recientes), así que
tampoco se disparaba el bono de arbitraje que ya existía.

**Regla que lo produjo**: `decision.js` calculaba el atractivo de vender
localmente sin verificar `market.goldReserve` — un dato que el motor
conoce perfectamente y que el agente, estando físicamente ahí, tiene
pleno derecho a observar.

**¿Es un bug?** Sí — contradice directamente el diseño experimental (la
sección 5 pide explícitamente que la caída de precio empuje a
comerciar/viajar/cambiar de actividad; acá no empujaba a nada, solo
generaba fracasos silenciosos).

**Corrección**: la puntuación de `trade_sell` ahora penaliza fuerte
(-3) si `goldReserve < precio×1,5` — una señal de "el mercado no tiene con
que pagarte", verificable en vivo por el agente, sin necesitar memoria.

**Corrida posterior (300 días, misma semilla)**: intentos fallidos por
falta de fondos: **0** (antes: 52 solo para este agente). Quilan pasó de
368 viajes... [ver sección 5, el efecto real fue mayor: pasó de
prácticamente no viajar a viajar 368 veces].

## 5. BUG #2 — Empezar una prueba de clase nueva tira el progreso de la anterior

**Reproducido en la primera corrida de 365 días tras el cambio 2.1/2.2.**
Un contador de `trial_started` que en toda corrida anterior rondaba las
20-40 apariciones en 365 días **saltó a 7.864** — un inicio de prueba cada
~27 ticks por agente, en promedio, sin que la diversidad de clases
mejorara (de hecho empeoró: 16 de 24 agentes terminaron Erudito, la peor
concentración vista en todo el proyecto).

**Causa, en dos capas**:
1. Al añadir `lifetimeTrialReadiness()` para que "empezar una prueba"
   pesara lo que el agente ya venía haciendo (sección 2 de este bug),
   apliqué el mismo bono a la prueba de Erudito (`knowledge_count`) — que
   se acumula solo por existir y socializar, no por ninguna acción
   elegida. Resultado: **todos** llegaban con esa prueba casi al 100% de
   progreso sin haberlo buscado, y el bono la hacía ganar todavía más
   seguido que antes. Corregido excluyendo `knowledge_count` del cálculo
   de "disposición" — no es una prueba que se persiga, es una que ocurre.
2. Con eso corregido, quedó al descubierto un problema más profundo:
   `actions.js` ofrece `iniciar_prueba_clase` para **cualquier** clase
   elegible que no sea la prueba activa — incluso si ya hay una prueba
   distinta en curso. Como `startTrial()` sobreescribe sin más el progreso
   anterior, y nada penalizaba abandonar una prueba a medias, dos pruebas
   con puntuaciones parecidas podían turnarse cada pocos ticks sin que
   ninguna llegara a completarse nunca.

**Regla que lo produjo**: ausencia de fricción para abandonar una prueba
en curso — el mismo patrón exacto que el bug de afiliación a gremios del
Experimento A (oscilar entre dos opciones porque ninguna tiene memoria de
"ya empecé esto").

**¿Es un bug?** Sí, y doblemente instructivo: mi propia corrección de la
sección 2 lo causó. Lo declaro igual, con la misma vara que usé para todo
lo demás.

**Corrección**: `iniciar_prueba_clase` ahora resta 6 puntos si ya hay una
prueba distinta en curso — cambiar de objetivo sigue siendo posible, pero
deja de ser gratis.

**Corrida posterior (365 días, misma semilla)**: `trial_started` bajó de
7.864 a **28**, `class_change` fue **26** — casi toda prueba iniciada
ahora se completa. La diversidad de clases pasó de 16/24 Erudito a una
distribución real: contrabandista, guerrero×2, explorador×5,
comerciante×4, erudito×1, curandero×9, caballero×1, herrero×1.

## 6. El resultado central: trayectoria criminal completa del sujeto de control

Con los dos bugs corregidos, el sujeto de control (codicia 0,92, ambición
0,88, tolerancia al riesgo 0,85, empatía 0,08, lealtad 0,12 — la misma
política que todos los demás, sin ninguna rama especial en el código)
produjo esto, verificado en los logs de eventos:

- **Día 1, tick 1**: arrestado por intento de robo — su primerísima
  acción relevante en toda la simulación es un crimen.
- **Día 2, tick 25-26**: sale de la cárcel, roba con éxito, lo atrapan de
  nuevo casi inmediatamente.
- **Día 4, tick 69**: tercer arresto en cuatro días.
- **Tick 556 (día ~23)**: completa la prueba de Novato → **Pícaro**.
- **Tick 4.543 (día ~189)**: tras acumular 96 robos exitosos a lo largo
  de la partida y nivel de oficio 9 como Pícaro, completa la prueba de
  Pícaro → **Contrabandista**.
- **Final (día 365)**: Contrabandista, nivel de oficio 9, nivel base 4,
  96 robos exitosos, 599 operaciones de comercio, 176 de oro.

`theft: 96` en el conteo global de eventos de toda la simulación coincide
casi exactamente con su contador personal — **prácticamente todo el robo
de los 365 días de este mundo lo cometió un solo agente**, el sembrado a
propósito para eso. Nadie más desarrolló una carrera criminal comparable
en esta corrida, y no hizo falta forzar nada: la personalidad sola bastó.

## 7. El otro resultado central: farming al estilo Cartman

En la corrida final de 365 días, **"Isvel la Sabia" mató 1.198 monstruos**
(y se convirtió en Guerrero en el camino) en Bosque Umbrío; en una corrida
intermedia, "Quilan" llegó a 1.052 sin cambiar nunca de clase (se quedó
Novato). Ambos superan la cifra literal que menciona el encargo como
ejemplo de absurdo.

**Qué descubrieron**: que matar lobos comunes repetidamente en un solo
lugar es una fuente confiable de oro y experiencia.

**Qué produjo el mundo en respuesta**:
- **Presión de caza**: en Bosque Umbrío llegó a 0,98 (el tope es 1) tras
  meses de explotación sostenida — más del 35% de los encuentros pasaron
  a ser variantes élite (lobo alfa) en vez de comunes, un riesgo real y
  sostenido, no cosmético.
- **Colapso del mercado local**: la reserva de oro de Bosque Umbrío bajó
  de 40 (inicial) a menos de 2 de forma permanente — una zona salvaje no
  se repone nunca, por diseño desde V2.
- **¿Dejó de ser rentable?** No completamente, y eso también es un
  resultado válido: incluso con la presión de caza al máximo y el mercado
  local seco, seguir matando lobos ahí seguía dando oro directo por cada
  victoria (un faucet que no depende del mercado) y XP de oficio. Lo que
  SÍ dejó de funcionar, antes del Bug #1, fue la parte de *vender* el
  botín — no la de cazarlo.
- **¿El agente cambió de estrategia?** Antes de corregir el Bug #1: no —
  se quedó exactamente en el mismo lugar, acumulando drops invendibles.
  Después de corregirlo: sí, parcialmente — empezó a viajar (368 salidas
  registradas para Quilan en la corrida comparable) a vender lo que ya no
  podía colocar localmente, sin dejar de cazar en el mismo sitio. No
  abandonó el farming; le agregó una ruta comercial regular.

## 8. El hallazgo que no esperaba: riqueza social, no productiva

La agente más rica de una de las corridas de 365 días acumuló ~14.500 de
oro con apenas 15 operaciones de comercio y 93 combates — cifras que no
explican ni de lejos esa fortuna. Rastreando el origen exacto: **recibió
`help_agent` de otros agentes 5.147 veces**, por un total de ~14.482 de
oro — prácticamente el 100% de su riqueza. No cazó, no comerció, no robó:
fue, con enorme diferencia, la agente más sociable y querida del mundo
(miles de conversaciones), y esa popularidad se tradujo en miles de
pequeños regalos que nadie planeó como estrategia de acumulación —
`help_agent` está diseñado para que ayudar a alguien que ya te cae bien
puntúe un poco mejor (`if (rel.affinity > 20) score += 1`), y a escala de
7.200 ticks eso compone en una fortuna mayor que cualquier estrategia de
caza o comercio activo registrada en esa misma corrida.

## 9. Clasificación de comportamientos (sección 8 y 22 del encargo)

| Comportamiento | Clasificación | Por qué |
|---|---|---|
| Farmear el mismo monstruo cientos/miles de veces | **A — estrategia racional** | El oro por victoria es un faucet directo, no depende de vender nada; seguía siendo positivo incluso con el mercado local colapsado. |
| Acumular drops sin vender por reserva agotada (antes del Bug #1) | **D — bug** | Contradecía el diseño experimental explícito (sección 5); corregido. |
| Reinicio constante de pruebas de clase (Bug #2) | **D — bug** | Ausencia de fricción, mismo patrón que un bug ya corregido en el Experimento A; corregido. |
| Riqueza pasiva por popularidad social (`help_agent`) | **E — emergente, con cautela** | Nadie programó "acumular riqueza siendo querido"; es la composición, a escala de miles de ticks, de una regla de puntuación simple (`afinidad > 20 → +1`) con una población que converge naturalmente en unos pocos agentes muy sociables. Se explica del todo una vez encontrado, pero encontrarlo requirió correr la simulación, no leer el código. |
| Robo concentrado casi enteramente en el sujeto de control | **A/derivado** | Consecuencia directa y predecible de sembrar codicia alta + empatía baja; el resto de la población simplemente no tiene el perfil para que robar puntúe alto. |
| Desigualdad de riqueza extrema (mediana 8-14 vs. cientos de miles en la cola) | **Derivado, ya documentado en V2/A** | No es un hallazgo nuevo de este experimento, se repite consistentemente. |
| Concentración de clase en Erudito cuando su prueba se sobre-premiaba | **D — bug propio, autoinfligido** | Efecto secundario de mi propia corrección (sección 5), detectado y corregido en la misma sesión. |

Ningún comportamiento de esta tabla se "arregló" solo por parecer raro o
repetitivo — el farming de 1.198 monstruos sigue intacto; es la fuente de
información, no un problema.

## 10. Respuestas basadas en datos (sección 21)

1. **¿Apareció farming extremo?** Sí — 1.198 y 1.052 muertes en corridas
   distintas de 365 días, superando el umbral literal de "Cartman" del
   encargo.
2. **¿Qué agente?** Isvel la Sabia (1.198, Guerrero) y Quilan (1.052,
   Novato) en corridas distintas — no el sujeto de control.
3. **¿Qué incentivo lo produjo?** Oro directo por victoria + XP de oficio,
   ambos independientes de si el mercado local puede pagar por los drops.
4. **¿Cuánto duró?** Los 365 días completos en ambos casos — no hay
   evidencia de que la estrategia se abandonara nunca.
5. **¿El mercado reaccionó?** Sí, con fuerza: reserva de Bosque Umbrío de
   40 a ~1-2 de oro, presión de caza al 98%, más de un tercio de
   encuentros pasando a variante élite.
6. **¿El agente cambió de estrategia?** Cambió la parte comercial (empezó
   a viajar a vender), no la parte de caza.
7. **¿Por qué cambió esa parte y no la otra?** Porque el oro por matar
   monstruos nunca dejó de pagar (viene del motor, no del mercado); vender
   los drops sí dejó de funcionar, y una vez que el sistema pudo
   representarle esa información (Bug #1 corregido), viajar a venderlos
   se volvió la opción racional.
8. **¿Estrategias económicas inesperadas?** La riqueza social pasiva
   (sección 8) — nadie la diseñó como estrategia.
9. **¿Hay una actividad que domina demasiado?** `talk`/`help` siguen
   siendo, por lejos, los eventos más frecuentes del mundo (decenas de
   miles), heredado de V1/V2 — no es nuevo de este experimento, pero sigue
   siendo cierto.
10. **¿Existen mercados locales realmente diferentes?** Sí, de forma
    marcada: los mercados asentados terminan con reservas de 350-440 de
    oro; los de zonas salvajes, con menos de 2 — una diferencia real, no
    cosmética.
11. **¿Los agentes viajan por razones económicas?** Sí, después del Bug
    #1 — antes, no de forma confiable.
12. **¿Especializaciones espontáneas?** Sí: Contrabandista apareció sin
    forzarlo; la concentración de clases varía fuerte entre corridas según
    qué prueba "gana la carrera" primero.
13. **¿Qué exploits encontró la población?** Ninguno que un agente
    explotara conscientemente; los dos bugs (mercado sin reserva ignorado,
    reinicio de pruebas) son fallas de la puntuación, no jugadas
    deliberadas de ningún agente.
14. **¿Qué debería conservarse?** El farming sostenido de bajo riesgo como
    estrategia válida y racional; la riqueza social emergente; la
    dispersión de clases lograda tras el Bug #2.
15. **¿Qué debería corregirse (a futuro, no en este experimento)?** Nada
    más se corrigió aquí — ver limitaciones.
16. **¿El crimen puede ser una trayectoria de progresión real?** Sí,
    demostrado end-to-end: Novato → Pícaro → Contrabandista con niveles de
    oficio reales.
17. **¿El sujeto criminal sube de nivel mediante el crimen?** Sí — nivel
    de oficio 9 como Pícaro antes de la transición, alimentado en buena
    parte por 96 robos exitosos.
18. **¿Qué parte de su XP viene de actividades criminales?** No medí el
    porcentaje exacto (requeriría instrumentar cada llamada a `addJobXp`
    por origen, fuera del alcance de este experimento), pero el robo fue,
    con diferencia, su actividad más repetida y la única en la que
    superó por completo al resto de la población.
19. **¿Qué especialización desarrolla?** Contrabandista (utilidad/comercio
    ilícito), no Asesino — coherente con su perfil: codicioso y ambicioso,
    pero no particularmente inclinado al combate (pocas muertes de
    monstruo registradas).
20. **¿La cárcel funciona como costo real sin destruir progresión?** Sí,
    verificado: tres arrestos en los primeros cuatro días no le impidieron
    completar dos cambios de clase después — perdió tiempo, oro y
    posición institucional, no XP ni nivel.
21. **¿Cambia de estrategia cuando cambian los incentivos?** Dentro de lo
    observable, no dejó de robar en ningún momento de la simulación —
    siguió siendo racional para su perfil durante los 365 días completos.
22. **¿Aparecen distintas trayectorias criminales entre agentes?** No se
    pudo comprobar en esta corrida — solo un agente desarrolló una
    carrera criminal sostenida. La rama de Asesino existe y es alcanzable
    en principio (usa el mismo mecanismo de prueba que Caballero), pero
    nadie la tomó en las corridas realizadas.
23. **¿La diferencia entre rutas se deriva de comportamiento real?** Sí,
    por diseño: Asesino exige matar élites de verdad; Contrabandista exige
    volumen de comercio real. Ninguna se asigna por una etiqueta.
24. **¿El sistema permite que un criminal de utilidad y uno de combate
    evolucionen distinto?** Estructuralmente sí (confirmado por el diseño
    de las dos pruebas); empíricamente solo se observó la rama de utilidad
    en las corridas realizadas.

## 11. Qué NO funcionó / limitaciones

- **Nunca apareció un Asesino** en ninguna corrida — la rama de combate
  del crimen existe en el código y usa una prueba ya validada en otro
  contexto (Caballero), pero ningún agente de esta población tenía el
  perfil (codicia/riesgo altos + inclinación real al combate) para
  tomarla. No lo forcé.
- **No medí qué fracción exacta de la XP total del sujeto de control vino
  específicamente del robo** — lo que sí verifiqué es que el robo genera
  XP y que fue su actividad dominante; separar el origen exacto de cada
  punto de experiencia acumulado requeriría instrumentación adicional que
  no construí.
- **La riqueza social pasiva (sección 8) no se investigó a fondo** — es un
  hallazgo real y verificado, pero entender si es un patrón general de la
  población o una rareza de un agente puntual necesitaría comparar varias
  semillas, fuera del alcance de esta corrida.
- **El Bug #2 fue autoinfligido**: al corregir la asimetría de progreso
  criminal agregué una regla nueva que, sin la exclusión de
  `knowledge_count` y sin la penalización de abandono, habría dejado el
  sistema peor que antes de tocarlo. Quedó documentado como advertencia:
  una corrección "mínima y sistémica" todavía puede introducir un
  problema nuevo si no se prueba contra el resto de las reglas ya
  existentes.

## 12. Recomendaciones para el siguiente experimento

- Correr esta misma configuración con 3-5 semillas distintas para ver si
  Contrabandista/Asesino aparecen con más frecuencia, y si la riqueza
  social pasiva de la sección 8 es un patrón repetible o un accidente de
  esta semilla en particular.
- Sembrar un segundo sujeto de control con perfil combate-criminal
  explícito (codicia y riesgo altos, pero también alta tolerancia al daño
  y clase inicial con más poder de combate) para observar directamente si
  la rama de Asesino es alcanzable en la práctica, no solo en el diseño.
- Instrumentar el origen de cada punto de XP (por tipo de acción) para
  poder responder con precisión qué fracción de una trayectoria de nivel
  vino de una fuente específica, en vez de inferirlo de los contadores de
  actividad.
- Investigar la riqueza social pasiva como su propio experimento: ¿qué
  pasa si `help_agent` tuviera algún techo o costo creciente? ¿Sigue
  siendo la estrategia más rentable del mundo, o era una consecuencia de
  la ausencia de fricción en esa acción en particular — el mismo patrón
  que ya apareció tres veces en este proyecto (gremios, pruebas de clase,
  ahora quizás ayuda social)?
