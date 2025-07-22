import { Schema } from "effect/Schema";
import * as Effect from "effect/Effect";

export const Node = Schema.Struct({
  id: Schema.String,
  lat: Schema.Number,
  lng: Schema.Number,
  type: Schema.optional(Schema.String)
});

export const Edge = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  to: Schema.String,
  weight: Schema.Number
});

export const PathSegment = Schema.Struct({
  id: Schema.String,
  from: Node,
  to: Node,
  path: Schema.Array(Node),
  editable: Schema.Boolean
});

export const CompletePath = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  segments: Schema.Array(PathSegment),
  createdAt: Schema.Date,
  color: Schema.String,
  visible: Schema.Boolean
});

export const PathState = Schema.Struct({
  segments: Schema.Array(PathSegment),
  currentWaypoint: Schema.optional(Node),
  isBuilding: Schema.Boolean
});

export type Node = Schema.Schema.Type<typeof Node>;
export type Edge = Schema.Schema.Type<typeof Edge>;
export type PathSegment = Schema.Schema.Type<typeof PathSegment>;
export type PathState = Schema.Schema.Type<typeof PathState>;
export type CompletePath = Schema.Schema.Type<typeof CompletePath>;

export const MapGraph = Schema.Struct({
  nodes: Schema.Array(Node),
  edges: Schema.Array(Edge)
});

export type MapGraph = Schema.Schema.Type<typeof MapGraph>;