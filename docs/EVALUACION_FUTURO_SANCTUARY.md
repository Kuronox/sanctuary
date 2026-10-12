# Sanctuary — Evaluación crítica: valor narrativo, calidad de la simulación e hipótesis de juego

Fecha: 2026-10-10. Respuesta al encargo del Product Owner. No se modificó código, reglas,
parámetros, semillas ni configuraciones, y no se ejecutó ninguna simulación. Toda la
evidencia sale de `docs/INFORME_AUDITORIA_PO_STEP14.md`, `docs/CRONICAS_STEP14.md` y los
reportes de los Steps 10 a 14.

Convención: **[Hecho]** medido o leído en el código; **[Inferencia]** deducido, no observado;
**[Hipótesis]** sin comprobar; **[Riesgo]**; **[Recomendación]**.

## Respuesta corta

- Las tres crónicas **no** demuestran que el mundo produzca historias de forma consistente.
  Son tres casos elegidos por llamativos, y parte de su interés viene de defectos del motor.
- La simulación tiene dos clases de problemas que conviene no mezclar: los que rompen la
  coherencia del mundo (pocos y acotados) y los que son vacíos de diseño o rasgos legítimos.
- La hipótesis del juego no tiene evidencia propia. Lo único verificado es técnico. Y hay un
  dato de nuestras propias corridas que juega en contra.
- Siguiente paso recomendado: un **censo narrativo con muestra al azar** sobre las corridas
  que ya existen. Sin cambios de reglas y sin simulaciones nuevas.

---

## 1. El valor narrativo del mundo

### Lo que las crónicas sí demuestran

- **[Hecho]** El mundo registra lo suficiente para reconstruir una vida completa y
  verificable: cada afirmación de las tres crónicas lleva su evento.
- **[Hecho]** Existe al menos una cadena de consecuencia que funciona de punta a punta. En el
  mundo a, Ulra pasó de terminar con 40.184 de oro (Step 12) a terminar con 195 (Step 14),
  vetada en 14 gremios, sin reingresos tras expulsión en ninguno de los tres mundos.

### Por qué son casos seleccionados

- **[Hecho]** Las elegí yo, mirando una tabla de los 70 agentes, con criterios de búsqueda
  que favorecen lo extremo.
- **[Hecho]** Fenna es la mayor fortuna de la corrida: el número 1 de 70.
- **[Hecho]** Ulra no es un personaje emergente. Es el "sujeto de control": su personalidad se
  fija a mano al crear el mundo. En los tres mundos el principal malversador es ese mismo
  agente (`agent_1`).
- **[Hecho]** Isvel el Audaz es una de las 3 muertes definitivas entre 70 agentes.
- **[Hecho]** Descarté a Kelas el Callado para la tercera crónica porque su segunda vida
  tenía pocos eventos propios. Es decir, ya encontré un agente que no daba para una crónica.
- **[Hecho]** En esa corrida solo 8 de 70 agentes murieron alguna vez, y 41 de los 67 vivos
  terminan con menos de 15 de oro.

**[Inferencia]** La vida típica es mucho más plana que las tres elegidas: un cambio de clase,
trabajo, conversación y aportes al gremio. No lo medí; es lo que sugiere la tabla.

### El problema más serio: el interés viene en parte de los defectos

| Crónica | Lo que la hace interesante | De dónde sale |
|---|---|---|
| Fenna | El giro del día 175: deja de trabajar y comercia a pérdida | **[Hecho]** Una prueba de clase que no puede completarse. Es un defecto. |
| Isvel el Audaz | Muere de hambre con 1.496 de oro, camino a otra ciudad | **[Hecho]** Huyó a Valdor. **[Inferencia]** Valdor no tenía comida. Defecto parcial. |
| Ulra | Roba, la vetan, decae | **[Hecho]** Personalidad puesta a mano más una regla que sí funciona (el veto). |

**[Riesgo]** Un defecto que se lee como historia es peor que uno que se nota: nos convence de
que el mundo tiene valor narrativo cuando lo que vemos es un artefacto. Al corregir la prueba
de clase, el giro de Fenna desaparece.

