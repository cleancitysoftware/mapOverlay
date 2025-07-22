// Interest Points functionality for the mapping application

export interface InterestPointType {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: Date;
}

export interface InterestPoint {
  id: string;
  typeId: string;
  name: string;
  description: string;
  position: L.LatLng;
  createdAt: Date;
  leafletMarker: L.Marker;
}

// Default point types for common categories
export const DEFAULT_POINT_TYPES: Omit<InterestPointType, 'id' | 'createdAt'>[] = [
  { name: 'Bathrooms', color: '#2196f3', icon: '🚻' },
  { name: 'Food & Drink', color: '#ff9800', icon: '🍽️' },
  { name: 'Transportation', color: '#4caf50', icon: '🚌' },
  { name: 'Shopping', color: '#e91e63', icon: '🛍️' },
  { name: 'Emergency', color: '#f44336', icon: '🚨' },
  { name: 'WiFi/Tech', color: '#9c27b0', icon: '📶' }
];

// Animation keyframes for pulsing effect
export const PULSE_ANIMATION = `
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
  .pulsing-marker {
    animation: pulse 0.8s ease-in-out infinite;
  }
`;

// Add the CSS animation to the document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = PULSE_ANIMATION;
  document.head.appendChild(style);
}