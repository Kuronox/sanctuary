# Sanctuary — Auditoría del Step 14, tres crónicas y cinco decisiones de PO

Fecha: 2026-10-09. Encargo del Product Owner. **No se modificó ninguna regla de simulación,
no se ajustó ningún parámetro y no se hizo commit.**

Convención del informe: **[Hecho]** es algo medido en los artefactos o leído en el código;
**[Inferencia]** se deduce de hechos pero no se observó directamente; **[Hipótesis]** está
pendiente de comprobar.

## Resumen

1. **Step 14.** La regla funciona como fue diseñada (verificado en 9.348 peleas), pero no
   puede resolver el problema porque la causa está en otro lado: el motor califica como
   "segura" una pelea que un comerciante o curandero desarmado pierde 33 % de las veces.
2. **Economía.** El agente común no está en una trampa de pobreza: tras renacer con 0 de oro
   vuelve a 15 en 15 a 20 horas. Su oro es bajo sobre todo porque dona al gremio: los mayores
   donantes entregan casi todo lo que ganan trabajando.
3. **Tesoros.** Entre 115.000 y 180.000 de oro por corrida entran a los tesoros como aportes
   voluntarios, y casi no tienen salida.
4. **Equipo.** Quien no es herrero o novato no tiene un camino real para armarse: comprar un
   arma puntúa casi nada y los comerciantes que las compran las revenden en 1 a 2 horas.
5. **Concentración.** Todas las huidas de zonas peligrosas llevan a Valdor o a Tejor. Valdor
   termina sin comida en los tres mundos.
6. **Tres hallazgos nuevos**, registrados sin tocar: invitaciones a grupo que dejan a un
   agente sin turnos para comer; una prueba de clase imposible de completar que deja a cuatro
   agentes comerciando a pérdida; y dos muertes "por hambre" de agentes ricos.

---

## 1. Estado real del repositorio

**[Hecho]** Rama con 4 commits; el último es `6310efb` (Steps hasta 9.6). Todo lo posterior
está sin commitear.

| Tipo | Archivos |
|---|---|
| Motor modificado (66 líneas agregadas, 5 quitadas) | `src/engine/world.js` (Steps 10 y 11), `src/engine/actions.js` (Steps 12, 13, 14), `src/engine/decision.js` (Step 14), `src/engine/entities.js` (Step 10) |
| Motor nuevo, sin seguimiento | `src/engine/llm/narrator.js`, `src/engine/llm/ollamaClient.js` (Step 10) |
| Tests nuevos | `narrative`, `survival_override`, `help_need`, `guild_ban`, `defeat_memory` (`.test.js`) |
| Documentos | reportes de Steps 10 a 14, `CRONICAS_STEP10.md`, `RESUMEN_PO_STEPS_11_A_14.md` |
| Herramientas | `chronicle.mjs` |

Datos de corridas: 15,9 GB en carpetas `data_runtime_step*` (fuera de git por `.gitignore`).
No se borró ni sobrescribió ninguna. La carpeta de trabajo `data_runtime/` contiene una
copia de la última corrida (`step14_c`).

**Discrepancia con los resúmenes previos.** El reporte del Step 10 dice que el narrador tiene
un timeout de 8 segundos; el código usa 30 (`ollamaClient.js`). Sigue sin corregir.

**Determinismo.** **[Hecho]** El narrador del Step 10 se ejecuta en toda corrida. Con Ollama
apagado, como en todas las corridas de esta auditoría, no escribe nada y las decisiones no
cambian. Con Ollama encendido escribe texto en `state.json`, así que el archivo de estado
deja de ser idéntico entre corridas de la misma seed. No se tocó.

---

## 2. Auditoría del Step 14

### 2.1 Verificación de los resultados reportados

Corridas: `data_runtime_step13_*` y `data_runtime_step14_*`, seeds a `sanctuary-v2`
(2789489010), b `sanctuary-v2-step8-b` (3240097812), c `sanctuary-v2-step8-c` (4218807298).

| Afirmación del encargo | Mundo a | Mundo b | Mundo c | Verificación |
|---|---|---|---|---|
| Las derrotas repetidas disminuyeron en los tres | 230 → 162 | 268 → 189 | 278 → 329 | **Solo como proporción.** En cantidad subieron en c. |
| (proporción de derrotas que son repetidas) | 64 % → 53 % | 66 % → 48 % | 67 % → 59 % | Baja en los tres. |
| Las muertes por combate disminuyeron en los tres | 19 → 13 | 36 → 32 | 14 → 10 | Correcto. |
| El máximo de derrotas de un agente empeoró en dos | 114 → 69 | 71 → 102 | 71 → 81 | Correcto (b y c). |
| El porcentaje de peleas perdidas aumentó en dos | 11,6 → 10,1 | 16,5 → 17,8 | 12,8 → 13,4 | Correcto (b y c). |

