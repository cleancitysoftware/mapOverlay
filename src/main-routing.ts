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

interface InterestPointType {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: Date;
}

interface InterestPoint {
  id: string;
  typeId: string;
  name: string;
  description: string;
  position: L.LatLng;
  createdAt: Date;
  leafletMarker: L.Marker;
}

interface Session {
  id: string;
  name: string;
  createdAt: Date;
  lastModified: Date;
  paths: CompletePath[];
  polygons: Polygon[];
  interestPointTypes: InterestPointType[];
  interestPoints: Omit<InterestPoint, 'leafletMarker'>[];
  mapCenter: L.LatLng;
  mapZoom: number;
}

class PathBuilderApp {
  private map!: L.Map; // Initialized in constructor
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
  
  // Interest Points mode properties
  // private _interestPointMode: boolean = false; // Commented out - unused
  private selectedPointType: InterestPointType | null = null;
  private pointTypes: InterestPointType[] = [];
  private interestPoints: InterestPoint[] = [];
  private animatingPoints: Set<string> = new Set();

  // Path Animation properties
  private selectedPath: CompletePath | null = null;
  private animationMarker: L.Marker | null = null;
  private animationSpeed: number = 5; // 1-10 scale
  private animationRunning: boolean = false;
  private animationRequestId: number | null = null;

  // Session Management properties
  private currentSession: Session | null = null;
  private allSessions: Session[] = [];
  private sessionCounter: number = 1;

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
      const polygonModeRadio = document.querySelector('input[name="mode"][value="polygon"]') as HTMLInputElement;
      const interestModeRadio = document.querySelector('input[name="mode"][value="interest"]') as HTMLInputElement;
      
