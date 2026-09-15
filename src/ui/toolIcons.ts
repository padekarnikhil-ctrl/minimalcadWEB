/**
 * MinimalCAD Web
 * ui/toolIcons.ts
 *
 * Small procedurally-drawn line-art icons for ui/toolbar.ts -- ported from
 * the desktop app's ui/tool_icons.py 1:1 where the geometry translates
 * directly (line/rect/arrow primitives in a local 0..20 square); a few
 * Qt-angle-convention-dependent arcs (arc/rotate/angular) are redrawn as
 * visually equivalent Canvas2D arcs rather than transliterated, since
 * Canvas2D's native angle convention already differs from Qt's (see
 * entities/arc.ts's own header comment on this exact mismatch) and these
 * are decorative glyphs, not world-space geometry -- pixel-exact parity
 * isn't the goal, "reads the same" is. No image assets, same as the
 * desktop app: each icon is a few canvas strokes, built lazily on first
 * use and cached per name.
 *
 * Utility-button icons (undo/redo/zoom/save/open/DXF/cloud) have no
 * desktop-app equivalent in tool_icons.py (Qt used its own toolbar icons
 * for window-level actions there) -- these are new, but drawn in the same
 * stroke style/weight so the whole toolbar reads as one consistent set.
 */

const SIZE = 20;
const STROKE_COLOR = "#d4d4d4";
const STROKE_WIDTH = 1.4;

type Drawer = (ctx: CanvasRenderingContext2D) => void;

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dashed(ctx: CanvasRenderingContext2D, fn: () => void): void {
  ctx.setLineDash([3, 2]);
  fn();
  ctx.setLineDash([]);
}

/** Small open V arrowhead, tip at (tipX, tipY), pointing along angleDeg. */
function arrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, angleDeg: number, size = 3.5): void {
  const rad = (angleDeg * Math.PI) / 180;
  const backX = tipX - size * Math.cos(rad);
  const backY = tipY - size * Math.sin(rad);
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const half = size * 0.6;
  line(ctx, tipX, tipY, backX + nx * half, backY + ny * half);
  line(ctx, tipX, tipY, backX - nx * half, backY - ny * half);
}

