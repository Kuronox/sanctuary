# Sanctuary — Documento de Diseño de Balance

> **Estado**: Diseño. No implementar nada de este documento hasta que una sección específica sea aprobada explícitamente.
> **Fuente**: resultados de Experimentos A, B, C, D, PRE-V3 y V3-LLM (300 días, 70 agentes, seed `sanctuary-v2`).
> **Convención**: "evidencia" = observado en datos reales. "Propuesta" = diseño no probado todavía.

---

## 1. ESTADO ACTUAL

### Lo que funciona

**Decision engine (evidencia):**
- El scoring por instancia concreta funciona para `travel`, `join_guild` y `help_agent` desde V2. Travel evalúa cada destino por razón real (encargo, arbitraje, amigo). Join evalúa cada gremio individualmente (reputación, cuota, líder, especialización). Help exige necesidad real del destinatario.
- `trialBonus` y `guildContractBonus` producen comportamiento dirigido hacia objetivos: los agentes con prueba activa sí cambian acciones para avanzarla.
- El fallback de la política LLM (decisión determinista cuando no hay llamada real) es robusto: 2.377 llamadas exitosas, 0 respuestas JSON inválidas en V3.

**Progresión (evidencia):**
- Nivel base promedio: 1.0 → 3.6 en 300 días. Clases alcanzadas en V3: guerrero, explorador, herrero, comerciante, curandero, caballero. La distribución es variada.
- La penalización por abandonar una prueba en curso (`-6`) resolvió el loop de pruebas alternantes que producía 7.864 inicios en 365 días.
- El sesgo `traits_bias` por clase funciona: Cirya (riskTolerance) → herrero; Dessa (sociabilidad) → curandero/comerciante.

**Economía base (evidencia):**
- Mediana de riqueza estable: ~15 de oro en D, 15.6 en PRE-V3, 15.77 en V3. El fix de `help_agent` (D) mantiene esta estabilidad: la riqueza pasiva por popularidad fue corregida.
- El mercado depleta su `goldReserve` y eso ya penaliza vender en mercados saturados (`reserveStarved: score -3`). Se observó y se corrigió correctamente.

**Guilds (evidencia):**
- La fricción de fundación de PRE-V3 (cooldown 72 ticks + costo creciente) redujo fundaciones de 456 → 61 (-87%) sin suprimir el comportamiento: 10 gremios activos al día 300.
- El sistema de guerras de gremios existe y tiene zonas disputadas (solo zonas salvajes, no ciudades).

**LLM (evidencia):**
- Solo ~7% de las decisiones de un agente "LLM" son respuestas reales del modelo. El sistema es robusto (98.2% éxito en llamadas reales, 0 errores de JSON en 2.377 llamadas).
- Cuando el LLM es consultado, converge fuertemente a `work` (66% de 2.377 decisiones reales de la cohorte). Esto no estaba programado.

### Problemas demostrados por evidencia

**Concentración geográfica:**
- Valdemarca concentra el 55.7% en PRE-V3 (365 días) y el 68.6% en V3 (300 días). 5 de 9 localizaciones vacías al día 300. Causa demostrada: la fórmula de `travel` tiene una penalización base de `-0.3` y solo añade bonus por razón concreta (encargo, arbitraje, amigo). Sin esa razón, ningún destino compite con `work` en Valdemarca, que da la mayor concentración de work+mercado+seguridad juntos.

**Equipment/crafting casi sin uso:**
- Solo 3 de 70 agentes (4.3%) tienen equipo al día 300. ~89% del combate ocurre sin arma ni armadura.
- 1.043 veces se vendió `mineral_hierro` crudo vs 13 armas_hierro crafteadas (76:1). Causa demostrada: `craft` puntúa `maestria_oficio*2 + riqueza*1`, mientras `trade_sell` puntúa `1.3 + greed*0.5`. Sin el objetivo `maestria_oficio`, vender siempre gana.
- Solo 1 artículo por slot (no hay tiers ni gradación). No hay razón sistémica para equiparse antes del combate: la acción `equip_item` puntúa `+2.5` flat pero compite contra `work` que puede puntuar 1.5-3.0 dependiendo de goals.

**Loop de malversación:**
- En V3 Ulra usó la vía unirse-gremio-ajeno → malversar → ser expulsada → unirse a otro → 248 veces. La fricción de PRE-V3 cubre *fundar*, no *unirse*. Esta vía existe para cualquier agente con `greed↑, loyalty↓`. En V3 solo la activó Ulra porque es la única con traits lo suficientemente extremos, pero la vía está abierta.
- 280 malversaciones de Ulra, 99.7% desde su fórmula determinista (no LLM).

**Economía sin sumidero:**
- El oro total en circulación crece sin límite: 23k → 86k → 196k en 300 días. No hay mecanismo de drenaje real: impuestos, mantenimiento, costos de vida. La riqueza se redistribuye pero nunca se destruye en el agregado. La cola superior (top agentes) acumula sin fricción: Isvel 37.930, Cirya 20.857, vs mediana 15.77.

**Bosses nunca aparecen en la práctica:**
- Probabilidad de boss por tick: 0.4% (`chance(world.rng, 0.004)`). Con la mayoría de agentes concentrados en Valdemarca (sin monster family), y pocas visitas a zonas salvajes, los encuentros de boss son estadísticamente nulos. En V3/300 días no se registró ningún boss kill. El sistema existe pero no es accesible con el comportamiento actual de los agentes.

**RNG: diversidad limitada de estados:**
- La concentración en Valdemarca homogeniza los ticks: 48/70 agentes están en el mismo lugar, compiten por el mismo trabajo, tienen oportunidades similares. Esto no es un bug del RNG — es que el estado del mundo colapsó a un atractor.

**Decisiones todavía abstractas (no por instancia):**
- `craft` puntúa el tipo de acción, no qué craftear ni para qué. Un agente con `maestria_oficio` alta craftea cualquier cosa que pueda, sin distinguir si necesita el ítem o si hay demanda real para él.
- `trade_sell` puntúa el tipo de acción, no qué bien vender en qué mercado. El scoring de arbitraje existe para `travel` pero no se propaga al momento de decidir *qué vender ahora mismo aquí*.
- `gather` puntúa el tipo abstracto sin distinguir qué recurso ni si es lo que la prueba de clase o el contrato de gremio necesita (el `guildContractBonus` ayuda, pero es aditivo sobre un tipo genérico).

---

## 2. PRINCIPIOS DE BALANCE

1. **Sin atractores dominantes.** Si una ciudad, clase, acción o estrategia domina el scoring en casi cualquier situación, los demás colapsan. Cada nodo del sistema debe tener *al menos* una desventaja real que otra alternativa no tiene.