"Repetida" = derrota individual contra un monstruo que ya derrotó a ese agente en los 7 días
previos. En el mundo c hubo más peleas en total (3.238 → 4.124), lo que explica que suba la
cantidad aunque baje la proporción.

### 2.2 Hallazgo

**La regla hace lo que se diseñó, y aun así no puede resolver el problema.** Las derrotas las
concentran pocos agentes de clases no combatientes que pelean desarmados contra dos monstruos
comunes. El motor les dice que esas peleas son seguras.

### 2.3 Evidencia reproducible

Comando: `node tools/auditoria_po/auditoria_step14.mjs <carpeta de corrida>`. Une cada
decisión de pelear sola (`decisions.jsonl`) con su resultado (`events.jsonl`) y reconstruye la
penalización con la misma fórmula del motor.

**a) La memoria expira, se actualiza y afecta la decisión.** **[Hecho]**

| Comprobación | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Peleas individuales decididas | 3.023 | 2.201 | 4.124 |
| La marca "recuerda derrotas" del log coincide con la penalización reconstruida | 3.023 de 3.023 | 2.201 de 2.201 | 4.124 de 4.124 |
| Derrotas de los últimos 7 días según eventos / recuerdos con monstruo en la memoria final | 3 / 3 | 5 / 5 | 13 / 13 |
| Peleas con penalización reconstruida mayor que 1 (Step 13, sin regla → Step 14) | 322 → 163 | 356 → 117 | 567 → 349 |

La coincidencia total entre el log y la reconstrucción prueba que el recuerdo se lee al
decidir y que vence según la fórmula. La última fila prueba el efecto: las peleas en la zona
de castigo alto caen a la mitad o menos.

**b) Quién concentra las derrotas.** **[Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Agentes que pelearon solos / con alguna derrota | 36 / 30 | 46 / 42 | 52 / 44 |
| Los 5 que más pierden concentran | 63 % | 56 % | 58 % |
| Los 10 que más pierden concentran | 84 % | 78 % | 79 % |

Perfil de los 6 que más pierden en cada mundo (18 agentes): 14 tienen como meta principal la
exploración; al perder eran comerciantes o curanderos en 14 casos; nivel base mediano al
perder entre 3 y 9 (el valor más común es 5); tolerancia al riesgo entre 0,52 y 0,94.

**c) Contra qué pierden.** **[Hecho]**

| Monstruo | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Lobo salvaje (común) | 145 de 1.035 (14 %) | 227 de 1.161 (20 %) | 244 de 881 (28 %) |
| Bandido (común) | 135 de 1.447 (9 %) | 122 de 944 (13 %) | 288 de 3.067 (9 %) |
| Todos los demás | 24 | 43 | 21 |

Entre 89 % y 96 % de las derrotas son contra esos dos monstruos.

**d) Un monstruo o varios.** **[Hecho]** Los que más pierden pierden contra **los dos**, no
contra uno. Ejemplos: Osk (mundo b) 71 contra el lobo y 29 contra el bandido; Brannok (c) 55
y 19; Isvel el Audaz (a) 42 y 19. Una excepción: Farro la Sabia (c), 37 de 37 contra el bandido.

**e) Clase, nivel, equipo, temperamento.** **[Hecho]** Porcentaje de peleas individuales perdidas:

| Factor | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Herrero | 3,4 % | 4,9 % | 4,3 % |
| Guerrero | 0 % | sin peleas | 0 % |
| Comerciante | 35,2 % | 39,5 % | 41,5 % |
| Curandero | 34,4 % | 36,2 % | 36,5 % |
| Nivel base 10 o más | 1,0 % | 2,2 % | 4,9 % |
| Nivel base 3 a 5 | 19,9 % | 24,0 % | 19,1 % |
| Con equipo (aproximado) | 6,2 % | 9,5 % | 7,0 % |
| Sin equipo (aproximado) | 13,5 % | 34,0 % | 31,0 % |

"Con equipo" es una aproximación: el agente tuvo un evento `equip` desde su último
renacimiento; no detecta equipo roto. La tolerancia al riesgo no ordena los resultados de
forma consistente entre mundos.

**f) Dependencia de la seed.** **[Hecho]** El perfil de quién pierde, contra qué y con qué
clase se repite en los tres mundos. Lo que cambia con la seed es el volumen total de peleas
(2.201 a 4.124) y, con él, las cifras absolutas.

### 2.4 Explicación causal confirmada

**[Hecho, del código y de los datos mundiales]** Tres piezas:

