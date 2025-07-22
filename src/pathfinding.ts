import * as Effect from "effect/Effect";
import { MapGraph, Node, Edge } from "./types";

interface PathNode {
  node: Node;
  gScore: number;
  fScore: number;
  parent: Node | null;
}

const heuristic = (a: Node, b: Node): number => {
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
};

const getNeighbors = (nodeId: string, graph: MapGraph): Node[] => {
  const neighbors: Node[] = [];
  
  for (const edge of graph.edges) {
    if (edge.from === nodeId) {
      const neighbor = graph.nodes.find(n => n.id === edge.to);
      if (neighbor) neighbors.push(neighbor);
    }
    if (edge.to === nodeId) {
      const neighbor = graph.nodes.find(n => n.id === edge.from);
      if (neighbor) neighbors.push(neighbor);
    }
  }
  
  return neighbors;
};

const getEdgeWeight = (fromId: string, toId: string, graph: MapGraph): number => {
  const edge = graph.edges.find(e => 
    (e.from === fromId && e.to === toId) || 
    (e.from === toId && e.to === fromId)
  );
  return edge ? edge.weight : Infinity;
};

const reconstructPath = (
  current: Node,
  cameFrom: Map<string, Node>
): Node[] => {
  const path: Node[] = [current];
  let currentNode = current;
  
  while (cameFrom.has(currentNode.id)) {
    currentNode = cameFrom.get(currentNode.id)!;
    path.unshift(currentNode);
  }
  
  return path;
};

export const findPath = (
  start: Node,
  goal: Node,
  graph: MapGraph
): Effect.Effect<Node[] | null> =>
  Effect.sync(() => {
    if (start.id === goal.id) return [start, goal];
    
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, Node>();
    
    const startPathNode: PathNode = {
      node: start,
      gScore: 0,
      fScore: heuristic(start, goal),
      parent: null
    };
    
    openSet.push(startPathNode);
    
    while (openSet.length > 0) {
      openSet.sort((a, b) => a.fScore - b.fScore);
      const current = openSet.shift()!;
      
      if (current.node.id === goal.id) {
        return reconstructPath(goal, cameFrom);
      }
      
      closedSet.add(current.node.id);
      
      const neighbors = getNeighbors(current.node.id, graph);
      
      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.id)) continue;
        
        const tentativeGScore = current.gScore + getEdgeWeight(current.node.id, neighbor.id, graph);
        
        let neighborInOpen = openSet.find(n => n.node.id === neighbor.id);
        
        if (!neighborInOpen) {
          neighborInOpen = {
            node: neighbor,
            gScore: Infinity,
            fScore: Infinity,
            parent: null
          };
          openSet.push(neighborInOpen);
        }
        
        if (tentativeGScore < neighborInOpen.gScore) {
          cameFrom.set(neighbor.id, current.node);
          neighborInOpen.gScore = tentativeGScore;
          neighborInOpen.fScore = tentativeGScore + heuristic(neighbor, goal);
          neighborInOpen.parent = current.node;
        }
      }
    }
    
    return null;
  });