2. **Sin sistemas de un solo sentido.** Cualquier flujo de valor (oro, XP, reputación, recursos) que entra al sistema debe poder salir también. Si solo hay fuentes y no sumideros, el sistema escala hasta la incoherencia.

3. **Fricción proporcional, no punitiva.** La fricción debe desalentar loops degenerativos sin bloquear el comportamiento legítimo. La fricción de fundación de gremios es el modelo correcto: la primera fundación sigue costando lo mismo, repetir se encarece.

4. **Las decisiones seleccionan instancias concretas, no tipos abstractos.** "Viajar" sin razón no debe ser una opción real. "Viajar a Puerto Grisal porque hay una oportunidad de transporte activa que termina allá" sí lo es. El motor ya hace esto parcialmente; debe extenderse.

5. **Las ciudades tienen identidades funcionales distintas.** Una ciudad es atractiva por lo que ofrece que ninguna otra tiene, no solo por su safety/guardStrength. El diseño actual de Valdemarca (capital + academia + mercado grande + alta seguridad + recursos propios) la hace la mejor en demasiados ejes a la vez.

6. **Toda progresión importante tiene opportunity cost.** Subir de clase requiere hacer algo que tiene cost real (tiempo, riesgo, recursos), no solo acumular ticks.

7. **No agregar RNG arbitrario para crear variedad.** La diversidad debe venir de que el mundo tenga estados distintos que hacen que distintas acciones sean óptimas en distintos momentos, no de ruido aleatorio sobre un sistema donde siempre gana lo mismo.

8. **No agregar bonos artificiales sin causa sistémica.** Un bono de "+2 a `craft`" para que los agentes craftéen más no resuelve el problema de por qué debería existir artesanía en este mundo. La solución debe venir de que haya demanda real de lo crafteable.

9. **El crimen surge de personalidad + incentivos + oportunidad.** "Criminal" no es una alineación hardcoded. Que Ulra sea la única que roba en 300 días no es un error del sistema — es consecuencia de que sus traits extremos (greed 0.92, loyalty 0.12) son los únicos que cruzan el umbral bajo las condiciones actuales. Si se quiere más crimen, se deben cambiar los incentivos/oportunidades, no parchear la fórmula de un agente.

10. **Medir antes de cambiar.** Cada modificación tiene hipótesis, smoke test, y criterios de aceptación/rollback definidos antes de implementar.

---

## 3. GEOGRAFÍA Y CIUDADES

### Mapa actual (9 localizaciones)

| ID | Tipo | Safety | Guard | Institución | Recursos propios | Monster family |
|---|---|---|---|---|---|---|
| valdemarca | capital | 0.90 | 0.85 | academia (guerrero/erudito) | grano | — |
| puerto_grisal | ciudad_portuaria | 0.80 | 0.60 | gremio_aventureros (explorador/picaro) | pescado, sal | — |
| aldea_tejo | pueblo_agricola | 0.85 | 0.40 | gremio_mercantil (comerciante) | grano, cuero | — |
| ribera_sauce | pueblo_pesquero | 0.75 | 0.45 | templo (curandero) | pescado, madera | — |
| praderas_vann | pueblo_ganadero | 0.70 | 0.35 | — | cuero, lana | — |
| cruce_fangoso | pueblo_minero | 0.50 | 0.30 | herrería (herrero) | mineral_hierro, piedra | bandido |
| bosque_umbrio | zona_salvaje | 0.40 | 0 | — | madera, hierbas | lobo |
| colinas_rotas | zona_salvaje_montañosa | 0.25 | 0 | — | mineral_hierro, piedra | trol |
| ruinas_kaltenhor | ruinas | 0.10 | 0 | — | reliquias | espectro |

### Problema demostrado

Valdemarca domina en: safety (0.90 = máximo), guardStrength (0.85 = máximo), institución que entrena la clase de combate de tier-2 más demandada (caballero), acceso a 4 conexiones (máximo del mapa), recursos propios. No tiene ninguna desventaja relativa frente a las otras ciudades seguras.

Puerto Grisal tiene el mejor mercado según su descripción, pero la mecánica actual no distingue el tamaño de mercado entre ciudades. Praderas de Vann no tiene institución. Ribera del Sauce tiene el único templo pero sus recursos (pescado/madera) son los menos valorados para el combate.

### Identidades funcionales propuestas

Las ciudades no deben rediseñarse desde cero — deben acentuarse sus identidades existentes hasta que cada una tenga *al menos una razón única* para ir allí.

**Valdemarca (capital):** Justificadamente la más segura. Su desventaja propuesta: es la más cara (mayor impuesto de mercado, mayor costo de vida). Los agentes que priorizan riqueza deberían eventualmente considerar si el costo vale lo que aporta. Sigue siendo el mejor lugar para avanzar clases de combate.

**Puerto Grisal (ciudad portuaria):** Mayor volumen de mercado = mejores precios de compra/venta para ciertos bienes (pescado, sal, bienes importados). Desventaja: más cara que las aldeas, pero no tanto como Valdemarca. Debería ser el destino de arbitraje natural para quien vende en volumen.

**Aldea del Tejo (pueblo agrícola):** Mejor lugar para comerciar grano y cuero al precio más alto local. La Casa de Comercio del Tejo (institución mercantil) debería dar acceso a encargos de tipo `entrega_material` con más frecuencia que otros lugares. Desventaja: sin defensa real (guard 0.40), crimen posible.

**Ribera del Sauce (pueblo pesquero):** El único templo del mundo = el único lugar donde un curandero puede avanzar hacia `sanador_mayor`. Ventaja propuesta adicional: las pociones curativas son más baratas o disponibles aquí porque las hierbas medicinales vienen del Bosque Umbrio adyacente (3 horas). Desventaja: aislado del circuito principal capital-puerto.

**Praderas de Vann (pueblo ganadero):** Única fuente de lana. Si la lana tiene uso real (componente de artesanía, bien de exportación), este lugar tiene razón de existir. Actualmente no tiene institución — podría obtener una `feria_ganadera` que entrene `comerciante` como alternativa al Tejo, diferenciada por especializarse en bienes ganaderos. Sin esto, no hay razón para vivir aquí.

**Cruce de Fangoso (pueblo minero):** Única fuente de mineral_hierro de ciudad (con gobernanza), y única herrería donde se puede reparar equipo y avanzar hacia `maestro_artesano`. Si el crafting tiene uso real, este lugar se vuelve necesario. Su desventaja ya existe: seguridad 0.50, bandidos en la zona.

**Zonas salvajes (bosque, colinas, ruinas):** Son zonas de recursos y combate, no de asentamiento. No deberían ser destinos de vivienda. Si un agente termina "viviendo" en una zona salvaje, es un síntoma de un problema en el scoring de travel, no de diseño de la zona.