1. **El motor subestima el riesgo.** `decision.js` calcula un factor de peligro comparando el
   poder del agente con el del monstruo: si el poder supera al del monstruo en 15 %, el factor
   es 1, el máximo. Un comerciante, curandero o erudito sin arma tiene poder 6; el Lobo salvaje
   tiene poder 5. Como 6 es mayor que 5,75, la pelea se puntúa como segura. Pero el combate
   suma un azar de −3 a +5 al agente y de −2 a +4 al monstruo: enumerando las 63
   combinaciones, ese agente pierde **33 %** de las veces. Contra el Bandido (poder 7) el
   factor baja a 0,55 y la derrota real es **56 %**. Las tasas observadas son compatibles:
   entre 31 % y 47 % en 13 de los 14 comerciantes y curanderos que más pierden, que pelean
   contra los dos monstruos (el restante pierde 62 %, solo contra el bandido).
2. **Su poder no mejora.** Comerciante, curandero y erudito tienen crecimiento de poder de
   combate 0 por nivel de oficio (`world_seed.json`). Solo un arma (+4) lo cambia; con ella
   la derrota contra el lobo baja a 5 % (3 de 63 combinaciones).
3. **El castigo es chico frente a la puntuación.** En las peleas tomadas con recuerdo activo,
   la penalización mediana fue 0,57 a 0,60 y la puntuación de pelear, ya descontada, 2,11 a
   2,55; pelear le ganó a la mejor alternativa por una mediana de 0,26 a 0,39 puntos.

Además, **[Hecho]** entre 40 % y 52 % de las derrotas ocurren sin ningún recuerdo activo (el
agente no había perdido contra ese monstruo en los 7 días previos). Ninguna regla basada en
memoria de derrotas puede evitar esas.

### 2.5 Hipótesis no confirmadas

- **[Hipótesis]** Que subir el peso del castigo reduciría las derrotas de forma proporcional.
  No se probó: el encargo prohíbe cambiar el peso.
- **[Hipótesis]** Que al dejar de pelear contra un monstruo el agente se pasa al otro. Los
  datos son compatibles (pierden contra los dos) pero no se midió la secuencia.
- **[Hipótesis]** Que la meta de exploración lleva a estos agentes a Duren, donde está el
  lobo. 13 de 18 tienen esa meta, pero no se comprobó el mecanismo.

### 2.6 Riesgo de mantener el comportamiento

- Bajo para la estabilidad: la regla no rompe nada y los 13 archivos de test pasan.
- Medio para la lectura del mundo: sigue habiendo agentes con 69 a 102 derrotas por corrida,
  lo que en una crónica se lee como un personaje que no aprende.
- El riesgo mayor es metodológico: ajustar el peso del castigo "hasta que mejore" taparía un
  error de cálculo de riesgo con una segunda regla.

### 2.7 Experimento mínimo siguiente

**Medir antes de cambiar.** Sin tocar reglas, comparar para cada pelea decidida el factor de
peligro que usó el motor con la probabilidad real de derrota calculada por enumeración. Si la
diferencia explica la mayoría de las derrotas, el Step siguiente sería calibrar ese factor,
no la memoria.

Alternativas que quedan para aprobación del PO, sin implementar:

| Opción | Qué cambia | Riesgo |
|---|---|---|
| A. Calibrar el factor de peligro con la probabilidad real de perder | La causa confirmada | Menos peleas en general; puede frenar la progresión de novatos |
| B. Subir el peso del castigo por derrota | El síntoma | No evita las derrotas sin recuerdo previo (40 % a 52 %) |
| C. Castigar por proporción de derrotas en vez de por cantidad | El síntoma, mejor dirigido | Regla nueva sobre una estimación de riesgo que sigue mal |
| D. Dejarlo como está | Nada | Persisten los perdedores crónicos |

---

## 3. Las tres crónicas

Archivo: [`docs/CRONICAS_STEP14.md`](CRONICAS_STEP14.md). No sobrescribe `CRONICAS_STEP10.md`.
Sin narrador LLM.

| | Agente | Trayectoria |
|---|---|---|
| A | Fenna (`agent_23`) | De 32 a 22.047 de oro en 176 días con 2.386 jornadas de trabajo; desde el día 177 no trabaja y comercia a pérdida; termina con 19.882. |
| B | Ulra (`agent_1`) | 6 arrestos, 111 malversaciones por 4.085 de oro, vetada en 14 gremios; su oro cae de 1.806 (día 30) a 195. |
| C | Isvel el Audaz (`agent_31`) | Muere tres veces; dos veces rehace su oro desde menos de 20 hasta más de 1.390; muere definitivamente de hambre con 1.496 de oro. |

**Trazabilidad.** Corrida `data_runtime_step14_a`, seed 2789489010, 7200 ticks. Cada hecho
lleva el identificador del evento. El oro en el tiempo sale del log de decisiones. El estado
inicial se reconstruyó repitiendo la creación del mundo; coincide con el estado guardado en
los 70 agentes. Cada crónica separa sus inferencias y declara lo que el motor no registra.

