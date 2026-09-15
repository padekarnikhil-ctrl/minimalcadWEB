/**
 * MinimalCAD Web
 * commands/trim.ts
 *
 * Ported from the ALREADY-FIXED commands/trim.py this session's earlier work
 * landed on the desktop app -- not the original buggy version. One-click
 * universal trim: find every intersection between the clicked entity and
 * every other entity, split the clicked entity at those intersection
 * parameters, remove the clicked sub-segment, and merge the untouched
 * remainder into as few pieces as possible (at most one piece on each side
 * of the removed interval) rather than fragmenting at every interior
 * crossing.
 *
 * v1 scope: Line, Circle, Arc only (no Ellipse, no Polyline self-trim --
 * Polyline trim needs vertex-chain rebuilding for both open and closed
 * cases, a genuinely separate and substantial piece deliberately deferred
 * past v1 rather than rushed).
 */

import type { Point } from "../core/types";
import type { Engine } from "../engine/engine";
import type { Entity } from "../entities/entity";
import { BaseCommand } from "./base";
import { Line } from "../entities/line";
import { Circle } from "../entities/circle";
import { Arc } from "../entities/arc";
import { findIntersections } from "../geometry/intersect";
import { entityAt } from "../engine/picking";

const TWO_PI = 2.0 * Math.PI;
const MIN_SEGMENT = 0.01;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

export class TrimCommand extends BaseCommand {
  constructor(engine: Engine) {
    super(engine);
  }

  start(): void {
    this.commandBar.setStatus("TRIM", "Click a segment to trim away");
  }

  leftClick(worldPos: Point): void {
    const trimmable = this.document.getEntities().filter((e) => this.isTrimmable(e));
    const target = entityAt(trimmable, worldPos, this.engine.pickTolerance());
    if (target === null) return;

    const gap = this.engine.pickTolerance();
    const points: Point[] = [];
    for (const other of trimmable) {
      if (other === target) continue;
      points.push(...findIntersections(target as Line | Circle | Arc, other as Line | Circle | Arc, gap));
    }

    const uniquePoints: Point[] = [];
    for (const p of points) {
      if (!uniquePoints.some((u) => Math.hypot(p.x - u.x, p.y - u.y) < 1e-4)) {
        uniquePoints.push(p);
      }
    }

    this.trimEntity(target, uniquePoints, worldPos);
  }

  private isTrimmable(e: Entity): boolean {
    return e instanceof Line || e instanceof Circle || e instanceof Arc;
  }

  private trimEntity(entity: Entity, splitPoints: Point[], clickPt: Point): void {
    if (entity instanceof Line) this.trimLine(entity, splitPoints, clickPt);
    else if (entity instanceof Circle) this.trimCircle(entity, splitPoints, clickPt);
    else if (entity instanceof Arc) this.trimArc(entity, splitPoints, clickPt);
  }

  private trimLine(entity: Line, splitPoints: Point[], clickPt: Point): void {
    const p0 = entity.startPoint;
    const ux = entity.endPoint.x - p0.x;
    const uy = entity.endPoint.y - p0.y;
    const lenSq = ux * ux + uy * uy;
    if (lenSq === 0) return;

    const params = splitPoints.map((p) => {
      const t = ((p.x - p0.x) * ux + (p.y - p0.y) * uy) / lenSq;
      return Math.max(0, Math.min(1, t));
    });
    const clickT = ((clickPt.x - p0.x) * ux + (clickPt.y - p0.y) * uy) / lenSq;
    const clickParam = Math.max(0, Math.min(1, clickT));

    const realTouches = Array.from(new Set(params));
    let bounds = Array.from(new Set([0, ...params, 1])).sort((a, b) => a - b);

    if (bounds.length < 3) {
      if (realTouches.length < 2) {
        this.commandBar.setStatus("TRIM", "No cutting edge found - nothing trimmed");
        return;
      }
      // Both real cutting points collapsed into this line's own [0,1] anchors
      // (e.g. a rectangle side whose only neighbors touch it exactly at its
      // corners) -- the whole line IS "the segment between the two
      // intersections"; a click anywhere on it deletes the entire line.
      bounds = [0, 1];
    }

    let trimmedIdx = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (clickParam >= bounds[i]! && clickParam <= bounds[i + 1]!) {
        trimmedIdx = i;
        break;
      }
    }
    if (trimmedIdx === -1) return;

    this.undo.push(this.document.toDict());
    this.document.removeEntity(entity);

