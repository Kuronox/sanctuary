# Sanctuary — Derrotas sin arma, gremios con fondos y lógica de compra

Fecha: 2026-10-12. Es el experimento de solo lectura propuesto en
`docs/EVALUACION_TESORERIA_GREMIOS.md` (sección 7), más una revisión del código de combate y
equipo. **No se modificó el motor, no se corrieron simulaciones y no hay commit.**

Datos: las tres corridas del Step 14 (`data_runtime_step14_a/b/c`), 300 días, 70 agentes.
Comando: `node tools/auditoria_po/tesoreria_y_armas.mjs <carpeta de corrida>`.

## Respuesta corta

- **Tres de cada cuatro derrotas sin arma de agremiados las sufrió alguien que podía pagar el
  arma con su propio oro.** El problema principal es la decisión de comprar, no el dinero.
- Las derrotas de quien no podía pagar y estaba en un gremio con fondos existen, pero son el
  14 % de todas las derrotas individuales. Armar a todos esos miembros costaría entre 1.050 y
  1.509 de oro por mundo, menos del 2 % de los tesoros.
- El agente **nunca calcula** el beneficio de un arma. En 405.517 decisiones de agentes ricos
  y desarmados, comprar no habría ganado ni una sola vez.

## Cómo se midió

- **Sin arma:** el agente no equipó un arma desde su último renacimiento. No detecta armas
  rotas, así que puede contar como armado a alguien que ya no lo está.
- **En gremio:** pertenencia reconstruida evento por evento (ingresos, salidas, expulsiones,
  muertes).
- **Podía pagar:** su oro en el momento de decidir esa pelea era al menos 65,63: el precio del
  arma con el stock habitual de 10 (62,50) más 5 % de impuesto.
- **Tesoro del gremio en ese momento:** reconstruido como aportes menos malversaciones menos
  inscripciones a disputas. No incluye cuotas, encargos, multas ni mantenimiento.
- Solo derrotas en pelea individual. En las derrotas en grupo el acompañante no tiene decisión
  propia registrada, así que no hay oro del momento.

**Validación de la reconstrucción.**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Pertenencia final reconstruida igual al estado | 68 de 70 | 68 de 70 | 69 de 70 |
| Error del tesoro reconstruido frente al real (mediana) | 2,1 % | 4,7 % | 2,4 % |

Los agentes que no coinciden son muertos definitivos: el estado conserva su último gremio y
la reconstrucción los da de baja. El único tesoro con error grande es un gremio de 514 de oro.

---

## Parte 1 — Las cinco cifras

### 1. Derrotas sin arma de agentes que pertenecían a gremios

| | Mundo a | Mundo b | Mundo c | Total |
|---|---|---|---|---|
| Derrotas individuales | 304 | 392 | 553 | 1.249 |
| Sin arma | 254 | 339 | 411 | 1.004 |
| **Sin arma y en gremio** | **189** | **258** | **387** | **834** |
| Agentes distintos | 24 | 36 | 33 | |
| Sin arma y sin gremio | 65 | 81 | 24 | 170 |

### 2. Cuántos podían pagar el arma en el momento de la derrota

| | Mundo a | Mundo b | Mundo c | Total |
|---|---|---|---|---|
| **Podían pagar** | **149 (79 %)** | **158 (61 %)** | **339 (88 %)** | **646 (77 %)** |
| Agentes distintos | 15 | 23 | 20 | |
| No podían pagar | 40 | 100 | 48 | 188 |
| Agentes distintos | 16 | 20 | 18 | |
| Oro mediano al perder | 513 | 301 | 1.143 | |

Un mismo agente puede figurar en las dos filas en momentos distintos. Con el precio base del
arma (26,25 con impuesto) en vez del de mercado, las que podían pagar suben a 178, 204 y 376.

### 3. No podían pagar, pero su gremio tenía fondos

| | Mundo a | Mundo b | Mundo c | Total |
|---|---|---|---|---|
| **Gremio con fondos para al menos un arma** | **38** | **96** | **39** | **173** |
| Agentes distintos | 14 | 18 | 14 | |
| De ellas, gremio con 1.000 de oro o más | 36 | 72 | 35 | 143 |
| Gremio sin fondos | 2 | 4 | 9 | 15 |