### Qué hace que una ciudad sea un atractor universal (a evitar)

- Tener tanto la mejor seguridad como la mejor economía como la mejor institución.
- Ser la única salida a tier-2 de la clase más demandada por la mayoría de agentes.
- Estar en el centro del grafo de conexiones con pocas horas de viaje a cualquier destino.

Valdemarca cumple los tres. La solución no es bajar sus stats, sino dar a las otras ciudades *algo que Valdemarca no tiene*: precio de mercado diferencial, monopolio de cierto tipo de encargo, o institución que entrena una clase que la academia no cubre.

---

## 4. TRAVEL

### Estado actual

Travel ya puntúa por razón concreta: encargo activo (+5-8), arbitraje de precio (+2.5), amigo que se mudó (+0.8). La penalización base es `-0.3`. Sin ninguna de estas razones, travel nunca gana contra `work` en Valdemarca (que puntúa ~1.5-2.5 para agentes con goals de riqueza).

### Problema demostrado

26.4 viajes promedio por agente LLM en 300 días vs 15.7 para deterministas. Casi todos los agentes terminan en Valdemarca y no salen. Las razones de travel (encargo, arbitraje, amigo) requieren que el agente ya tenga información del otro lugar o un encargo que llegue allí. Sin esa información inicial, el agente nunca viaja, nunca genera la información, y el ciclo no arranca.

### Propuestas

**P-T1 (diseño):** Los encargos de tipo `transporte` y `entrega_material` deberían generarse con más frecuencia hacia localizaciones que no son la del agente, y con recompensas escaladas por distancia. Si las oportunidades siempre se originan en la localización del agente con destino cercano, el pull de travel es mínimo.

**P-T2 (diseño):** La información sobre precios en otras ciudades debería llegar por rumor antes de que el agente viaje. Actualmente `knownPricesFor` requiere que el agente haya estado allí o haya escuchado un rumor específico. Debería haber una tasa base de rumores de precios que lleguen vía `talk` o `knowledge`, así el ciclo de arbitraje puede arrancar sin haber viajado antes.

**P-T3 (diseño):** Si una localización tiene un recurso que la actual del agente no tiene, y el agente tiene demanda real de ese recurso (para prueba de clase, contrato de gremio), el bonus de travel hacia allí debería ser explícito, no inferido desde el sistema de conocimiento.

**P-T4 (verificar antes de cambiar):** La razón por la que Valdemarca concentra tanto podría ser en parte que `work` tiene un scoring de base más alto que cualquier travel con razón real. Si se ajusta el equilibrio trabajo-viaje, podría liberarse la concentración sin tocar las ciudades.

---

## 5. ECONOMÍA

### Fuentes de oro actuales (evidencia)

- `work`: principal fuente. Scoring alto para agentes con goals de riqueza/maestría.
- `trade_sell`: vender materias primas o botín de combate.
- `combat_win`: gold drop de monstruos.
- `help_agent` (recibir): recibir oro de otro agente (agente destinatario).
- `accept_job`: recompensa de encargo completado.
- `malversar_tesoro`: tesoro del gremio (actualmente sin fricción de unirse).

### Sumideros de oro actuales (evidencia)

- `trade_buy`: comprar bienes.
- `train`: pagar XP.
- `aportar_gremio`: contribuir al tesoro.
- `create_guild`: costo de fundación (30 + creciente).
- `join_guild`: cuota de entrada (`duesFor`).
- `rest_inn`: pagar por descanso.
- `craft`: costo de materias primas (indirecto).
- `help_agent` (dar): transferir oro.
- Impuestos de mercado (implícitos en `economy.js`).

### Problema demostrado

El oro total en circulación crece sin límite: 23k → 196k en 300 días. La mediana se mantiene estable (~15) porque `help_agent` redistribuye hacia abajo, pero la acumulación en la cola superior no tiene freno: Isvel 37.930, Cirya 20.857 al día 300. No hay ningún mecanismo que drene oro del sistema en términos absolutos — todos los sumideros son redistribución (de agente A a mercado/gremio/agente B), no destrucción.

### Propuestas

**P-E1 (diseño):** Costo de vida periódico. Un pequeño drenaje de oro por tick (mantenimiento de equipo, alimentación, alojamiento), proporcional a la riqueza del agente o a su clase. Esto crea presión sostenida que mantiene incluso a los agentes ricos trabajando en vez de acumular pasivamente. El calibrado es crítico: demasiado alto destruye agentes pobres, demasiado bajo no cambia nada.

**P-E2 (diseño):** Los precios de mercado deben responder a la concentración de agentes. Si 48/70 agentes están en Valdemarca, la demanda de bienes en Valdemarca debería subir los precios y la oferta en otras ciudades debería bajar (exceso). Actualmente el sistema de mercado ajusta precios por volumen de transacciones, pero no por concentración de demanda pasiva.

**P-E3 (diseño):** Comercio regional explícito. Los recursos propios de cada ciudad deberían estar naturalmente más baratos allí y más caros en ciudades que no los producen. Esto ya está implícito en los precios base, pero necesita amplificarse para que el arbitraje sea rentable y frecuente.

**P-E4 (hipótesis sin verificar):** ¿La concentración de riqueza en pocos agentes afecta el comportamiento del resto? Si Cirya tiene 20k y la mediana es 15, ¿está bloqueando recursos del mercado o simplemente acumulando sin impacto? Requiere análisis de flujo antes de proponer cambios.

---

## 6. EQUIPMENT / CRAFTING

### Estado actual (evidencia)

3 ítems de equipo totales (1 por slot), sin tiers ni progresión:
- `arma_hierro`: +4 combatPower, durabilidad 120, receta: 3 mineral_hierro
- `armadura_cuero`: -15% daño recibido, durabilidad 120, receta: 3 cuero
- `herramienta_recoleccion`: +25% gather bonus, durabilidad 100, receta: 2 madera + 1 piedra

Resultado en 300 días: 3/70 agentes equipados, 19 crafteos totales, 1.451 ventas de materias primas, ~89% del combate sin equipo.

**Causa raíz demostrada**: `craft` solo puntúa alto con el objetivo `maestria_oficio`. Sin ese objetivo (10 goals posibles, cada agente tiene 2), craftear pierde siempre contra `trade_sell`. El equipo tampoco se incluye en el scoring de combate de forma que el agente *anticipe* beneficio antes de tener el ítem — `equip_item` solo existe cuando ya lo tiene en inventario.

### Cuándo debería craftear un agente

