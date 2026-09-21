// Economia V2: cada localizacion asentada tiene, ademas de stock de bienes,
// una RESERVA DE ORO finita. Vender le paga al agente desde esa reserva
// (si no alcanza, la venta se recorta o falla); comprar repone la reserva.
// Esto es lo que convierte "vender" de un faucet infinito (V1) en un ciclo
// cerrado: si en un sitio venden mucho mas de lo que compran, su reserva se
// seca y hay que llevarse la mercancia a otro lado (arbitraje real).
//
// Ademas, una fraccion pequeña de cada compra se pierde como impuesto (un
// sumidero de verdad, no reciclado) — ver seccion 7 del encargo V2.

const TAX_RATE = 0.05;
const WILD_STARTING_RESERVE = 40; // no se repone: una vez seca, seca queda.
const SETTLED_STARTING_RESERVE = 220;

export function initMarket(worldSeed) {
  const markets = {};
  for (const loc of worldSeed.locations) {
    const stock = {};
    for (const good of worldSeed.goods) {
      const producesHere = (loc.resources || []).includes(good.id);
      stock[good.id] = producesHere ? 40 : 10;
    }
    markets[loc.id] = {
      stock,
      goldReserve: loc.governance === "ninguna" ? WILD_STARTING_RESERVE : SETTLED_STARTING_RESERVE,
      settled: loc.governance !== "ninguna",
    };
  }
  return markets;
}

export function goodDef(worldSeed, goodId) {
  return worldSeed.goods.find((g) => g.id === goodId);
}

export function priceAt(worldSeed, markets, locationId, goodId) {
  const def = goodDef(worldSeed, goodId);
  if (!def) return null;
  const market = markets[locationId];
  const stock = market.stock[goodId] ?? 0;
  const ref = 25;
  const ratio = ref / Math.max(3, stock);
  const price = def.basePrice * Math.min(3, Math.max(0.4, ratio));
  return Math.max(1, Math.round(price * 100) / 100);
}

export function buy(worldSeed, markets, locationId, goodId, qty, taxDiscount = 0) {
  const market = markets[locationId];
  const unitPrice = priceAt(worldSeed, markets, locationId, goodId);
  const available = market.stock[goodId] ?? 0;
  const actualQty = Math.min(qty, available);
  if (actualQty <= 0) return null;
  const subtotal = Math.round(unitPrice * actualQty * 100) / 100;
  const effectiveTaxRate = Math.max(0, TAX_RATE - taxDiscount);
  const tax = market.settled ? Math.round(subtotal * effectiveTaxRate * 100) / 100 : 0;
  const totalCost = subtotal + tax;
  market.stock[goodId] -= actualQty;
  market.goldReserve += subtotal; // el impuesto se pierde, el resto repone la reserva
  return { qty: actualQty, unitPrice, subtotal, tax, totalCost };
}

// Vender le paga al agente DESDE la reserva local. Si la reserva no alcanza,
// se recorta la cantidad vendible (o falla si no alcanza ni para 1 unidad).
export function sell(worldSeed, markets, locationId, goodId, qty) {
  const market = markets[locationId];
  const unitPrice = priceAt(worldSeed, markets, locationId, goodId) * 0.85; // margen del mercado
  const maxByReserve = Math.floor(market.goldReserve / Math.max(0.01, unitPrice));
  const actualQty = Math.min(qty, maxByReserve);
  if (actualQty <= 0) return null;
  market.stock[goodId] = (market.stock[goodId] ?? 0) + actualQty;
  const totalGain = Math.round(unitPrice * actualQty * 100) / 100;
  market.goldReserve = Math.max(0, market.goldReserve - totalGain);
  return { qty: actualQty, unitPrice, totalGain, reserveExhausted: actualQty < qty };
}

export function repairCost(worldSeed, itemId, missingDurability, discount = 0) {
  const def = goodDef(worldSeed, itemId);
  if (!def || !def.durability) return 0;
  const fraction = missingDurability / def.durability;
  const base = def.basePrice * 0.6 * fraction;
  return Math.max(1, Math.round(base * (1 - Math.min(0.6, discount))));
}

// Regeneracion/consumo natural del mercado cada tick.
export function tickMarkets(worldSeed, markets, populationByLocation = {}) {
  for (const loc of worldSeed.locations) {
    const market = markets[loc.id];
    for (const res of loc.resources || []) {
      market.stock[res] = Math.min(80, (market.stock[res] ?? 0) + 0.5);
    }
    if (market.settled) {
      // La reposicion de comida representa produccion de fondo de NPCs no
      // simulados (ver seccion 7 de V1/V2). Con una poblacion fija esa tasa
      // no importaba mucho, pero a escala de 70 agentes concentrados en una
      // sola ciudad una tasa fija (pensada para ~5-15 residentes) se queda
      // corta y la reserva se seca del todo: un agente sin oro puede quedar
      // atrapado huyendo para siempre entre dos ciudades igual de vacias
      // (se vio jugando la simulacion con 70 agentes: salud 7, oro 0,
      // reserva de comida en 0 en las dos ciudades mas cercanas). La
      // reposicion y el tope ahora escalan con cuanta gente vive ahi.
      const pop = populationByLocation[loc.id] || 0;
      // Bonus por recursos alimentarios propios (grano/pescado): ciudades
      // agricolas y pesqueras producen comida independientemente de cuanta
      // gente viva alli — rompe el bucle pop-alta→mas-comida→mas-pop de Valdor.
      const foodBonus = (loc.resources || []).filter((r) => r === "grano" || r === "pescado").length * 0.4;
      const regen = 0.6 + Math.min(pop, 8) * 0.05 + foodBonus;
      const cap = Math.max(30, pop * 0.8 + 10);
      market.stock.racion_comida = Math.min(cap, (market.stock.racion_comida ?? 0) + regen);
      // pequeño flujo de fondo (impuestos generales, no solo de trade) para
      // que ciudades muy visitadas no queden secas para siempre por una mala racha.
      market.goldReserve = Math.min(SETTLED_STARTING_RESERVE * 2, market.goldReserve + 0.4);
    }
    for (const good of worldSeed.goods) {
      if (good.category === "consumible") {
        market.stock[good.id] = Math.max(0, (market.stock[good.id] ?? 0) - 0.1);
      }
    }
  }
}