### Las 1.249 derrotas individuales, repartidas

| Situación | Derrotas | Parte |
|---|---|---|
| Sin arma, en gremio, **podía pagarla** | 646 | 52 % |
| Con arma | 245 | 20 % |
| Sin arma, en gremio, no podía pagar, **gremio con fondos** | 173 | 14 % |
| Sin arma, sin gremio | 170 | 14 % |
| Sin arma, en gremio, no podía pagar, gremio sin fondos | 15 | 1 % |

Son techos, no derrotas evitadas: un arma baja la probabilidad de perder, no la anula.

### 4. Cuánto costaría equipar a esos miembros, por gremio

Un arma por miembro, a 65,63.

| Mundo | Gremio | Miembros | Coste | Tesoro mediano en esas derrotas | Tesoro final |
|---|---|---|---|---|---|
| a | ElsvetCompany | 7 | 459 | 33.970 | 77.710 |
| a | JorunHermandad | 3 | 197 | 3.385 | 20.957 |
| a | GorrikCompany | 3 | 197 | 9.792 | 14.098 |
| a | Otros 3 gremios | 3 | 197 | 1.412 a 7.284 | 10.557 a 14.445 |
| b | QuilanHermandad | 5 | 328 | 2.488 | 11.806 |
| b | DoranCompañia | 5 | 328 | 3.100 | 11.052 |
| b | RennaHermandad | 5 | 328 | 21.162 | 30.892 |
| b | NyraCompany | 4 | 263 | 1.151 | 1.853 |
| b | Otros 4 gremios | 4 | 263 | 150 a 8.082 | varios |
| c | DoranCompañia | 6 | 394 | 42.168 | 67.525 |
| c | LyssaCompañia | 3 | 197 | 15.764 | 27.900 |
| c | Otros 5 gremios | 7 | 459 | 1.124 a 7.230 | 5.958 a 14.181 |

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Coste total | 1.050 | 1.509 | 1.050 |
| Tesoro total de gremios activos | 159.369 | 79.544 | 153.134 |
| Coste como parte del tesoro | 0,7 % | 1,9 % | 0,7 % |

Medido de otra forma, sobre el estado final: en ElsvetCompany hay 41 miembros vivos, 38 sin
arma, y 11 de esos sufrieron alguna derrota individual; armarlos costaría 722 de oro frente a
un tesoro de 77.710. En el mundo c, DoranCompañia: 17, 13 y 7; 459 frente a 67.525.

El coste no cuenta reposición. Un arma dura unas 60 peleas (pierde entre 1 y 3 de 120 puntos
por pelea), se pierde al morir, y quien la lleva paga 1 de oro por día de mantenimiento.

### 5. Integrantes de gremios ricos con hambre alta

"Gremio rico": tesoro reconstruido de 1.000 o más en ese momento. "Hambre alta": 0,85 o más,
el nivel desde el que el hambre quita salud.

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| **Miembros con hambre alta en alguna decisión** | **47** | **43** | **55** |
| Decisiones con hambre alta | 2.100 | 3.986 | 1.827 |
| Miembros con 24 o más decisiones así | 12 | 19 | 14 |
| Decisiones con hambre alta y menos de 6 de oro | 1.067 | 1.929 | 1.050 |
| Miembros distintos en ese caso | 15 | 21 | 16 |
| Muertes por hambre de miembros de un gremio rico | 0 | 0 | 0 |

Lectura con cuidado:

- Casi todos los agremiados pasan alguna vez por hambre alta. Es parte del ciclo normal: comen
  cuando el hambre sube.
- El grupo que importa es el de 15 a 21 miembros por mundo que llegan a hambre alta **sin oro
  para una comida**, en un gremio con más de 1.000 de oro.
- Nadie muere por eso. **[Hecho, del código]** Con hambre sobre 0,9 la regla de supervivencia
  hace comer al agente sin comprobar que pueda pagar, así que come igual.
- Las cifras subestiman el hambre extrema: las decisiones forzadas por supervivencia no
  registran el hambre.