**Propuesta de diseño**: un agente debería craftear cuando:
1. Tiene una prueba de clase activa que requiere crafteo (ya funciona via `trialBonus`).
2. Tiene un contrato de gremio que requiere el bien crafteado (ya funciona via `guildContractBonus`).
3. Necesita el ítem para combate y la diferencia de poder hace que el combate sea factible vs no factible.
4. El precio de venta del ítem crafteado supera el valor de las materias primas por un margen que justifica el tiempo.

El punto 3 y 4 no tienen mecanismo actual. Para que 3 funcione, el scoring de `fight_monster` debe reducirse cuando el agente no tiene arma y el monstruo es difícil, y el scoring de `craft` debe subir cuando esa arma eliminaría esa diferencia. Para que 4 funcione, se necesita comparar precio de `arma_hierro` (25 base) contra 3× mineral_hierro (6 base × 3 = 18), lo cual da margen — pero ese cálculo no existe en el motor.

### Cuándo debería comprar equipo

**Propuesta de diseño**: si el mercado tiene equipo disponible (actualmente no hay stock inicial), un agente debería comprarlo cuando el beneficio de combate / gather justifica el costo. Actualmente `trade_buy` no tiene stock de equipo en `world_seed.json`. Si se agrega stock de equipo al mercado, un agente podría comprar en vez de craftear.

### Durabilidad y reparación

El sistema existe: durabilidad 120/100, `repair_item` en la herrería de Cruce de Fangoso. En V3 solo se registró 1 reparación en 300 días porque casi nadie tenía equipo. Si el crafting / compra de equipo aumenta, la reparación se vuelve relevante automáticamente — es un sistema que espera ser usado, no que necesite cambios.

### Progresión de equipo (fuera de alcance de implementación inmediata)

Definición conceptual: el equipo debería tener al menos 2 tiers por slot para crear una razón de reemplazar el equipo actual. Un `arma_hierro` tier-1 (+4) y un `arma_acero` tier-2 (+8) crean un ciclo de progresión natural: craftear → equipar → deteriorar → reparar → eventualmente craftear algo mejor. No implementar todavía — la prioridad es que el tier-1 actual tenga uso real primero.

---

## 7. PROGRESIÓN

### Estado actual (evidencia)

- 15 clases: novato (tier 0) → 7 tier-1 → 8 tier-2.
- Progresión via trails: cada clase tiene un tipo de trial (kill_count, craft_count, trade_count, heal_count, steal_success_count, visit_count, defeat_rank, knowledge_count).
- Nivel base promedio: 3.6 a los 300 días. Distribución en V3: comerciante:15, curandero:20, novato:19, guerrero:6, explorador:7, herrero:2, caballero:1.
- `lifetimeTrialReadiness` ya evita que agentes inicien trials para los que no tienen historial previo. Funciona.

### Problemas demostrados

**Class trial loops (resuelto en parte):** El costo de abandonar una prueba en curso (`-6`) funciona, pero el problema subyacente persiste: si un agente tiene `maestria_oficio` + `riqueza` en sus goals, puede querer herrero Y comerciante. Sin el penalizador, alternaba indefinidamente. Con el penalizador, eventualmente elige — pero la elección puede no ser la que sus traits sugieren.

**Caballero como cuello de botella:** 1 caballero en 300 días. `standing` mínimo 15 con `academia_valdemarca` requerido para tier-2 de guerrero. El `standing` decae si no hay interacción activa con la institución (ver `decayStandings`). Para alcanzar tier-2 de cualquier clase, el agente necesita: nivel 8 del job, standing institucional mínimo, Y completar el trial tier-2. Este triple requisito puede ser demasiado largo para corridas de 300 días.

**Novato como estado permanente:** 27% de los agentes siguen siendo novatos al día 300 (19/70). El trial de herrero/comerciante/curandero requiere solo 3-10 acciones especializadas, pero si el agente no tiene esos goals, los trials nunca arrancan con prioridad suficiente.

### Propuestas

**P-PR1 (diseño):** El `trialBonus` ya empuja hacia las acciones del trial activo. Si un agente es novato sin trial activo, debería haber un empuje suave hacia `iniciar_prueba_clase` para la clase más compatible con sus traits. `lifetimeTrialReadiness` ya puede inferir esto — si se expone como factor de scoring pasivo, no solo de selección de trial, el bloqueo en novato debería reducirse.

**P-PR2 (hipótesis sin verificar):** ¿El 27% de novatos es un problema o es una distribución realista? En una población de 70, tener ~20 generalistas que nunca se especializan podría ser correcto si su contribución al sistema es distinta (más flexibles, más disponibles para encargos genéricos). Verificar en V3.1 si esos novatos tienen comportamientos distintos a los especializados, o si simplemente están bloqueados.

**P-PR3 (diseño):** Para tier-2, el requisito de standing institucional debería tener un camino más claro desde la interfaz de decisión. Actualmente `train` interacciona con la institución local y aumenta standing, pero el scoring de `train` no incluye "estoy cerca del requisito de standing para la clase que quiero". Esto podría añadirse como bonus si el agente tiene un trial de tier-2 activo y le falta standing.

---

## 8. COMBATE / PARTIES

### Estado actual (evidencia)

- 6.401 eventos de combate en 300 días: 2.100 victorias solo, 266 derrotas solo, más combates en grupo.
- ~89% del combate sin equipo.
- Boss encounters: probabilidad 0.4% por tick en zona con monster family. En la práctica nula en V3 porque la mayoría de agentes está en Valdemarca (sin monstruos) y pocos visitan zonas salvajes.
- Party: 1.007 propuestas / 801 aceptadas / 141 perdidas en PRE-V3.

### Diferencia solo vs grupo

**Solo**: `fight_monster` se propone cuando hay encuentros disponibles en la zona. El scoring desalienta monstruos `partyRecommended` con `-2.2` y bajas salud con `-3`. Funciona: los agentes evitan ir solos a monstruos de group content.

**Grupo**: `proponer_grupo` requiere que haya un agente aliado (affinity > umbral) en la misma localización que tiene el monstruo. La aceptación es determinista (confianza + afinidad + chance de victoria combinada). Funciona mecánicamente.

**Problema**: con 48/70 en Valdemarca y Valdemarca sin monstruos, el combate ocurre en las pocas zonas salvajes que alguien visita. Los agentes que pasan por cruce_fangoso o bosque_umbrio combaten, los que viven en Valdemarca no. El combate no está bloqueado — está vacío porque los agentes no van a las zonas.

### Bosses (propuesta de diseño)

Los jefes actuales (Aullador Ancestral, Señor del Camino, Madre Trol, Guardián de Kaltenhor) existen en el seed pero son prácticamente inaccesibles:
- Power 34-65 vs agentes con combatBase 3-14 + nivel (raramente superan 20 de poder efectivo antes del día 100).
- Probabilidad 0.4% por tick → incluso en zonas visitadas, raro.
- `partyRecommended: true` → requiere grupo → requiere que haya aliados en la misma zona salvaje → raro dado la concentración en Valdemarca.

