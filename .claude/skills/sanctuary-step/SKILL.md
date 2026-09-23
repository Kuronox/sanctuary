---
name: sanctuary-step
description: Ejecuta el protocolo estándar de un Step de SANCTUARY una vez que ya existe una propuesta de diseño aprobada — revisión arquitectónica previa, implementación acotada a archivos permitidos/prohibidos, tests, simulación con seed fijo, análisis comparativo contra el Step anterior y veredicto sobre la hipótesis. No decide qué experimento hacer ni qué es "un buen resultado" — eso sigue siendo criterio humano. Usar cuando el usuario dice "ejecutá el próximo step de Sanctuary", "implementá este step siguiendo el protocolo", o pega un diseño de Step ya aprobado para SANCTUARY.
---

# sanctuary-step

Protocolo estándar para ejecutar un Step de SANCTUARY. Este skill automatiza el **proceso** — no decide qué mecánica agregar, qué problema es prioritario, qué métrica importa, ni si un resultado es "bueno". Esas son decisiones del Product Owner (con o sin asesoría externa), tomadas antes de invocar este skill.

Si te piden "decidí el próximo step" o "qué deberíamos experimentar ahora": **eso no es este skill**. Este skill arranca recién cuando ya existe una propuesta concreta.

## Fase A — Diseño aprobado

Antes de tocar nada, confirmá que tenés estos elementos explícitos. Si falta alguno crítico, **parate y pedilo** — no lo inventes ni lo asumas:

- Hipótesis/problema que motiva el Step.
- Objetivo del Step (qué se quiere observar, no qué número se quiere lograr).
- Intervención propuesta (el diseño concreto).
- Archivos permitidos.
- Archivos prohibidos.
- Criterios de éxito — como *observables*, nunca como cifras objetivo ("debe haber X muertes" no es un criterio válido; "observar cuántas muertes ocurren y dónde" sí). Cada criterio necesita, explícito:
  - descripción,
  - prioridad: `critical` (si no puede observarse, invalida la capacidad de responder la hipótesis) o `secondary` (si no puede observarse, el Step sigue siendo evaluable igual),
  - dato esperado que lo respondería,
  - comparación o umbral, si corresponde.

  No hace falta un formato literal para esto — alcanza con que esos cuatro elementos queden explícitos por cada criterio.
- Seed de referencia para la simulación.
- Duración de la simulación.
- Métricas relevantes a instrumentar.

## Fase B — Auditoría previa (sin implementar)

Con el diseño en mano, y ANTES de escribir código:

- Revisá la arquitectura real (leé el código, no asumas desde la memoria de steps anteriores — puede haber cambiado).
- Identificá efectos secundarios posibles.
- Identificá loops de refuerzo / feedback loops que la intervención podría crear o agravar.
- Verificá que la intervención propuesta realmente ataque el mecanismo que el problema plantea (no un síntoma adyacente).
- Identificá explícitamente qué NO debe cambiar.

Si en esta fase encontrás que el diseño tiene un problema real (un loop no considerado, una premisa que el código ya contradice, un archivo permitido que no alcanza para lo que se pide), decilo y esperá confirmación antes de seguir — no lo arregles vos por tu cuenta ni sigas adelante asumiendo que está bien.

### Observability Audit

Antes de implementar, para **cada criterio de éxito de Fase A** (no solo los que "parecen" difíciles) verificá:

1. Qué dato o conjunto de datos respondería el criterio.
2. Dónde se almacena ese dato hoy (o dónde se almacenaría con la intervención propuesta).
3. En qué momento temporal se captura.
4. Si esa captura ocurre exactamente en el momento que el criterio necesita.
5. Si el dato permite distinguir estado previo, evento y consecuencia — no solo un snapshot ambiguo.
6. Si responde el criterio directamente, o solo por proxy.
7. Si esa información sobrevive a la simulación y queda disponible para el análisis de Fase F.
8. Si alcanza para comparar contra el baseline del Step anterior.

Clasificá cada criterio como:

- **`OBSERVABLE`**: la instrumentación existente captura la información necesaria, en el momento correcto, sin inferencias importantes.
- **`PROXY_ONLY`**: hay información relacionada que aproxima el criterio pero no lo responde directamente — dejá explícito qué sí y qué no se puede concluir con ella.
- **`NOT_OBSERVABLE`**: la información no se captura, se captura en el momento equivocado, o se pierde antes del análisis.

**Regla de parada**: si un criterio **`critical`** resulta `NOT_OBSERVABLE`, parate antes de implementar/simular y devolvé la decisión al usuario. Explicá: qué criterio no puede observarse, qué dato falta, dónde habría que capturarlo, por qué no se puede inferir de forma confiable, y qué opciones existen (eliminar/ajustar ese criterio, aceptar explícitamente un proxy, ampliar la instrumentación como parte de este Step, o posponerlo a otro Step). **No elijas vos cuál opción tomar.**

