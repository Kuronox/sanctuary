# Crónicas del Step 14 — tres trayectorias

Reconstruidas desde una corrida ya guardada, sin narrador LLM. La prosa ordena hechos
registrados; no agrega pensamientos, emociones ni causas que el motor no registre.

## Origen de los datos

| | |
|---|---|
| Corrida | `data_runtime_step14_a` |
| Seed | `sanctuary-v2` (2789489010) |
| Duración | 7200 ticks, 300 días de juego; 70 agentes |
| Código | Steps 1 a 14, sin commitear |
| Política de decisión | determinista para los 70. La cohorte de 5 agentes "LLM" hizo 0 llamadas reales (sin API key) y usó la política determinista. Ollama apagado: no hay frases de narrador. |
| Herramientas | `chronicle.mjs` (fichas con identificadores de evento), `tools/auditoria_po/tabla_trayectorias.mjs` (selección y estado inicial), `tools/auditoria_po/ultimas_horas.mjs` |

Fuentes por tipo de dato:

- **Eventos** (`events.jsonl`): identificadores entre corchetes, por ejemplo `[ev_6253]`.
- **Oro en el tiempo**: campo `oro=` del log de decisiones (`decisions.jsonl`), último valor de cada día.
- **Estado inicial**: reconstruido repitiendo la creación del mundo con la misma seed. El
  hogar y la personalidad reconstruidos coinciden con el estado guardado en los 70 agentes.
- **Estado final, relaciones, memoria, vetos**: `state.json`.

Lo que el motor **no** registra y por eso no aparece: el monto de cada comida, de las
cuotas de gremio, del mantenimiento de equipo y del coste de fundar un gremio; el contenido
de las conversaciones; y cualquier motivo que no sea la lista de razones de la decisión.

## Cómo se eligieron

De la tabla de los 70 agentes (oro inicial, oro en los días 30, 100, 200 y final, clase,
muertes, actividad) se buscó un caso por criterio:

| Criterio | Elegido | Por qué |
|---|---|---|
| A. Prosperidad | Fenna (`agent_23`) | Mayor fortuna final de la corrida (19.882), sin muertes, sin malversar. |
| B. Conflicto y pérdida de posición | Ulra (`agent_1`) | Única malversadora de la corrida, 6 arrestos, vetada en 14 gremios; su oro cae de 1.806 a 195. |
| C. Trayectoria marcada por obstáculos | Isvel el Audaz (`agent_31`) | Dos veces pierde todo y se rehace; muere tres veces, la última de forma definitiva. |

Para C se consideró también a Kelas el Callado (`agent_56`), que muere el día 2 y termina con
1.070 de oro. Se descartó porque su segunda vida tiene pocos eventos propios (14 jornadas,
5 combates). Ulra es además el "sujeto de control" del proyecto: su personalidad se fija a
mano al crear el mundo (`src/sim/run.js`); no es un agente al azar.

---

## A. Fenna — la comerciante que dejó de trabajar

**Inicio.** Novata nacida en Brynn con 32 de oro. Rasgos extremos: solitaria, cauta, fría.
Metas: riqueza e independencia.

**Días 1 a 9.** Trabaja desde el primer día `[ev_56]`. El día 5 inicia y completa la prueba
de Comerciante `[ev_6253]` `[ev_7173]`. El día 7 llega a Morvane `[ev_10203]` y el día 9 a
Valdor `[ev_12742]`, donde entra al gremio QuilanCirculo `[ev_13790]`. Cierra el día 1 con 80
de oro.

**Días 9 a 175.** Es su etapa de trabajo. Hace 2.386 jornadas que le dan 21.844 de oro, casi
todas en dos ciudades: 1.034 en Valdor y 935 en Grisal (251 en Veldris, 83 en Brynn, 60 en
Tejor, 18 en Morvane, 5 en Duren). Su oro al cierre del día: 2.838 el día 30, 6.479 el 60,
9.883 el 90, 14.311 el 120 y 19.319 el 150.