**Diseño propuesto**: un boss no debería ser una versión más fuerte del monstruo común que aparece con probabilidad fija. Debería ser un *evento* que se anuncia (rumor que llega a varias localizaciones), que tiene una ventana de tiempo, y que requiere organización deliberada. Si el boss aparece como rumor en `knowledge`, los agentes con goals de `prestigio` y `riskTolerance` alto tienen razón concreta para viajar hacia él y proponer grupo. Sin este mecanismo, los bosses son invisibles.

**No implementar todavía** — requiere un sistema de eventos globales que no existe. Definición conceptual solamente.

### Farming de zona

`huntPressure` ya existe: la presión de caza sube +0.09 por kill, y la probabilidad de elite aumenta (`0.05 + pressure * 0.5`). Esto limita el farming indefinido de comunes aumentando el peligro. No hay bug aquí — el sistema no se ha podido observar en equilibrio porque pocos agentes llegan a las zonas.

---

## 9. GUILDS / INSTITUTIONS

### Estado actual (evidencia)

- PRE-V3: 61 fundaciones en 365 días, 9 activos al cierre. Tamaño máximo: 19 miembros.
- V3: 45 fundaciones en 300 días, 10 activos al cierre. Sistema estable.
- Standing institucional: decae 0.03 por tick hacia 0 (si |v| >= 0.05). Requiere actividad sostenida para mantener el acceso a tier-2.
- Guild war: existe pero requiere que un líder declare (`declarar_guerra_gremios`, scoring por ambición + prestigio + riskTolerance). Zonas disputadas: cruce_fangoso, colinas_rotas, bosque_umbrio, ribera_sauce, praderas_vann.

### Valor real de pertenecer

**Demostrado**: `guildContractBonus` crea un bonus real a acciones que avanzan el contrato colectivo. Un contrato activo (+0.6 al score de join) atrae nuevos miembros. El líder tiene incentivo real a aceptar contratos (`accept_guild_contract` pesa recompensa/feasibility).

**Problema**: el valor de pertenecer al mismo gremio para la mecánica de party es solo +0.25 en `respondToPartyInvite` y +1.2 en `proponer_grupo`. Es moderado pero no grande. Para que el gremio sea la institución social central, el bonus de confianza entre compañeros de gremio debería extenderse a más contextos.

### Loop de malversación (vía unirse)

**Documentado en V3**: unirse → malversar → ser expulsado → esperar cooldown de re-unión al mismo → unirse a otro → repetir. La fricción de PRE-V3 solo cubre fundar. Esta vía necesita su propio mecanismo de disuasión.

**Propuesta de diseño**: reputation penalty por malversación descubierta debería aplicarse al agente de forma visible y persistente (no solo afectar el gremio). Si la malversación descubierta baja el standing institucional y crea una memoria negativa en otros agentes (`broadcastLocalEvent`), los gremios futuros reconocerán al malversador y bajarán el score de `join_guild` para él. Actualmente la expulsión borra el estado pero no penaliza la reputación fuera del gremio.

### Liderazgo y coste de mantenimiento

El liderazgo de gremio tiene un incentivo: `leave_guild` tiene `-0.8` si eres el líder con miembros. Pero no hay un costo de mantenimiento para el gremio mismo. Un gremio con 1 miembro (el líder) y 0 de tesoro sigue existiendo indefinidamente. Propuesta: si un gremio tiene 0 miembros activos o treasury negativo durante N ticks, se disuelve automáticamente.

---

## 10. CRIMEN

### Principio (evidencia confirmada)

El crimen en Sanctuary emerge de personalidad + incentivos + oportunidad — no de una alineación hardcoded. En 300 días de V3:
- Ulra (greed 0.92, loyalty 0.12, empathy 0.08): único agente que robó o malversó.
- 314 de 315 decisiones de crimen vinieron de su fórmula determinista, no del LLM.
- Cuando el LLM fue consultado: eligió crimen 1 vez en 453 oportunidades.

La fórmula de `steal` ya incluye: `greed*2.5 - empathy*3 + riskTolerance*0.5 - guardRisk*2.5`. Con guardStrength alta (Valdemarca 0.85), el score de robar es negativo para cualquier agente con traits normales. Solo traits extremos (los de Ulra) cruzan el umbral.

### Propuestas

**No cambiar la mecánica de crimen**. El sistema funciona según principios correctos. Si se quiere observar más crimen, se debe cambiar el entorno (menos guardStrength en algunas zonas, mayor desigualdad económica que aumente el incentivo) — no la fórmula.

**Fricción pendiente (malversación vía unirse)**: ver sección Guilds. La malversación de gremio ya tiene su mecánica correcta — solo necesita que la reputación se propague externamente.

---

## 11. RELACIONES / MEMORIA

### Estado actual (evidencia)

- V3/300 días: 25.620 memorias relacionales. 290 traiciones significativas activas.
- PRE-V3/365 días: 28.103 memorias, 351 traiciones.
- `hasSignificantBetrayal` pesa más que la afinidad recuperada por decay — una traición recordada afecta `help_agent`, `join_guild` y `respondToPartyInvite` incluso si numéricamente la relación se recuperó.

### Propuestas

**P-R1 (diseño):** Los rumores de crimen/malversación deberían propagarse como eventos de conocimiento (`addKnowledge`). Actualmente `broadcastLocalEvent` notifica a agentes en la misma localización, pero una malversación descubierta en Valdemarca no llega a Puerto Grisal. Si se agrega un mecanismo de rumor de largo alcance para crímenes descubiertos, el criminal acumula reputación negativa en toda la red — esto es el freno natural sin necesidad de sistemas de "reputación global" complejos.

**P-R2 (diseño):** El decay de relaciones ya existe. No cambiar la tasa sin evidencia de que es incorrecta.

**P-R3 (hipótesis):** ¿Las relaciones de tipo "aliado" (affinity > umbral alto) afectan viajes? Si un aliado se muda, el agente puede seguirlo (+0.8 en destinationBonus). Con 48/70 en Valdemarca, la mayoría de aliados ya están allí, lo que podría reforzar la concentración en vez de diluirla. Verificar si el pull social es un factor de concentración antes de ajustarlo.

---

## 12. DECISION ENGINE

### Transición de tipos abstractos a instancias concretas

Esta es la dirección de diseño más importante del motor y la más incompleta.