### Hechos, interpretaciones e inferencias en lo ya entregado

| Tipo | Ejemplos |
|---|---|
| Hecho registrado | Fechas, montos, muertes, vetos, oro al cierre del día |
| Interpretación mía | Los títulos ("la comerciante que dejó de trabajar", "dos fortunas rehechas"), el orden del relato, qué se cuenta y qué se resume |
| Inferencia | Que el bono de la prueba hizo que Fenna dejara de trabajar; que Valdor no tenía comida en el tick 5743; en qué gastó Ulra su oro |

**[Hecho]** La prosa la escribí yo a partir de fichas. Lo que la herramienta produce sola es
una lista de hitos con resúmenes del tipo "…y 109 malversaciones más". La legibilidad de las
crónicas no es, todavía, una capacidad del sistema.

### Veredicto del punto 1

**Capacidad demostrada:** reconstruir una vida con trazabilidad.
**No demostrado:** que una vida cualquiera sea interesante, ni cuántas lo son, ni que lo sean
en otros mundos. Hay crónicas de una sola seed, ninguna de un agente elegido al azar y ningún
lector que no seamos nosotros dos.

---

## 2. La calidad de la simulación

### Criterio de separación

Un defecto **rompe la coherencia** cuando un lector no puede explicarlo con hechos del mundo y
hay que recurrir al funcionamiento interno del motor. Un rasgo es **legítimo** cuando se
explica por el carácter del personaje o por las reglas visibles del mundo, guste o no.

### Rompen la coherencia

| Problema | Por qué rompe | Evidencia |
|---|---|---|
| Invitaciones a grupo que consumen el turno | Un guerrero rico muere de hambre junto a un mercado lleno. No hay explicación dentro del mundo. | **[Hecho]** Quilan: 149 invitaciones y 23 turnos propios en 120 horas |
| Estimación de peligro incorrecta | El personaje "cree" segura una pelea que pierde 1 de cada 3 veces, sin motivo de carácter | **[Hecho]** Poder 6 contra 5: factor máximo, derrota real 33 % |
| Prueba de clase imposible | Miles de operaciones para una prueba que pide 30 | **[Hecho]** 4 agentes, 2.404 a 3.868 operaciones, posición 0 |
| Nadie compra un arma para usarla | Agentes ricos que pelean desarmados; comerciantes que compran armas y las revenden en 1 a 2 horas | **[Hecho]** 16 a 25 agentes por mundo con oro de sobra y sin arma |
| El conocimiento dura horas | Lo que un personaje "sabe" del mundo se borra en una mediana de 9 horas en una ciudad poblada | **[Hecho]** Medido en el Step 14 |

El último es el más importante para el rumbo narrativo: si lo que un agente presencia se
olvida en horas, las consecuencias a largo plazo solo pueden venir de reglas puestas a mano,
como el veto.

### Rasgos legítimos o vacíos de diseño

| Problema | Clasificación | Por qué |
|---|---|---|
| Desigualdad (Gini 0,77 a 0,86) | Rasgo legítimo | Sale del carácter: los leales donan casi todo, los codiciosos no. Es material narrativo. |
| Tesoros de gremio inmovilizados | Vacío de diseño | El oro entra por decisión de los miembros; lo que falta es para qué sirve. No es incoherente. |
| Concentración en Valdor y Tejor | Mixto | Huir a la ciudad más segura es coherente. Que todas las rutas de huida lleven a dos ciudades es geografía del mundo semilla. |
| Escasez de comida en Valdor | Ajuste | Un tope de reposición fijo frente a una ciudad que crece. |
| Muerte de Isvel el Audaz | Mixto | "Murió en el camino buscando comida" se puede contar. La regla que lo mandó a una ciudad sin comida, no tanto. |

### Dos observaciones sobre la simulación en conjunto

