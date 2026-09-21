// Caminos mas cortos sobre el grafo de localizaciones (8 nodos: BFS trivial,
// no hace falta nada mas sofisticado). Se usa para que "viajar" pueda
// puntuar la conexion concreta que de verdad acerca a un agente a un
// destino que le importa (trabajo aceptado, arbitraje, aliado conocido) en
// vez de puntuar "viajar" como un tipo generico (seccion 17 del encargo V2).

export function buildAdjacency(worldSeed) {
  const adj = {};
  for (const loc of worldSeed.locations) {
    adj[loc.id] = loc.connections.map((c) => ({ to: c.to, hours: c.hours }));
  }
  return adj;
}

// Devuelve el id del primer salto en el camino mas corto de `from` a `to`,
// o null si son el mismo lugar o no hay camino.
export function nextHopToward(adjacency, from, to) {
  if (from === to) return null;
  const visited = new Set([from]);
  const queue = [{ node: from, firstHop: null }];
  while (queue.length) {
    const { node, firstHop } = queue.shift();
    for (const edge of adjacency[node] || []) {
      if (visited.has(edge.to)) continue;
      const hop = firstHop || edge.to;
      if (edge.to === to) return hop;
      visited.add(edge.to);
      queue.push({ node: edge.to, firstHop: hop });
    }
  }
  return null;
}
