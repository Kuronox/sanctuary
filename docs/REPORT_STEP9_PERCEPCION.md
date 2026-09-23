# STEP 9 Percepcion y Reaccion a Eventos del Mundo

Protocolo sanctuary-step Fases A-H. Primer Step que conecta knowledge con
destinationBonus. Cierra Ruptura 1 del Causal Audit.

---

## 1. Hipotesis

H0: knowledge de peligro no altera decisiones de viaje.
H1: (A) agentes con knowledge reaccionan diferente, (B) modulado por riskTolerance,
(C) ninguna zona colapsa a 0 agentes.

## 2. Cambios implementados (Fase C)

Unico archivo: src/engine/decision.js. Cero cambios en motor/reglas/economia/stats.

### 2.1 dangerPenalty(agent, candidate, world) -- exportada

Lee entries de tipo rebirth, permanent_death, combat_loss dentro de 168 ticks.
Senyal = sum(confidence * (1 - age/168)) por entry valida.
Penalty = min(0.6, signal * 0.25 * (1 - riskTolerance))

Nota de esquema: rebirth.data.fromLocation = lugar de muerte (peligroso).
rebirth.data.location = destino de renacimiento (no peligroso).
La propuesta inicial usaba k.location (seria undefined). Corregido antes de
implementar; test T7 lo verifica.

Cap de senyal: la propuesta inicial incluia Math.min(1, signal), que habria dejado
el cap de 0.6 como codigo muerto (max 0.25). Implementacion final lo omite.
Con 4+ entries frescas, penalty puede saturar a 0.6. Test T10 lo verifica.

### 2.2 Integracion en travel case

  dp = dangerPenalty(agent, action.data.to, world)
  score += bonus * (1 - dp)
  if dp > 0: reasons.push(penalizacion...N%)

Si bonus=0 (exploracion pura), la penalty es nula aunque dp > 0.

## 3. Tests (Fase D) - 10/10 PASS

T1  sin knowledge -> 0
T2  combat_loss fresco rT=0 -> 0.25
T3  entry expirada age=169 -> 0
T4  otra localizacion -> 0
T5  rT=1 -> 0
T6  rT=0 -> 0.25, rT=0.5 -> 0.125
T7  rebirth: fromLocation = peligro, no location
T8  permanent_death -> penalty > 0
T9  3 entries > 1 entry en senyal
T10 10 entries rT=0 satura en 0.6

Regresion completa sin regresiones.

## 4. Simulaciones (Fase E)

3 seeds x 7200 ticks. DEEPSEEK_API_KEY oculta.

seed-a: sanctuary-v2-step9-a seed=2407047410 | 65/70 vivos | 5 perm.deaths
seed-b: sanctuary-v2-step9-b seed=1428298812 | 70/70 vivos | 0 perm.deaths
seed-c: sanctuary-v2-step9-c seed=449607806  | 67/70 vivos | 3 perm.deaths

## 5. Resultados (Fase F)

### 5.1 Eje 1: Efecto mecanico - CONFIRMADO

Eventos de peligro (combat_loss + permanent_death) por zona:

seed-a: cruce_fangoso=147 bosque_umbrio=137 colinas_rotas=16 ruinas_kaltenhor=5
seed-b: cruce_fangoso=108 bosque_umbrio=77  colinas_rotas=19
seed-c: cruce_fangoso=87  bosque_umbrio=59  ruinas_kaltenhor=13 colinas_rotas=12

Disparos de penalty:
         total | efectivas (bonus>0) | cosmeticas (bonus=0) | max% | avg%
seed-a:  40    | 29                  | 11                   | 29   | 9.4
seed-b:  33    | 26                  |  7                   | 12   | 4.6
seed-c:  13    |  9                  |  4                   | 16   | 5.8
total:   86    | 64                  | 22

Penalty cosmetica: 22/86 casos con bonus=0 no cambian el score. Consecuencia
de la formula multiplicativa aprobada, no un bug.

### 5.2 Eje 2: Efecto conductual - NO DEMOSTRADO

64 decisiones efectivas: penalty en el score, pero travel sigue siendo la
accion elegida. Sin baseline sin Step 9 no se puede atribuir distribucion
geografica al mecanismo nuevo.

### 5.3 Eje 3: Diferenciacion por riskTolerance - DIRECCION CORRECTA, SIN DIVERGENCIA

100% de decisiones efectivas: agentes con rT >= 0.6. Ningun agente rT < 0.4.
Interpretacion probable: wildlands son destinos de aventureros (alta rT), no de
artesanos cautos. La modulacion interna es correcta: rT=0.67 -> -16%, rT=0.82 -> -3%.

### 5.4 Eje 4: Libertad de respuesta - H1-C SATISFECHO

seed-a: cruce_fangoso=2 (valdemarca=31 aldea_tejo=19)
seed-b: cruce_fangoso=1 (valdemarca=33 aldea_tejo=20)
seed-c: cruce_fangoso=1 (valdemarca=30 aldea_tejo=15)

Ninguna zona cae a 0 agentes en ninguna seed. Criterion C satisfecho.

### 5.5 Eje 5: Cadena causal trazable - CONFIRMADA

Ejemplo 1 (seed-b): agent_45 rT=0.78 tick=1129
  penalizacion por peligro conocido en colinas_rotas (-5%)
  ruta hacia un encargo aceptado
  -- Contrato lleva al agente a zona con muertes conocidas. Score 5% menor.

Ejemplo 2 (seed-c): agent_66 rT=0.89 ticks=482-527
  penalizacion por peligro conocido en ruinas_kaltenhor (-4% a -5%)
  arbitraje: grano se vendia mejor en ruinas_kaltenhor
  -- Arbitraje al mismo destino peligroso, 3 decisiones consecutivas reducidas.

Primeros casos en SANCTUARY donde un evento del mundo produce un cambio
cuantificable en la utilidad de una decision de un agente concreto.

## 6. Veredicto (Fase G)

RESULTADO MIXTO.

No es H1 APOYADA: criterios A y B sin baseline no confirmables.

No es H1 NO APOYADA: cadena causal evento->knowledge->decision demostrada por
primera vez en SANCTUARY (sec 5.5). Criterion C satisfecho.

No es INCONCLUSO: 64 disparos efectivos y trazabilidad directa. Genuinamente mixto.

Lectura honesta: Step 9 logra el mecanismo (primera conexion events-decision).
No logra divergencia conductual observable porque:
(1) penalty solo actua cuando bonus > 0.
(2) contratos y arbitraje son mas fuertes que 0.25x.

Siguiente paso para ver divergencia: baseline comparativo, subir el multiplicador,
o extender penalty al score base de exploracion.

---

Datos en data_runtime_step9_a/, data_runtime_step9_b/, data_runtime_step9_c/.
Analisis en analyze_step9_danger.mjs.
Tests en src/engine/tests/danger_perception.test.js.