- **[Hecho]** Cuatro Steps seguidos destaparon algo que el anterior tapaba: al corregir la
  huida aparecieron los regalos; al corregir los regalos, las peleas sin equipo y los aportes
  al gremio; al auditar las derrotas, el cálculo de peligro.
  **[Riesgo]** No sabemos cuántos ciclos dominantes quedan. Cada arreglo puede revelar otro.
- **[Hecho]** Con la misma regla de supervivencia, el combate en grupo va de 639 a 4.259
  según la seed; y en una misma seed fue 1.908, 2.776 y 4.259 en tres Steps que no tocaron
  el combate. **[Riesgo]** Cualquier conclusión sacada de una
  sola corrida, incluida una crónica, puede ser un accidente.

---

## 3. La hipótesis del juego

Mi propuesta fue: el jugador es un patrón o alcalde con pocas acciones y vuelve cada día a
leer una crónica. La di en una respuesta rápida, sin evidencia. Revisada con criterio:

### Evidencia a favor

Toda es técnica. **[Hecho]**

- Simular 300 días toma unos 4 minutos: calcular lo ocurrido "mientras no estabas" es barato.
- El modo determinista permite reproducir y auditar cualquier corrida.
- Existe una herramienta que arma la vida de un agente a partir de los registros.

No hay ninguna evidencia sobre jugadores. Que las crónicas nos interesen a dos personas que
construyeron el mundo no cuenta como evidencia.

### Evidencia en contra, de nuestras propias corridas

- **[Hecho]** En el Step 11, un solo agente que descansó en vez de viajar el día 1 cambió toda
  la trayectoria del mundo.
  **[Inferencia]** Si un cambio mínimo altera todo, el jugador no podrá ver qué efecto tuvo
  su acción. El resultado de "financiar un gremio" se perdería en el ruido. Un juego de pocas
  palancas depende justo de que la consecuencia sea atribuible.
- **[Hecho]** Los nombres se repiten: en el mundo a hay seis agentes llamados Isvel, cuatro
  Ulra y tres Quilan, distinguidos solo por un apodo.
  Yo mismo atribuí a Fenna un evento de "Fenna el Manco". **[Riesgo]** Sin identidad clara no
  hay apego a un personaje.
- **[Hecho]** Las muertes ocurren cada 9 a 30 días de juego (10 a 32 por corrida).
  **[Hipótesis]** El mundo se asienta: la población por ciudad casi no cambia después del día
  200 y la mediana de oro es plana. Un resumen diario podría quedarse sin novedades.

### Lo que estamos suponiendo

| Supuesto | Estado |
|---|---|
| Leer lo que pasó es una recompensa suficiente | Sin evidencia |
| Un día de juego tiene novedades suficientes | Sin evidencia; el indicio disponible es desfavorable |
| El jugador se encariña con personajes concretos | Sin evidencia |
| Pocas acciones producen consecuencias visibles | El indicio disponible es desfavorable |
| Una crónica de 300 días y un resumen diario son lo mismo | **Falso.** Validamos la biografía, no el resumen diario |

El último punto es mi error de fondo. El interés de la vida de Fenna está en el arco de 300
días. Un día cualquiera de Fenna es "trabajó catorce veces". El artefacto que la hipótesis
necesita no existe ni se ha probado.

### Qué tendría que experimentar un jugador para volver al día siguiente

1. **Una pregunta abierta:** algo pendiente cuyo desenlace quiera conocer. La crónica mira
   hacia atrás; no deja nada por resolver.
2. **Una consecuencia propia y visible:** que lo que hizo ayer se note hoy y pueda decir "eso
   fue por mí".
3. **Alguien que le importe:** dos o tres personajes reconocibles, no setenta.
4. **Novedad:** que hoy no se parezca a ayer.
5. **Algo que perder.**

Hoy el mundo ofrece, como mucho, material para el punto 3.

### Veredicto del punto 3

Es una idea, no una hipótesis respaldada. No conviene invertir en ella todavía.

---

## 4. El siguiente paso

### Las dos líneas, sin mezclar

