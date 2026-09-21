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
- Criterios de éxito — como *observables*, nunca como cifras objetivo ("debe haber X muertes" no es un criterio válido; "observar cuántas muertes ocurren y dónde" sí).
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

## Fase G — Veredicto

El resultado de la Fase F se resume en uno de estos cuatro, nunca forzado hacia "éxito":

- **HIPÓTESIS APOYADA**
- **HIPÓTESIS NO APOYADA**
- **RESULTADO MIXTO**
- **RESULTADO INCONCLUSO**

## Fase H — Reporte

Generá o actualizá el informe correspondiente en `docs/` (siguiendo el patrón ya existente de `docs/REPORT_EXPERIMENT_*.md`: contexto, diseño, implementación, resultados, veredicto). El reporte debe preservar la trazabilidad experimental — no reescribas ni "mejores" retroactivamente informes de Steps anteriores para que el actual quede mejor parado.

## Regla fundamental

Este skill ejecuta el ritual una vez que la ciencia ya la decidió un humano. En cualquier fase, si notás que estás por tomar una decisión de "qué es interesante" o "qué deberíamos priorizar" en vez de "cómo ejecutar lo que ya se decidió" — parate y preguntá. Ese límite es más importante que completar las 8 fases de corrido.