      if (pathModeRadio?.checked) {
        this.handlePathClick(e);
        this.resetSegmentHighlighting();
      } else if (polygonModeRadio?.checked) {
        this.handlePolygonClick(e);
      } else if (interestModeRadio?.checked) {
        this.handleInterestPointClick(e);
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

    // Interest Points controls
    const addTypeBtn = document.getElementById('add-type-btn');
    const pointTypeDropdown = document.getElementById('point-type-dropdown') as HTMLSelectElement;
    const stopPlacementBtn = document.getElementById('stop-placement');

    addTypeBtn?.addEventListener('click', () => this.addNewPointType());
    pointTypeDropdown?.addEventListener('change', (e) => {
      const selectedTypeId = (e.target as HTMLSelectElement).value;
      this.selectPointType(selectedTypeId);
    });
    stopPlacementBtn?.addEventListener('click', () => this.stopPointPlacement());

    // Path Animation controls
    const animatePathBtn = document.getElementById('animate-path');
    const stopAnimationBtn = document.getElementById('stop-animation');
    const speedSlider = document.getElementById('animation-speed') as HTMLInputElement;

    animatePathBtn?.addEventListener('click', () => this.startPathAnimation());
    stopAnimationBtn?.addEventListener('click', () => this.stopPathAnimation());
    speedSlider?.addEventListener('input', (e) => {
      this.animationSpeed = parseInt((e.target as HTMLInputElement).value);
    });

    // Session controls
    const newSessionBtn = document.getElementById('new-session-btn');
    const switchSessionBtn = document.getElementById('switch-session-btn');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const deleteSessionBtn = document.getElementById('delete-session-btn');

    newSessionBtn?.addEventListener('click', () => this.createNewSession());
    switchSessionBtn?.addEventListener('click', () => this.showSessionSwitcher());
    saveSessionBtn?.addEventListener('click', () => this.saveCurrentSession());
    deleteSessionBtn?.addEventListener('click', () => this.deleteCurrentSession());

    // Walkways toggle
    const showWalkwaysCheckbox = document.getElementById('show-walkways') as HTMLInputElement;
    showWalkwaysCheckbox?.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) {
        this.showWalkablePaths();
      } else {
        this.hideWalkablePaths();
      }
    });

    // Initialize with some default point types
    this.initializeDefaultPointTypes();
    
    // Initialize animation controls
    this.updateAnimationControls();
    
    // Initialize session management
    this.initializeSessions();
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
      // createMarker: () => null, // We handle markers ourselves - removed due to strict types
      lineOptions: {
        styles: [{ color: '#28a745', weight: 4, opacity: 0.8 }],
        extendToWaypoints: true,
        missingRouteTolerance: 10
      },
      show: false, // Hide the directions panel
      fitSelectedRoutes: false, // Prevent auto-zoom when route is calculated
      router: L.Routing.osrmv1({
        serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        profile: 'foot-walking' // Proper walking profile on walking server
        // Note: optimize option removed as it's not part of the official API
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

    // Removed auto-zoom to avoid disrupting path building workflow

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
        // createMarker: () => null, // Removed due to strict types
        lineOptions: {
          styles: [{ color: color, weight: 4, opacity: 0.8 }],
          extendToWaypoints: true,
          missingRouteTolerance: 10
        },
        show: false,
        fitSelectedRoutes: false, // Prevent auto-zoom when route is calculated
        router: L.Routing.osrmv1({
          serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
          profile: 'foot-walking'
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
        <div class="pathway-info ${this.selectedPath?.id === path.id ? 'selected-path' : ''}">
          <span class="pathway-color" style="background-color: ${path.color}"></span>
          <span class="pathway-name">${path.name}</span>
          <span class="pathway-segments">(${path.segments.length} segments)</span>
        </div>
        <div class="pathway-actions">
          <button class="select-btn" data-path-id="${path.id}">🎯</button>
          <button class="highlight-btn" data-path-id="${path.id}">👁️</button>
          <button class="edit-btn" data-path-id="${path.id}">✏️</button>
          <button class="delete-btn" data-path-id="${path.id}">🗑️</button>
        </div>
      `;

      // Add event listeners for pathway actions
      const selectBtn = li.querySelector('.select-btn');
      const highlightBtn = li.querySelector('.highlight-btn');
      const editBtn = li.querySelector('.edit-btn');
      const deleteBtn = li.querySelector('.delete-btn');

      selectBtn?.addEventListener('click', () => this.selectPathForAnimation(path));
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
      // const bounds = L.latLngBounds(segment.waypoints); // Unused but kept for potential future use
      const highlightOverlay = L.polyline(segment.waypoints, {
        color: '#ffeb3b',
        weight: 8,
        opacity: 0.8
      }).addTo(this.map);
      
      (segment as any).highlightOverlay = highlightOverlay;
    });
    
    // Removed auto-zoom to avoid disrupting workflow - user can zoom manually if needed
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
    const interestControls = document.getElementById('interest-controls');
    
    // Reset all modes
    this.polygonMode = false;
    // this.interestPointMode = false; // Property removed - not needed
    this.isBuilding = false;
    
    // Hide all control sections
    if (pathControls) pathControls.style.display = 'none';
    if (polygonControls) polygonControls.style.display = 'none';
    if (interestControls) interestControls.style.display = 'none';
    
    if (mode === 'polygon') {
      // Switch to polygon mode
      this.polygonMode = true;
      this.clearPath();
      if (polygonControls) polygonControls.style.display = 'block';
      console.log('Switched to Polygon Mode');
      
    } else if (mode === 'interest') {
      // Switch to interest points mode
      // this.interestPointMode = true; // Property removed - not needed
      this.clearPath();
      this.clearPolygon();
      if (interestControls) interestControls.style.display = 'block';
      console.log('Switched to Interest Points Mode');
      
    } else {
      // Switch to path mode (default)
      this.clearPolygon();
      this.stopPointPlacement();
      if (pathControls) pathControls.style.display = 'block';
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

  // Interest Points Methods
  private initializeDefaultPointTypes(): void {
    const defaultTypes = [
      { name: 'Bathrooms', color: '#2196f3', icon: '🚻' },
      { name: 'Food & Drink', color: '#ff9800', icon: '🍽️' },
      { name: 'Transportation', color: '#4caf50', icon: '🚌' },
      { name: 'Shopping', color: '#e91e63', icon: '🛍️' },
      { name: 'Emergency', color: '#f44336', icon: '🚨' }
    ];

    defaultTypes.forEach(type => {
      const pointType: InterestPointType = {
        id: `type-${Date.now()}-${Math.random()}`,
        name: type.name,
        color: type.color,
        icon: type.icon,
        createdAt: new Date()
      };
      this.pointTypes.push(pointType);
    });

    this.updatePointTypeDropdown();
  }

  private updatePointTypeDropdown(): void {
    const dropdown = document.getElementById('point-type-dropdown') as HTMLSelectElement;
    if (!dropdown) return;

    // Clear existing options except first
    dropdown.innerHTML = '<option value="">Select Point Type...</option>';

    this.pointTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = `${type.icon} ${type.name}`;
      dropdown.appendChild(option);
    });
  }

  private addNewPointType(): void {
    const name = prompt('Enter name for new point type:');
    if (!name) return;

    const icon = prompt('Enter emoji icon for this type:', '📍');
    const colors = ['#2196f3', '#ff9800', '#4caf50', '#e91e63', '#f44336', '#9c27b0'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const pointType: InterestPointType = {
      id: `type-${Date.now()}`,
      name: name,
      color: color,
      icon: icon || '📍',
      createdAt: new Date()
    };

    this.pointTypes.push(pointType);
    this.updatePointTypeDropdown();
    this.updateInterestPointsList();
  }

  private selectPointType(typeId: string): void {
    if (!typeId) {
      this.selectedPointType = null;
      this.stopPointPlacement();
      return;
    }

    const type = this.pointTypes.find(t => t.id === typeId);
    if (!type) return;

    this.selectedPointType = type;
    
    // Show placement controls
    const placementDiv = document.getElementById('point-placement');
    const selectedTypeSpan = document.getElementById('selected-type-name');
    
    if (placementDiv) placementDiv.style.display = 'block';
    if (selectedTypeSpan) selectedTypeSpan.textContent = `Selected: ${type.icon} ${type.name}`;

    // Highlight all points of this type with animation
    this.highlightPointsByType(type);
  }

  private stopPointPlacement(): void {
    this.selectedPointType = null;
    
    const placementDiv = document.getElementById('point-placement');
    if (placementDiv) placementDiv.style.display = 'none';

    // Stop all animations
    this.stopAllAnimations();
  }

  private handleInterestPointClick(e: L.LeafletMouseEvent): void {
    if (!this.selectedPointType) return;

    console.log('Interest Points mode - Placing point at:', e.latlng);

    // Create point name
    const pointName = prompt(`Enter name for this ${this.selectedPointType.name}:`, `${this.selectedPointType.name} ${this.getPointsOfType(this.selectedPointType.id).length + 1}`);
    if (!pointName) return;

    // Create marker
    const marker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'interest-point-marker',
        html: `<div style="background: ${this.selectedPointType.color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${this.selectedPointType.icon}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    }).addTo(this.map);

    // Create interest point object
    const interestPoint: InterestPoint = {
      id: `point-${Date.now()}`,
      typeId: this.selectedPointType.id,
      name: pointName,
      description: '',
      position: e.latlng,
      createdAt: new Date(),
      leafletMarker: marker
    };

    // Add click listener for editing
    marker.on('click', (e) => {
      e.originalEvent?.stopPropagation();
      this.editInterestPoint(interestPoint);
    });

    this.interestPoints.push(interestPoint);
    this.updateInterestPointsList();
  }

  private editInterestPoint(point: InterestPoint): void {
    const newName = prompt('Edit point name:', point.name);
    const newDescription = prompt('Edit description:', point.description);

    if (newName !== null) point.name = newName || point.name;
    if (newDescription !== null) point.description = newDescription;

    this.updateInterestPointsList();
  }

  private highlightPointsByType(type: InterestPointType): void {
    console.log(`=== Highlighting type ${type.name} ===`);
    this.stopAllAnimations();

    const pointsOfType = this.getPointsOfType(type.id);
    console.log(`Found ${pointsOfType.length} points of type ${type.name}`);
    console.log('Points:', pointsOfType.map(p => ({name: p.name, hasMarker: !!p.leafletMarker, onMap: this.map.hasLayer(p.leafletMarker)})));
    
    pointsOfType.forEach((point, index) => {
      console.log(`Processing point ${index + 1}: ${point.name}`);
      
      // Ensure marker is visible on map
      if (!this.map.hasLayer(point.leafletMarker)) {
        console.log(`Adding marker for ${point.name} to map`);
        point.leafletMarker.addTo(this.map);
      } else {
        console.log(`Marker for ${point.name} already on map`);
      }
      
      const markerElement = point.leafletMarker.getElement();
      if (markerElement) {
        // Apply animation to the inner div instead of the wrapper
        const innerDiv = markerElement.querySelector('div');
        if (innerDiv) {
          innerDiv.style.animation = 'pulse 0.8s ease-in-out infinite';
          this.animatingPoints.add(point.id);
          console.log(`Added pulsing animation to ${point.name}`);
        } else {
          console.log(`ERROR: No inner div found for ${point.name}`);
        }
      } else {
        console.log(`ERROR: No marker element found for ${point.name}`);
      }
    });

    console.log(`=== End highlighting type ${type.name} ===`);
  }

  private stopAllAnimations(): void {
    console.log('Stopping all animations...');
    this.animatingPoints.forEach(pointId => {
      const point = this.interestPoints.find(p => p.id === pointId);
      if (point) {
        const markerElement = point.leafletMarker.getElement();
        if (markerElement) {
          const innerDiv = markerElement.querySelector('div');
          if (innerDiv) {
            innerDiv.style.animation = '';
            console.log(`Removed pulsing from ${point.name}`);
          }
        }
      }
    });
    this.animatingPoints.clear();
  }

  private getPointsOfType(typeId: string): InterestPoint[] {
    return this.interestPoints.filter(p => p.typeId === typeId);
  }

  private updateInterestPointsList(): void {
    const listDiv = document.getElementById('interest-points-list');
    if (!listDiv) return;

    listDiv.innerHTML = '';

    // Group points by type
    this.pointTypes.forEach(type => {
      const pointsOfType = this.getPointsOfType(type.id);
      
      // Create type header
      const typeHeader = document.createElement('div');
      typeHeader.className = 'point-type-header';
      typeHeader.innerHTML = `
        <div class="type-info" style="cursor: pointer;">
          <span style="color: ${type.color};">${type.icon}</span>
          <strong>${type.name}</strong>
          <span class="point-count">(${pointsOfType.length})</span>
        </div>
        <div class="type-actions">
          <button class="delete-type-btn" data-type-id="${type.id}">🗑️</button>
        </div>
      `;

      // Add click to highlight all of this type
      const typeInfo = typeHeader.querySelector('.type-info');
      typeInfo?.addEventListener('click', () => this.highlightPointsByType(type));

      const deleteBtn = typeHeader.querySelector('.delete-type-btn');
      deleteBtn?.addEventListener('click', () => this.deletePointType(type));

      listDiv.appendChild(typeHeader);

      // Create nested point list
      if (pointsOfType.length > 0) {
        const pointsList = document.createElement('div');
        pointsList.className = 'points-nested-list';
        
        pointsOfType.forEach(point => {
          const pointDiv = document.createElement('div');
          pointDiv.className = 'point-item';
          pointDiv.innerHTML = `
            <div class="point-info">
              <strong>${point.name}</strong>
              <div class="point-description">${point.description || 'No description'}</div>
            </div>
            <div class="point-actions">
              <button class="edit-point-btn" data-point-id="${point.id}">✏️</button>
              <button class="delete-point-btn" data-point-id="${point.id}">🗑️</button>
            </div>
          `;

          const editBtn = pointDiv.querySelector('.edit-point-btn');
          const deleteBtn = pointDiv.querySelector('.delete-point-btn');

          editBtn?.addEventListener('click', () => this.editInterestPoint(point));
          deleteBtn?.addEventListener('click', () => this.deleteInterestPoint(point));
          
          // Click to zoom to point
          const pointInfo = pointDiv.querySelector('.point-info');
          pointInfo?.addEventListener('click', () => {
            this.map.setView(point.position, 18);
            const markerElement = point.leafletMarker.getElement();
            if (markerElement) {
              const innerDiv = markerElement.querySelector('div');
              if (innerDiv) {
                innerDiv.style.animation = 'pulse 0.8s ease-in-out infinite';
                setTimeout(() => innerDiv.style.animation = '', 2000);
              }
            }
          });

          pointsList.appendChild(pointDiv);
        });

        listDiv.appendChild(pointsList);
      }
    });
  }

  private deletePointType(type: InterestPointType): void {
    const pointsOfType = this.getPointsOfType(type.id);
    if (pointsOfType.length > 0) {
      if (!confirm(`Delete "${type.name}" and all ${pointsOfType.length} points of this type?`)) {
        return;
      }
      // Remove all points of this type
      pointsOfType.forEach(point => this.deleteInterestPoint(point));
    }

    // Remove type
    this.pointTypes = this.pointTypes.filter(t => t.id !== type.id);
    this.updatePointTypeDropdown();
    this.updateInterestPointsList();
  }

  private deleteInterestPoint(point: InterestPoint): void {
    if (confirm(`Delete "${point.name}"?`)) {
      this.map.removeLayer(point.leafletMarker);
      this.interestPoints = this.interestPoints.filter(p => p.id !== point.id);
      this.updateInterestPointsList();
    }
  }

  // Path Animation Methods
  private selectPathForAnimation(path: CompletePath): void {
    this.stopPathAnimation(); // Stop any current animation
    this.selectedPath = path;
    this.updatePathwaysList();
    this.updateAnimationControls();
    console.log(`Selected path "${path.name}" for animation`);
    
    // Auto-start animation when selecting a path
    this.startPathAnimation();
  }

  private updateAnimationControls(): void {
    const animateBtn = document.getElementById('animate-path') as HTMLButtonElement;
    const stopBtn = document.getElementById('stop-animation') as HTMLButtonElement;

    if (this.selectedPath) {
      if (this.animationRunning) {
        animateBtn.disabled = true;
        animateBtn.textContent = `Animating "${this.selectedPath.name}"`;
        stopBtn.disabled = false;
      } else {
        animateBtn.disabled = false;
        animateBtn.textContent = `Start "${this.selectedPath.name}"`;
        stopBtn.disabled = true;
      }
    } else {
      animateBtn.disabled = true;
      animateBtn.textContent = 'Select a Path to Animate';
      stopBtn.disabled = true;
    }
  }

  private startPathAnimation(): void {
    if (!this.selectedPath || this.animationRunning) return;

    console.log(`Starting animation for path: ${this.selectedPath.name}`);
    this.animationRunning = true;
    this.updateAnimationControls();

    // Create animation marker
    this.animationMarker = L.marker([0, 0], {
      icon: L.divIcon({
        className: 'leaflet-div-icon',
        html: '<div style="width: 20px; height: 20px; background: #ff6b35; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(255, 107, 53, 0.8); animation: pathMarkerPulse 1.5s ease-in-out infinite alternate;"></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
    });
    
    console.log('Animation marker created:', this.animationMarker);
    this.animationMarker.addTo(this.map);
    console.log('Animation marker added to map');

    // Start the animation loop
    this.animateAlongPath();
  }

  private stopPathAnimation(): void {
    this.animationRunning = false;
    
    if (this.animationRequestId) {
      cancelAnimationFrame(this.animationRequestId);
      this.animationRequestId = null;
    }

    if (this.animationMarker) {
      this.map.removeLayer(this.animationMarker);
      this.animationMarker = null;
    }

    this.updateAnimationControls();
    console.log('Animation stopped');
  }

  private animateAlongPath(): void {
    if (!this.selectedPath || !this.animationMarker || !this.animationRunning) return;

    // Collect all route coordinates from all segments
    const allCoordinates: L.LatLng[] = [];
    
    this.selectedPath.segments.forEach((segment, segmentIndex) => {
      console.log(`Processing segment ${segmentIndex + 1}:`);
      const routingControl = segment.routingControl as any;
      
      // Try to get detailed route coordinates
      let segmentCoords: L.LatLng[] = [];
      
      if (routingControl && routingControl._routes && routingControl._routes.length > 0) {
        const route = routingControl._routes[0];
        console.log('Route object:', route);
        
        if (route.coordinates && Array.isArray(route.coordinates)) {
          console.log('Raw coordinates array:', route.coordinates.slice(0, 3));
          route.coordinates.forEach((coord: any) => {
            if (coord && Array.isArray(coord) && coord.length >= 2) {
              segmentCoords.push(L.latLng(coord[1], coord[0])); // OSRM returns [lng, lat]
            } else if (coord && typeof coord.lat === 'number' && typeof coord.lng === 'number') {
              segmentCoords.push(L.latLng(coord.lat, coord.lng)); // Already LatLng objects
            } else if (coord && coord.lat && coord.lng) {
              segmentCoords.push(L.latLng(coord.lat, coord.lng)); // LatLng-like objects
            }
          });
          console.log(`Found ${segmentCoords.length} detailed coordinates`);
        } else if (route.waypoints && Array.isArray(route.waypoints)) {
          route.waypoints.forEach((wp: any) => {
            if (wp && wp.latLng) {
              segmentCoords.push(wp.latLng);
            }
          });
          console.log(`Found ${segmentCoords.length} waypoint coordinates`);
        }
      }
      
      // Fallback to segment waypoints if no detailed route found
      if (segmentCoords.length === 0) {
        console.log('Using segment waypoints as fallback');
        segment.waypoints.forEach(wp => {
          if (wp && typeof wp.lat === 'number' && typeof wp.lng === 'number') {
            segmentCoords.push(wp);
          }
        });
      }
      
      console.log(`Adding ${segmentCoords.length} coordinates from segment ${segmentIndex + 1}`);
      allCoordinates.push(...segmentCoords);
    });

    if (allCoordinates.length === 0) {
      console.log('No valid coordinates found for animation');
      this.stopPathAnimation();
      return;
    }

    console.log(`Total coordinates for animation: ${allCoordinates.length}`);
    console.log('First few coordinates:', allCoordinates.slice(0, 3));

    // Animation parameters based on speed slider (1-10 -> actual speeds)
    // Much slower slow end, keeping fast end very fast for cool effect
    const baseSpeed = [15000, 10000, 7000, 5000, 3000, 2000, 1200, 600, 200, 50][this.animationSpeed - 1]; // ms for full path (1=very slow, 10=very fast)
    const totalDuration = baseSpeed;
    const startTime = Date.now();

    const animate = () => {
      if (!this.animationRunning || !this.animationMarker) return;

      const elapsed = Date.now() - startTime;
      const progress = (elapsed % totalDuration) / totalDuration;
      
      // Calculate position along path
      const totalPoints = allCoordinates.length;
      const currentIndex = Math.floor(progress * (totalPoints - 1));
      const nextIndex = Math.min(currentIndex + 1, totalPoints - 1);
      
      // Safety checks
      if (currentIndex >= totalPoints || currentIndex < 0) {
        console.log(`Invalid currentIndex: ${currentIndex} (totalPoints: ${totalPoints})`);
        return;
      }
      
      const current = allCoordinates[currentIndex];
      const next = allCoordinates[nextIndex];
      
      // Ensure coordinates are valid
      if (!current || typeof current.lat !== 'number' || typeof current.lng !== 'number') {
        console.log(`Invalid current coordinate at index ${currentIndex}:`, current);
        return;
      }
      
      if (!next || typeof next.lat !== 'number' || typeof next.lng !== 'number') {
        console.log(`Invalid next coordinate at index ${nextIndex}:`, next);
        return;
      }
      
      // Interpolate between current and next points for smooth movement
      const segmentProgress = (progress * (totalPoints - 1)) - currentIndex;
      const lat = current.lat + (next.lat - current.lat) * segmentProgress;
      const lng = current.lng + (next.lng - current.lng) * segmentProgress;
      
      if (Math.floor(elapsed / 100) !== Math.floor((elapsed - 16) / 100)) { // Log every ~100ms
        console.log(`Animation progress: ${(progress * 100).toFixed(1)}% - Position: [${lat.toFixed(6)}, ${lng.toFixed(6)}]`);
      }
      
      this.animationMarker.setLatLng([lat, lng]);

      this.animationRequestId = requestAnimationFrame(animate);
    };

    animate();
  }

  // Session Management Methods
  private initializeSessions(): void {
    // Load sessions from localStorage
    this.loadSessionsFromStorage();
    
    // If no sessions exist, create default session
    if (this.allSessions.length === 0) {
      this.createDefaultSession();
    } else {
      // Load the most recent session
      const lastSession = this.allSessions.reduce((latest, session) => 
        session.lastModified > latest.lastModified ? session : latest
      );
      this.loadSession(lastSession);
    }
  }

  private createDefaultSession(): void {
    const defaultSession: Session = {
      id: `session-${Date.now()}`,
      name: 'Default Session',
      createdAt: new Date(),
      lastModified: new Date(),
      paths: [],
      polygons: [],
      interestPointTypes: [...this.pointTypes],
      interestPoints: [],
      mapCenter: this.map.getCenter(),
      mapZoom: this.map.getZoom()
    };
    
    this.currentSession = defaultSession;
    this.allSessions.push(defaultSession);
    this.updateSessionUI();
    this.saveSessionsToStorage();
    console.log('Created default session');
  }

  private createNewSession(): void {
    const name = prompt('Enter name for new session:', `Session ${this.sessionCounter}`);
    if (!name) return;

    // Save current session first
    this.saveCurrentSession();

    // Create new session
    const newSession: Session = {
      id: `session-${Date.now()}`,
      name: name,
      createdAt: new Date(),
      lastModified: new Date(),
      paths: [],
      polygons: [],
      interestPointTypes: [...this.pointTypes], // Copy default types
      interestPoints: [],
      mapCenter: this.map.getCenter(),
      mapZoom: this.map.getZoom()
    };

    this.sessionCounter++;
    this.currentSession = newSession;
    this.allSessions.push(newSession);
    
    // Clear current map data
    this.clearAllMapData();
    
    this.updateSessionUI();
    this.saveSessionsToStorage();
    console.log(`Created new session: ${name}`);
    this.showSessionMessage(`New session "${name}" created!`, 'success');
  }

  private showSessionSwitcher(): void {
    if (this.allSessions.length === 0) return;

    const options = this.allSessions.map((session, index) => 
      `${index + 1}. ${session.name} (${session.paths.length} paths, ${session.polygons.length} polygons, ${session.interestPoints.length} points)`
    ).join('\n');

    const choice = prompt(`Choose session to switch to:\n\n${options}\n\nEnter session number (1-${this.allSessions.length}):`);
    if (!choice) return;

    const sessionIndex = parseInt(choice) - 1;
    if (sessionIndex >= 0 && sessionIndex < this.allSessions.length) {
      const targetSession = this.allSessions[sessionIndex];
      this.switchToSession(targetSession);
    } else {
      alert('Invalid session number');
    }
  }

  private switchToSession(session: Session): void {
    if (session === this.currentSession) return;

    // Save current session
    this.saveCurrentSession();

    // Load target session
    this.loadSession(session);
    console.log(`Switched to session: ${session.name}`);
    this.showSessionMessage(`Switched to session "${session.name}"`, 'info');
  }

  private loadSession(session: Session): void {
    // Clear current map data
    this.clearAllMapData();

    // Set current session
    this.currentSession = session;
    
    // Load session data
    this.savedPaths = [...session.paths];
    this.savedPolygons = [...session.polygons];
    this.pointTypes = [...session.interestPointTypes];
    
    // Recreate interest points with markers
    this.interestPoints = session.interestPoints.map(point => {
      const marker = this.createInterestPointMarker(point);
      return {
        ...point,
        position: L.latLng(point.position.lat, point.position.lng),
        leafletMarker: marker
      };
    });

    // Restore map state
    this.map.setView(session.mapCenter, session.mapZoom);
    
    // Update UI
    this.recreateMapElements();
    this.updateSessionUI();
    this.updateAllLists();
  }

  private saveCurrentSession(): void {
    if (!this.currentSession) return;

    // Update session data
    this.currentSession.paths = [...this.savedPaths];
    this.currentSession.polygons = [...this.savedPolygons];
    this.currentSession.interestPointTypes = [...this.pointTypes];
    this.currentSession.interestPoints = this.interestPoints.map(point => ({
      id: point.id,
      typeId: point.typeId,
      name: point.name,
      description: point.description,
      position: point.position,
      createdAt: point.createdAt
    }));
    this.currentSession.mapCenter = this.map.getCenter();
    this.currentSession.mapZoom = this.map.getZoom();
    this.currentSession.lastModified = new Date();

    this.saveSessionsToStorage();
    console.log(`Saved session: ${this.currentSession.name}`);
    
    // Show user feedback
    this.showSessionMessage(`Session "${this.currentSession.name}" saved successfully!`, 'success');
  }

  private deleteCurrentSession(): void {
    if (!this.currentSession) return;

    // Don't allow deleting the last session
    if (this.allSessions.length === 1) {
      alert('Cannot delete the last session. Create another session first.');
      return;
    }

    const sessionName = this.currentSession.name;
    const confirmation = confirm(`Are you sure you want to delete session "${sessionName}"?\n\nThis will permanently remove all paths, polygons, and interest points in this session.`);
    
    if (!confirmation) return;

    // Find index of current session
    const sessionIndex = this.allSessions.findIndex(s => s.id === this.currentSession!.id);
    if (sessionIndex === -1) return;

    // Remove session from array
    this.allSessions.splice(sessionIndex, 1);

    // Switch to another session (prefer the next one, or the first one)
    const nextSession = this.allSessions[sessionIndex] || this.allSessions[0];
    this.loadSession(nextSession);

    // Save updated sessions
    this.saveSessionsToStorage();
    
    console.log(`Deleted session: ${sessionName}`);
    this.showSessionMessage(`Session "${sessionName}" has been deleted.`, 'warning');
  }

  private clearAllMapData(): void {
    // Stop any running animation
    this.stopPathAnimation();
    
    // Clear paths
    this.savedPaths.forEach(path => {
      path.segments.forEach(segment => {
        this.map.removeControl(segment.routingControl);
      });
    });
    this.savedPaths = [];

    // Clear segments
    this.segments.forEach(segment => {
      this.map.removeControl(segment.routingControl);
    });
    this.segments = [];

    // Clear polygons
    this.savedPolygons.forEach(polygon => {
      this.map.removeLayer(polygon.leafletPolygon);
    });
    this.savedPolygons = [];

    // Clear polygon points
    this.polygonMarkers.forEach(marker => this.map.removeLayer(marker));
    this.polygonMarkers = [];

    // Clear interest points
    this.interestPoints.forEach(point => {
      this.map.removeLayer(point.leafletMarker);
    });
    this.interestPoints = [];
    
    // Clear temp markers
    this.clearTempMarkers();
    
    // Reset state
    this.isBuilding = false;
    this.polygonMode = false;
    this.selectedPath = null;
    this.currentWaypoints = [];
    this.polygonPoints = [];
  }

  private recreateMapElements(): void {
    // Recreate path controls
    this.savedPaths.forEach(path => {
      path.segments.forEach(segment => {
        // Recreate routing control for each segment
        const routingControl = L.Routing.control({
          waypoints: segment.waypoints.map(wp => L.Routing.waypoint(wp)),
          routeWhileDragging: false,
          addWaypoints: false,
          // createMarker: () => null, // Removed due to strict types
          lineOptions: {
            styles: [{ color: path.color, weight: 4, opacity: 0.8 }],
            extendToWaypoints: true,
            missingRouteTolerance: 10
          },
          show: false,
          fitSelectedRoutes: false,
          router: L.Routing.osrmv1({
            serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
            profile: 'foot-walking'
          })
        }).addTo(this.map);
        
        segment.routingControl = routingControl;
      });
    });

    // Recreate polygons
    this.savedPolygons.forEach(polygon => {
      const leafletPolygon = L.polygon(polygon.points, {
        color: polygon.color,
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.3
      }).addTo(this.map);
      
      polygon.leafletPolygon = leafletPolygon;
    });

    // Interest point markers are already recreated in loadSession
  }

  private createInterestPointMarker(point: Omit<InterestPoint, 'leafletMarker'>): L.Marker {
    const pointType = this.pointTypes.find(t => t.id === point.typeId);
    if (!pointType) throw new Error(`Point type not found: ${point.typeId}`);

    const marker = L.marker(point.position, {
      icon: L.divIcon({
        className: 'interest-point-marker',
        html: `<div style="background: ${pointType.color}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${pointType.icon}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    }).addTo(this.map);

    return marker;
  }

  private updateAllLists(): void {
    this.updatePathwaysList();
    this.updateInterestPointsList();
    this.updatePointTypeDropdown();
    // TODO: Add polygon list update when that method exists
  }

  private updateSessionUI(): void {
    const sessionNameSpan = document.getElementById('current-session-name');
    if (sessionNameSpan && this.currentSession) {
      sessionNameSpan.textContent = this.currentSession.name;
    }
  }

  private saveSessionsToStorage(): void {
    try {
      const sessionsData = this.allSessions.map(session => ({
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        lastModified: session.lastModified,
        paths: session.paths.map(path => ({
          id: path.id,
          name: path.name,
          color: path.color,
          createdAt: path.createdAt,
          visible: path.visible,
          segments: path.segments.map(segment => ({
            id: segment.id,
            waypoints: segment.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })),
            editable: segment.editable,
            isHighlighted: segment.isHighlighted
            // Exclude routingControl - will be recreated
          }))
        })),
        polygons: session.polygons.map(polygon => ({
          id: polygon.id,
          name: polygon.name,
          color: polygon.color,
          createdAt: polygon.createdAt,
          visible: polygon.visible,
          points: polygon.points.map(point => ({ lat: point.lat, lng: point.lng }))
          // Exclude leafletPolygon - will be recreated
        })),
        interestPointTypes: session.interestPointTypes.map(type => ({
          id: type.id,
          name: type.name,
          color: type.color,
          icon: type.icon,
          createdAt: type.createdAt
        })),
        interestPoints: session.interestPoints.map(point => ({
          id: point.id,
          typeId: point.typeId,
          name: point.name,
          description: point.description,
          position: { lat: point.position.lat, lng: point.position.lng },
          createdAt: point.createdAt
          // Exclude leafletMarker - will be recreated
        })),
        mapCenter: { lat: session.mapCenter.lat, lng: session.mapCenter.lng },
        mapZoom: session.mapZoom
      }));

      localStorage.setItem('mapBuilderSessions', JSON.stringify(sessionsData));
      console.log(`Saved ${sessionsData.length} sessions to storage`);
    } catch (error) {
      console.error('Failed to save sessions:', error);
      alert('Failed to save sessions to storage');
    }
  }

  private loadSessionsFromStorage(): void {
    try {
      const stored = localStorage.getItem('mapBuilderSessions');
      if (!stored) return;

      const sessionsData = JSON.parse(stored);
      this.allSessions = sessionsData.map((sessionData: any) => ({
        ...sessionData,
        createdAt: new Date(sessionData.createdAt),
        lastModified: new Date(sessionData.lastModified),
        paths: sessionData.paths.map((path: any) => ({
          ...path,
          createdAt: new Date(path.createdAt),
          segments: path.segments.map((segment: any) => ({
            ...segment,
            waypoints: segment.waypoints.map((wp: any) => L.latLng(wp.lat, wp.lng)),
            routingControl: null // Will be recreated when loading session
          }))
        })),
        polygons: sessionData.polygons.map((polygon: any) => ({
          ...polygon,
          createdAt: new Date(polygon.createdAt),
          points: polygon.points.map((point: any) => L.latLng(point.lat, point.lng)),
          leafletPolygon: null // Will be recreated when loading session
        })),
        interestPointTypes: sessionData.interestPointTypes.map((type: any) => ({
          ...type,
          createdAt: new Date(type.createdAt)
        })),
        interestPoints: sessionData.interestPoints.map((point: any) => ({
          ...point,
          createdAt: new Date(point.createdAt),
          position: L.latLng(point.position.lat, point.position.lng)
        })),
        mapCenter: L.latLng(sessionData.mapCenter.lat, sessionData.mapCenter.lng)
      }));

      console.log(`Loaded ${this.allSessions.length} sessions from storage`);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      this.allSessions = [];
    }
  }

  private showSessionMessage(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `session-message session-message-${type}`;
    messageEl.textContent = message;
    
    // Style the message
    Object.assign(messageEl.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      borderRadius: '4px',
      color: 'white',
      fontWeight: 'bold',
      fontSize: '14px',
      zIndex: '10000',
      maxWidth: '300px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease-in-out'
    });

    // Set background color based on type
    const colors = {
      success: '#28a745',
      info: '#17a2b8', 
      warning: '#ffc107',
      error: '#dc3545'
    };
    messageEl.style.backgroundColor = colors[type];
    if (type === 'warning') messageEl.style.color = '#000';

    // Add to page
    document.body.appendChild(messageEl);

    // Animate in
    setTimeout(() => {
      messageEl.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 3 seconds
    setTimeout(() => {
      messageEl.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      }, 300);
    }, 3000);
  }
}

new PathBuilderApp();