En ese tiempo cambia de gremio: deja QuilanCirculo el día 54 `[ev_87269]` y entra a
GorrikCirculo `[ev_87385]`, que deja el día 131 `[ev_214267]`; hay dos ingresos más hasta el
día 172 `[ev_234351…ev_280324]` y una salida de ElsvetCompany el día 168 `[ev_273745]`. No
registra ningún aporte de oro a un gremio. Completa 10 encargos de transporte (266 de oro).
Llega a Grisal el día 85 `[ev_139223]`, a Veldris el 152 `[ev_247259]`, a Duren el 171
`[ev_278509]` y a Tejor el 172 `[ev_279414]`. El día 171, en Duren, vence junto a Isvel a un
Lobo alfa `[ev_279047]`.

**Día 175: el cambio.** Inicia la prueba de Mercader de Ruta `[ev_285816]`. Su última jornada
de trabajo es de ese mismo día `[ev_285726]`. El día 176 alcanza su máximo: 22.047 de oro.

**Días 177 a 301.** No trabaja ni una vez. Hace 1.348 compras por 28.468 de oro y 1.327
ventas por 26.352: una diferencia de 2.116 de oro en contra. (Entre los días 1 y 176 había
hecho 20 compras y 122 ventas.) Su oro baja de forma continua: 21.008 el día 210, 20.647 el
240, 20.166 el 270 y 19.882 el 300. Llega a Vannur el día 247 `[ev_401532]` y a Kestal el 286
`[ev_463025]`; el día 288 vence con Corwen a un Capitán bandido `[ev_466391]`.

**Final.** Comerciante de nivel base 7 y nivel de oficio 20, con 19.882 de oro, en Tejor, con
sus 3 vidas, miembro de ElsvetCompany. Tiene un amigo, Corwen. Su memoria guarda 11 entradas,
las de mayor importancia son encargos de transporte completados. La prueba de Mercader de
Ruta sigue abierta.

**Sobre la prueba abierta.** Son hechos del estado final y del código, no una interpretación:
la prueba pide 30 operaciones de comercio y Fenna lleva 2.698 desde que la inició; la clase
exige además una posición de 15 ante la institución `mercado_tejo`, y la suya es 0. El código
da un bono de puntuación a comprar y vender mientras hay una prueba de comercio en curso.
Que ese bono sea la razón de que dejara de trabajar es una **inferencia** a partir del
código; el log no registra el motivo.

**Trazabilidad.** `agent_23` en `data_runtime_step14_a`. Reproducir la ficha:
`node chronicle.mjs data_runtime_step14_a agent_23`. Jornadas y comercio por período:
eventos `work`, `trade_buy` y `trade_sell` del agente (primer `work` `ev_56`, último
`ev_285726`). Requisito de clase: `worldSeed.jobs` (`mercader_de_ruta.requirement`).
Posición y prueba: `agents.agent_23.standing` y `.progression.trial` en `state.json`.

---

## B. Ulra — robar a los gremios dejó de alcanzar

**Inicio.** Novata nacida en Veldris con 19 de oro. Rasgos extremos: ambiciosa, temeraria,
codiciosa, desleal, fría. Metas: independencia y exploración.

**Días 1 a 5: robos a personas.** El día 1 intenta robar a Varik el Manco, la descubren y la
arrestan: 5 de multa y 29 horas de cárcel `[ev_114]` `[ev_113]`. El día 2 la descubren
intentando robar a Ulra la Errante `[ev_2252]`; luego le roba 12 de oro a Varik el Manco y la
guardia la detiene: 17 de multa y 45 horas `[ev_2376]` `[ev_2375]`. En toda la corrida suma 6
arrestos, todos antes del día 54 (el último, `[ev_88174]`), 81 de oro en multas, 11 robos
logrados por 76 de oro y 17 intentos fallidos.

