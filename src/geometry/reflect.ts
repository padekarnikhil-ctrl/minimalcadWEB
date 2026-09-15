/**
 * MinimalCAD Web
 * geometry/reflect.ts
 *
 * Pure reflection-across-an-infinite-line geometry, extracted out of
 * commands/mirror.ts so it's directly unit-testable without constructing a
 * full command/Engine. Per-entity-type dispatch mirrors
 * commands/mirror.py's `_calculate_mirror_geometry` -- Arc reconstructs
 * actual world-space endpoint positions (not naive angle reflection) and
 * swaps start/end because reflection reverses winding; Polyline applies the
 * same principle per-edge (mirror each vertex point, negate its bulge)
 * without reordering vertices.
 */

import type { Point } from "../core/types";
import type { Entity } from "../entities/entity";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { Polyline } from "../entities/polyline";

/** Reflects `pt` across the infinite line through axisP1/axisP2 (unclamped
 *  projection). Returns `pt` unchanged if the axis is degenerate (zero length). */
export function mirrorPoint(pt: Point, axisP1: Point, axisP2: Point): Point {
  const dx = axisP2.x - axisP1.x;
  const dy = axisP2.y - axisP1.y;
  const axisLenSq = dx * dx + dy * dy;
  if (axisLenSq === 0) return pt;
  const vx = pt.x - axisP1.x;
  const vy = pt.y - axisP1.y;
  const t = (vx * dx + vy * dy) / axisLenSq;
  const proj: Point = { x: axisP1.x + t * dx, y: axisP1.y + t * dy };
  return { x: 2 * proj.x - pt.x, y: 2 * proj.y - pt.y };
}

/** Reflects `entity` across the infinite line through p1/p2, returning a new
 *  entity (originals are never mutated). Returns null for unsupported types. */
export function mirrorEntity(entity: Entity, p1: Point, p2: Point): Entity | null {
  if (entity instanceof Line) {
    return new Line(mirrorPoint(entity.startPoint, p1, p2), mirrorPoint(entity.endPoint, p1, p2), {
      lineType: entity.lineType,
      dxfLayer: entity.dxfLayer,
      dxfColor: entity.dxfColor,
    });
  }

  if (entity instanceof Arc) {
    const newCenter = mirrorPoint(entity.center, p1, p2);
    const oldStartWorld = entity.pointAt(entity.startAngle);
    const oldEndWorld = entity.pointAt(entity.endAngle);
    const newStartWorld = mirrorPoint(oldStartWorld, p1, p2);
    const newEndWorld = mirrorPoint(oldEndWorld, p1, p2);
    const newStartAngle = Math.atan2(newStartWorld.y - newCenter.y, newStartWorld.x - newCenter.x);
    const newEndAngle = Math.atan2(newEndWorld.y - newCenter.y, newEndWorld.x - newCenter.x);
    // Swapped: reflection reverses winding, so the old end angle becomes
    // the new sweep's start, and vice versa.
    return new Arc(newCenter, entity.radius, newEndAngle, newStartAngle, {
      lineType: entity.lineType,
      dxfLayer: entity.dxfLayer,
      dxfColor: entity.dxfColor,
    });
  }

  if (entity instanceof Circle) {
    return new Circle(mirrorPoint(entity.center, p1, p2), entity.radius, {
      lineType: entity.lineType,
      dxfLayer: entity.dxfLayer,
      dxfColor: entity.dxfColor,
    });
  }

  if (entity instanceof Polyline) {
    return new Polyline(
      entity.vertices.map((v) => ({ point: mirrorPoint(v.point, p1, p2), bulge: -v.bulge })),
      entity.closed,
      { lineType: entity.lineType, dxfLayer: entity.dxfLayer, dxfColor: entity.dxfColor },
    );
  }

  return null;
}