    const point = (t: number): Point => ({ x: p0.x + t * ux, y: p0.y + t * uy });
    if (bounds[trimmedIdx]! - bounds[0]! > MIN_SEGMENT) {
      this.document.addEntity(new Line(point(bounds[0]!), point(bounds[trimmedIdx]!), { lineType: entity.lineType }));
    }
    if (bounds[bounds.length - 1]! - bounds[trimmedIdx + 1]! > MIN_SEGMENT) {
      this.document.addEntity(
        new Line(point(bounds[trimmedIdx + 1]!), point(bounds[bounds.length - 1]!), { lineType: entity.lineType }),
      );
    }
    this.engine.requestRedraw();
    this.start();
  }

  private trimCircle(entity: Circle, splitPoints: Point[], clickPt: Point): void {
    if (splitPoints.length === 0) return;
    const cx = entity.center.x, cy = entity.center.y;

    const angles = Array.from(
      new Set(splitPoints.map((p) => normalizeAngle(Math.atan2(p.y - cy, p.x - cx)))),
    ).sort((a, b) => a - b);
    if (angles.length < 2) {
      this.commandBar.setStatus("TRIM", "Need at least 2 cutting points on a circle - nothing trimmed");
      return;
    }
    const clickParam = normalizeAngle(Math.atan2(clickPt.y - cy, clickPt.x - cx));

    const bounds = [...angles, angles[0]! + TWO_PI];
    let trimmedIdx = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      let testP = clickParam;
      if (i === bounds.length - 2 && testP < bounds[i]!) testP += TWO_PI;
      if (testP >= bounds[i]! && testP <= bounds[i + 1]!) {
        trimmedIdx = i;
        break;
      }
    }
    if (trimmedIdx === -1) return;

    this.undo.push(this.document.toDict());
    this.document.removeEntity(entity);

    // AutoCAD standard: circles trimmed form a single spanning arc.
    const a0 = normalizeAngle(bounds[trimmedIdx + 1]!);
    const a1 = normalizeAngle(bounds[trimmedIdx]!);
    this.document.addEntity(new Arc(entity.center, entity.radius, a0, a1, { lineType: entity.lineType }));
    this.engine.requestRedraw();
    this.start();
  }

  private trimArc(entity: Arc, splitPoints: Point[], clickPt: Point): void {
    const cx = entity.center.x, cy = entity.center.y;
    const sAng = normalizeAngle(entity.startAngle);
    const eAng = normalizeAngle(entity.endAngle);
    let totalSweep = ((eAng - sAng) % TWO_PI + TWO_PI) % TWO_PI;
    if (totalSweep === 0) totalSweep = TWO_PI;

    const allOffsets: number[] = [];
    const validSplitOffsets: number[] = [];
    for (const p of splitPoints) {
      const ang = normalizeAngle(Math.atan2(p.y - cy, p.x - cx));
      const relOffset = ((ang - sAng) % TWO_PI + TWO_PI) % TWO_PI;
      allOffsets.push(relOffset);
      if (relOffset > 1e-4 && relOffset < totalSweep - 1e-4) validSplitOffsets.push(relOffset);
    }

    const clickAng = normalizeAngle(Math.atan2(clickPt.y - cy, clickPt.x - cx));
    const clickParam = ((clickAng - sAng) % TWO_PI + TWO_PI) % TWO_PI;

    const realTouches = Array.from(new Set(allOffsets));
    let bounds = Array.from(new Set([0, ...validSplitOffsets, totalSweep])).sort((a, b) => a - b);

    if (bounds.length < 3) {
      if (realTouches.length < 2) {
        this.commandBar.setStatus("TRIM", "No cutting edge found - nothing trimmed");
        return;
      }
      // Both real cutting points sit at this arc's own two ends (a corner
      // join on each side) -- same whole-entity-is-the-segment case as Line.
      bounds = [0, totalSweep];
    }

    let trimmedIdx = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (clickParam >= bounds[i]! && clickParam <= bounds[i + 1]!) {
        trimmedIdx = i;
        break;
      }
    }
    if (trimmedIdx === -1) return;

    this.undo.push(this.document.toDict());
    this.document.removeEntity(entity);

    // Merge each side of the removed interval into at most one surviving
    // piece -- untouched interior crossings don't fragment the survivors.
    const o0a = bounds[0]!, o1a = bounds[trimmedIdx]!;
    if (o1a - o0a > 1e-4) {
      this.document.addEntity(
        new Arc(entity.center, entity.radius, normalizeAngle(sAng + o0a), normalizeAngle(sAng + o1a), {
          lineType: entity.lineType,
        }),
      );
    }
    const o0b = bounds[trimmedIdx + 1]!, o1b = bounds[bounds.length - 1]!;
    if (o1b - o0b > 1e-4) {
      this.document.addEntity(
        new Arc(entity.center, entity.radius, normalizeAngle(sAng + o0b), normalizeAngle(sAng + o1b), {
          lineType: entity.lineType,
        }),
      );
    }
    this.engine.requestRedraw();
    this.start();
  }

  rightClick(): void {
    this.engine.cancelCommand();
  }

  draw(): void {}

  cancel(): void {
    this.commandBar.setReady();
  }
}
