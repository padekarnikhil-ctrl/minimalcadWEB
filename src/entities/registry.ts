/**
 * MinimalCAD Web
 * entities/registry.ts
 *
 * Type-string -> fromDict() dispatch table, mirroring document.py's
 * _ENTITY_TYPES dict. Add one line here per entity type as later phases
 * bring them online (Circle in Phase C, Arc/Polyline in Phase E) -- nothing
 * else in core/document.ts or io/fileFormat.ts needs to change.
 */

import { Line } from "./line";
import { Circle } from "./circle";
import { Arc } from "./arc";
import { Polyline } from "./polyline";
import type { Entity } from "./entity";

type EntityFromDict = (data: Record<string, unknown>) => Entity;

export const ENTITY_TYPES: Record<string, EntityFromDict> = {
  line: (data) => Line.fromDict(data),
  circle: (data) => Circle.fromDict(data),
  arc: (data) => Arc.fromDict(data),
  polyline: (data) => Polyline.fromDict(data),
};