---

## Parte 2 — Lo que dice el código

### Qué atributos influyen realmente en el daño

**Ninguno del agente.** El daño recibido es un número al azar.

| Situación | Daño |
|---|---|
| Gana una pelea individual | 2 a 15 |
| Pierde una pelea individual | 15 a 40 |
| Gana en grupo | 1 a 10, por 0,8 (0,55 si hay un caballero) |
| Pierde en grupo | 15 a 40, por 0,7 (0,5 si hay un caballero) |

Lo único que lo reduce es la **armadura**: 15 % menos mientras le quede durabilidad. La clase,
el nivel y el arma no cambian cuánto daño se recibe.

Lo que la clase, el nivel y el arma sí cambian es **si se gana o se pierde**, y cuánta salud
hay para aguantar:

- **Poder de combate** = base de la clase × 3, más crecimiento por nivel de oficio, más 4 si
  lleva arma, menos 1,5 por cada nivel base que le falte para ese enemigo. Se multiplica por
  0,55 si enfrenta solo a un enemigo pensado para grupo.
- **Resultado:** poder más un azar de −3 a +5, contra el poder del monstruo más un azar de −2
  a +4. Gana el agente si iguala o supera.
- **Salud máxima** = 80 + 4 por nivel base.
- **Crecimiento de poder por nivel de oficio:** guerrero 1,4; caballero 1,8; asesino 1,0; guía
  de expedición 0,9; explorador 0,6. Todas las demás clases: **0**.

| Clase | Base × 3 | Sin arma | Con arma |
|---|---|---|---|
| Comerciante, curandero, erudito | 6 | 6 | 10 |
| Novato, herrero, mercader de ruta, archivista, sanador mayor | 9 | 9 | 13 |
| Explorador (nivel de oficio 1) | 15 | 15 | 19 |
| Guerrero (nivel de oficio 1) | 24 | 24 | 28 |

Probabilidad de perder, enumerando las 63 combinaciones de azar:

| Poder | Contra Lobo salvaje (5) | Contra Bandido (7) |
|---|---|---|
| 6 (comerciante sin arma) | 33 % | 56 % |
| 10 (comerciante con arma) | 5 % | 16 % |
| 9 (herrero sin arma) | 10 % | 24 % |
| 13 (herrero con arma) | 0 % | 2 % |

### Qué equipo existe y qué requisitos tiene

Hay tres objetos y un solo nivel de cada uno. No existe un arma mejor que otra.

| Objeto | Efecto | Precio base | Durabilidad | Se fabrica con |
|---|---|---|---|---|
| Arma de hierro | +4 de poder | 25 | 120 | 3 de mineral de hierro |
| Armadura de cuero | −15 % de daño recibido | 20 | 120 | 3 de cuero |
| Herramienta de recolección | +25 % de recolección | 18 | 100 | 2 de madera y 1 de piedra |

- **Para equipar:** ningún requisito de clase ni de nivel. Basta tenerlo en el inventario.
- **Para fabricar:** solo novato, herrero y maestro artesano, con los materiales.
- **Para comprar:** que haya más de 3 en el mercado y oro para el precio más 5 %. El precio de
  mercado es el base multiplicado según el stock: con 10 unidades, × 2,5.
- **Desgaste:** arma y armadura pierden de 1 a 3 puntos por pelea; al llegar a 0 desaparecen.
- **Mantenimiento:** 1 de oro por pieza equipada por día.
- **Reparación:** se ofrece bajo la mitad de durabilidad, en una ciudad cuya institución
  repare; reparar un arma entera cuesta 15.
- **Al morir** se pierde todo el equipo.

### Cómo calcula el agente el beneficio de comprar y equipar un arma

**No lo calcula.** Ninguna de las tres acciones mira el combate.

| Acción | Puntuación | Qué mira |
|---|---|---|
| Comprar | codicia × 0,4 + meta de riqueza × 0,3. Máximo 0,7. | El carácter. No mira qué objeto es, si la ranura está vacía ni si pelea. |
| Comprar durante una prueba de comercio | lo anterior + 2,5 | Que cuenta como operación de comercio |
| Equipar | 2,5 fijo | Solo se ofrece si ya tiene el objeto y la ranura está vacía o es distinta |
| Fabricar | margen de venta / 10, + 1,5 si la ranura está vacía | Es la única que mira la ranura vacía |