**Cambios a la herramienta.** `chronicle.mjs` ahora agrega el identificador de evento a cada
hito, el oro al cierre del día, los flujos de oro con monto registrado, los vetos, la memoria
propia y una línea de trazabilidad. Se corrigió un error propio: los eventos de mundo se
atribuían por prefijo de nombre, y "Fenna" coincidía con "Fenna el Manco".

---

## 4. Las cinco decisiones de Product Owner

Datos de las tres corridas del Step 14. Comando:
`node tools/auditoria_po/decisiones_po.mjs <carpeta de corrida>`.

### PO1 — Economía del agente común

**Decisión recomendada.** No ajustar ingresos ni costes. El agente común no está atrapado; su
oro bajo se explica sobre todo por los aportes voluntarios al gremio. Tratar PO1 junto con PO3.

**Evidencia. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Oro final: mediana | 9 | 20 | 31 |
| Percentil 25 / 75 / 90 | 4 / 243 / 8.889 | 6 / 3.047 / 18.558 | 9 / 4.417 / 15.353 |
| Los 5 más ricos tienen | 61 % | 54 % | 41 % |
| Índice de Gini | 0,86 | 0,82 | 0,77 |
| Agentes con menos de 5 de oro al final | 18 | 13 | 5 |
| Mediana de oro en los días 30 / 100 / 200 / 300 | 17 / 20 / 14 / 12 | 24 / 29 / 35 / 62 | 52 / 25 / 27 / 38 |

*¿Puede un trabajador pagar comida y mantenimiento?* Sí. Una jornada rinde 4 de oro a un
herrero, 5 a un curandero y entre 8,3 y 8,7 a un comerciante. Un agente come una vez al día
(mediana 1,0 en los tres mundos). Una comida cuesta entre 1 y 6 de oro según el stock
(precio base 2); el mantenimiento es 1 de oro por pieza equipada por día; la cuota de gremio,
2 o más por semana. El agente mediano hace 0,8 a 1,6 jornadas por día.

*¿Cuánto tarda en recuperarse de una crisis?*

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Renacimientos (oro 0) que vuelven a 15 de oro | 12 de 12 | 27 de 27 | 9 de 9 |
| Tiempo mediano hasta 15 de oro | 19 h | 15 h | 20 h |
| Rachas de pobreza cerradas (bajar de 5 y volver a 15) | 2.696 | 2.200 | 3.051 |
| Duración mediana / percentil 90 | 6 h / 51 h | 9 h / 70 h | 9 h / 61 h |

La pobreza es una oscilación frecuente y corta, no un estado permanente.

*¿Adónde va el oro?* A los gremios.

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Agentes que donaron | 41 de 70 | 35 de 70 | 48 de 70 |
| Aporte medio por agente y día | 7,6 | 5,5 | 8,5 |
| Ingreso medio por trabajo por agente y día | 15,1 | 19,9 | 19,8 |
| Agentes que donaron más de lo que ganaron trabajando | 10 | 6 | 14 |

De los cinco mayores donantes de cada mundo (15 agentes), 14 entregaron entre 82 % y 103 %
de lo que ganaron trabajando; el otro (Farro, mundo c) donó 10.196 habiendo ganado 245
trabajando, así que su oro venía de otra fuente. Trece de los 15 terminaron con 0 a 20 de
oro. Ejemplo: Yosef el Callado (mundo a) ganó 15.650 trabajando, donó 14.865 y terminó con
0. Los 15 tienen lealtad entre 0,68 y 0,90. Los más ricos son lo contrario: Fenna, la mayor fortuna del mundo a, no hizo
ningún aporte.

**Supuestos críticos.** Que el oro del log de decisiones representa bien el oro real (se
registra solo cuando el agente decide; los días sin decisión heredan el último valor). Que
las comidas, cuotas y mantenimiento, que no emiten monto, no esconden otro drenaje mayor.

**Consecuencias no deseadas.** Si se limitaran los aportes, los tesoros crecerían menos y
habría menos oro para los encargos y las disputas de gremio; los malversadores tendrían
menos que robar. Si se subieran los ingresos sin tocar los aportes, el oro extra terminaría
igual en los tesoros.

**Experimento mínimo.** Solo instrumentación, sin cambiar reglas: registrar el monto de
comida, cuotas y mantenimiento para cerrar la contabilidad del agente, y repetir las tres seeds.

**Estado:** decisión provisional.

### PO2 — Robos a gremios no detectados

**Decisión recomendada.** No cambiar la detección todavía. Primero un análisis sin tocar
reglas que diga cuántos robos descubriría cada regla candidata.

**Cómo funciona exactamente. [Hecho, `actions.js`, `malversar_tesoro`]** Al malversar se
buscan testigos: miembros del mismo gremio que estén en la misma ciudad en ese tick. Si hay al
menos uno, es descubierto: cada testigo pierde 70 de afinidad y 60 de confianza hacia el
ladrón y guarda el hecho; el gremio pierde 6 de reputación, lo expulsa y (Step 13) lo veta; los
presentes que no son del gremio se enteran por un evento local. Si no hay testigos, no pasa
nada: el oro sale del tesoro, nadie lo registra y el ladrón sigue siendo miembro.

