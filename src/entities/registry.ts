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
import { Ellipse } from "./ellipse";
import { Polyline } from "./polyline";
import { Text } from "./text";
import { Dimension } from "./dimension";
import type { Entity } from "./entity";

type EntityFromDict = (data: Record<string, unknown>) => Entity;

// linear/aligned/angular/diameter/radius/leader all construct through the
// same Dimension.fromDict -- mirrors document.py's _DIMENSION_TYPES set.
const DIMENSION_TYPES = ["linear", "aligned", "angular", "diameter", "radius", "leader"] as const;

export const ENTITY_TYPES: Record<string, EntityFromDict> = {
  line: (data) => Line.fromDict(data),
  circle: (data) => Circle.fromDict(data),
  arc: (data) => Arc.fromDict(data),
  ellipse: (data) => Ellipse.fromDict(data),
  polyline: (data) => Polyline.fromDict(data),
  text: (data) => Text.fromDict(data),
  ...Object.fromEntries(DIMENSION_TYPES.map((t) => [t, (data: Record<string, unknown>) => Dimension.fromDict(data)])),
};
