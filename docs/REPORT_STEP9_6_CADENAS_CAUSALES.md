# STEP 9.6 — Seguimiento de cadenas causales después de una decisión divergente

Protocolo `sanctuary-step`, Fases A–K. Puramente observacional: cero cambios
de motor, mecánicas, reglas o balance. Análisis externo sobre datos del Step 9.5.

---

## 1. Pregunta

> Cuando una percepción del mundo cambia realmente una decisión, ¿esa decisión
> diferente produce posteriormente una consecuencia diferente en el mundo?

## 2. Hipótesis

- **H0**: las 57 divergencias Tipo A del Step 9.5 no producen consecuencias
  observables posteriores; el estado del agente es indistinguible.
- **H1**: al menos una divergencia Tipo A produce un cambio de estado observable
  que altera decisiones o eventos posteriores del mismo agente.

## 3. Auditoría de observabilidad (resumen)

| Información | Clasificación | Fuente | Limitación |
|---|---|---|---|
| agentId + tick de divergencia | OBSERVABLE | decisions.jsonl | — |
| Acción real vs. contrafactual | OBSERVABLE | decisions.jsonl `cf` | — |
| dangerPenalty aplicado | OBSERVABLE | decisions.jsonl `cf.penaltyApplied` | — |
| Eventos en ventana (travel, work, combat) | OBSERVABLE | events.jsonl | — |
| Decisiones posteriores del mismo agente | OBSERVABLE | decisions.jsonl | — |
| Conexión causal D0→D1→D2 | PROXY_ONLY | secuencia temporal | No se puede excluir independencia |
| Knowledge entry específica que activó el penalty | PROXY_ONLY | knowledge[] del agente | Sin puntero directo |

Travel time real: 2–8 ticks. Ventana aprobada: **48 ticks**.

## 4. Método

- Datos: `data_runtime_step95_{a,b,c}/decisions.jsonl` y `events.jsonl`
- Script: `analyze_step96_chains.mjs` — sin nueva simulación
- Por cada Tipo A: ventana de 48 ticks de decisiones y eventos del mismo agente
- Causalidad: DIRECTAMENTE_ATRIBUIBLE solo cuando la consecuencia es la acción
  elegida en sí misma; CONSISTENT_WITH para secuencias plausibles; NOT_DETERMINABLE
  cuando no hay datos suficientes

## 5. Casos analizados

57 Tipo A: seed a = 6, seed b = 50, seed c = 1.

El cfWinner más frecuente es `travel` (30/57 = 53%) — el penalty principalmente
bloqueó viajes a destinos peligrosos o redujo el atractivo de stay-actions en zonas
con danger knowledge activo.

## 6. Immediate State Divergence

`state_divergence_rate = 57/57 = 100%`

| Tipo de consecuencia | n |
|---|---|
| needs | 57 |
| economy | 51 |
| relationship | 50 |
| location | 42 |
| combat | 30 |
| death | 2 |

## 7. Subsequent Decision Divergence

`subsequent_decision_rate = 57/57 = 100%`

`subsequent_cf_activation_rate = 49/57 = 86%`

En 49 de 57 casos el agente tuvo al menos una decisión posterior donde el
dangerPenalty volvió a activarse. El knowledge de peligro persistió y siguió
siendo relevante durante toda la ventana.

## 8. Consecuencias

Nivel 2 (DIRECTAMENTE_ATRIBUIBLE): la acción elegida produce su consecuencia intrínseca.
Nivel 3 (CONSISTENT_WITH): lo que ocurrió en los 47 ticks siguientes es consistente con
causalidad pero no puede demostrarse sin segunda simulación.

## 9. Chain depth

| Depth | n | % |
|---|---|---|
| 0 | 0 | 0% |
| 1 | 0 | 0% |
| 2 | 8 | 14% |
| 3+ | 49 | 86% |

## 10. Casos DIRECTAMENTE_ATRIBUIBLE (14 casos)

### Farro (seed b, t=336): work gana sobre help_agent

```
t=336  REAL: work (score 1.88)
       CONTRAFACTUAL: help_agent (cfScore 2.47) — penalty: 0.0777

CONSECUENCIA DIRECTA:
t=337  help     "Farro ayuda a Petra la Errante con 10 de oro."
t=338  work     "Farro trabaja la fragua en Tejor."
t=340  work     "Farro trabaja la fragua en Tejor."  (×3 más hasta t=344)
4 activaciones de penalty (Tipo B) en la ventana
```

DIRECTAMENTE_ATRIBUIBLE — `work` sucedió porque ganó. Anomalía: a t=337 Farro
ayudó igual — el penalty reordenó las acciones pero no suprimió `help`.

---

### Quilan (seed a, t=4643): trade_sell gana sobre eat

```
t=4643  REAL: trade_sell reliquias (score 1.6)
        CONTRAFACTUAL: eat (cfScore 1.95) — penalty: 0.0828

t=4644  eat       "Quilan come."              ← acción cf ocurre 1 tick después
t=4645  help      "Quilan ayuda a Wenna con 7 de oro."
t=4646  trade_sell "Quilan vende cuero: 21.76 oro."
t=4649  travel_start → Duren
t=4651  travel_end "Quilan llega a Duren."
t=4653  party_combat_win "Quilan y Isvel vencen un Lobo alfa."
2 activaciones de penalty (Tipo B) en la ventana
```

DIRECTAMENTE_ATRIBUIBLE (Nivel 2) + CONSISTENT_WITH (Nivel 3).

