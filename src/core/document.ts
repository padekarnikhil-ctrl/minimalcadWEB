/**
 * MinimalCAD Web
 * core/document.ts
 *
 * Ported from document.py's Document class. Pure drawing database: stores
 * entities, serializes/restores the whole document as a plain JSON-shaped
 * object (the same shape the desktop app reads/writes).
 */

import type { Bounds } from "./types";
import { unionBounds } from "./types";
import type { Entity } from "../entities/entity";
import { ENTITY_TYPES } from "../entities/registry";

export interface DocumentSnapshot {
  entities: Record<string, unknown>[];
  // Opaque passthrough: v1 doesn't interpret constraints at all, but a file
  // loaded from the desktop app may already carry some -- round-tripping
  // them unread (rather than dropping them on save) avoids silently
  // destroying data the user didn't ask this app to touch.
  constraints: unknown[];
}

export interface ParseResult {
  entities: Entity[];
  skippedCount: number;
}

export class Document {
  entities: Entity[] = [];
  constraints: unknown[] = [];

  addEntity(entity: Entity): void {
    if (!this.entities.includes(entity)) {
      this.entities.push(entity);
    }
  }

  removeEntity(entity: Entity): void {
    const idx = this.entities.indexOf(entity);
    if (idx !== -1) this.entities.splice(idx, 1);

    // Purge any constraint referencing this entity's id -- a no-op today
    // since v1 never creates constraints, but keeps removeEntity's contract
    // identical to the Python source's for whenever a constraints feature
    // (and passthrough-loaded desktop constraints) becomes load-bearing.
    if (entity.id !== undefined && this.constraints.length > 0) {
      this.constraints = this.constraints.filter((c) => {
        const rec = c as { driven_entity_id?: string; ref_entity_id?: string };
        return rec.driven_entity_id !== entity.id && rec.ref_entity_id !== entity.id;
      });
    }
  }

  clear(): void {
    this.entities = [];
    this.constraints = [];
  }

  getEntities(): Entity[] {
    return this.entities.slice();
  }

  getBounds(): Bounds {
    if (this.entities.length === 0) return [0, 0, 0, 0];
    let bounds = this.entities[0]!.getBounds();
    for (const entity of this.entities.slice(1)) {
      bounds = unionBounds(bounds, entity.getBounds());
    }
    return bounds;
  }

  toDict(): DocumentSnapshot {
    return {
      entities: this.entities.map((e) => e.serialize()),
      constraints: this.constraints,
    };
  }

  /** Rebuilds this Document's entities/constraints IN PLACE (undo/redo, Load) so any
   *  held reference to this Document instance stays valid across a reload. */
  restoreFromDict(data: DocumentSnapshot): ParseResult {
    const result = parseEntities(data.entities);
    this.entities = result.entities;
    this.constraints = data.constraints ?? [];
    return result;
  }
}

/** Type-dispatches a snapshot's entity list back into live entity instances,
 *  skipping (rather than aborting on) any unrecognized/corrupted entry --
 *  e.g. an Ellipse/Text/Table/Dimension from a real desktop-app file that
 *  this v1 web port doesn't support yet. */
export function parseEntities(items: Record<string, unknown>[]): ParseResult {
  const entities: Entity[] = [];
  let skippedCount = 0;

  for (const item of items) {
    const typeKey = typeof item.type === "string" ? item.type.toLowerCase() : null;
    const factory = typeKey !== null ? ENTITY_TYPES[typeKey] : undefined;
    if (factory === undefined) {
      skippedCount++;
      continue;
    }
    try {
      entities.push(factory(item));
    } catch {
      skippedCount++;
    }
  }

  return { entities, skippedCount };
}
