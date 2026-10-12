# Sanctuary — Evaluación del sistema de tesorería de los gremios

Fecha: 2026-10-10. Encargo del Product Owner. Análisis conceptual sobre evidencia existente.
**No se modificó código, reglas, parámetros ni datos; no se ejecutaron simulaciones; no hay commit.**

Fuentes: `docs/INFORME_AUDITORIA_PO_STEP14.md` (citado como "auditoría"),
`docs/CRONICAS_STEP14.md`, reportes de los Steps 12 a 14, la tabla de trayectorias del mundo a
(`tools/auditoria_po/tabla_trayectorias.mjs`) y lectura del código actual. Las cifras "por
mundo" van en el orden a / b / c y son de las corridas del Step 14.

Convención: **[Hecho]**, **[Inferencia]**, **[Hipótesis]**, **[Recomendación]**.

---

## 1. Diagnóstico

### El problema real

**El tesoro no sirve para nada que un miembro pueda notar.** El oro entra por decisión de los
miembros y no vuelve a ellos de ninguna forma: no los protege, no los equipa, no los alimenta
y no decide el resultado de una disputa. El saldo alto es la consecuencia, no el problema.

Tres hechos lo sostienen:

- **[Hecho]** Donar no depende de nada salvo del carácter. La puntuación de aportar es
  `lealtad × 1,8 + meta de pertenencia × 0,5`, se ofrece con 5 de oro o más, y no mira cuánto
  tiene el gremio, cuánto le queda al agente ni si el gremio necesita algo.
- **[Hecho]** El tesoro no influye en las disputas. El ganador es el gremio cuyos miembros
  aportaron más poder de combate; el oro solo paga los 20 de inscripción.
- **[Hecho]** Las salidas previstas suman menos del 5 % de las entradas (auditoría, PO3).

### Lo que no es el problema

- No es que haya "demasiado oro". En el mundo b el tesoro total (79.544) es menos de un tercio
  del oro en manos de los agentes (278.393).
- No es que los agentes donen "por error". Donar mucho es coherente con ser leal.

### Lo que no sabemos todavía

| Pregunta | Por qué importa |
|---|---|
| ¿Cuántos de los que pelean sin arma son miembros de un gremio con fondos, y cuántos de ellos no pueden pagarla por su cuenta? | Decide si una armería ayudaría a alguien que hoy no puede ayudarse solo |
| ¿Cómo evoluciona cada tesoro en el tiempo? | Solo se guarda el saldo final; cuotas y mantenimiento no emiten evento |
| ¿Hay miembros con hambre en gremios ricos? | El hambre por agente está en el log de decisiones, pero no se cruzó con gremios |
| ¿Qué pasa con las donaciones si el gremio da algo a cambio? | No hay ningún antecedente: nunca existió una salida hacia los miembros |

---

## 2. Evidencia

Todas las cifras de esta sección están en la auditoría, salvo donde se indica.

**Acumulación y origen. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Tesoro total de gremios activos | 159.369 | 79.544 | 153.134 |
| Oro en manos de los agentes | 129.495 | 278.393 | 294.110 |
| Los 3 gremios mayores concentran | 71 % | 73 % | 72 % |
| Entrada: aportes voluntarios | 159.182 | 115.465 | 179.525 |
| Entrada: recompensas de encargos | 2.333 | 1.930 | 2.571 |
| Salida: malversado | 4.085 | 26.183 | 15.458 |
| Salida: inscripciones a disputas | 1.860 | 2.240 | 3.080 |
| Tesoro perdido en gremios disueltos | 6.611 (44 gremios) | 27.502 (97) | 32.490 (57) |

**Quién dona. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Agentes que donaron | 41 de 70 | 35 de 70 | 48 de 70 |
| Aporte medio por agente y día | 7,6 | 5,5 | 8,5 |
| Ingreso medio por trabajo por agente y día | 15,1 | 19,9 | 19,8 |

De los 15 mayores donantes, 14 entregaron entre 82 % y 103 % de lo que ganaron trabajando, y
13 terminaron con 0 a 20 de oro. Todos tienen lealtad entre 0,68 y 0,90.

**Quién pelea sin arma. [Hecho]**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Agentes con arma al final | 8 de 70 | 10 de 70 | 14 de 70 |
| Vivos sin arma con 75 de oro o más | 16 | 25 | 24 |
| Derrota en pelea individual sin equipo / con equipo | 13,5 % / 6,2 % | 34,0 % / 9,5 % | 31,0 % / 7,0 % |