**Evidencia. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Malversaciones / descubiertas | 111 / 14 (13 %) | 322 / 63 (20 %) | 86 / 24 (28 %) |
| Oro malversado / en las descubiertas | 4.085 / 2.357 | 26.183 / 14.976 | 15.458 / 10.278 |
| Rachas sin descubrir en un mismo gremio | 9 | 39 | 7 |
| Racha más larga | 15 | 25 | 18 |
| Cómo terminan: el ladrón se va / lo descubren / fin de corrida | 7 / 2 / 0 | 26 / 12 / 1 | 4 / 1 / 2 |

La racha de 43 citada en el encargo es del Step 13; en el Step 14 la más larga es de 25. La
mayoría de las rachas termina porque el ladrón se va por su cuenta, sin consecuencia. Las
rachas de 12 robos o más duraron entre 21 y 101 horas; varios gremios víctimas terminan
disueltos porque "su último miembro se fue".

**Consecuencia del retraso. [Inferencia]** El veto del Step 13 solo se activa al ser
descubierto. Un ladrón que roba sin testigos y se va no queda vetado y puede volver.

**Supuestos críticos.** Que el objetivo es que el gremio note la falta de oro, no que sepa
quién fue. Que no se quiere dar a los gremios información que ningún miembro presenció.

**Consecuencias no deseadas.** Una detección más fuerte reduce el único camino por el que hoy
sale oro de los tesoros (ver PO3), y aumenta expulsiones y vetos, con gremios más chicos.

**Experimento mínimo.** Sin cambiar reglas: con los logs actuales se puede reconstruir dónde
estaba cada miembro en cada robo (el log de decisiones guarda la ciudad). Calcular cuántos de
los robos no descubiertos habrían tenido testigo bajo dos reglas candidatas: (a) también
cuenta un miembro en una ciudad vecina; (b) el líder nota la falta en el cobro semanal de
cuotas, sin saber quién fue. El PO elige con ese número.

**Estado:** pendiente de datos.

### PO3 — Tesoros de gremio inmovilizados

**Decisión recomendada.** No agregar mecanismos de gasto. La acumulación es legítima según
las reglas, pero es un problema económico porque es casi un pozo sin fondo. Decidir junto con PO1.

**Evidencia. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Gremios activos al final | 9 | 9 | 14 |
| Tesoro total | 159.369 | 79.544 | 153.134 |
| Oro en manos de todos los agentes | 129.495 | 278.393 | 294.110 |
| Los 3 gremios mayores tienen | 71 % | 73 % | 72 % |
| Gremio mayor | ElsvetCompany: 77.710, 42 miembros | RennaHermandad: 30.892, 14 miembros | DoranCompañia: 67.525, 17 miembros |
| Tesoro perdido en gremios disueltos | 6.611 (44 gremios) | 27.502 (97) | 32.490 (57) |

*Procedencia y usos:*

| Flujo | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Entrada: aportes voluntarios | 159.182 | 115.465 | 179.525 |
| Entrada: recompensas de encargos | 2.333 | 1.930 | 2.571 |
| Salida: malversado | 4.085 | 26.183 | 15.458 |
| Salida: declaraciones de disputa (20 cada una) | 1.860 | 2.240 | 3.080 |
| Salida: multas cubiertas a miembros | 0 casos | 11 casos | 5 casos |

Faltan en la tabla las cuotas semanales (entrada) y el mantenimiento del gremio (salida): no
emiten evento. Por fórmula el mantenimiento es de 0,4 de oro más 0,15 por miembro al día.

*Acumulación legítima o problema.* Es legítima: casi todo el tesoro viene de aportes que los
miembros hacen por decisión propia. Es un problema porque las salidas previstas (disputas,
multas, mantenimiento) son menos del 5 % de las entradas: las disputas son entre 1,2 % y
1,9 % según los eventos, y el mantenimiento, estimado con la fórmula, un orden similar
(**inferencia**: no emite evento). La salida más grande es el robo. Y
cuando un gremio se disuelve, su tesoro desaparece: no vuelve a nadie.

En el mundo a el tesoro total supera a todo el oro en manos de los agentes.

**Supuestos críticos.** Que las cuotas y el mantenimiento no cambian el orden de magnitud.

**Consecuencias no deseadas.** Cualquier gasto nuevo crea un incentivo nuevo; repartir el
tesoro a los miembros reintroduciría una redistribución parecida al ping-pong de regalos del
Step 12.

**Experimento mínimo.** Solo instrumentación: un libro de entradas y salidas por gremio
(cuotas, aportes, encargos, mantenimiento, disputas, multas, robos, disolución) en una corrida
de cada seed.

