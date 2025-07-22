// Polygon utility functions for the mapping application

export interface PolygonPoint {
  lat: number;
  lng: number;
}

// Create a sensible polygon from scattered points using concave hull algorithm
export function createConcaveHull(points: PolygonPoint[]): PolygonPoint[] {
  if (points.length < 3) return points;
  
  // Start with convex hull
  const hull = convexHull(points);
  
  // If we have enough points, try to include interior points
  if (points.length > hull.length && hull.length >= 3) {
    return expandHullWithInteriorPoints(hull, points);
  }
  
  return hull;
}

function convexHull(points: PolygonPoint[]): PolygonPoint[] {
  if (points.length < 3) return points;
  
  const sortedPoints = points.slice().sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  
  // Build lower hull
  const lower: PolygonPoint[] = [];
  for (const point of sortedPoints) {
    while (lower.length >= 2 && crossProduct(lower[lower.length-2], lower[lower.length-1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  
  // Build upper hull
  const upper: PolygonPoint[] = [];
  for (let i = sortedPoints.length - 1; i >= 0; i--) {
    const point = sortedPoints[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length-2], upper[upper.length-1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  
  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();
  
  return lower.concat(upper);
}

function crossProduct(o: PolygonPoint, a: PolygonPoint, b: PolygonPoint): number {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
}

function expandHullWithInteriorPoints(hull: PolygonPoint[], allPoints: PolygonPoint[]): PolygonPoint[] {
  // Find points that are close to hull edges and include them for a more natural shape
  const expandedHull = [...hull];
  const hullSet = new Set(hull.map(p => `${p.lat},${p.lng}`));
  
  for (const point of allPoints) {
    const pointKey = `${point.lat},${point.lng}`;
    if (hullSet.has(pointKey)) continue;
    
    // Find the closest edge in the hull
    let minDistance = Infinity;
    let insertIndex = -1;
    
    for (let i = 0; i < hull.length; i++) {
      const nextI = (i + 1) % hull.length;
      const distance = pointToLineDistance(point, hull[i], hull[nextI]);
      
      if (distance < minDistance && distance < 0.001) { // Within ~100m
        minDistance = distance;
        insertIndex = nextI;
      }
    }
    
    if (insertIndex !== -1) {
      expandedHull.splice(insertIndex, 0, point);
    }
  }
  
  return expandedHull;
}

function pointToLineDistance(point: PolygonPoint, lineStart: PolygonPoint, lineEnd: PolygonPoint): number {
  const A = point.lng - lineStart.lng;
  const B = point.lat - lineStart.lat;
  const C = lineEnd.lng - lineStart.lng;
  const D = lineEnd.lat - lineStart.lat;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return Math.sqrt(A * A + B * B);
  
  const param = dot / lenSq;
  let xx, yy;
  
  if (param < 0) {
    xx = lineStart.lng;
    yy = lineStart.lat;
  } else if (param > 1) {
    xx = lineEnd.lng;
    yy = lineEnd.lat;
  } else {
    xx = lineStart.lng + param * C;
    yy = lineStart.lat + param * D;
  }
  
  const dx = point.lng - xx;
  const dy = point.lat - yy;
  return Math.sqrt(dx * dx + dy * dy);
}