Un arma de hierro cuesta 62,5 de oro en el mercado (base 25, con stock 10). Comprarla puntúa
como máximo 0,7 y no considera si la ranura está vacía.

**Un dato que complica la armería. [Hecho, tabla de trayectorias del mundo a]** Donantes y
combatientes son personas distintas.

| Agente | Papel | Jornadas | Peleas individuales | Oro final | Gremio |
|---|---|---|---|---|---|
| Yosef el Callado | Mayor donante | 1.676 | 14 | 0 | ElsvetCompany |
| Quilan el Viejo | Donante | 3.220 | 0 | 2 | ElsvetCompany |
| Isvel el Callado | Donante | 1.760 | 0 | 0 | ElsvetCompany |
| Morden | Pierde 33 peleas, sin equipo | 936 | 91 | 8.889 | IsvelCirculo |
| Quilan de las Colinas | Pierde 24, sin equipo | 928 | 68 | 11.314 | ElsvetCompany |
| Lyssa | Pierde 26, sin equipo; muerte definitiva | 79 | 55 | 22 | ElsvetCompany |

ElsvetCompany tiene 42 miembros y 77.710 de oro. Lyssa murió definitivamente con 22 de oro,
siendo miembro del gremio más rico de su mundo; todas sus derrotas fueron sin equipo según la
aproximación de la auditoría (ningún evento de equipar desde su último renacimiento). Morden
y Quilan de las Colinas, con su oro final, podían pagar el arma más de cien veces y no llevan
ninguna.

**[Inferencia]** Hay dos causas distintas de pelear desarmado: no decidir comprar (la mayoría
de los casos vistos) y no poder pagar (Lyssa). Un tesoro solo resuelve la segunda.

**Sistema territorial actual. [Hecho, del código]**

- Cada 30 días se anuncia una disputa por una de cinco localizaciones.
- El líder inscribe al gremio pagando 20 del tesoro. Los miembros aportan su poder de combate,
  lo que les cuesta fatiga y nada de oro.
- Gana quien sumó más poder. Recibe 10 de reputación y, durante 30 días, sus miembros tienen
  en esa localización 3 % de descuento de impuesto y 20 % de probabilidad de recolectar una
  unidad extra.
- Solo existe un bono a la vez en todo el mundo; cada disputa nueva reemplaza al anterior.
- El campo `claims` del gremio ("territorios reclamados") está declarado y no se usa.

No existen territorios anexados, propiedad persistente ni consecuencias por perder una disputa
más allá de las relaciones entre gremios.

**Disolución. [Hecho, del código]** Un gremio se disuelve cuando se queda sin miembros (el
último se va, muere o es expulsado) o tras 10 días con el tesoro en 0. El gremio queda marcado
como disuelto y su tesoro permanece en el registro, fuera de la economía.

---

## 3. Comparación de alternativas

Sin puntuaciones numéricas. Donde hay evidencia se cita; donde no, se dice.

