# STEP 9.5 — Contrafactual de decision

Protocolo `sanctuary-step` completo (Fases C-H). Instrumentacion del motor para
registrar, en cada decision donde `dangerPenalty > 0`, que habria decidido el agente
sin esa penalizacion activa.

---

## 1. Pregunta e hipotesis (Fase A — diseno aprobado)

**Pregunta**: El conocimiento de que una zona es peligrosa tiene suficiente peso para
cambiar lo que un agente decide hacer, manteniendo la libertad del agente y sin
convertir el conocimiento en una orden programada?

- **H0**: `dangerPenalty` modifica scores pero nunca cambia el ganador.
- **H1**: existe al menos un subconjunto de decisiones donde la penalizacion activa
  cambia el ganador, mas grande para agentes con `riskTolerance` bajo.

**Metodo**: contrafactual inline (Opcion 1). `cfScore = realScore + bonus * dp`.
Sin segunda simulacion. El ruido RNG se comparte entre score real y contrafactual.

**Restriccion de interpretacion** (diseno aprobado): los resultados no permiten
concluir que el multiplicador 0.25 es correcto o incorrecto. Este Step solo mide
el efecto causal del mecanismo actual.

---

## 2. Cambios implementados (Fase C)

**Un unico archivo modificado**: `src/engine/decision.js`.

En `scoreAction()` caso `travel`: se anade `let _cfBonusDp = 0;`. Cuando `dp > 0`,
se almacena `_cfBonusDp = bonus * dp` (offset entre score real y contrafactual).
Se devuelve en el objeto resultado. No modifica el score real ni el comportamiento.

En `decide()`: tras elegir el ganador real (incluido el 8% shuffle), si hay
candidatos con `_cfBonusDp > 0`, se determina el ganador contrafactual
(`max cfScore` sin shuffle) y se registra `cfType = "A"` (ganador cambia) o
`"B"` (ganador igual, score distinto) en `rationale.cf`. El campo se serializa
automaticamente a `decisions.jsonl` sin cambios en `world.js`.

**Nuevo archivo**: `src/engine/tests/counterfactual.test.js` — 6 tests (PASS).

---

## 3. Simulaciones (Fase E)

3 seeds x 7200 ticks (300 dias), `DEEPSEEK_API_KEY` oculta (determinista):

| Seed | Label | Decisiones totales |
|---|---|---|
| a | sanctuary-v2 | 490.772 |
| b | sanctuary-v2-step8-b | 470.749 |
| c | sanctuary-v2-step8-c | 488.553 |

---

## 4. Metricas (Fase F)

### 4.1 CHR y DDR por seed

| Seed | Con cf (CHR) | Tipo A | Tipo B | DDR |
|---|---|---|---|---|
| a | 85 (0,02%) | 6 | 79 | 7,06% |
| b | 309 (0,07%) | 50 | 259 | 16,18% |
| c | 51 (0,01%) | 1 | 50 | 1,96% |
| **promedio** | **0,03%** | **57** | **388** | **8,40%** |

**CHR** = fraccion de decisiones donde el penalty tiene efecto observable
(`dangerPenalty > 0` Y `bonus > 0`). Extremadamente bajo: ~3 de cada 10.000.

**DDR** = de las decisiones donde el penalty actua, fraccion que habria tenido
otro ganador sin el. Promedio 8,40%.

### 4.2 Breakdown por riskTolerance

| Bucket | DDR promedio | n (cf events) |
|---|---|---|
| bajo [0, 0.33) | 0,00% | 10 |
| medio [0.33, 0.67) | 10,63% | 182 |
| alto [0.67, 1] | 7,16% | 253 |

**Hallazgo inesperado**: la selectividad esperada (bajo > alto) no se verifica.
Los agentes cautos tienen DDR=0% no porque la penalizacion sea debil para ellos
(es la maxima), sino porque no tienen `_cfBonusDp > 0`: ya evitan destinos
peligrosos por otros mecanismos — no aceptan encargos hacia esas zonas ni tienen
arbitraje que los lleve alli. La penalizacion es redundante para quienes mas
la necesitarian.

### 4.3 Distribucion del margen para Tipo A (cfScore - realScore del ganador real)

| Seed | n | media | mediana | p90 |
|---|---|---|---|---|
| a | 6 | 0,367 | 0,350 | 0,810 |
| b | 50 | 0,542 | 0,250 | 0,720 |
| c | 1 | 0,590 | 0,590 | 0,590 |

Margenes pequenos (mediana 0,25-0,59 puntos de score). El ganador contrafactual
habria ganado por poco.

### 4.4 Evolucion temporal (cf events / Tipo A)

| Fase | Seed a | Seed b | Seed c |
|---|---|---|---|
| Early (0-2400) | 10 / 0 | 172 / 28 | 0 / 0 |
| Mid (2400-4800) | 44 / 2 | 87 / 17 | 43 / 1 |
| Late (4800-7200) | 31 / 4 | 50 / 5 | 8 / 0 |

Patron temporal inconsistente entre seeds — refleja cuando y donde ocurren
muertes con witnesses en cada run particular.

---

## 5. Veredicto (Fase G)

**RESULTADO MIXTO.**

No es `HIPOTESIS NO APOYADA`: DDR positivo en las 3 seeds (7%, 16%, 2%) con
57 eventos Tipo A. El mecanismo tiene poder causal demostrado.

No es `HIPOTESIS APOYADA`: la selectividad por `riskTolerance` no se verifica
en la direccion esperada. El CHR es extremadamente bajo (0,01-0,07%).

No es `RESULTADO INCONCLUSO`: los datos son suficientes para responder.

**Lectura honesta**: la penalizacion por peligro SI cambia lo que los agentes
deciden — pero solo bajo condiciones especificas: destino con bonus positivo
simultaneo (encargo activo, arbitraje, tiron social) Y conocimiento de peligro
reciente en ese mismo destino. La coincidencia es rara (~3 de cada 10.000
decisiones). Cuando ocurre, el cambio es real pero el margen es estrecho.

La selectividad por `riskTolerance` opera de forma indirecta y contraintuitiva:
los agentes mas cautos ya evitan destinos peligrosos por otros sistemas de
decision. El penalty resulta redundante para ellos y actua principalmente sobre
agentes de riesgo moderado/alto que tienen otras razones para ir a zonas peligrosas.

---

## 6. Limitaciones

1. **8% shuffle -> falsos Tipo A**: estimado <=8% del total Tipo A (<=5 de 57).
2. **Multiplicador 0.25 no evaluado**: este Step no permite concluir nada sobre
   si el multiplicador es correcto, excesivo o insuficiente.
3. **CHR muy bajo**: pocos events cf para el bucket rT=bajo (10 total en 3 seeds).
4. **Tipo B sin downstream tracking**: 388 eventos donde el score cambio pero el
   destino fue el mismo — no se midio impacto en trayectorias posteriores.

---

## 7. Proximos pasos posibles

- Step 10: calibracion del multiplicador si se quiere aumentar el CHR.
- Aplicar senales de conocimiento a otros tipos de accion (`fight_monster`, `steal`).
- Auditoria de causalidad cruzada: formalizar el hallazgo de que agentes cautos ya
  evitan destinos peligrosos por otros sistemas — la redundancia puede ser un diseno
  correcto o una señal de desconexion entre sistemas.

---

*Datos: `data_runtime_step95_{a,b,c}/`. Analisis: `analyze_step95_counterfactual.mjs`.
Resumen: `data_runtime_step95_analysis.json`.*