Comprar un arma y comprar un saco de sal puntúan igual.

### Qué elige en lugar de comprarla, y por qué

Decisiones de un agente sin arma, con oro para pagarla y en una ciudad con mercado:

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Decisiones en esa situación | 116.493 | 162.806 | 126.218 |
| Agentes distintos | 50 | 55 | 46 |
| Puntuación mediana de la acción que ganó | 1,93 | 1,99 | 1,96 |
| Puntuación de comprar: mediana / máxima | 0,40 / 0,59 | 0,51 / 0,67 | 0,46 / 0,67 |
| **Veces que comprar habría superado a la ganadora** | **0** | **0** | **0** |
| Veces que compró un arma | 161 | 270 | 25 |

Lo que eligió en su lugar:

| Mundo | Acciones más frecuentes |
|---|---|
| a | Conversar 45 %, descansar 14 %, trabajar 13 %, recolectar 8 %, vender 7 % |
| b | Conversar 33 %, trabajar 27 %, descansar 17 %, vender 5 %, recolectar 5 % |
| c | Trabajar 24 %, conversar 21 %, descansar 18 %, proponer grupo 11 %, recolectar 8 % |

Por qué: comprar puntúa como mucho 0,67 y la acción que gana ronda 1,95. No es que el agente
prefiera otra cosa a armarse; es que armarse nunca entra en la comparación.

**[Inferencia]** Las compras de armas que sí ocurrieron solo pueden explicarse por el bono de
2,5 de una prueba de comercio, porque sin él comprar no gana nunca. La auditoría midió que los
comerciantes revenden ese equipo en 1 a 2 horas.

### Si la mejora de supervivencia es visible en la lógica de decisión

**No lo es, en ningún punto.**

1. **Al comprar:** no existe ningún término de combate, salud o riesgo.
2. **Al decidir pelear:** el motor usa el poder para un factor de peligro en tres escalones
   (1, 0,55 y 0,15). Para un comerciante contra el lobo ese factor ya es 1 sin arma, así que
   el arma no cambia cómo ve esa pelea, aunque baja su derrota real de 33 % a 5 %. Contra el
   bandido sí cambia: de 0,55 a 1.
3. **La armadura** no aparece en ninguna puntuación de pelea.
4. **Tras una derrota** (Step 14) el agente recuerda contra qué perdió, pero ese recuerdo
   solo le quita ganas de pelear. No lo empuja a equiparse.

La mejora es grande en las reglas de combate e invisible en las de decisión.

---

## Qué cambia esto respecto a las evaluaciones anteriores

- **Confirma el orden propuesto:** primero la decisión de compra individual (PO4), después la
  armería. La compra individual toca hasta el 52 % de las derrotas; la armería, hasta el 14 %.
- **Da tamaño a la armería:** barata (menos del 2 % de los tesoros) y con alcance limitado. No
  es una función principal para el tesoro; es una ayuda puntual.
- **Agrega un hallazgo:** entre 15 y 21 miembros por mundo pasan hambre alta sin oro para comer
  dentro de gremios ricos. No mueren, porque el motor les da de comer sin cobrar.
- **Queda sin cubrir:** las derrotas de quien no tiene gremio (14 %) y las de quien ya lleva
  arma (20 %).

## Limitaciones

- "Sin arma" no detecta armas rotas. La cifra real de desarmados puede ser mayor.
- El tesoro reconstruido omite cuotas, encargos, multas y mantenimiento (error del 2 % al 5 %).
- El precio del arma se tomó fijo en 65,63; el real depende del stock de cada mercado en cada momento.
- Las derrotas en grupo no están incluidas.
- La puntuación de comprar se calculó con la fórmula y el carácter del agente; el log solo
  muestra las seis acciones mejor puntuadas, y comprar casi nunca está entre ellas.
- Tres seeds.