| | A. Validar la simulación como mundo que genera historias | B. Validar si hay una experiencia de juego |
|---|---|---|
| Pregunta | ¿El mundo produce vidas que valga la pena leer, de forma consistente? | ¿Alguien quiere volver mañana? |
| Qué necesita | Los registros que ya existen, y luego corregir defectos de coherencia | Lectores ajenos al proyecto y un resumen diario que todavía no existe |
| Riesgo propio | Volver al laboratorio de ajustes sin criterio de parada | Probar con material elegido y escrito a mano: daría un falso positivo |
| Depende de la otra | No | Sí: probar B sobre un mundo con artefactos mide los artefactos |

### Orden de trabajo propuesto

1. **Medir** el rendimiento narrativo con lo que ya hay. Sin cambios.
2. **Decidir** con ese número si la línea A merece seguir.
3. Si sigue: corregir **solo** los defectos que rompen la coherencia, uno por Step, en tres
   seeds, y volver a medir con el mismo instrumento. No tocar economía ni tesoros todavía.
4. Recién entonces abrir B, y abrirla sin producto: mostrar a tres o cinco personas ajenas
   crónicas de agentes **no elegidos** y observar si preguntan qué pasó después.
5. Solo si el paso 4 es positivo, pensar qué puede hacer un jugador.

Las cinco decisiones de PO siguen como están en la auditoría. PO4 (comprar armas por
necesidad) y la calibración del peligro pertenecen al paso 3. PO1, PO3 y PO5 pueden esperar:
son rasgos o vacíos de diseño, no incoherencias.

---

## Recomendación única

**Hacer un censo narrativo con muestra al azar sobre las tres corridas del Step 14 que ya
están guardadas.**

**Qué es.** Dos cosas, ambas de solo lectura:

- Un conteo sobre los 210 agentes (70 por mundo) de cuántas vidas tienen al menos un punto de
  giro, con una definición fijada antes de mirar: una muerte, un veto, un cambio de clase
  posterior al primer mes, o una caída de oro de más de la mitad desde su máximo. Para cada
  giro, anotar si se explica por una regla del mundo o por uno de los defectos conocidos.
- Nueve crónicas de agentes elegidos **por sorteo fijado de antemano** (tres por mundo),
  armadas con el mismo método que las tres ya entregadas.

**Por qué este y no otro.**

- Responde directamente la pregunta que hoy bloquea todo: ¿casos aislados o capacidad consistente?
- Cuesta poco: no cambia reglas, no requiere simulaciones nuevas ni APIs, y usa herramientas
  que ya existen. Requiere su autorización porque implica leer las corridas guardadas.
- Sirve a las dos líneas: da el instrumento de medida que la línea A no tiene, y deja listo
  el material no elegido que la línea B necesitaría después.
- Evita los dos errores posibles: seguir ajustando el motor sin saber si mejora lo que
  importa, y probar un juego sobre material escogido.

**Qué resultado permite decidir.** Los umbrales los fija el PO antes de ver los datos. Como
propuesta:

| Resultado | Decisión |
|---|---|
| Menos de 1 de cada 5 vidas tiene un giro explicable por el mundo, y menos de 3 de las 9 crónicas al azar se sostienen | El mundo no genera historias de forma consistente. La línea A cambia de objetivo: hacen falta más acontecimientos con peso, no más correcciones. La línea B queda cerrada por ahora. |
| Los giros existen pero la mayoría viene de defectos | Línea A, paso 3: corregir los defectos de coherencia y medir cuánto valor narrativo sobrevive. |
| Al menos 1 de cada 5 vidas tiene un giro legítimo y 3 o más de las 9 crónicas se sostienen | El mundo tiene base. Corregir los defectos de coherencia y después abrir la línea B con el material no elegido. |

**Limitación de esta recomendación.** "Se sostiene" lo juzgaría yo, que escribí las
anteriores. Para reducir ese sesgo, las nueve crónicas deberían leerlas el PO o alguien ajeno
sin saber cuáles giros vienen de defectos.