Un criterio `secondary` en `NOT_OBSERVABLE` o `PROXY_ONLY` no frena nada — se marca así y el Step sigue, siempre que la hipótesis siga siendo evaluable con lo que queda. No sobrerreacciones: esto no es "cualquier métrica ausente detiene el experimento", es específicamente sobre los criterios que la propia Fase A marcó como `critical`.

Dos principios metodológicos del protocolo (no reglas del mundo de SANCTUARY) que esta auditoría existe para hacer cumplir:

> Una simulación no puede responder una pregunta que el sistema no instrumenta.

> La ausencia de una observación no demuestra la ausencia del fenómeno.

**No implementes todavía.**

## Fase C — Implementación acotada

Recién acá se escribe código. Reglas duras, sin excepción:

- Solo tocás los archivos de la lista de permitidos.
- Nunca tocás los archivos de la lista de prohibidos.
- Node.js puro — sin frameworks nuevos.
- Cero dependencias nuevas salvo aprobación explícita en el diseño de Fase A.
- El motor sigue siendo determinista: nada de `Math.random()`/`Date.now()` fuera de `src/engine/rng.js`.
- Mantené el estilo existente (comentarios en español explicando el *por qué*, no el qué; sin abstracciones que nadie pidió).

Si en el medio de la implementación te parece que hace falta tocar un archivo fuera de la lista permitida, **parate y pedí ampliar el alcance** — no lo hagas y lo aclarás después.

## Fase D — Tests

- Corré los tests relevantes existentes (al menos toda la suite en `src/engine/tests/*.test.js`).
- Si el comportamiento nuevo necesita un test que no existe, proponelo primero; solo creá el archivo si está dentro del alcance aprobado (generalmente sí lo está: un test nuevo para el comportamiento del Step es parte natural de "implementar el Step", pero decilo explícitamente en el reporte final igual).
- Si algo falla, corregí solo lo relacionado al Step actual — nunca "aprovechá" para tocar algo más.

## Fase E — Simulación

- Corré la simulación con la seed acordada en Fase A, por la duración acordada.
- **No cambiés la seed** para buscar un resultado distinto.
- Si el entorno tiene una variable que la corrida anterior (el Step con el que vas a comparar) no tenía disponible (por ejemplo una API key de un proveedor LLM opcional), replicá las condiciones de esa corrida anterior en vez de dejar que la variable nueva del entorno cambie el experimento sin querer — y decilo explícitamente en el reporte.
- Un resultado favorable a la hipótesis NO es éxito automático — pasa a Fase F igual.

## Fase F — Análisis

Compará contra el baseline/Step anterior, separando explícitamente:

- Efectos esperados (los que la intervención buscaba producir).
- Efectos secundarios (los que no se buscaban).
- Métricas que mejoraron.
- Métricas que empeoraron.
- Comportamientos nuevos observados.
- Anomalías (estado inconsistente, referencias rotas, agentes actuando fuera de su condición esperada, loops inesperados).
- Cosas que quedan sin resolver.

Separá además, por cada criterio de éxito de Fase A, según la clasificación de la Observability Audit:

- **Direct observations**: lo que salió `OBSERVABLE` — datos que responden el criterio directamente.
- **Proxy observations**: lo que salió `PROXY_ONLY` — dejá explícita la limitación cada vez que lo uses. Nunca lo presentes como si fuera una observación directa.
- **Unanswered criteria**: lo que salió `NOT_OBSERVABLE` — nombralos, no los omitas del reporte.

## Fase G — Veredicto

El resultado de la Fase F se resume en uno de estos cuatro, nunca forzado hacia "éxito":

- **HIPÓTESIS APOYADA**
- **HIPÓTESIS NO APOYADA**
- **RESULTADO MIXTO**
- **RESULTADO INCONCLUSO**

Si algún criterio **`critical`** quedó `NOT_OBSERVABLE` (y llegaste hasta acá porque en Fase B se decidió aceptar esa limitación en vez de frenar), **no podés declarar HIPÓTESIS APOYADA ni HIPÓTESIS NO APOYADA** — la evidencia que faltaría para sostener cualquiera de las dos es justamente la que no se pudo observar. Usá **RESULTADO INCONCLUSO**, o si parte de la hipótesis sí se pudo evaluar con los criterios que quedaron `OBSERVABLE`, **HIPÓTESIS PARCIALMENTE EVALUADA** (aclarando qué parte sí y qué parte no).

## Fase H — Reporte

Generá o actualizá el informe correspondiente en `docs/` (siguiendo el patrón ya existente de `docs/REPORT_EXPERIMENT_*.md`: contexto, diseño, implementación, resultados, veredicto). El reporte debe preservar la trazabilidad experimental — no reescribas ni "mejores" retroactivamente informes de Steps anteriores para que el actual quede mejor parado.

## Regla fundamental

Este skill ejecuta el ritual una vez que la ciencia ya la decidió un humano. En cualquier fase, si notás que estás por tomar una decisión de "qué es interesante" o "qué deberíamos priorizar" en vez de "cómo ejecutar lo que ya se decidió" — parate y preguntá. Ese límite es más importante que completar las 8 fases de corrido.