**Estado:** decisión provisional.

### PO4 — Bajo equipamiento

**Decisión recomendada.** Es la pregunta mejor respaldada y la más acotada. Aprobar un
experimento mínimo sobre la decisión de comprar, no una compra automática.

**La cadena de decisión. [Hecho, del código]**

| Eslabón | Qué hace el motor |
|---|---|
| Necesidad | Fabricar puntúa +1,5 si la ranura está vacía. **Comprar no mira si la ranura está vacía.** |
| Quién puede fabricar | Solo novato, herrero y maestro artesano. |
| Disponibilidad | Hay 10 armas de hierro en cada mercado (3 a 12 al final). No falta stock. |
| Precio | Base 25. Con stock 10 la fórmula de precio lo multiplica por 2,5: 62,5 de oro, más impuesto. |
| Dinero | Se ofrece comprar si el oro alcanza para el precio más 5 %. |
| Prioridad | Comprar puntúa `codicia × 0,4 + meta de riqueza × 0,3`: como máximo 0,7. Conversar puntúa entre 1 y 2,5. |
| Equipar | Puntúa 2,5, pero solo se ofrece si el objeto ya está en el inventario. |

**Evidencia. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Con arma al final | 8 de 70 | 10 de 70 | 14 de 70 |
| De ellos, herreros o novatos | 8 | 9 | 12 |
| Vivos sin arma con 75 de oro o más | 16 | 25 | 24 |
| Compras de equipo por comerciantes | 457 | 820 | 108 |
| Equipo comprado y luego revendido | 438 | 813 | 73 |
| Espera mediana entre comprar y revender | 1 h | 1 h | 2 h |
| Veces que un comerciante equipó algo | 1 | 8 | 5 |
| Armas fabricadas | 403 | 278 | 1.219 |

*¿Hay agentes con oro suficiente que nunca compran?* Sí: entre 16 y 25 agentes vivos por
mundo tienen al menos tres veces el precio base de un arma y no llevan ninguna. Son sobre
todo comerciantes, curanderos y exploradores.

*¿Por qué?* La compra no tiene ningún término que refleje necesitar el arma, así que casi
nunca gana. Los comerciantes sí compran armas, pero como mercancía: las revenden en 1 a 2
horas. **[Inferencia]** Lo hacen por el bono que el código da a comprar y vender durante una
prueba de comercio; el log no registra el motivo de cada compra.

Esto conecta con el Step 14: los que más pierden son comerciantes y curanderos desarmados.

**Supuestos críticos.** Que "con equipo" medido por eventos `equip` aproxima bien el equipo
real. Que el precio de 62,5 es intencional (la fórmula de precio usa un stock de referencia
de 25, pensado para la comida).

**Consecuencias no deseadas.** Más agentes armados significa más peleas ganadas, más oro y
más progresión por combate; también más mantenimiento pagado. Podría vaciar los mercados de armas.

**Experimento mínimo (para aprobar, no implementado).** Un solo término en la puntuación de
comprar: sumar puntos cuando el objeto es un arma, la ranura está vacía y el agente peleó o
perdió una pelea hace poco. Medir en las tres seeds: agentes armados, derrotas sin equipo y
stock de armas.

**Estado:** lista para aprobación.

### PO5 — Concentración en Valdor y Tejor

**Decisión recomendada.** No imponer límites de población. La concentración tiene una causa
identificada (las rutas de huida) y la escasez afecta a Valdor, no a las dos ciudades.
Investigar la decisión de hacia dónde huir antes que el suministro.

**Cómo se produce. [Hecho]** Población por ciudad, reconstruida del log de decisiones:

| Día | Mundo a: Valdor + Tejor | Mundo b | Mundo c |
|---|---|---|---|
| 1 | 15 + 9 = 24 | 8 + 13 = 21 | 12 + 18 = 30 |
| 100 | 17 + 20 = 37 | 22 + 18 = 40 | 20 + 19 = 39 |
| 200 | 30 + 23 = 53 | 24 + 21 = 45 | 30 + 16 = 46 |
| 300 | 30 + 24 = 54 de 67 | 28 + 28 = 56 de 65 | 31 + 18 = 49 de 69 |

Llegadas por motivo, sumando los tres mundos:

| Destino | Huida forzada | Explorar | Encargo | Seguir a un amigo | Arbitraje |
|---|---|---|---|---|---|
| Valdor | 509 | 579 | 159 | 240 | 17 |
| Tejor | 280 | 584 | 153 | 104 | 20 |
| Grisal | 0 | 665 | 185 | 184 | 71 |
| Vannur | 0 | 561 | 142 | 85 | 71 |
| Veldris | 0 | 436 | 131 | 43 | 45 |

