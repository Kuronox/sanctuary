# Sanctuary — Resumen para Product Owner: Steps 11 a 14

Fecha: 2026-10-09. Estado: implementados y medidos, **sin commitear**.

## Contexto

Sanctuary es una simulación de 70 agentes autónomos en un mundo de fantasía con reglas y
consecuencias. Cada agente tiene temperamento, metas, oficio, relaciones y tres vidas.

Antes de estos ajustes generamos por primera vez una **crónica de personaje**: la vida de un
agente contada en orden a partir de una corrida de 300 días (`docs/CRONICAS_STEP10.md`).
Leer tres vidas mostró tres comportamientos sin sentido que las tablas de métricas no
dejaban ver. Cada ajuste corrige uno.

Método de los cuatro: un solo cambio por Step, tests automáticos, y simulación de 300 días
en **tres mundos distintos** (seeds a, b, c) comparada contra el Step anterior. Medir con
un solo mundo resultó engañoso: algunas métricas cambian hasta cuatro veces entre mundos
sin tocar nada.

## Step 11 — Comer antes que huir

**Problema.** Un agente débil huía a la ciudad vecina más segura, y esa regla se evaluaba
antes que la de comer. Si la debilidad venía del hambre, el agente caminaba de ida y vuelta
entre dos ciudades con comida hasta morir. Un curandero murió así dos veces.

**Cambio.** Con hambre crítica y comida en la ciudad, el agente come primero. Un agente
débil solo huye si su ciudad es peligrosa; en una ciudad segura se queda a descansar.

**Resultado en los tres mundos.**

| | Antes | Después |
|---|---|---|
| Muertes por hambre | 24 | 2 |
| Episodios de ida y vuelta sin parar | 66 | 9 |

**Veredicto:** funciona. Sin efectos secundarios sistemáticos.

## Step 12 — Regalar oro solo ante necesidad real

**Problema.** Regalar oro era la segunda acción más común del mundo: entre 80.000 y
117.000 regalos por corrida, más que jornadas de trabajo. Entre 67 % y 78 % eran
devoluciones a quien había regalado en las últimas 24 horas: el mismo oro yendo y viniendo.

**Cambio.** Solo se puede regalar a quien tiene hambre y no puede pagar una comida, y solo
regala quien tiene oro de verdad.

**Resultado.**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Regalos | 117.482 → 678 | 88.056 → 949 | 80.743 → 494 |
| Regalos devueltos en 24 h | 78 % → 0 % | 69 % → 0 % | 67 % → 0 % |
| Mediana de oro por agente | 79 → 13 | 144 → 15 | 82 → 20 |
| Derrotas en combate individual | 233 → 595 | 242 → 569 | 232 → 532 |

**Veredicto:** funciona, con dos consecuencias importantes:

- **La mediana de oro cayó a la quinta parte con casi el mismo oro total.** El ida y
  vuelta de regalos funcionaba como redistribución y mantenía a todos cerca de 80 de oro.
  Sin él aparece la distribución real: la mayoría con 13 a 20 de oro y unos pocos con
  decenas de miles.
- **Las derrotas en combate se duplicaron.** No es por pobreza: entre quienes más pierden
  hay agentes muy ricos. Con los turnos que antes gastaban en regalar, los agentes
  temerarios ahora pelean, muchos sin equipo. Sin equipo se pierde un tercio de las
  peleas; con equipo, entre 3 % y 6 %.

## Step 13 — El gremio no readmite a quien expulsó por robar

**Problema.** Una agente codiciosa entraba a un gremio, vaciaba el tesoro, era expulsada y
el mismo gremio la volvía a aceptar, con una espera mediana de 23 horas. En un mundo hizo
sola las 412 malversaciones de la corrida y terminó siendo la más rica.

**Cambio.** Cada gremio recuerda a quien expulsó por malversar y no lo vuelve a aceptar,
ni siquiera después de que el ladrón muera y renazca.

**Resultado.**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Reingresos tras expulsión | 164 → 0 | 207 → 0 | 54 → 0 |
| Malversaciones | 412 → 82 | 401 → 295 | 48 → 54 |
| Oro malversado | 79.280 → 4.696 | 51.100 → 15.606 | 63.977 → 50.874 |
| Gremios disueltos en la corrida | 64 → 31 | 122 → 87 | 27 → 16 |

