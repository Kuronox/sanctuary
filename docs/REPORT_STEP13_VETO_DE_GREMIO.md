# STEP 13 — El gremio no readmite a quien expulsó por malversar

Protocolo `sanctuary-step`. Línea base: Step 12, tres seeds (`data_runtime_step12_a/b/c`).

## 1. Problema

La crónica de Ulra (`docs/CRONICAS_STEP10.md`) mostró el ciclo entrar, vaciar el tesoro, ser
expulsada y volver a entrar al mismo gremio. En el Step 12:

| | Seed a | Seed b | Seed c |
|---|---|---|---|
| Malversaciones | 412 | 401 | 48 |
| De ellas, en un gremio que ya había expulsado al ladrón | 303 | 185 | 25 |
| Reingresos al mismo gremio tras la expulsión | 164 | 207 | 54 |
| Espera mediana para reingresar (horas) | 23 | 328 | 304 |

Causa: `expelMember` no activa ningún período de espera (irse por decisión propia sí activa
uno de 72 horas), y el gremio no guarda memoria de a quién expulsó.

## 2. Hipótesis

Si un gremio no vuelve a aceptar a quien expulsó por malversar, desaparece el ciclo de
reingreso y la malversación deja de ser una fuente de oro sin costo.

## 3. Intervención

Único archivo del motor modificado: `src/engine/actions.js`.

1. Al descubrirse una malversación, el gremio agrega al ladrón a `guild.bannedIds`.
2. `listCandidateActions` no ofrece `join_guild` para un gremio que tiene vetado al agente.
3. Instrumentación: el evento `guild_embezzle` registra `guildId`.

El veto es permanente, por gremio, y sobrevive a la muerte y renacimiento del ladrón. No
aplica a expulsiones por cuotas impagas ni a malversaciones no descubiertas.

## 4. Criterios y observabilidad

| Criterio | Prioridad | Dato | Clasificación |
|---|---|---|---|
| Reingresos a un gremio tras ser expulsado por malversar | critical | eventos `guild_joined` y `guild_embezzle` | OBSERVABLE |
| Malversaciones: cantidad, oro, por agente | critical | eventos `guild_embezzle` | OBSERVABLE |
| Gremios, tesoros, economía, trayectoria de los ladrones, muertes | secondary | `state.json`, eventos | OBSERVABLE |

## 5. Tests

`src/engine/tests/guild_ban.test.js` (nuevo), 7 casos. Suite completa: 12 archivos, todos pasan.

## 6. Simulación

Mismas tres seeds, 7200 ticks, 70 agentes, sin API key de DeepSeek y con Ollama apagado.
Datos en `data_runtime_step13_a/b/c`.

## 7. Resultados (Step 12 → Step 13)

### Efectos buscados

| Métrica | Seed a | Seed b | Seed c |
|---|---|---|---|
| Reingresos tras expulsión | 164 → 0 | 207 → 0 | 54 → 0 |
| Malversaciones | 412 → 82 | 401 → 295 | 48 → 54 |
| Oro malversado | 79.280 → 4.696 | 51.100 → 15.606 | 63.977 → 50.874 |
| Vetos acumulados | 12 | 55 | 20 |

Trayectoria de los principales ladrones:

| Agente (seed) | Step 12 | Step 13 |
|---|---|---|
| Ulra (a) | 412 malversaciones, termina con 40.184 de oro | 82, termina con 16 de oro, vetada en 12 gremios |
| Renna (b) | 144, termina con 10.636 | 224, termina con 70, vetada en 18 |
| Dessa de las Colinas (b) | 202, termina con 16.956 | 44, termina con 15, vetada en 17 |
| Morden (c) | 16, termina con 46.223 | 30, termina con 32.318, vetado en 9 |
| Wenna (c) | 31, termina con 22.707 | 21, termina con 16.570, vetada en 10 |

### Efectos secundarios

| Métrica | Seed a | Seed b | Seed c |
|---|---|---|---|
| Tesoro total de gremios activos | 66.091 → 124.848 | 19.770 → 87.872 | 95.359 → 150.501 |
| Oro total en manos de agentes | 182.892 → 112.898 | 273.488 → 299.698 | 270.858 → 294.665 |
| Mayor fortuna individual | 40.184 → 22.174 | 33.321 → 30.853 | 46.223 → 32.318 |
| Mediana de oro | 13 → 11 | 15 → 36 | 20 → 17 |
| Gremios creados en la corrida | 74 → 39 | 140 → 97 | 43 → 31 |
| Gremios disueltos | 64 → 31 | 122 → 87 | 27 → 16 |
| Gremios activos al final | 10 → 8 | 18 → 10 | 16 → 15 |
| Robos a personas (logrados + fallidos) | 7 → 54 | 214 → 111 | 4 → 10 |
| Derrotas en combate individual | 595 → 361 | 569 → 404 | 532 → 416 |
| Muertes totales | 23 → 20 | 28 → 37 | 19 → 14 |
| Muertes definitivas | 4 → 2 | 2 → 8 | 2 → 2 |

### Lectura

- El ciclo de reingreso desapareció en las tres seeds.
- En las seeds a y b la malversación dejó de enriquecer: los ladrones terminan casi sin oro.
- En la seed c no bajó. Ahí los ladrones hacen pocos golpes muy grandes, uno o pocos por
  gremio, y siguen siendo los más ricos. El veto llega después del golpe, no lo impide.
- Los gremios son más estables: se crean y se disuelven menos, y los tesoros crecen.
- En la seed a, Ulra pasó a robarle a personas (de 7 a 54 intentos).

### Anomalías y cosas sin resolver

- **Malversación no descubierta.** Solo se descubre si otro miembro del gremio está en la
  misma ciudad. Rachas máximas sin ser descubierto en un mismo gremio: 43, 31 y 11. Un
  gremio no nota que su tesoro baja.
- **Un solo golpe puede llevarse hasta el 40 % del tesoro.** Con tesoros de decenas de
  miles, un golpe basta para hacerse rico (seed c).
- **Los tesoros acumulan oro que nadie usa:** 87.000 a 150.000 de oro inmovilizado. En la
  seed a el oro en manos de agentes bajó 38 %.
- Seed b: muertes definitivas de 2 a 8, casi todas por combate en Brynn. Una sola seed; sin investigar.
- Las derrotas individuales bajaron en las tres seeds. Sin investigar.

## 8. Veredicto

**HIPÓTESIS APOYADA** en el primer criterio (reingresos: 0 en las tres seeds).
**RESULTADO MIXTO** en el segundo: la malversación dejó de ser rentable en dos de tres
seeds; en la tercera persiste como pocos golpes grandes.