**Ya implementado por instancia (evidencia):**
- `travel`: evalúa cada destino por razón concreta (encargo, arbitraje, amigo). No es "viajar = tipo".
- `join_guild`: evalúa cada gremio por sus atributos reales (reputación, cuota, líder, especialización).
- `help_agent`: evalúa la necesidad real del destinatario específico, no "ayudar = bueno".
- `fight_monster`: evalúa el rank y power del monstruo específico vs el poder efectivo del agente.

**Todavía abstracto (problema demostrado):**
- `craft`: puntúa el tipo de acción. No evalúa *qué craftear* ni *para qué*. Un agente con `maestria_oficio` craftea lo que pueda, sin distinguir si necesita el ítem o si hay demanda real.
- `trade_sell`: tiene scoring de arbitraje para el destino del viaje, pero no para qué bien vender *ahora mismo aquí*. Si tiene `mineral_hierro` y `cuero` en inventario, no hay scoring diferencial entre vender uno u otro (aparte de los precios de mercado, que sí se incluyen via `priceAt`).
- `gather`: puntúa el tipo abstracto. No distingue qué recurso recolectar. Si hay una prueba de clase activa o un contrato de gremio que necesita `madera`, el agente debería preferir un lugar con `madera` sobre uno con `grano`.
- `steal`: evalúa al agente objetivo específico (tiene cantidad de oro, relación), así que es parcialmente por instancia. Falta: evaluar el riesgo de la localización específica más que `guardStrength` plana (qué guardias hay cerca, cuántos testigos).

**Definición del objetivo:**
No se busca que cada acción evalúe todas las dimensiones posibles — se busca que cuando dos instancias del mismo tipo tienen consecuencias radicalmente distintas, esa diferencia se refleje en el scoring. Craftear un arma cuando eres herrero y lo necesitas para un contrato → score alto. Craftear la misma arma cuando eres comerciante y puedes vender el material crudo a mejor precio → score bajo. Esa diferencia no existe hoy.

---

## 13. LLM

### Aprendizajes de V3

**El LLM no debe confundirse con comportamiento agregado.** La fracción real de decisiones LLM es ~7% por agente. Cualquier análisis que compare totales agregados (total de robos, total de viajes, total de work) entre "agentes LLM" y "agentes deterministas" está comparando mayormente el mismo motor determinista, ejercido sobre personalidades distintas.

**El crimen de Ulra NO fue causado por el LLM.** 314 de 315 decisiones de crimen vinieron de ticks sin consulta real. Cuando el LLM fue consultado, eligió crimen 1 vez en 453 oportunidades. La hipótesis original de esta sesión ("el LLM pesa la codicia más literal que la fórmula calibrada") quedó descartada.

**Cuando el LLM es consultado, converge fuertemente a `work`.** 66% de 2.377 decisiones reales de la cohorte fueron `work`. Casi nunca eligió `travel`. Esto no estaba programado — puede ser efecto del modelo (`deepseek-flash`, temperatura 0.3), del diseño del prompt, o de cómo se presenta la lista de opciones. No se sabe todavía.

**El sistema de selección por índice es robusto.** 0 respuestas JSON inválidas en 2.377 llamadas reales. El LLM nunca intentó escribir una acción no disponible.

**Separación limpia es posible y necesaria.** `llm_decisions.jsonl` con `fallback: true/false` permite cruzar exactamente qué ticks vinieron del modelo real vs del fallback determinista. Cualquier análisis futuro DEBE hacer esta separación antes de atribuir comportamiento al LLM.

### Qué NO cambiar en V3.1 (LLM)

- No aumentar la población LLM todavía (pedir corrida de control 100% determinista con la misma semilla primero, para poder comparar limpiamente).
- No cambiar el mecanismo de selección por índice — funciona.
- No agregar chain-of-thought — no aporta datos útiles para el análisis y consumiría presupuesto.
- No cambiar el proveedor sin razón clara — `deepseek-flash` con `thinking: disabled` funciona bien.

### Qué investigar antes de V3.1 (LLM)

- ¿Por qué el LLM converge a `work`? ¿Es el modelo, la temperatura, o el prompt?
- ¿Correr una cohorte de control 100% determinista (Ulra incluida) bajo la misma semilla, para comparar su patrón criminal con el de V3?
- ¿La vía de malversación por unirse también ocurre en una corrida 100% determinista de Ulra?

---

## 14. PRIORIDAD DE IMPLEMENTACIÓN

Las siguientes secuencias están ordenadas por impacto/riesgo. Cada paso es independiente y puede detenerse si el criterio de rollback se activa.

### Paso 1: Fricción de malversación externa (prioridad alta)

**Problema**: unirse-malversar-ser expulsado-unirse a otro es un loop sin fricción real desde PRE-V3.

**Cambio propuesto**: cuando una malversación es descubierta, además de expulsar al agente, emitir un `broadcastLocalEvent` con tipo `malversacion_descubierta`. Agentes en la localización reciben esto en su `knowledge`. Los futuros `join_guild` para ese agente aplican un penalty en el scoring si otros miembros del gremio candidato recuerdan la malversación (vía `knowledge` de tipo `malversacion_descubierta`).

**Hipótesis**: reducción de malversaciones por agente con traits extremos, sin afectar la vía de unirse a gremios legítimamente.

**Smoke test (24 ticks)**: verificar que `broadcastLocalEvent` con el nuevo tipo funciona sin errores. Verificar que la knowledge llega a agentes presentes.

**30 días**: comparar total de malversaciones vs V3. Esperar reducción. Verificar que los gremios siguen formándose con frecuencia similar.

**100 días**: comparar distribución de gremios (tamaño, duración, número activos) vs V3. La fricción no debe vaciar el sistema de gremios.

**300 días**: comparar patrón de Ulra: ¿redujo malversaciones? ¿cambió hacia fundar más? ¿acumuló más riqueza o menos?

**Criterio de aceptación**: malversaciones de Ulra < 50% de las 280 de V3, con número de gremios activos comparable.

**Criterio de rollback**: número de gremios activos < 5 al día 100, o el sistema de join_guild deja de funcionar correctamente para agentes sin historial criminal.

---

### Paso 2: Craft por instancia (prioridad media-alta)

**Problema**: `craft` puntúa el tipo abstracto. Los agentes venden materias primas en vez de craftear porque vender puntúa más sin `maestria_oficio`.

**Cambio propuesto**: cuando el agente tiene materiales en inventario para un ítem de equipo Y tiene el ítem en su lista de candidatos de `craft`, añadir al scoring de `craft` un bonus proporcional a la diferencia entre el precio de venta del ítem terminado y el costo de los materiales. Ejemplo: `arma_hierro` (precio 25) vs 3× `mineral_hierro` (precio 6 c/u = 18) → margen +7 → añadir `margen/max_margen * factor` al score.

