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

class PathBuilderApp {
  private map: L.Map;
  private segments: PathSegment[] = [];
  private isBuilding: boolean = false;
  private currentWaypoints: L.LatLng[] = [];
  private tempMarkers: L.Marker[] = [];
  private walkwaysLayer: L.LayerGroup | null = null;

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
      this.handleMapClick(e);
      this.resetSegmentHighlighting();
    });
  }

  private setupEventListeners(): void {
    const startPathBtn = document.getElementById('start-path');
    const clearPathBtn = document.getElementById('clear-path');
    const showWalkwaysCheckbox = document.getElementById('show-walkways') as HTMLInputElement;

    startPathBtn?.addEventListener('click', () => this.startNewPath());
    clearPathBtn?.addEventListener('click', () => this.clearPath());
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

  private handleMapClick(e: L.LeafletMouseEvent): void {
    if (!this.isBuilding) return;

    console.log('Map clicked at:', e.latlng);
    
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

  private updateUI(): void {
    const startBtn = document.getElementById('start-path') as HTMLButtonElement;
    const clearBtn = document.getElementById('clear-path') as HTMLButtonElement;

    if (startBtn && clearBtn) {
      startBtn.disabled = this.isBuilding;
      clearBtn.disabled = this.segments.length === 0 && !this.isBuilding;
    }
  }
}

new PathBuilderApp();