function glyph(char: string): Drawer {
  return (ctx) => {
    ctx.font = `bold ${SIZE * 0.62}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STROKE_COLOR;
    ctx.fillText(char, SIZE / 2, SIZE / 2 + 0.5);
  };
}

// --- Draw ---

function drawLine(ctx: CanvasRenderingContext2D): void {
  line(ctx, 2, 18, 18, 2);
}

function drawArc(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(4, 16, 14, -Math.PI / 2, 0);
  ctx.stroke();
}

function drawRectangle(ctx: CanvasRenderingContext2D): void {
  ctx.strokeRect(2, 4, 16, 12);
}

function drawCircle(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(10, 10, 8, 0, 2 * Math.PI);
  ctx.stroke();
}

function drawEllipse(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.ellipse(10, 10, 9, 6, 0, 0, 2 * Math.PI);
  ctx.stroke();
}

const drawText: Drawer = glyph("A");

// --- Dimension ---

function drawLinear(ctx: CanvasRenderingContext2D): void {
  const y = 10;
  const x0 = 2;
  const x1 = 18;
  line(ctx, x0, 3, x0, 17);
  line(ctx, x1, 3, x1, 17);
  line(ctx, x0, y, x1, y);
  arrowhead(ctx, x0, y, 180);
  arrowhead(ctx, x1, y, 0);
}

function drawAligned(ctx: CanvasRenderingContext2D): void {
  line(ctx, 2, 18, 18, 2);
  arrowhead(ctx, 2, 18, 135);
  arrowhead(ctx, 18, 2, -45);
}

function drawAngular(ctx: CanvasRenderingContext2D): void {
  const vx = 2;
  const vy = 18;
  line(ctx, vx, vy, 18, vy);
  line(ctx, vx, vy, vx, 2);
  ctx.beginPath();
  ctx.arc(vx, vy, 7, 0, -Math.PI / 3, true);
  ctx.stroke();
}

const drawDiameter = glyph("Ø");
const drawRadius = glyph("R");

function drawLeader(ctx: CanvasRenderingContext2D): void {
  const tipX = 2;
  const tipY = 18;
  const kneeX = 10;
  const kneeY = 4;
  line(ctx, tipX, tipY, kneeX, kneeY);
  line(ctx, kneeX, kneeY, 18, kneeY);
  arrowhead(ctx, tipX, tipY, (Math.atan2(tipY - kneeY, tipX - kneeX) * 180) / Math.PI);
}

// --- Modify ---

function drawMove(ctx: CanvasRenderingContext2D): void {
  const cx = 10;
  const cy = 10;
  for (const ang of [0, 90, 180, 270]) {
    const rad = (ang * Math.PI) / 180;
    const tipX = cx + Math.cos(rad) * 8;
    const tipY = cy + Math.sin(rad) * 8;
    line(ctx, cx, cy, tipX, tipY);
    arrowhead(ctx, tipX, tipY, ang);
  }
}

function drawCopy(ctx: CanvasRenderingContext2D): void {
  ctx.strokeRect(1, 4, 12, 12);
  ctx.strokeRect(7, 8, 12, 12);
}

function drawRotate(ctx: CanvasRenderingContext2D): void {
  const cx = 10;
  const cy = 10;
  const radius = 7;
  const start = (20 * Math.PI) / 180;
  const end = start + (300 * Math.PI) / 180;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end, false);
  ctx.stroke();
  const tipX = cx + radius * Math.cos(end);
  const tipY = cy + radius * Math.sin(end);
  arrowhead(ctx, tipX, tipY, (end * 180) / Math.PI + 90);
}

function drawTrim(ctx: CanvasRenderingContext2D): void {
  line(ctx, 2, 10, 18, 10);
  line(ctx, 7, 6, 13, 14);
  line(ctx, 13, 6, 7, 14);
}

function drawOffset(ctx: CanvasRenderingContext2D): void {
  line(ctx, 2, 17, 15, 3);
  dashed(ctx, () => line(ctx, 5, 19, 18, 6));
}

function drawMirror(ctx: CanvasRenderingContext2D): void {
  dashed(ctx, () => line(ctx, 10, 1, 10, 19));
  line(ctx, 7, 17, 7, 3);
  line(ctx, 7, 17, 2, 17);
  line(ctx, 13, 17, 13, 3);
  line(ctx, 13, 17, 18, 17);
}

function drawFillet(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(3, 3, 14, 14, 8);
  } else {
    ctx.rect(3, 3, 14, 14);
  }
  ctx.stroke();
}

function drawChamfer(ctx: CanvasRenderingContext2D): void {
  const pts: [number, number][] = [
    [3, 8],
    [8, 3],
    [17, 3],
    [17, 17],
    [3, 17],
    [3, 8],
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}

function drawScale(ctx: CanvasRenderingContext2D): void {
  ctx.strokeRect(2, 12, 6, 6);
  ctx.strokeRect(8, 2, 10, 10);
  line(ctx, 4, 14, 17, 3);
  arrowhead(ctx, 17, 3, -45);
}

// --- Utility (no desktop tool_icons.py equivalent -- see header comment) ---

function drawCurvedArrow(ctx: CanvasRenderingContext2D, mirrored: boolean): void {
  ctx.save();
  if (mirrored) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  const cx = 10;
  const cy = 11;
  const radius = 7;
  const start = (-200 * Math.PI) / 180;
  const end = (20 * Math.PI) / 180;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end, false);
  ctx.stroke();
  const tipX = cx + radius * Math.cos(end);
  const tipY = cy + radius * Math.sin(end);
  arrowhead(ctx, tipX, tipY, (end * 180) / Math.PI + 90);
  ctx.restore();
}

const drawUndo: Drawer = (ctx) => drawCurvedArrow(ctx, false);
const drawRedo: Drawer = (ctx) => drawCurvedArrow(ctx, true);

function drawZoomExtents(ctx: CanvasRenderingContext2D): void {
  const bracket = (x: number, y: number, dx: number, dy: number) => {
    line(ctx, x, y, x + dx, y);
    line(ctx, x, y, x, y + dy);
  };
  bracket(2, 2, 5, 5);
  bracket(18, 2, -5, 5);
  bracket(2, 18, 5, -5);
  bracket(18, 18, -5, -5);
}

function drawSave(ctx: CanvasRenderingContext2D): void {
  ctx.strokeRect(3, 3, 14, 14);
  ctx.strokeRect(6, 3, 8, 5);
  ctx.strokeRect(6, 12, 8, 5);
}

function drawOpen(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(2, 6);
  ctx.lineTo(2, 16);
  ctx.lineTo(18, 16);
  ctx.lineTo(16, 8);
  ctx.lineTo(7, 8);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.stroke();
}

function drawDocumentArrow(ctx: CanvasRenderingContext2D, downward: boolean): void {
  ctx.strokeRect(4, 2, 12, 16);
  const x = 10;
  const top = 6;
  const bottom = 15;
  if (downward) {
    line(ctx, x, top, x, bottom);
    arrowhead(ctx, x, bottom, 90);
  } else {
    line(ctx, x, bottom, x, top);
    arrowhead(ctx, x, top, -90);
  }
}

const drawExportDxf: Drawer = (ctx) => drawDocumentArrow(ctx, true);
const drawImportDxf: Drawer = (ctx) => drawDocumentArrow(ctx, false);

function drawCloud(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(7, 12, 4, Math.PI * 0.5, Math.PI * 1.6);
  ctx.arc(11, 8, 5, Math.PI * 1.1, Math.PI * 2.05);
  ctx.arc(14.5, 12, 3.5, Math.PI * 1.4, Math.PI * 0.55);
  ctx.lineTo(7, 16);
  ctx.closePath();
  ctx.stroke();
}

const DRAWERS: Record<string, Drawer> = {
  line: drawLine,
  arc: drawArc,
  rectangle: drawRectangle,
  circle: drawCircle,
  ellipse: drawEllipse,
  text: drawText,
  linear: drawLinear,
  aligned: drawAligned,
  angular: drawAngular,
  diameter: drawDiameter,
  radius: drawRadius,
  leader: drawLeader,
  move: drawMove,
  copy: drawCopy,
  rotate: drawRotate,
  trim: drawTrim,
  offset: drawOffset,
  mirror: drawMirror,
  fillet: drawFillet,
  chamfer: drawChamfer,
  scale: drawScale,
  undo: drawUndo,
  redo: drawRedo,
  zoomextents: drawZoomExtents,
  save: drawSave,
  open: drawOpen,
  exportdxf: drawExportDxf,
  importdxf: drawImportDxf,
  cloud: drawCloud,
};

/** Renders `name`'s icon into `canvas`, sized crisply for the current
 *  device pixel ratio (this app runs heavily on tablets, see
 *  ui/canvasView.ts's own touch handling -- a plain 20x20 canvas would
 *  render blurry on a high-DPI screen once scaled up by CSS). No-op
 *  (blank icon) for an unrecognized name, matching tool_icons.py's own
 *  build_icon() falling through silently rather than throwing. */
export function drawIcon(name: string, canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  DRAWERS[name.toLowerCase()]?.(ctx);
}
