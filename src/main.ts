import './style.css';
import * as L from 'leaflet';
import * as Effect from "effect/Effect";
import { MapGraph, Node, PathSegment, PathState } from './types';
import { createSeattleGraph, findNearestNode } from './graph';
import { findPath } from './pathfinding';

class PathBuilderApp {
  private map: L.Map;
  private graph: MapGraph;
  private pathState: PathState;
  private nodeMarkers: Map<string, L.Marker> = new Map();
  private pathLayers: L.Polyline[] = [];
  private segmentElements: Map<string, HTMLElement> = new Map();

  constructor() {
    this.pathState = {
      segments: [],
      currentWaypoint: undefined,
      isBuilding: false
    };
    
    this.initializeMap();
    this.setupEventListeners();
    this.initializeGraph();
  }

  private initializeMap(): void {
    this.map = L.map('map').setView([47.6097, -122.3425], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  private async initializeGraph(): Promise<void> {
    const graphEffect = createSeattleGraph();
    this.graph = await Effect.runPromise(graphEffect);
    this.renderNodes();
  }

  private renderNodes(): void {
    console.log('Rendering nodes:', this.graph.nodes.length);
    this.graph.nodes.forEach(node => {
      const marker = L.circleMarker([node.lat, node.lng], {
        radius: 8,
        fillColor: '#007bff',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      })
      .bindPopup(node.id.replace(/-/g, ' ').toUpperCase())
      .addTo(this.map);

      marker.on('click', (e) => {
        console.log('Node clicked:', node.id);
        e.originalEvent?.stopPropagation();
        this.handleNodeClick(node);
      });
      
      this.nodeMarkers.set(node.id, marker);
    });

    // Also add map click handler for debugging
    this.map.on('click', (e) => {
      console.log('Map clicked at:', e.latlng);
      const nearest = this.findNearestNodeToClick(e.latlng.lat, e.latlng.lng);
      if (nearest) {
        console.log('Nearest node:', nearest.id);
        this.handleNodeClick(nearest);
      }
    });
  }

  private setupEventListeners(): void {
    const startPathBtn = document.getElementById('start-path');
    const clearPathBtn = document.getElementById('clear-path');

    startPathBtn?.addEventListener('click', () => this.startNewPath());
    clearPathBtn?.addEventListener('click', () => this.clearPath());
  }

  private startNewPath(): void {
    console.log('Starting new path');
    this.pathState = {
      segments: [],
      currentWaypoint: undefined,
      isBuilding: true
    };
    this.clearPathDisplay();
    this.updateUI();
  }

  private clearPath(): void {
    this.pathState = {
      segments: [],
      currentWaypoint: undefined,
      isBuilding: false
    };
    this.clearPathDisplay();
    this.updateUI();
  }

  private clearPathDisplay(): void {
    this.pathLayers.forEach(layer => this.map.removeLayer(layer));
    this.pathLayers = [];
    this.updateSegmentsList();
  }

  private async handleNodeClick(node: Node): Promise<void> {
    console.log('handleNodeClick called, isBuilding:', this.pathState.isBuilding);
    if (!this.pathState.isBuilding) {
      console.log('Not building, ignoring click');
      return;
    }

    if (!this.pathState.currentWaypoint) {
      console.log('Setting first waypoint:', node.id);
      this.pathState.currentWaypoint = node;
      this.highlightNode(node.id, '#28a745');
      return;
    }

    const pathEffect = findPath(this.pathState.currentWaypoint, node, this.graph);
    const path = await Effect.runPromise(pathEffect);

    if (path) {
      const segment: PathSegment = {
        id: `segment-${this.pathState.segments.length + 1}`,
        from: this.pathState.currentWaypoint,
        to: node,
        path: path,
        editable: true
      };

      this.pathState.segments.forEach(s => s.editable = false);
      this.pathState.segments.push(segment);
      this.pathState.currentWaypoint = node;

      this.renderSegment(segment);
      this.updateSegmentsList();
      this.highlightNode(node.id, '#28a745');
    }
  }

  private renderSegment(segment: PathSegment): void {
    const coordinates = segment.path.map(node => [node.lat, node.lng] as [number, number]);
    
    const polyline = L.polyline(coordinates, {
      color: segment.editable ? '#28a745' : '#007bff',
      weight: 4,
      opacity: 0.8
    }).addTo(this.map);

    this.pathLayers.push(polyline);

    if (segment.editable) {
      this.makeSegmentDraggable(polyline, segment);
    }
  }

  private makeSegmentDraggable(polyline: L.Polyline, segment: PathSegment): void {
    const coordinates = polyline.getLatLngs() as L.LatLng[];
    
    coordinates.forEach((latlng, index) => {
      if (index === 0 || index === coordinates.length - 1) return;
      
      const dragMarker = L.marker([latlng.lat, latlng.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'drag-handle',
          html: '<div style="background: #ffc107; width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      }).addTo(this.map);

      dragMarker.on('drag', () => {
        const newPos = dragMarker.getLatLng();
        const snappedNode = this.snapToNearestNode(newPos.lat, newPos.lng);
        if (snappedNode) {
          dragMarker.setLatLng([snappedNode.lat, snappedNode.lng]);
          this.updateSegmentPath(segment, index, snappedNode);
        }
      });
    });
  }

  private async snapToNearestNode(lat: number, lng: number): Promise<Node | null> {
    const nodeEffect = findNearestNode(lat, lng, this.graph);
    return await Effect.runPromise(nodeEffect);
  }

  private findNearestNodeToClick(lat: number, lng: number): Node | null {
    let nearest: Node | null = null;
    let minDistance = Infinity;
    const maxClickDistance = 0.01; // Maximum distance to consider a click on a node
    
    for (const node of this.graph.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.lat - lat, 2) + Math.pow(node.lng - lng, 2)
      );
      if (distance < minDistance && distance < maxClickDistance) {
        minDistance = distance;
        nearest = node;
      }
    }
    
    return nearest;
  }

  private updateSegmentPath(segment: PathSegment, pointIndex: number, newNode: Node): void {
    const newPath = [...segment.path];
    newPath[pointIndex] = newNode;
    segment.path = newPath;
    
    this.clearPathDisplay();
    this.pathState.segments.forEach(s => this.renderSegment(s));
    this.updateSegmentsList();
  }

  private highlightNode(nodeId: string, color: string): void {
    this.nodeMarkers.forEach((marker, id) => {
      if (id === nodeId) {
        marker.setStyle({ fillColor: color });
      } else {
        marker.setStyle({ fillColor: '#007bff' });
      }
    });
  }

  private updateSegmentsList(): void {
    const segmentsList = document.getElementById('segments');
    if (!segmentsList) return;

    segmentsList.innerHTML = '';

    this.pathState.segments.forEach((segment, index) => {
      const li = document.createElement('li');
      li.textContent = `${segment.from.id} → ${segment.to.id}`;
      
      if (segment.editable) {
        li.classList.add('current');
      }

      li.addEventListener('click', () => this.highlightSegment(segment.id));
      
      segmentsList.appendChild(li);
      this.segmentElements.set(segment.id, li);
    });
  }

  private highlightSegment(segmentId: string): void {
    this.segmentElements.forEach((element, id) => {
      if (id === segmentId) {
        element.classList.add('active');
      } else {
        element.classList.remove('active');
      }
    });
  }

  private updateUI(): void {
    const startBtn = document.getElementById('start-path') as HTMLButtonElement;
    const clearBtn = document.getElementById('clear-path') as HTMLButtonElement;

    if (startBtn && clearBtn) {
      startBtn.disabled = this.pathState.isBuilding;
      clearBtn.disabled = this.pathState.segments.length === 0;
    }
  }
}

new PathBuilderApp();