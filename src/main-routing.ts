import './style.css';
import * as L from 'leaflet';
import 'leaflet-routing-machine';

interface PathSegment {
  id: string;
  waypoints: L.LatLng[];
  routingControl: L.Routing.Control;
  editable: boolean;
  isHighlighted: boolean;
}

interface CompletePath {
  id: string;
  name: string;
  segments: PathSegment[];
  createdAt: Date;
  color: string;
  visible: boolean;
}

interface Polygon {
  id: string;
  name: string;
  points: L.LatLng[];
  createdAt: Date;
  color: string;
  visible: boolean;
  leafletPolygon: L.Polygon;
}

class PathBuilderApp {
  private map: L.Map;
  private segments: PathSegment[] = [];
  private isBuilding: boolean = false;
  private currentWaypoints: L.LatLng[] = [];
  private tempMarkers: L.Marker[] = [];
  private walkwaysLayer: L.LayerGroup | null = null;
  private savedPaths: CompletePath[] = [];
  private pathCounter: number = 1;
  
  // Polygon mode properties
  private polygonMode: boolean = false;
  private polygonPoints: L.LatLng[] = [];
  private polygonMarkers: L.Marker[] = [];
  private savedPolygons: Polygon[] = [];
  private polygonCounter: number = 1;

  constructor() {
    this.initializeMap();
    this.setupEventListeners();
    // Auto-show walkways on startup and set checkbox to checked
    setTimeout(() => {
      const checkbox = document.getElementById('show-walkways') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = true;
      }
      this.showWalkablePaths();
    }, 1000);
  }

  private initializeMap(): void {
    this.map = L.map('map').setView([47.6097, -122.3425], 19);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 20
    }).addTo(this.map);

    this.map.on('click', (e) => {
      // Route to appropriate handler based on current mode
      const pathModeRadio = document.querySelector('input[name="mode"][value="path"]') as HTMLInputElement;
      const isPathMode = pathModeRadio?.checked;
      
      if (isPathMode) {
        this.handlePathClick(e);
        this.resetSegmentHighlighting();
      } else {
        this.handlePolygonClick(e);
      }
    });
  }

  private setupEventListeners(): void {
    // Mode switching
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => this.switchMode((e.target as HTMLInputElement).value));
    });

    // Path controls
    const startPathBtn = document.getElementById('start-path');
    const finishPathBtn = document.getElementById('finish-path');
    const clearPathBtn = document.getElementById('clear-path');

    startPathBtn?.addEventListener('click', () => this.startNewPath());
    finishPathBtn?.addEventListener('click', () => this.finishCurrentPath());
    clearPathBtn?.addEventListener('click', () => this.clearPath());

    // Polygon controls
    const startPolygonBtn = document.getElementById('start-polygon');
    const finishPolygonBtn = document.getElementById('finish-polygon');
    const clearPolygonBtn = document.getElementById('clear-polygon');

    startPolygonBtn?.addEventListener('click', () => this.startNewPolygon());
    finishPolygonBtn?.addEventListener('click', () => this.finishCurrentPolygon());
    clearPolygonBtn?.addEventListener('click', () => this.clearPolygon());

    // Walkways toggle
    const showWalkwaysCheckbox = document.getElementById('show-walkways') as HTMLInputElement;
    showWalkwaysCheckbox?.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) {
        this.showWalkablePaths();
      } else {
        this.hideWalkablePaths();
      }
    });
  }

  private startNewPath(): void {
    console.log('Starting new path');
    this.isBuilding = true;
    this.currentWaypoints = [];
    this.clearTempMarkers();
    this.updateUI();
  }

  private clearPath(): void {
    this.isBuilding = false;
    this.currentWaypoints = [];
    this.clearTempMarkers();
    this.segments.forEach(segment => {
      this.map.removeControl(segment.routingControl);
    });
    this.segments = [];
    this.updateSegmentsList();
    this.updateUI();
  }

  private clearTempMarkers(): void {
    this.tempMarkers.forEach(marker => this.map.removeLayer(marker));
    this.tempMarkers = [];
  }

  private handlePathClick(e: L.LeafletMouseEvent): void {
    if (!this.isBuilding) return;

    console.log('Path mode - Map clicked at:', e.latlng);
    
    // Add waypoint marker
    const marker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'waypoint-marker',
        html: `<div style="background: ${this.currentWaypoints.length === 0 ? '#28a745' : '#007bff'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(this.map);

    this.tempMarkers.push(marker);
    this.currentWaypoints.push(e.latlng);

    // If we have at least 2 waypoints, create a route segment
    if (this.currentWaypoints.length >= 2) {
      this.createRouteSegment();
    }
  }

  private handlePolygonClick(e: L.LeafletMouseEvent): void {
    if (!this.polygonMode) return;

    console.log('Polygon mode - Map clicked at:', e.latlng);
    
    // Add polygon point marker (different style from path markers)
    const marker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'polygon-marker',
        html: '<div style="background: #ff6b35; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })
    }).addTo(this.map);

    this.polygonMarkers.push(marker);
    this.polygonPoints.push(e.latlng);

    this.updatePolygonPointCount();
    this.updateUI(); // Enable finish button when we have enough points
  }

  private createRouteSegment(): void {
    // Mark previous segments as non-editable (but don't recreate controls yet)
    this.segments.forEach(segment => {
      segment.editable = false;
      // We'll change colors only when highlighting is needed
    });

    const segmentWaypoints = [...this.currentWaypoints];
    
    const routingControl = L.Routing.control({
      waypoints: segmentWaypoints.map(wp => L.Routing.waypoint(wp)),
      routeWhileDragging: true,
      addWaypoints: false,
      createMarker: () => null, // We handle markers ourselves
      lineOptions: {
        styles: [{ color: '#28a745', weight: 4, opacity: 0.8 }]
      },
      show: false, // Hide the directions panel
      router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        profile: 'foot-walking', // Proper walking profile on walking server
        optimize: false
      })
    }).addTo(this.map);

    const segment: PathSegment = {
      id: `segment-${this.segments.length + 1}`,
      waypoints: segmentWaypoints,
      routingControl: routingControl,
      editable: true,
      isHighlighted: false
    };

    this.segments.push(segment);
    
    // Keep only the last waypoint for the next segment
    this.currentWaypoints = [this.currentWaypoints[this.currentWaypoints.length - 1]];
    
    // Clear temp markers except the last one
    this.clearTempMarkers();
    const lastMarker = L.marker(segment.waypoints[segment.waypoints.length - 1], {
      icon: L.divIcon({
        className: 'waypoint-marker',
        html: '<div style="background: #28a745; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(this.map);
    
    this.tempMarkers.push(lastMarker);

    this.updateSegmentsList();
    this.updateUI(); // Enable finish button now that we have segments
  }

  private updateSegmentsList(): void {
    const segmentsList = document.getElementById('segments');
    if (!segmentsList) return;

    segmentsList.innerHTML = '';

    this.segments.forEach((segment, index) => {
      const li = document.createElement('li');
      li.textContent = `Segment ${index + 1} (${segment.waypoints.length} waypoints)`;
      
      if (segment.editable) {
        li.classList.add('current');
      }

      li.addEventListener('click', () => this.highlightSegment(segment));
      segmentsList.appendChild(li);
    });
  }

  private highlightSegment(segment: PathSegment): void {
    // Clear any existing highlights first
    this.resetSegmentHighlighting();

    // Update UI list highlighting
    const segmentsList = document.getElementById('segments');
    if (segmentsList) {
      Array.from(segmentsList.children).forEach((child, index) => {
        child.classList.toggle('active', this.segments[index] === segment);
      });
    }

    // Focus the map on the selected segment without recreating controls
    if (segment.waypoints.length > 0) {
      const bounds = L.latLngBounds(segment.waypoints);
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }

    // Add a temporary red overlay for highlighting
    const redOverlay = L.polyline(segment.waypoints, {
      color: '#dc3545',
      weight: 8,
      opacity: 0.7
    }).addTo(this.map);

    // Store reference to remove later
    (segment as any).highlightOverlay = redOverlay;
  }

  private resetSegmentHighlighting(): void {
    // Remove any red highlight overlays
    this.segments.forEach(segment => {
      if ((segment as any).highlightOverlay) {
        this.map.removeLayer((segment as any).highlightOverlay);
        delete (segment as any).highlightOverlay;
      }
    });

    // Remove active class from all list items
    const segmentsList = document.getElementById('segments');
    if (segmentsList) {
      Array.from(segmentsList.children).forEach(child => {
        child.classList.remove('active');
      });
    }
  }

  private async showWalkablePaths(): Promise<void> {
    if (this.walkwaysLayer) {
      this.map.removeLayer(this.walkwaysLayer);
    }

    this.walkwaysLayer = L.layerGroup();

    // Get current map bounds
    const bounds = this.map.getBounds();
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["highway"~"^(footway|pedestrian|steps|crossing|path|cycleway)$"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        way["foot"="yes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        way["sidewalk"~"^(both|left|right|yes)$"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      );
      out geom;
    `;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });

      const data = await response.json();
      
      if (data.elements) {
        data.elements.forEach((element: any) => {
          if (element.type === 'way' && element.geometry && this.walkwaysLayer) {
            const coords = element.geometry.map((node: any) => [node.lat, node.lon] as [number, number]);
            
            const color = this.getWalkwayColor(element.tags || {});
            
            const polyline = L.polyline(coords, {
              color: color,
              weight: 2,
              opacity: 0.7,
              dashArray: element.tags?.highway === 'crossing' ? '5, 5' : undefined
            });
            
            this.walkwaysLayer.addLayer(polyline);
          }
        });
      }

      if (this.walkwaysLayer) {
        this.walkwaysLayer.addTo(this.map);
      }
    } catch (error) {
      console.error('Failed to load walkable paths:', error);
      // Create empty layer even if fetch fails
      if (this.walkwaysLayer) {
        this.walkwaysLayer.addTo(this.map);
      }
    }
  }

  private getWalkwayColor(tags: any): string {
    if (tags.highway === 'footway' || tags.highway === 'pedestrian') return '#ff9800';
    if (tags.highway === 'crossing') return '#f44336';
    if (tags.highway === 'steps') return '#9c27b0';
    if (tags.highway === 'path') return '#4caf50';
    if (tags.sidewalk) return '#2196f3';
    return '#607d8b';
  }

  private hideWalkablePaths(): void {
    if (this.walkwaysLayer) {
      this.map.removeLayer(this.walkwaysLayer);
      this.walkwaysLayer = null;
    }
  }

  private finishCurrentPath(): void {
    if (this.segments.length === 0) return;
    
    // Prompt for path name
    const pathName = prompt('Enter name for this path:', `Path ${this.pathCounter}`) || `Path ${this.pathCounter}`;
    
    // Generate random color for this path
    const colors = ['#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#795548'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Create complete path
    const completePath: CompletePath = {
      id: `path-${Date.now()}`,
      name: pathName,
      segments: [...this.segments], // Copy segments
      createdAt: new Date(),
      color: color,
      visible: true
    };
    
    // Update segment colors to match path color
    completePath.segments.forEach(segment => {
      segment.editable = false;
      this.map.removeControl(segment.routingControl);
      
      const coloredControl = L.Routing.control({
        waypoints: segment.waypoints.map(wp => L.Routing.waypoint(wp)),
        routeWhileDragging: false,
        addWaypoints: false,
        createMarker: () => null,
        lineOptions: {
          styles: [{ color: color, weight: 4, opacity: 0.8 }]
        },
        show: false,
        router: L.Routing.osrmv1({
          serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
          profile: 'foot-walking',
          optimize: false
        })
      }).addTo(this.map);
      
      segment.routingControl = coloredControl;
    });
    
    this.savedPaths.push(completePath);
    this.pathCounter++;
    
    // Reset current path building
    this.segments = [];
    this.isBuilding = false;
    this.currentWaypoints = [];
    this.clearTempMarkers();
    
    // Update UI
    this.updateSegmentsList();
    this.updatePathwaysList();
    this.updateUI();
    
    console.log('Path finished and saved:', pathName);
  }

  private updatePathwaysList(): void {
    const pathwaysList = document.getElementById('pathways-list');
    if (!pathwaysList) return;

    pathwaysList.innerHTML = '';

    this.savedPaths.forEach(path => {
      const li = document.createElement('li');
      li.className = 'pathway-item';
      li.innerHTML = `
        <div class="pathway-info">
          <span class="pathway-color" style="background-color: ${path.color}"></span>
          <span class="pathway-name">${path.name}</span>
          <span class="pathway-segments">(${path.segments.length} segments)</span>
        </div>
        <div class="pathway-actions">
          <button class="highlight-btn" data-path-id="${path.id}">👁️</button>
          <button class="edit-btn" data-path-id="${path.id}">✏️</button>
          <button class="delete-btn" data-path-id="${path.id}">🗑️</button>
        </div>
      `;

      // Add event listeners for pathway actions
      const highlightBtn = li.querySelector('.highlight-btn');
      const editBtn = li.querySelector('.edit-btn');
      const deleteBtn = li.querySelector('.delete-btn');

      highlightBtn?.addEventListener('click', () => this.highlightPath(path));
      editBtn?.addEventListener('click', () => this.editPathName(path));
      deleteBtn?.addEventListener('click', () => this.deletePath(path));

      pathwaysList.appendChild(li);
    });
  }

  private highlightPath(path: CompletePath): void {
    // Clear any existing highlights
    this.resetSegmentHighlighting();
    
    // Highlight all segments in this path
    path.segments.forEach(segment => {
      const bounds = L.latLngBounds(segment.waypoints);
      const highlightOverlay = L.polyline(segment.waypoints, {
        color: '#ffeb3b',
        weight: 8,
        opacity: 0.8
      }).addTo(this.map);
      
      (segment as any).highlightOverlay = highlightOverlay;
    });
    
    // Zoom to show entire path
    if (path.segments.length > 0) {
      const allWaypoints = path.segments.flatMap(s => s.waypoints);
      const bounds = L.latLngBounds(allWaypoints);
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  private editPathName(path: CompletePath): void {
    const newName = prompt('Enter new name for this path:', path.name);
    if (newName && newName !== path.name) {
      path.name = newName;
      this.updatePathwaysList();
    }
  }

  private deletePath(path: CompletePath): void {
    if (confirm(`Are you sure you want to delete "${path.name}"?`)) {
      // Remove path segments from map
      path.segments.forEach(segment => {
        this.map.removeControl(segment.routingControl);
      });
      
      // Remove from saved paths
      this.savedPaths = this.savedPaths.filter(p => p.id !== path.id);
      this.updatePathwaysList();
    }
  }

  // Mode switching
  private switchMode(mode: string): void {
    const pathControls = document.getElementById('path-controls');
    const polygonControls = document.getElementById('polygon-controls');
    
    if (mode === 'polygon') {
      // Switch to polygon mode
      this.polygonMode = true;
      this.isBuilding = false; // Stop any path building
      
      // Clear current path building
      this.clearPath();
      
      // Show/hide appropriate controls
      if (pathControls) pathControls.style.display = 'none';
      if (polygonControls) polygonControls.style.display = 'block';
      
      console.log('Switched to Polygon Mode');
    } else {
      // Switch to path mode
      this.polygonMode = false;
      
      // Clear current polygon building
      this.clearPolygon();
      
      // Show/hide appropriate controls
      if (pathControls) pathControls.style.display = 'block';
      if (polygonControls) polygonControls.style.display = 'none';
      
      console.log('Switched to Path Mode');
    }
    
    this.updateUI();
  }

  // Polygon methods
  private startNewPolygon(): void {
    console.log('Starting new polygon');
    this.polygonMode = true;
    this.polygonPoints = [];
    this.clearPolygonMarkers();
    this.updatePolygonPointCount();
    this.updateUI();
  }

  private finishCurrentPolygon(): void {
    if (this.polygonPoints.length < 3) return;
    
    // Prompt for polygon name
    const polygonName = prompt('Enter name for this polygon:', `Polygon ${this.polygonCounter}`) || `Polygon ${this.polygonCounter}`;
    
    // Use the concave hull algorithm to create sensible polygon
    const hullPoints = this.createConcaveHull(this.polygonPoints);
    
    // Generate random color for this polygon
    const colors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Create Leaflet polygon
    const leafletPolygon = L.polygon(hullPoints, {
      color: color,
      fillColor: color,
      fillOpacity: 0.3,
      weight: 3,
      opacity: 0.8
    }).addTo(this.map);
    
    // Create complete polygon object
    const completedPolygon: Polygon = {
      id: `polygon-${Date.now()}`,
      name: polygonName,
      points: hullPoints,
      createdAt: new Date(),
      color: color,
      visible: true,
      leafletPolygon: leafletPolygon
    };
    
    this.savedPolygons.push(completedPolygon);
    this.polygonCounter++;
    
    // Reset polygon building
    this.polygonMode = false;
    this.polygonPoints = [];
    this.clearPolygonMarkers();
    
    // Update UI
    this.updatePolygonPointCount();
    this.updatePolygonsList();
    this.updateUI();
    
    console.log('Polygon finished and saved:', polygonName);
  }

  private clearPolygon(): void {
    this.polygonMode = false;
    this.polygonPoints = [];
    this.clearPolygonMarkers();
    this.updatePolygonPointCount();
    this.updateUI();
  }

  private clearPolygonMarkers(): void {
    this.polygonMarkers.forEach(marker => this.map.removeLayer(marker));
    this.polygonMarkers = [];
  }

  private updatePolygonPointCount(): void {
    const pointCountDiv = document.getElementById('polygon-point-count');
    if (pointCountDiv) {
      pointCountDiv.textContent = `${this.polygonPoints.length} points`;
    }
  }

  private updatePolygonsList(): void {
    const polygonsList = document.getElementById('polygons-list');
    if (!polygonsList) return;

    polygonsList.innerHTML = '';

    this.savedPolygons.forEach(polygon => {
      const li = document.createElement('li');
      li.className = 'polygon-item';
      li.innerHTML = `
        <div class="polygon-info">
          <span class="polygon-color" style="background-color: ${polygon.color}"></span>
          <span class="polygon-name">${polygon.name}</span>
          <span class="polygon-points">(${polygon.points.length} points)</span>
        </div>
        <div class="polygon-actions">
          <button class="highlight-btn" data-polygon-id="${polygon.id}">👁️</button>
          <button class="edit-btn" data-polygon-id="${polygon.id}">✏️</button>
          <button class="delete-btn" data-polygon-id="${polygon.id}">🗑️</button>
        </div>
      `;

      // Add event listeners for polygon actions
      const highlightBtn = li.querySelector('.highlight-btn');
      const editBtn = li.querySelector('.edit-btn');
      const deleteBtn = li.querySelector('.delete-btn');

      highlightBtn?.addEventListener('click', () => this.highlightPolygon(polygon));
      editBtn?.addEventListener('click', () => this.editPolygonName(polygon));
      deleteBtn?.addEventListener('click', () => this.deletePolygon(polygon));

      polygonsList.appendChild(li);
    });
  }

  private highlightPolygon(polygon: Polygon): void {
    // Clear existing highlights
    this.resetSegmentHighlighting();
    
    // Temporarily change polygon style to highlight it
    polygon.leafletPolygon.setStyle({
      color: '#ffeb3b',
      fillColor: '#ffeb3b',
      weight: 6,
      opacity: 1.0,
      fillOpacity: 0.5
    });
    
    // Zoom to polygon
    this.map.fitBounds(polygon.leafletPolygon.getBounds(), { padding: [20, 20] });
    
    // Reset style after a moment
    setTimeout(() => {
      polygon.leafletPolygon.setStyle({
        color: polygon.color,
        fillColor: polygon.color,
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.3
      });
    }, 2000);
  }

  private editPolygonName(polygon: Polygon): void {
    const newName = prompt('Enter new name for this polygon:', polygon.name);
    if (newName && newName !== polygon.name) {
      polygon.name = newName;
      this.updatePolygonsList();
    }
  }

  private deletePolygon(polygon: Polygon): void {
    if (confirm(`Are you sure you want to delete "${polygon.name}"?`)) {
      // Remove polygon from map
      this.map.removeLayer(polygon.leafletPolygon);
      
      // Remove from saved polygons
      this.savedPolygons = this.savedPolygons.filter(p => p.id !== polygon.id);
      this.updatePolygonsList();
    }
  }

  // Concave Hull Algorithm - creates sensible polygon from scattered points
  private createConcaveHull(points: L.LatLng[]): L.LatLng[] {
    if (points.length < 3) return points;
    
    // For simplicity, we'll use a modified convex hull approach
    // that includes more points to create a more natural shape
    
    // Start with convex hull
    const hull = this.convexHull(points);
    
    // If we have enough points, try to include interior points
    if (points.length > hull.length && hull.length >= 3) {
      return this.expandHullWithInteriorPoints(hull, points);
    }
    
    return hull;
  }

  private convexHull(points: L.LatLng[]): L.LatLng[] {
    if (points.length < 3) return points;
    
    const sortedPoints = points.slice().sort((a, b) => a.lng - b.lng || a.lat - b.lat);
    
    // Build lower hull
    const lower = [];
    for (const point of sortedPoints) {
      while (lower.length >= 2 && this.crossProduct(lower[lower.length-2], lower[lower.length-1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }
    
    // Build upper hull
    const upper = [];
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      const point = sortedPoints[i];
      while (upper.length >= 2 && this.crossProduct(upper[upper.length-2], upper[upper.length-1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }
    
    // Remove last point of each half because it's repeated
    lower.pop();
    upper.pop();
    
    return lower.concat(upper);
  }

  private crossProduct(o: L.LatLng, a: L.LatLng, b: L.LatLng): number {
    return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  }

  private expandHullWithInteriorPoints(hull: L.LatLng[], allPoints: L.LatLng[]): L.LatLng[] {
    // Find points that are close to hull edges and include them
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
        const distance = this.pointToLineDistance(point, hull[i], hull[nextI]);
        
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

  private pointToLineDistance(point: L.LatLng, lineStart: L.LatLng, lineEnd: L.LatLng): number {
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

  private updateUI(): void {
    const startBtn = document.getElementById('start-path') as HTMLButtonElement;
    const finishBtn = document.getElementById('finish-path') as HTMLButtonElement;
    const clearBtn = document.getElementById('clear-path') as HTMLButtonElement;

    const startPolygonBtn = document.getElementById('start-polygon') as HTMLButtonElement;
    const finishPolygonBtn = document.getElementById('finish-polygon') as HTMLButtonElement;
    const clearPolygonBtn = document.getElementById('clear-polygon') as HTMLButtonElement;

    // Path controls
    if (startBtn && finishBtn && clearBtn) {
      startBtn.disabled = this.isBuilding;
      finishBtn.disabled = !this.isBuilding || this.segments.length === 0;
      clearBtn.disabled = this.segments.length === 0 && !this.isBuilding;
    }

    // Polygon controls
    if (startPolygonBtn && finishPolygonBtn && clearPolygonBtn) {
      startPolygonBtn.disabled = this.polygonMode;
      finishPolygonBtn.disabled = !this.polygonMode || this.polygonPoints.length < 3;
      clearPolygonBtn.disabled = this.polygonPoints.length === 0 && !this.polygonMode;
    }
  }
}

new PathBuilderApp();