Valdor y Tejor reciben 789 llegadas por huida forzada; las otras tres ciudades seguras,
ninguna. Las rutas: Duren → Valdor (147, 148 y 128 por mundo), Brynn → Tejor (83, 120 y 30),
Morvane → Valdor (29, 30 y 27).

**[Hecho, del código]** La regla de supervivencia manda al agente débil a la vecina **más
segura**. Desde Duren y Morvane esa vecina es Valdor (seguridad 0,9); desde Brynn es Tejor
(0,85). Además, al morir se renace en el primer vecino de la lista del lugar de muerte: desde
Duren siempre en Tejor; desde Brynn en Grisal. No existe ninguna regla que saque a un agente
de una ciudad por estar llena.

**Relación con la escasez. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Valdor: población media, días 100 a 300 (máxima) | 25,9 (34) | 23,1 (31) | 28,0 (37) |
| Valdor: comidas por día | 29,4 | 26,1 | 31,0 |
| Valdor: stock de comida al final | 0,3 | 0,3 | 0,3 |
| Tejor: población media (máxima) | 22,9 (30) | 22,2 (31) | 18,2 (25) |
| Tejor: stock de comida al final | 26,9 | 28,2 | 29,2 |
| Grisal y Vannur: stock final | 29,9 | 29,9 | 29,7 a 29,9 |

**[Hecho, del código]** La reposición de comida tiene tope: `0,6 + 0,05 × min(población, 8) +
0,4 por recurso alimentario`. Para Valdor y Tejor da 1,4 por hora, 33,6 comidas por día, sin
importar cuánta gente haya por encima de 8. Un agente consume 0,96 comidas por día, así que
la ciudad sostiene unos 35 agentes. Valdor llega a 34 y 37.

La relación entre concentración y escasez está verificada para Valdor: termina sin comida en
los tres mundos. Para Tejor no: termina con stock casi lleno.

**Relación con las muertes. [Hecho]** Es débil en el Step 14. Muertes por hambre: 2 en el
mundo a, 0 en b, 0 en c. Las dos se analizaron tick a tick:

- **Isvel el Audaz**: con hambre crítica en Duren (sin mercado) huyó a Valdor; desde Valdor
  salió de inmediato por otra decisión de necesidad crítica y murió en el camino. La escasez
  de Valdor es parte de la cadena (**inferencia**: la regla solo lo hace salir si no hay
  comida local; el stock de ese tick no se guarda). Tenía 1.496 de oro.
- **Quilan**: murió en Brynn, que tiene comida, con 18.286 de oro. No tiene relación con la
  concentración (ver hallazgo N1).

**Comparación de opciones.**

| Opción | A favor | En contra |
|---|---|---|
| Mejorar el suministro (subir el tope de reposición) | Un solo número | Trata el síntoma. Un comentario del propio código advierte que más comida atrae más gente. No explica por qué Tejor no tiene escasez. |
| Mejorar la movilidad (que la huida por hambre elija un destino con comida) | Ataca la cadena observada: hoy el hambriento de Valdor va a Tejor y el de Tejor a Valdor | Exige decidir qué sabe el agente sobre la comida de otras ciudades |
| Cambiar la decisión de migrar (salir de una ciudad llena) | Ataca la concentración misma | Es una regla nueva; puede romper gremios y amistades, que hoy se apoyan en la convivencia |

**Supuestos críticos.** Que la población reconstruida (ciudad de la última decisión del día)
aproxima bien la real. Que no hay otro consumidor de raciones relevante además de comer.

**Consecuencias no deseadas.** Dispersar a la población reduce conversaciones, amistades y
gremios grandes. Subir el suministro permite ciudades de 60 agentes.

**Experimento mínimo.** Sin cambiar reglas: registrar el stock de comida por ciudad y día
(hoy solo se guarda el final) y contar, para cada huida por hambre, si el destino elegido
tenía comida y si alguna otra vecina la tenía. Ese número dice si la opción de movilidad vale
la pena.

**Estado:** decisión provisional.

---

## 5. Hallazgos nuevos (registrados, no corregidos)

**N1 — Las invitaciones a grupo dejan a un agente sin turnos. [Hecho]** En `world.js`,
responder una invitación a grupo consume el turno del agente y se resuelve antes que la regla
de supervivencia. Quilan (guerrero de nivel 15, el aliado más fuerte de Brynn) recibió 149
invitaciones en sus últimas 120 horas y tuvo 23 turnos propios. Su último turno propio fue 18
horas antes de morir de hambre, con 18.286 de oro, en una ciudad con comida.
Comando: `node tools/auditoria_po/ultimas_horas.mjs data_runtime_step14_a agent_2 5259 120`.