| Criterio | A. Armería | B. Recompensas periódicas | C. Mantenimiento de territorios | D. Destino del tesoro al disolverse |
|---|---|---|---|---|
| 1. Problema real que resuelve | Miembros que pelean desarmados **y no pueden pagar** el arma | Que donar no devuelva nada; reconocimiento | Que el oro no decida nada en lo territorial | Oro que desaparece sin explicación |
| 2. Evidencia en la auditoría | Fuerte para "pelean desarmados"; débil para "no pueden pagar" (la mayoría sí puede) | Indirecta: los donantes terminan sin oro, pero no hay evidencia de que eso cause un daño | Ninguna: no hay dato de que el territorio importe a los agentes | Directa: 6.611 / 27.502 / 32.490 de oro perdidos |
| 3. Economía individual y colectiva | Convierte oro inmóvil en equipo; sube el mantenimiento que paga cada miembro (1 de oro por pieza y día) | Si paga en oro, devuelve liquidez a quien la vuelve a donar | Saca oro del mundo; no llega a los miembros | Devuelve entre 5 % y 11 % del oro de los agentes a la circulación, según a quién vaya |
| 4. Combate y supervivencia | Alto y favorable: con arma, la derrota de un comerciante baja de 33 % a 5 % contra el lobo y de 56 % a 16 % contra el bandido (cálculo sobre las reglas de combate) | Ninguno si paga oro; igual que A si paga equipo | Ninguno directo | Ninguno |
| 5. Historias emergentes | Medio: favoritismo, el que se va con el arma, el gremio que arma a sus peleadores y no a sus trabajadores | Alto: el líder que se queda con el cofre, el leal no reconocido | Bajo hoy; alto solo si perder un territorio tuviera consecuencias que aún no existen | Bajo a medio: el último que queda |
| 6. Riesgo de explotación | Entrar, recibir el arma, irse; agremiados muy superiores a independientes | Ciclo donar → cobrar → donar; premiar siempre a los mismos | Gasto fijo sin decisión; gremios chicos excluidos | Quedarse último para llevarse el tesoro |
| 7. Complejidad | Media. El equipo no tiene dueño registrado: prestar exige un registro nuevo | Alta. No existe registro de aportes por miembro ni de desempeño | Alta. Propiedad, beneficio y pérdida son sistemas nuevos | Baja. Un solo punto del código |
| 8. Dependencias | De que el miembro quiera el arma (decisión PO4) y del cálculo de peligro (Step 14) | De cómo se decide donar; de la detección de malversación (PO2) | Del sistema de disputas, que habría que ampliar | Casi ninguna |
| 9. Métricas para comprobarlo | Miembros armados; derrotas sin equipo de agremiados frente a independientes; stock y precio de armas | Oro que vuelve al tesoro tras el reparto; concentración de premios; salidas de gremio tras un reparto | Territorios mantenidos y perdidos; gasto frente a beneficio | Oro perdido en disoluciones; quién lo recibe; fundaciones y abandonos |
| 10. Reversibilidad y aislamiento | Media: cambia combate y economía a la vez | Baja: toca donaciones, lealtad y liderazgo | Baja: sistema nuevo | Alta: efecto acotado y fácil de medir |

### Notas por alternativa

**A. Armería.**

- *Quién recibe.* El único criterio que ataca el problema documentado es la **necesidad**:
  miembro sin arma que pelea. Repartir por contribución armaría a trabajadores que no pelean
  (los mayores donantes del mundo a hicieron entre 0 y 14 peleas).
- *Grado de autonomía.* Tres formas posibles, de menor a mayor control central:
  1. el miembro decide comprar y el gremio paga;
  2. el líder decide a quién equipar;
  3. una regla automática. Esta última contradice la indicación previa del PO de no
     implementar compra automática.

  La primera conserva la decisión en el agente, pero **depende de que el agente quiera el
  arma**, y hoy esa decisión casi nunca gana.
- *Si el miembro se va, es expulsado o muere.* **[Hecho]** Al morir y renacer el equipo ya se
  pierde. Para la salida voluntaria hay dos caminos: registrar la propiedad (mecánica nueva) o
  aceptar que se lo lleva y que eso deje un recuerdo negativo en los que se quedan, como hoy
  ocurre con el fundador que abandona. El segundo usa lo que existe.
- *Mercados.* **[Hecho]** Hay unas 10 armas por mercado y solo se puede comprar con stock
  mayor que 3; el precio sube cuando el stock baja. **[Inferencia]** Un gremio de 42 miembros
  no puede armarse en una sola ciudad. Los herreros fabrican entre 278 y 1.219 armas por
  corrida; que el gremio compre a sus propios herreros sería coherente y es más complejo.

**B. Recompensas.**

- **[Inferencia]** Si el premio es oro, el miembro leal lo vuelve a donar, porque donar no
  tiene límite. Sería el mismo ciclo que se quitó en el Step 12, ahora entre miembro y tesoro.
- Premiar por participación en disputas premia el poder de combate, es decir, a quien ya es
  fuerte. Premiar por aportes premia al leal que trabaja. Son poblaciones distintas (ver tabla
  de la sección 2).
- Un premio en equipo o en algo no transferible evita el ciclo, y entonces B se parece a A con
  otro criterio de reparto.
- Es la alternativa con más superficie de diseño y la más difícil de aislar.

**C. Territorios.** Hoy el "territorio" es un bono pequeño, temporal y único. Cobrar
mantenimiento por eso sería un gasto artificial, que el encargo pide evitar. Para que tenga
sentido haría falta primero que poseer un territorio signifique algo y que perderlo duela.

**D. Disolución.** Cuatro destinos posibles:

| Destino | A favor | En contra |
|---|---|---|
| Se pierde (actual) | Simple; ya funciona | No tiene explicación dentro del mundo |
| Al último miembro | Usa lo que existe | Premia quedarse último; el que funda y abandona gremios en serie se beneficiaría |
| Reparto por aportes | Es lo más justo | No existe registro de aportes por miembro |
| A la ciudad (reserva de oro del mercado) | Usa una entidad existente; el oro vuelve a circular sin premiar a nadie | No reconoce a los miembros |

