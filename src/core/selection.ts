/**
 * MinimalCAD Web
 * core/selection.ts
 *
 * Pure tracking container for selected entities, ported from selection.py.
 */

import type { Entity } from "../entities/entity";

export class Selection {
  private selected = new Set<Entity>();

  select(entity: Entity): void {
    this.selected.add(entity);
  }

  deselect(entity: Entity): void {
    this.selected.delete(entity);
  }

  clear(): void {
    this.selected.clear();
  }

  isSelected(entity: Entity): boolean {
    return this.selected.has(entity);
  }

  getEntities(): Entity[] {
    return Array.from(this.selected);
  }
}