**Hipótesis**: aumento del ratio crafteo/venta de materias primas, especialmente para herreros y agentes con `riqueza` como goal.

**Smoke test**: verificar que el scoring de craft cambia correctamente para distintos niveles de margen.

**30 días**: comparar ratio crafteo/venta de mineral_hierro vs V3 (actualmente 13:1043). Esperar reducción hacia al menos 1:20.

**100 días**: comparar porcentaje de agentes con equipo vs V3 (actualmente 4.3%). Esperar al menos 10%.

**300 días**: comparar utilización de equipo en combate. Esperar que el porcentaje de combates con al menos un agente equipado suba del actual ~11%.

**Criterio de aceptación**: ratio crafteo/venta de materias primas al menos 1:20 al día 100.

**Criterio de rollback**: si el sistema de mercado se vacía de materias primas (agents craftean demasiado y no venden) y los precios se desestabilizan.

---

### Paso 3: Costo de vida mínimo (prioridad media)

**Problema**: el oro total crece sin límite, concentrando riqueza en la cola superior.

**Cambio propuesto**: drenaje periódico de oro por mantenimiento de equipo/alojamiento. Propuesta mínima: cada N ticks, si el agente tiene equipo equipado, descuenta un costo de mantenimiento pequeño (1-2 de oro). Esto es un sumidero real que escala con el equipo y crea incentivo de mantenimiento sin punir a agentes pobres que no tienen equipo.

**Hipótesis**: reducción del crecimiento de la cola superior sin afectar la mediana (que ya está cerca de cero en algunos agentes).

**Smoke test**: verificar que el drenaje funciona sin llevar agentes a valores negativos de oro.

**30 días**: verificar que la mediana de riqueza no cae por debajo de 10 (actualmente ~15).

**100 días**: comparar la distribución de riqueza vs V3. Esperar que el máximo crezca más lento.

**Criterio de aceptación**: distribución de riqueza más comprimida sin agentes en 0 de forma sostenida.

**Criterio de rollback**: si el 25% inferior de agentes llega a 0 de oro de forma sostenida al día 100.

---

### Paso 4: Identidad funcional de ciudades (prioridad media, alta complejidad)

**Problema**: Valdemarca es el atractor universal porque domina en demasiados ejes.

**Cambio propuesto** (mínimo): dar a Puerto Grisal precios de mercado 10-15% más altos para bienes de exportación (pescado, sal, reliquias). Esto crea un pull de arbitraje real hacia Puerto Grisal sin tocar ningún otro sistema.

**Hipótesis**: reducción de la concentración en Valdemarca de 68.6% hacia <55%.

**Smoke test**: verificar que los precios diferenciales funcionan correctamente en `economy.priceAt`.

**30 días**: comparar distribución de agentes por localización vs V3. Esperar más agentes en Puerto Grisal.

**100 días**: comparar el número de localizaciones vacías vs V3 (actualmente 5 de 9 al día 300).

**300 días**: comparar concentración total vs V3. Esperar <55% en Valdemarca.

**Criterio de aceptación**: <60% de agentes en Valdemarca al día 100 (vs 45.7% al día 100 en V3 — esperar no empeorar significativamente antes del día 100).

**Criterio de rollback**: si la concentración geográfica no mejora en 30 días, investigar si el problema es el precio diferencial insuficiente o si hay otro factor dominante antes de ajustar más.

---

## 15. FUERA DE ALCANCE

Los siguientes sistemas NO se implementarán en la próxima fase:

- **Stats numéricos adicionales** (STR/AGI/VIT/INT/DEX/LUK). El sistema actual de clase + nivel base + traits de personalidad ya produce diversidad comportamental suficiente. Añadir stats primarios requiere rediseñar el sistema de combate y crafting enteros.
- **NPCs complejos con diálogo o roles fijos** (tendero, guardia, jefe de misión). Los agentes son el sistema social. NPCs con comportamiento propio serían un segundo sistema paralelo.
- **Romance / vínculos sentimentales**. Las relaciones actuales (affinity, trust, memory) ya cubren la dimensión social necesaria para las decisiones. El romance sería capas adicionales de código para un fenómeno que el sistema de relaciones ya aproxima.
- **Permadeath**. Con 70 agentes y monstruos con poder escalado, la muerte permanente requeriría rebalancear todo el sistema de combate y progresión.
  > **Actualización histórica (Step 6)**: esta premisa fue invalidada por el experimento. Step 6 introdujo mortalidad/rebirth (vidas, muerte permanente, renacimiento con pérdida material) sin modificar ninguna fórmula de combate ni de progresión. La afirmación original queda como registro de la premisa de diseño con la que se partió, no como estado actual del sistema.
- **Skill trees complejos** (más de un nivel de especialización por dimensión). El sistema actual de clases tier-0/1/2 con trials ya es un árbol funcional. Más ramas antes de que las actuales se usen es sobre-ingeniería.
- **WoE / Siege completo** (control de ciudades). Guild war ya existe para zonas salvajes. Extenderlo a ciudades requiere un sistema de control político que actualmente no existe.
- **Refinamiento avanzado de equipo** (tier 3+, enchantment, rune slots). El tier-1 actual apenas se usa. Refinamiento se define conceptualmente en la sección Equipment pero no se implementa.
- **Más capas de IA** o agentes con arquitecturas más complejas que el LLM actual (multi-step planning, memoria episódica externa, tool use). El sistema LLM actual es deliberadamente minimalista.
- **Más agentes LLM antes de entender los actuales**. El ~7% de decisiones reales por agente hace que con n=5 las conclusiones sean estadísticamente débiles. Se necesita entender por qué el LLM converge a `work` antes de escalar.
- **PVP entre agentes**. El combate actual es PvE. Añadir PvP requiere un sistema de resolución de conflictos entre agentes con consecuencias balanceadas que actualmente no existe.
- **Nuevos sistemas solo para "hacerlo interesante"** (eventos climáticos, plagas, facciones políticas). Cada nuevo sistema sin problema demostrado al que responder es deuda de balance futura. El principio es: problema demostrado en datos → cambio mínimo → verificar.

---

## 16. DECISIONES ABIERTAS

### Ya demostradas (no requieren más investigación para actuar)

1. La fricción de malversación por unirse necesita su propio mecanismo — la de fundar no la cubre.
2. `craft` necesita scoring por instancia (margen craftear vs vender) para ser competitivo sin `maestria_oficio`.
3. El LLM converge a `work` en el 66% de sus decisiones reales — si se quiere que explore más opciones, hay que cambiar temperatura o prompt.
4. Los jefes son prácticamente inaccesibles con el comportamiento actual de agentes.
5. El oro total crece sin límite — se necesita al menos un sumidero.

### Requieren calibración (hipótesis razonable, parámetro desconocido)