---

## 4. Comportamientos emergentes (hipótesis)

Todo lo de esta sección es **[Hipótesis]**: ninguno de estos comportamientos se ha observado.

**Qué distingue hoy a tres tipos de gremio: nada.** **[Hecho]** El líder solo decide aceptar
encargos e inscribirse en disputas. Un líder generoso y uno oportunista administran el tesoro
exactamente igual, porque no hay nada que administrar.

| Tipo de gremio | Con armería (A) | Con recompensas (B) |
|---|---|---|
| **Solidario** (líder empático) | Arma primero a los miembros débiles que pelean. Menos muertes, tesoro más bajo. | Reparte parejo. Los leales reciben y vuelven a donar. |
| **Militarista** (líder ambicioso) | Arma a los más fuertes para ganar disputas. Los trabajadores financian a los peleadores. | Premia a quien más poder aporta. Los trabajadores podrían irse. |
| **Oportunista** (líder codicioso y desleal) | Se arma a sí mismo o no gasta. | Se queda el cofre. Si lo descubren, pierde miembros y reputación. |

El caso oportunista ya existe en parte como malversación. Con cualquiera de las dos
alternativas, la diferencia entre gremios pasaría a ser visible y a tener consecuencias.

**El leal que lo da todo.** Con una armería por necesidad, quien más dona no recibe nada si
no pelea. Eso puede leerse como injusticia y como material narrativo, o como un defecto si lo
que se quiere es reconocer la contribución.

---

## 5. Riesgos y dependencias

**La cadena equipo → combate → donaciones → supervivencia.**

1. **Equipo y cálculo de peligro.** **[Hecho]** El motor ya cree que pelear contra el lobo es
   seguro para un agente desarmado. **[Inferencia]** Armar a más agentes no corrige esa
   estimación; solo hace que acierte más seguido. Si después se calibra el peligro (opción A
   del Step 14), los dos cambios se superponen y no se podrá saber cuál produjo qué.
2. **Equipo y decisión de compra.** Si se aprueba PO4 (comprar un arma por necesidad), los
   agentes ricos se arman solos. La armería quedaría para quienes no pueden pagar, cuyo número
   se desconoce. Hacer ambas a la vez impide medir cada una.
3. **Equipo y mantenimiento.** **[Hecho]** Cada pieza equipada cuesta 1 de oro por día a quien
   la lleva. **[Inferencia]** Armar a un miembro pobre le crea un gasto diario que hoy no tiene.
4. **Donaciones sin límite.** Mientras donar no mire nada, cualquier oro que el gremio devuelva
   a un leal tiende a volver al tesoro.
5. **Malversación.** **[Hecho]** Solo entre 13 % y 28 % de los robos se descubre.
   **[Inferencia]** Un tesoro que además reparte cosas ofrece más motivos para entrar a robar.
6. **Agremiados frente a independientes.** En el mundo a, 64 de 70 agentes están en un gremio.
   Una ventaja militar por pertenecer dejaría a los pocos independientes en clara desventaja.
7. **Sensibilidad del mundo.** **[Hecho]** Cuatro Steps seguidos destaparon un ciclo que el
   anterior tapaba, y el combate en grupo varía hasta cuatro veces entre trayectorias. Una
   mecánica nueva de gremio toca los tres sistemas más inestables a la vez.

**Decisiones previas del PO que estas alternativas rozan.**

- "No implementar compra automática" (PO4): excluye la forma automática de A.
- "No inventar mecanismos de gasto para resolver el síntoma" (PO3): C, tal como está hoy el
  sistema territorial, caería ahí.
- Orden de trabajo de `EVALUACION_FUTURO_SANCTUARY.md`: medir primero, luego corregir solo
  defectos de coherencia. Una mecánica nueva de tesorería no es una corrección de coherencia.
  Estudiarla es compatible con ese orden; implementarla ahora lo cambiaría.

---

## 6. Recomendación

**[Recomendación]** Esto es qué estudiar primero, no una autorización para construirlo.

**Estudiar primero la armería (A), en su forma por necesidad, y solo después de resolver la
decisión de compra individual (PO4).**

Razones:

- Es la única alternativa atada a un daño documentado: agentes que pierden y mueren por pelear
  desarmados siendo miembros de gremios con fondos.
- Le da al tesoro una función comprensible dentro del mundo: proteger a los suyos.
- Hace visible, por primera vez, la diferencia entre un líder solidario, uno militarista y uno
  oportunista.

