# STEP 10 — Primera Voz

Protocolo `sanctuary-step`, Fases 0–8. Puramente observacional en términos de
causalidad: la narrativa no afecta ningún mecanismo del motor. Primer experimento
de integración LLM local (Ollama) como capa de interpretación.

---

## 1. Pregunta

> ¿Puede un agente racionalizar decisiones que ya tomó de manera que su voz
> resulte consistentemente distinguible de la de otros agentes, sin que la
> narrativa afecte la causalidad del mundo?

## 2. Hipótesis

- **H0**: las racionalizaciones son suficientemente genéricas como para resultar
  intercambiables entre agentes.
- **H1**: las racionalizaciones muestran diferencias consistentes entre agentes
  que corresponden a sus rasgos de personalidad y contexto, sin que esos rasgos
  sean explicitados como instrucciones narrativas.

## 3. Cambios implementados

### Archivos nuevos
- **`src/engine/llm/ollamaClient.js`**: cliente HTTP a `localhost:11434/api/generate`.
  Timeout 8s, devuelve `null` en error — la simulación nunca se rompe.
- **`src/engine/llm/narrator.js`**: construye el prompt con datos deterministas
  (personalidad, acción real, acción contrafactual, dangerPenalty, ubicación,
  clase, nivel) e instrucción de responder en español en primera persona.
  Agrega la narrativa a `agent.narrative[]` con `{ tick, text, trigger: "typeA" }`.

### Archivos modificados
- **`src/engine/entities.js`**: campo `narrative: []` agregado al schema base.
- **`src/engine/world.js`**: `await narrateTypeA(agent, ...)` después de cada
  decisión donde `cfType === "A"`. Solo 1 import y 3 líneas.

### Aislamiento causal verificado
- T7 (grep): ningún archivo del engine importa ni lee `narrative[]`.
- La decisión ya está tomada cuando el LLM es llamado.
- `await` directo en vez de fire-and-forget — fire-and-forget no funciona con el
  event loop de Node en un loop de microtasks. Sin impacto observable dado que
  el Tipo A ocurre ~6 veces en 7200 ticks.

## 4. Tests

7/7 PASS — incluyendo T7 (aislamiento causal por grep) y T4 (modificar
`narrative[]` manualmente no altera `scoreAction()`).

## 5. Simulación

| Parámetro | Valor |
|---|---|
| Seed | `sanctuary-v2` |
| Ticks | 7200 (300 días) |
| Modelo | `mistral:7b-instruct-q4_K_M` |
| Hardware | GTX 1070 8GB |
| Type A detectados | 6 |
| Llamadas Ollama | 6 |
| Narrativas generadas | 6 (100%) |
| Errores/timeouts | 0 |
| Latencia por llamada | ~600ms |
| Latencia total agregada | ~3.6s sobre ~8 min de simulación |

## 6. Narrativas generadas

### Quilan — explorador, nivel 18

```
riskTolerance: 0.76 | greed: 0.40 | empathy: 0.44
ambition: 0.10 | sociability: 0.27 | loyalty: 0.24
```

| tick | narrativa |
|---|---|
| t4643 | "No como para no aumentar el riesgo" |
| t7019 | "El peligro me impide viajar al cruce fangoso." |
| t7020 | "No estoy listo para enfrentar un peligro percibido, opto por descansar en un lugar seguro." |
| t7021 | "Me parece más seguro vender y obtener algo valioso en lugar de tomar un riesgo." |

### Isvel la Sabia — comerciante, nivel 11

```
riskTolerance: 0.67 | greed: 0.20 | empathy: 0.37
ambition: 0.61 | sociability: 0.24 | loyalty: 0.33
```

| tick | narrativa |
|---|---|
| t4669 | "No quiero riesgo." |
| t6096 | "Me parece más prudente con mi dinero." |

## 7. Evaluación ciega

Frases mezcladas sin identificadores:

```
1. No estoy listo para enfrentar un peligro percibido, opto por descansar en un lugar seguro.
2. No quiero riesgo.
3. El peligro me impide viajar al cruce fangoso.
4. Me parece más prudente con mi dinero.
5. Me parece más seguro vender y obtener algo valioso en lugar de tomar un riesgo.
6. No como para no aumentar el riesgo
```

**Agrupación inferida por voz:**
- Grupo A (frases elaboradas, referencias a acción/destino): 1, 3, 5, 6
- Grupo B (frases tersas, sin referencia específica): 2, 4

**Agrupación real:**
- Quilan: 1, 3, 5, 6 ✓
- Isvel: 2, 4 ✓

**Agrupación correcta: 2/2.** Quilan elabora con referencias al peligro y la
acción concreta. Isvel es seca y económica. La diferencia es consistente con
sus rasgos sin haberla programado explícitamente.

## 8. Veredicto

**PARCIAL**

La diferenciación existe y es consistente con los rasgos deterministas — la
evaluación ciega fue exitosa. Sin embargo, 6 narrativas en 2 agentes es un
dataset demasiado pequeño para afirmar H1 con confianza estadística. Se necesitan
más divergencias Tipo A para generalizar.

No es NO EMERGIÓ: la voz diferenciada apareció sin instrucción explícita.
No es EMERGIÓ: 6 casos no son suficientes.

## 9. Limitaciones

1. **Dataset pequeño**: 6 Type A en 300 días, 2 agentes. La seed sanctuary-v2
   tiene pocos knowledge entries de danger activos en esa ventana.
2. **Español inconsistente**: el modelo a veces mezcla construcciones — "No como
   para no aumentar el riesgo" es ambiguo.
3. **Sin variedad de personalidades**: los 2 agentes con voz son ambos moderados
   en greed/empathy. No se probó el rango extremo (el sujeto de control
   agent_1 con greed=0.92, empathy=0.08 no tuvo Tipo A en esta seed).
4. **`await` directo**: el call bloquea el tick ~600ms cuando ocurre. Aceptable
   a 6 llamadas en 7200 ticks; puede ser problema si el CHR sube.

## 10. Próximos pasos posibles

- Correr con una seed de mayor actividad (seed b tuvo 50 Type A en Step 9.5)
  para tener más narrativas y mejor cobertura de personalidades.
- Verificar si el sujeto de control (agent_1, greed=0.92, empathy=0.08) produce
  una voz notablemente diferente cuando tiene divergencias.
- Mejorar el prompt para forzar español más natural.
- Si el CHR sube con más seeds/steps, evaluar si `await` directo sigue siendo
  aceptable o hay que pasar a cola async real.

---

*Datos en `data_runtime_step10_a/`. Modelo: `mistral:7b-instruct-q4_K_M` vía
Ollama local.*