**Veredicto:** el reingreso desapareció en los tres mundos. Que robar deje de ser negocio
es un resultado mixto: en los mundos a y b los ladrones terminan casi sin oro (la principal
pasó de 40.184 a 16); en el mundo c siguen siendo los más ricos, porque dan pocos golpes
muy grandes y el veto llega después del golpe.

## Decisiones que necesitan al Product Owner

1. **¿Qué economía queremos para el agente común?** Con 13 a 20 de oro de mediana vive al
   día. Opciones: aceptar un mundo duro y desigual, o revisar cuánto rinde una jornada de
   trabajo frente a lo que cuestan la comida y el mantenimiento del equipo.
2. **Robo a gremios que nadie nota.** Una malversación solo se descubre si otro miembro
   está en la misma ciudad. Hubo rachas de 43 robos seguidos al mismo gremio sin que nadie
   se enterara, y un solo golpe puede llevarse hasta el 40 % del tesoro.
3. **Tesoros de gremio inmovilizados.** Entre 87.000 y 150.000 de oro acumulados sin uso.
4. **Casi nadie se equipa.** Solo 10 a 13 de 70 agentes llevan arma al final de una
   corrida, aunque tengan oro de sobra.
5. **Amontonamiento en dos ciudades.** Valdor y Tejor llegan a juntar 61 de 68 agentes y
   se quedan sin comida; en un mundo eso volvió a causar muertes por hambre.

## Pendientes sin investigar

- Mundo b, Step 13: las muertes definitivas subieron de 2 a 8. Es un solo mundo.
- Menos de la mitad de los regalos del Step 12 termina en una comida dentro de 12 horas;
  el umbral de hambre elegido (0,5) puede ser bajo.
- La percepción de peligro del Step 9 casi no se activa porque lo que un agente "sabe" se
  renueva por completo en unas 9 horas en una ciudad poblada.

## Step 14 — Aprender de las derrotas (resultado mixto)

**Problema.** En el Step 13, dos tercios de las derrotas individuales eran repeticiones
contra el mismo monstruo en menos de 7 días, y un curandero llegó a perder 114 peleas en
una corrida. La decisión de pelear no tenía en cuenta haber perdido antes.

**Cambio.** Un agente recuerda sus derrotas contra cada tipo de monstruo durante 7 días, y
cada una le resta ganas de volver a pelearlo solo. Un temerario aprende más lento que un cauto.

**Resultado.**

| | Mundo a | Mundo b | Mundo c |
|---|---|---|---|
| Derrotas repetidas, como parte del total | 64 % → 53 % | 66 % → 48 % | 67 % → 59 % |
| Peor racha de derrotas seguidas | 12 → 6 | 10 → 8 | 7 → 7 |
| Muertes por combate | 19 → 13 | 36 → 32 | 14 → 10 |
| Más derrotas de un solo agente | 114 → 69 | 71 → 102 | 71 → 81 |
| Porcentaje de peleas perdidas | 11,6 % → 10,1 % | 16,5 % → 17,8 % | 12,8 % → 13,4 % |

**Veredicto:** va en la dirección esperada pero es insuficiente. Sigue habiendo agentes
con 69 a 102 derrotas por corrida. Causas probables, sin verificar: el castigo pesa poco
para los temerarios, y la regla no distingue a quien gana casi siempre de quien pierde casi
siempre. No se ajustaron los números después de ver el resultado.

**Decisión para el Product Owner:** dejarlo así, subir el peso, o cambiar la regla para
que mire la proporción de derrotas de cada agente contra ese monstruo en vez de la cantidad.
Reporte: `docs/REPORT_STEP14_APRENDER_DE_LAS_DERROTAS.md`.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Reporte completo de cada Step | `docs/REPORT_STEP11_COMER_ANTES_QUE_HUIR.md`, `docs/REPORT_STEP12_REGALAR_POR_NECESIDAD.md`, `docs/REPORT_STEP13_VETO_DE_GREMIO.md`, `docs/REPORT_STEP14_APRENDER_DE_LAS_DERROTAS.md` |
| Crónicas de personaje | `docs/CRONICAS_STEP10.md`, generadas con `chronicle.mjs` |
| Código modificado | `src/engine/world.js` (Step 11), `src/engine/actions.js` (Steps 12, 13 y 14), `src/engine/decision.js` (Step 14) |
| Tests nuevos | `src/engine/tests/survival_override.test.js`, `help_need.test.js`, `guild_ban.test.js`, `defeat_memory.test.js` |
| Datos de las corridas | carpetas `data_runtime_step11_*` a `_step14_*` (unos 16 GB en total con las anteriores) |