**Días 6 a 30: los gremios.** El día 6 entra a GorrikCompany `[ev_8984]`, malversa 62 de oro,
la ven y la expulsan `[ev_9045]` `[ev_9044]`. El día 7 inicia y completa la prueba de Erudito
`[ev_10123]` `[ev_10173]`. El día 8 llega a Duren `[ev_11118]` y pierde dos veces contra un
Lobo salvaje `[ev_11133]` `[ev_11285]`. El día 9 entra a ElsvetCompany `[ev_13699]`, malversa
277 y la expulsan `[ev_13737]` `[ev_13736]`. El día 12 funda UlraCirculo `[ev_18697]`, lo
compromete en la disputa por Brynn `[ev_18797]` y lo abandona ese mismo día `[ev_18898]`; el
día 15 funda y abandona UlraCompañia `[ev_23880]` `[ev_24067]`.

En estos 30 días malversa 7 veces por 2.132 de oro, y las 7 son descubiertas. La mayor, de
892 de oro, es del día 29. El día 30 tiene 1.806 de oro: su máximo de toda la corrida.

**Días 31 a 120: la caída.** Malversa 19 veces más, pero por 231 de oro en total; 2 son
descubiertas. Funda otros 10 gremios. Su oro baja a 1.549 el día 60, 1.177 el día 90 y 204 el
día 120. El día 80 pasa de Erudito a Archivista `[ev_131010]` `[ev_131106]`. Entre los días
63 y 64 pierde dos veces junto a Morden contra un Lobo alfa y luego lo vencen `[ev_102993]`
`[ev_103972]` `[ev_104587]`.

**Días 121 a 301: sobrevivir peleando.** Malversa 85 veces por 1.722 de oro (5 descubiertas);
la última es del día 284 `[ev_459547]`. Gana 171 peleas individuales y pierde 30. Vende al
mercado por 980 de oro. El día 107 vence con Quilan a un Trol ancestral `[ev_175145]` y el
121, en Brynn, con Isvel la Sabia a un Capitán bandido `[ev_198207]`. Su oro se mantiene
entre 196 y 450: 259 el día 150, 414 el 210, 450 el 240, 196 el 300.

**Final.** Archivista de nivel 7, con 195 de oro, en Tejor, con sus 3 vidas y sin gremio. En
total malversó 111 veces por 4.085 de oro (14 descubiertas) y fundó 23 gremios. Está vetada
en 14 gremios; ninguno de los que la expulsaron volvió a aceptarla. Tres agentes le guardan
rencor: Jorun la ve como rival, y Quilan de las Colinas y Brannok la Errante como enemiga.
Ella aprecia como amigos a Farro de las Colinas, Varik y Yosef la Errante. Las entradas más
importantes de su memoria son sus seis arrestos.

**Límites de lo registrado.** El log no dice en qué se fue el oro entre los días 30 y 120.
Según el código, fundar un gremio cuesta 30 de oro más 20 por cada gremio fundado antes; el
monto pagado no queda en el evento. Con 23 fundaciones esa fórmula sumaría 5.750 de oro: es
un **cálculo a partir del código**, no un dato observado.

**Trazabilidad.** `agent_1` en `data_runtime_step14_a`. Ficha:
`node chronicle.mjs data_runtime_step14_a agent_1`. Malversaciones: eventos `guild_embezzle`
del agente (primera `ev_9045`, última `ev_459547`; campos `amount`, `caught`, `guildId`).
Vetos: `guilds.*.bannedIds` en `state.json`. Rencores: `agents.*.relationships.agent_1`.

---

## C. Isvel el Audaz — tres vidas, dos fortunas rehechas

**Inicio.** Novato nacido en Grisal con 18 de oro. Rasgos extremos: temerario y desleal.
Metas: exploración y ayudar a otros.

**Primera vida, días 1 a 73.** El día 1 llega a Brynn `[ev_571]` y pierde dos veces contra
un Bandido `[ev_642]` `[ev_965]`. El día 2 vence con Quilan a un Capitán bandido `[ev_1817]`
e inicia y completa la prueba de Curandero `[ev_1878]` `[ev_2306]`. Recorre el mundo: Tejor
el día 4, Morvane el 23, Valdor el 24, Duren el 26, Veldris y Vannur el 27, Kestal el 40.
Entra y sale de gremios nueve veces. El día 30 vence solo a un Lobo alfa `[ev_48349]`.