1. ¿Cuánto debe costar el mantenimiento de equipo para reducir la cola superior sin destruir la base? Requiere smoke test con distintos valores.
2. ¿Cuánto diferencial de precio entre ciudades es suficiente para redirigir agentes sin vaciar el mercado de una ciudad? Requiere corrida de 30 días con distintos factores.
3. ¿El costo creciente de fundación de gremios necesita un techo o decaimiento con el tiempo? A 300 días no fue problema (máximo ~12 fundaciones por agente), pero a 1.000+ días podría bloquear a agentes con `ambition` alta.
4. ¿El 27% de novatos permanentes al día 300 es un problema o una distribución razonable?

### Hipótesis todavía no demostradas

1. **¿El pull social (aliados en Valdemarca) refuerza la concentración geográfica?** El score de travel tiene +0.8 por "amigo que se mudó ahí". Con la mayoría de aliados ya en Valdemarca, esto podría ser un ciclo de auto-refuerzo. No se ha verificado separando este factor del resto.

2. **¿Ulra habría robado igual en V3 con política 100% determinista?** No se guardó el desglose individual de PRE-V3 para comparar. Es una pregunta abierta genuina — el 99.7% de crimen vino de ticks deterministas, pero eso no prueba que habría sido igual sin la política LLM (el RNG ya diverge desde el primer tick LLM).

3. **¿El precio diferencial entre ciudades es suficiente para redistribuir agentes o hay un factor de seguridad que domina?** Valdemarca tiene safety 0.9 vs praderas_vann 0.7. Si el agente pondera la seguridad más que el precio, ningún diferencial de mercado redistribuirá. No se ha aislado este factor.

4. **¿Los contratos de gremio producen combate en zonas salvajes?** Los contratos tipo `caza_gremial` deberían llevar a agentes de gremio a zonas con monstruos. No se ha medido qué proporción del combate observado viene de contratos vs comportamiento autónomo.

5. **¿El LLM elegiría `travel` más a menudo si la lista de opciones se presentara en orden de scoring en vez de orden arbitrario?** Actualmente el FilteredWorldView envía `accionesDisponibles` como lista sin orden de preferencia explícito. Posible factor de sesgo hacia las primeras opciones.

---

## Resumen ejecutivo (10-15 puntos)

1. **Valdemarca es un atractor universal** (68.6% de agentes al día 300). Causa: domina en safety, guardStrength, institución, conectividad y mercado simultáneamente. No hay ninguna ciudad que tenga algo que Valdemarca no tenga.

2. **El equipment casi no se usa** (4.3% equipados, ~89% del combate sin arma). Causa: `craft` solo gana con `maestria_oficio` como goal, vender materias primas siempre supera craftear para el resto. No es un bug — es un problema de scoring.

3. **El oro crece sin límite** (23k→196k en 300 días). No hay sumideros reales, solo redistribución. La cola superior acumula sin fricción.

4. **La fricción de malversación por unirse está incompleta**. PRE-V3 tapó fundar→malversar, V3 descubrió unirse→malversar (248 veces de Ulra en 300 días, 99.7% por fórmula determinista).

5. **El LLM solo decide el ~7% de los ticks de sus agentes**. El 93% restante es la misma fórmula determinista. Cualquier análisis de "el LLM hace X" debe cruzar `llm_decisions.jsonl` antes de atribuir comportamiento.

6. **Cuando el LLM es consultado, converge fuertemente a `work`** (66% de las 2.377 decisiones reales). El crimen de Ulra fue 99.7% determinista. La hipótesis original de "el LLM pesa la codicia más directamente" quedó descartada.

7. **El sistema de decisión por instancia está parcialmente implementado** y funciona: travel evalúa destinos concretos, join_guild evalúa cada gremio, help_agent evalúa la necesidad real. Falta extender el mismo patrón a craft, gather y sell.

8. **Los jefes son prácticamente invisibles**. Probabilidad 0.4% por tick + agentes concentrados en una ciudad sin monstruos = 0 boss kills en 300 días. El sistema existe pero no es accesible.

9. **La progresión de clase funciona** pero el 27% de agentes sigue siendo novato al día 300. El triple requisito para tier-2 (nivel 8 + standing institucional + trial) puede ser demasiado largo.

10. **El sistema de relaciones y memoria funciona correctamente**. Las traiciones siguen pesando aunque la afinidad numérica se recupere. No cambiar sin evidencia de problema.

11. **La fricción de fundación de gremios funciona** (456→61 fundaciones, -87%). No degradar.

12. **Los bosses necesitan un mecanismo de anuncio/evento** para ser accesibles. Sin rumores que lleguen a los agentes, son invisibles aunque existan en el seed.

13. **El RNG produce diversidad suficiente** dentro de los parámetros actuales. El problema de homogeneidad es de diseño de mundo (todos en el mismo lugar), no de falta de entropía en el generador.

14. **La separación limpia entre política LLM y determinista es correcta y debe mantenerse**. El mock de decisión (`decision.js`) no se toca — solo se expanden helpers a nuevas capas que la necesiten.

15. **La prioridad inmediata es**: (1) fricción de malversación externa, (2) craft por instancia, (3) sumidero mínimo de oro, (4) diferencial de precios entre ciudades — en ese orden, con smoke test entre cada paso.

---

## Qué partes están basadas en evidencia vs propuestas

### Basado en evidencia (datos reales de experimentos)

- Concentración geográfica: números exactos de V3 y PRE-V3.
- Equipment/crafting: conteos de V3 (craft, sell, equip events).
- LLM: fracción real de decisiones (~7%), convergencia a `work`, desglose de Ulra tick por tick.
- Guild fraud loop: 248 join+malversar de Ulra en V3, desglose determinista/LLM.
- Progresión: distribución de clases al día 300 en V3.
- Economía: curva de oro total, distribución de riqueza.
- Decisiones por instancia: documentado en comentarios de `decision.js`.

### Propuestas de diseño (no probadas en corrida)

- Identidades funcionales de ciudades (precios diferenciales por ciudad).
- Costo de vida periódico como sumidero.
- Craft scoring por margen craftear vs vender materiales.
- Fricción de malversación externa via `broadcastLocalEvent` + penalty en join_guild.
- Sistema de anuncio de bosses via rumores.
- Tier-2 de equipo (solo definición conceptual).

### Discrepancias no resueltas

- **Concentración en V3 (68.6%) vs PRE-V3 (55.7%)**: puede ser efecto de 300 días vs 365, divergencia de RNG, o efecto real del LLM en el mundo compartido. No se puede separar limpiamente.
- **27% de novatos permanentes**: puede ser distribución correcta o bloqueo real. Hipótesis contradictorias documentadas en sección Progresión.