## 11. Casos CONSISTENT_WITH (43 casos)

### Brannok (seed c, t=2998): rest gana sobre accept_job — margen más alto del dataset

```
t=2998  REAL: rest (score 2.60)
        CONTRAFACTUAL: accept_job (cfScore 3.19) — penalty: 0.0419, margen: 0.59

t=2999  job_accepted "Brannok acepta: transportar mercancia de Kestal a Brynn."
        DEC cfType=B (accept_job ganó pero score reducido)
t=3000  travel_start → Brynn
t=3007  travel_end + job_completed "Brannok completa el transporte: 35 de oro."
t=3008  party_combat_loss "Brannok y Sorin son derrotados por un Capitán bandido."
t=3010  party_combat_win  "Vencen al Capitán bandido (12 oro repartido)."
t=3011  craft "Brannok fabrica Arma de hierro."
```

CONSISTENT_WITH — penalty bloqueó un job en t=2998, Brannok descansó y
al tick siguiente aceptó otro que llevó a Brynn y a combate.

---

### Doran (seed b, t=264): eat gana sobre travel bosque_umbrio — margen mínimo

```
t=264   REAL: eat (score 2.16)
        CONTRAFACTUAL: travel bosque_umbrio (cfScore 2.17) — penalty: 0.2084, margen: 0.01

t=265   rest  "Doran descansa en Valdor."
t=266   travel_start → Duren  ← viaja, pero a Duren, no a bosque_umbrio
t=271   travel_end "Doran llega a Duren."
```

CONSISTENT_WITH — Doran no fue a bosque_umbrio pero viajó a Duren 2 ticks después.
Con margen 0.01 este caso probablemente sea un falso Tipo A por el 8% shuffle.

---

### Quilan (seed a, t=7019–7021): travel cruce_fangoso bloqueado 3 ticks consecutivos

El caso causal más rico del dataset.

```
t=7019  REAL: help_agent (1.95)   CF: travel cruce_fangoso (1.95)  margen: 0.000
t=7020  REAL: rest_inn   (1.70)   CF: travel cruce_fangoso (1.98)  margen: 0.280
t=7021  REAL: trade_sell (1.36)   CF: travel cruce_fangoso (2.17)  margen: 0.810

Durante el bloqueo:
t=7019  help      "Quilan ayuda a Dessa con 7 de oro."
t=7020  rest_inn  "Quilan se aloja en posada de Grisal por 9 de oro."
t=7021  trade_sell "Quilan vende insignia_bandido: 32.64 de oro."

Después del bloqueo:
t=7022  travel_start → Brynn   (no cruce_fangoso)
t=7030  travel_end "Quilan llega a Brynn."
t=7031  combat_win "Bandido: 3 oro."
t=7032  combat_win "Capitán bandido: 12 oro."
t=7033  combat_win "Capitán bandido: 16 oro."
t=7034  combat_win "Capitán bandido: 10 oro."
t=7035  combat_win "Capitán bandido: 16 oro."
t=7036  combat_win "Bandido: 8 oro."
```

CONSISTENT_WITH — 3 bloqueos de intensidad creciente mantuvieron a Quilan en zona.
Cuando viajó, eligió Brynn (no cruce_fangoso) y cosechó 6 victorias en combate.

## 12. Casos NOT_DETERMINABLE

**0 casos.** Todos los Tipo A producen eventos observables en la ventana.

## 13. Limitaciones

1. **Sin segunda simulación**: Nivel 3 siempre es CONSISTENT_WITH. Afecta 75% de casos.
2. **8% shuffle**: hasta ~8% de Tipo A son falsos positivos. Caso Doran (margen 0.01) es candidato.
3. **Knowledge origin proxy**: no hay puntero al evento específico que activó el penalty.
4. **Ventana de 48 ticks**: consecuencias posteriores no se midieron.
5. **Multiplicador 0.25 no evaluado**.
6. **Correlación de activaciones**: el 86% de reactivaciones refleja persistencia del knowledge, no cadena causal confirmada.

## 14. Anomalías

**A1 — La acción bloqueada ocurre al tick siguiente (Farro y Brannok):**
El penalty actúa como regulador temporal, no como supresor. La acción
contrafactual no desaparece — se retrasa.

**A2 — Quilan: intensidad creciente en 3 ticks consecutivos:**
Márgenes 0.000 → 0.280 → 0.810. El dangerSignal acumuló fuerza cada tick
mientras Quilan permanecía en la zona.

**A3 — Seed b concentra 88% de los casos (50/57).**
Posible sesgo de distribución de muertes en esa seed.

## 15. Veredicto

**C — Cadena causal**

SANCTUARY produce la secuencia `EVENTO → KNOWLEDGE → PERCEPCIÓN → DECISIÓN →
CONSECUENCIA → NUEVA DECISIÓN` de forma observable en los 57 casos. Nivel 2
directo en 14 casos; Nivel 3 consistente en 43. No se alcanza D (cadena
recurrente confirmada) sin segunda simulación.

Hallazgo más inesperado: el penalty actúa como **regulador temporal, no supresor**.
Las acciones bloqueadas ocurren al tick siguiente. El efecto duradero es la
redirección de destinos de viaje y la reducción continua de scores en el 86%
de decisiones posteriores dentro de la ventana.

---

*Datos en `data_runtime_step95_{a,b,c}/`. Análisis: `data_runtime_step96_analysis.json`.
Script: `analyze_step96_chains.mjs`.*