En esta vida cura a otros 118 veces, pierde 28 peleas individuales, vende al mercado por
1.242 de oro y gasta 449 en 57 noches de posada. Trabaja 3 jornadas. Su oro sube a 989 el día
30, 1.351 el 60 y 1.441 el 72. El día 73 muere en Duren, a manos de un Lobo alfa, siendo
curandero de nivel 6 `[ev_119914]`. Renace en Tejor con 2 vidas. Ese día cierra con 18 de oro.

**Segunda vida, días 73 a 158.** El mismo día que renace pierde junto a Ulra contra un Lobo
alfa `[ev_119915]`. Suma 26 derrotas individuales y 69 en grupo. Cura 137 veces, vende por
1.346 y gasta 553 en 65 noches de posada. Su oro vuelve a subir: 206 el día 90, 545 el 120,
1.013 el 150 y 1.394 el 156. El día 158 muere otra vez en Duren, otra vez contra un Lobo alfa,
siendo curandero de nivel 8 `[ev_257075]`. Renace en Tejor con 1 vida y 13 de oro.

**Tercera vida, días 158 a 240.** Pierde 15 peleas individuales. El día 203 vence con Quilan a
un Aullador Ancestral, un enemigo de rango jefe `[ev_329778]`. El día 224 asume el liderazgo
del gremio IsvelCirculo `[ev_364162]`. Cura 244 veces, vende por 1.313 y gasta 639 en 76
noches de posada. Su oro sube por tercera vez: 365 el día 180, 670 el 210 y 1.496 el 239.

**Las últimas 120 horas.** Está en Brynn, donde propone 12 combates en grupo y los gana. En el
tick 5684 una decisión de necesidad crítica lo lleva a Tejor; allí descansa, pasa cuatro
noches de posada, come y vende. En el tick 5704 viaja a Duren. Pelea solo cuatro veces (gana
dos, pierde dos) y cura seis veces. Entre los ticks 5726 y 5734 sus decisiones registran el
hambre subiendo de 0,72 a 0,88 y la salud bajando de 36 a 21 sobre 120, con 1.496 de oro. En
el tick 5737 una decisión de necesidad crítica lo saca de Duren hacia Valdor. En el tick 5743,
ya en Valdor, otra decisión de necesidad crítica lo pone de nuevo en camino. En el tick 5746
muere definitivamente; el motor registra la causa como hambre y el lugar como Valdor
`[ev_390264]`.

**Final.** Curandero de nivel 10, muerto definitivamente con 1.502 de oro registrados. En toda
la corrida perdió 69 de sus 219 peleas individuales: 42 contra el Lobo salvaje, 19 contra el
Bandido. Apreciaba como amigos a Quilan, Ulra e Isvel la Sabia. Nadie le guardaba rencor.

**Lo que es dato y lo que es inferencia.** Dato: Duren no tiene mercado (en el mundo semilla
no tiene gobierno y su stock de comida es 0). Dato: el estado final muestra Valdor con 0,3 de
comida. **Inferencia desde el código:** la regla de supervivencia solo hace viajar por hambre
a un agente que está en una ciudad segura si en ese momento no hay comida en el mercado
local; por eso el segundo viaje desde Valdor implica que no la había en el tick 5743. El log
no guarda el stock de ese momento.

**Trazabilidad.** `agent_31` en `data_runtime_step14_a`. Ficha:
`node chronicle.mjs data_runtime_step14_a agent_31`. Últimas horas:
`node tools/auditoria_po/ultimas_horas.mjs data_runtime_step14_a agent_31 5746 120`. Muertes:
`agents.agent_31.deathHistory` (ticks 1741, 3766 y 5746). Derrotas por monstruo:
`node tools/auditoria_po/auditoria_step14.mjs data_runtime_step14_a`.