Reservas:

- Su valor real puede ser pequeño. Si la mayoría de los desarmados puede pagar su arma, lo que
  falta es la decisión de comprar, y eso no lo arregla un tesoro. Por eso va después de PO4.
- No reconoce a los que más aportan, porque no son los que pelean.

**Sobre las otras tres:**

- **D** puede decidirse por separado y antes: es chica, aislada y fácil de medir. De los cuatro
  destinos, el oro a la ciudad es el que menos incentivos nuevos crea. No es urgente.
- **B** conviene dejarla para cuando se decida si donar debe tener algún límite. Sin eso,
  reproduce el ciclo del Step 12.
- **C** no debería estudiarse hasta que exista algo que mantener.

### Respuestas a las preguntas de diseño

| Pregunta | Respuesta propuesta |
|---|---|
| ¿Qué debe priorizar el tesoro? | La supervivencia de los miembros. Es donde hay daño medido. Poder militar y territorio no tienen evidencia; cohesión social llega como efecto. |
| ¿Qué diferencia a un gremio solidario, uno militarista y uno oportunista? | Hoy nada. La diferencia debería salir de **a quién** decide favorecer el líder, usando rasgos que ya existen (empatía, ambición, codicia, lealtad). |
| ¿Cómo reconocer la contribución sin crear una competición? | Con memoria y relaciones, no con un marcador. El motor ya guarda recuerdos con peso entre agentes; un ranking de aportes convertiría el gremio en una tabla de posiciones. |
| ¿Qué incentiva a donar todo y depender del gremio? | Ya ocurre sin incentivo: donar no mira la reserva propia. Cualquier beneficio por donar lo acentuaría. |
| ¿Qué debería pasar si el gremio es rico y sus miembros pasan hambre o van mal equipados? | Es la situación actual (Lyssa). Lo coherente es que el gremio pueda responder y que **no hacerlo tenga un costo social** para el líder. |
| ¿Qué debe surgir de los agentes y qué necesita regla explícita? | De los agentes: a quién se ayuda, quién se va, quién roba. Regla explícita: qué puede pagar el tesoro y qué pasa con lo entregado cuando alguien se va. |

---

## 7. Experimento mínimo

**Sin mecánica nueva, sin simulaciones nuevas, solo lectura de las tres corridas del Step 14.**
Requiere autorización porque implica leer los registros guardados.

**Qué medir:**

1. **Para cada pelea individual perdida sin equipo:** si el agente era miembro de un gremio, y
   si su propio oro alcanzaba para un arma en ese momento. El log de decisiones guarda el oro
   del agente en cada decisión; la pertenencia se reconstruye con los eventos de ingreso y salida.
2. **Por gremio al final de la corrida:** miembros, cuántos pelean, cuántos de esos van
   desarmados, cuántos de esos no pueden pagar el arma, y qué parte del tesoro costaría armarlos.
3. **Por agente:** proporción del ingreso que dona, frente a su lealtad. Confirma si donar
   depende solo del carácter.
4. **Miembros con hambre alta en gremios con tesoro.** El log de decisiones guarda el hambre.

**Qué permite decidir:**

| Resultado | Lectura |
|---|---|
| La mayoría de los desarmados que pierden **puede** pagar el arma | El problema es la decisión de compra. PO4 primero; la armería aportaría poco. |
| Una parte relevante **no puede** pagar y está en un gremio con fondos | La armería por necesidad tiene un caso real y medible. |
| Los desarmados que pierden casi no están en gremios | Ninguna mecánica de tesoro los ayuda. |

**Limitación.** No se puede reconstruir el saldo de cada tesoro en el tiempo: las cuotas y el
mantenimiento no emiten evento y solo se guarda el saldo final. Para eso haría falta la
corrida de instrumentación ya propuesta en la auditoría.

---

## 8. Decisión requerida del PO

**¿La primera función del tesoro debe ser proteger a los miembros que no pueden protegerse
solos (armas hoy, quizá comida después), aceptando que eso no reconoce a quienes más aportan y
que deja a los agremiados por encima de los independientes?**

- **Sí:** se autoriza el experimento de la sección 7, y la armería se estudia después de PO4.
- **No, debe reconocer la contribución:** el camino es B, y antes hay que decidir si donar
  debe tener algún límite.
- **No, debe servir al poder del gremio:** antes hay que decidir si los territorios van a
  existir como algo persistente.

Las tres respuestas son compatibles con decidir D por separado.
