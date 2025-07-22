import * as Effect from "effect/Effect";
import { MapGraph, Node, Edge } from "./types";

const downtownSeattleNodes: Node[] = [
  { id: "pike-place", lat: 47.6097, lng: -122.3425 },
  { id: "pioneer-square", lat: 47.6021, lng: -122.3365 },
  { id: "waterfront", lat: 47.6062, lng: -122.3390 },
  { id: "belltown", lat: 47.6150, lng: -122.3425 },
  { id: "capitol-hill", lat: 47.6205, lng: -122.3212 },
  { id: "fremont", lat: 47.6517, lng: -122.3517 },
  { id: "queen-anne", lat: 47.6237, lng: -122.3565 },
  { id: "south-lake-union", lat: 47.6205, lng: -122.3370 },
  { id: "denny-triangle", lat: 47.6170, lng: -122.3370 },
  { id: "international-district", lat: 47.5988, lng: -122.3244 },
  { id: "first-hill", lat: 47.6080, lng: -122.3244 },
  { id: "downtown-core", lat: 47.6080, lng: -122.3350 },
  { id: "seattle-center", lat: 47.6205, lng: -122.3493 },
  { id: "magnolia", lat: 47.6358, lng: -122.3993 },
  { id: "ballard", lat: 47.6685, lng: -122.3833 }
];

const downtownSeattleEdges: Edge[] = [
  { id: "e1", from: "pike-place", to: "waterfront", weight: 0.5 },
  { id: "e2", from: "pike-place", to: "downtown-core", weight: 0.3 },
  { id: "e3", from: "pike-place", to: "belltown", weight: 0.4 },
  { id: "e4", from: "waterfront", to: "pioneer-square", weight: 0.6 },
  { id: "e5", from: "pioneer-square", to: "international-district", weight: 0.4 },
  { id: "e6", from: "pioneer-square", to: "first-hill", weight: 0.5 },
  { id: "e7", from: "downtown-core", to: "first-hill", weight: 0.4 },
  { id: "e8", from: "downtown-core", to: "denny-triangle", weight: 0.3 },
  { id: "e9", from: "belltown", to: "denny-triangle", weight: 0.2 },
  { id: "e10", from: "belltown", to: "south-lake-union", weight: 0.3 },
  { id: "e11", from: "denny-triangle", to: "south-lake-union", weight: 0.2 },
  { id: "e12", from: "denny-triangle", to: "capitol-hill", weight: 0.4 },
  { id: "e13", from: "south-lake-union", to: "queen-anne", weight: 0.3 },
  { id: "e14", from: "queen-anne", to: "seattle-center", weight: 0.2 },
  { id: "e15", from: "queen-anne", to: "magnolia", weight: 0.8 },
  { id: "e16", from: "seattle-center", to: "fremont", weight: 0.6 },
  { id: "e17", from: "fremont", to: "ballard", weight: 0.4 },
  { id: "e18", from: "capitol-hill", to: "first-hill", weight: 0.3 },
  { id: "e19", from: "first-hill", to: "international-district", weight: 0.3 }
];

export const createSeattleGraph = (): Effect.Effect<MapGraph> =>
  Effect.succeed({
    nodes: downtownSeattleNodes,
    edges: downtownSeattleEdges
  });

export const findNearestNode = (
  lat: number,
  lng: number,
  graph: MapGraph
): Effect.Effect<Node | null> =>
  Effect.sync(() => {
    let nearest: Node | null = null;
    let minDistance = Infinity;
    
    for (const node of graph.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.lat - lat, 2) + Math.pow(node.lng - lng, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    }
    
    return nearest;
  });

export const getNodeById = (id: string, graph: MapGraph): Effect.Effect<Node | null> =>
  Effect.succeed(graph.nodes.find(node => node.id === id) || null);