**N2 — Una prueba de clase que no se puede completar. [Hecho]** Mercader de Ruta exige una
posición de 15 ante `mercado_tejo`. Cuatro agentes del mundo a tienen la prueba abierta con
posición 0 y entre 2.404 y 3.868 operaciones de comercio desde que la iniciaron (la prueba
pide 30). **[Inferencia]** Mientras la prueba sigue abierta, comprar y vender reciben un bono
de puntuación; Fenna dejó de trabajar el día que inició la prueba y perdió 2.116 de oro
comerciando. No se investigó cómo se gana esa posición.

**N3 — El conocimiento de un agente dura horas. [Hecho]** En una ciudad poblada, las 60
entradas de conocimiento se renuevan por completo en una mediana de 9 horas. La percepción de
peligro del Step 9 depende de esas entradas.

**N4 — "Muerte por hambre" no significa pobreza. [Hecho]** Las dos muertes por hambre del
mundo a son de agentes con 1.496 y 18.286 de oro.

---

## 6. Tests ejecutados

Sin modificar reglas. Con `DEEPSEEK_API_KEY` vacía y Ollama apagado.

| Archivo | Resultado |
|---|---|
| `counterfactual.test.js` | pasa |
| `craft_instance.test.js` | pasa |
| `danger_perception.test.js` | pasa |
| `defeat_memory.test.js` (Step 14) | pasa, 9 casos |
| `economic_pressure.test.js` | pasa |
| `embezzlement_friction.test.js` | pasa |
| `equipment_maintenance.test.js` | pasa |
| `geography.test.js` | pasa |
| `guild_ban.test.js` | pasa |
| `help_need.test.js` | pasa |
| `mortality.test.js` | pasa |
| `narrative.test.js` | pasa |
| `survival_override.test.js` | pasa |

13 de 13 archivos terminan sin error. No existe un comando único (`npm test`) que los corra
todos; se ejecutaron uno por uno. No hay tests específicos de combate más allá de los de
memoria de derrotas, mortalidad y contrafactual.

No se hicieron corridas nuevas para esta auditoría: se usaron las 6 corridas existentes de los
Steps 13 y 14.

---

## 7. Archivos creados o modificados

| Archivo | Acción |
|---|---|
| `docs/INFORME_AUDITORIA_PO_STEP14.md` | creado (este informe) |
| `docs/CRONICAS_STEP14.md` | creado |
| `tools/auditoria_po/auditoria_step14.mjs` | creado |
| `tools/auditoria_po/decisiones_po.mjs` | creado |
| `tools/auditoria_po/malversacion.mjs` | creado |
| `tools/auditoria_po/tabla_trayectorias.mjs` | creado |
| `tools/auditoria_po/ultimas_horas.mjs` | creado |
| `tools/auditoria_po/derrotas_resumen.mjs` | creado |
| `chronicle.mjs` | modificado (identificadores de evento, oro, flujos, vetos, memoria, trazabilidad; corrección de atribución por nombre) |
| `src/engine/**` | **sin cambios en esta tarea** |

Todos los scripts son de solo lectura sobre las carpetas de corridas.

---

## 8. Limitaciones

- **Tres seeds.** Las cifras absolutas varían mucho entre mundos; lo consistente son los
  perfiles y las proporciones.
- **Equipo aproximado.** No hay registro del equipo en cada pelea; se usó el último evento
  `equip` desde el renacimiento.
- **Montos no registrados.** Comida, cuotas, mantenimiento, coste de fundar gremio y
  mantenimiento del gremio no emiten monto. La contabilidad de PO1 y PO3 no cierra del todo.
- **Stock de comida.** Solo se guarda el valor final; la escasez en el tiempo se infiere del
  consumo y de la fórmula.
- **Oro en el tiempo.** Sale del log de decisiones: no hay dato en los turnos sin decisión
  propia (viajes, cárcel, invitaciones).
- **Motivos.** El log guarda las razones de la acción elegida, no de las descartadas más allá
  de las seis mejores puntuaciones.
- **Sin corridas nuevas.** Ninguna hipótesis se probó cambiando reglas, por restricción del encargo.

## 9. Siguiente experimento recomendado

**Una corrida de instrumentación, sin cambiar reglas**, en las tres seeds, que registre:

1. el factor de peligro usado y la probabilidad real de derrota de cada pelea decidida (Step 14);
2. el monto de comida, cuotas y mantenimiento por agente, y el libro de entradas y salidas de
   cada gremio (PO1 y PO3);
3. el stock de comida por ciudad y día (PO5).

Con eso, tres de las cinco decisiones pasan de "provisional" a "lista para aprobación" sin
haber tocado el comportamiento del mundo. PO4 ya puede aprobarse como experimento. PO2
necesita solo el análisis de testigos sobre los logs actuales.

Orden sugerido si el PO quiere actuar antes: PO4 (compra de armas por necesidad) y la opción A
del Step 14 (calibrar el factor de peligro) atacan la misma cadena, la de los agentes que
pelean desarmados, y son los dos cambios con la causa mejor confirmada.
