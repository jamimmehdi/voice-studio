export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Moves a window of `size` so that it lies fully inside `area`. */
export function clampToArea(position: Point, size: Size, area: Rect): Point {
  return {
    x: Math.min(Math.max(position.x, area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(position.y, area.y), area.y + area.height - size.height),
  };
}

/** Default spot of the compact panel: top-right corner of the work area. */
export function defaultPanelPosition(area: Rect, size: Size, margin = 24): Point {
  return { x: area.x + area.width - size.width - margin, y: area.y + margin };
}

/** Default spot of the floating icon: right edge, vertically centred. */
export function defaultIconPosition(area: Rect, size: Size, margin = 24): Point {
  return { x: area.x + area.width - size.width - margin, y: area.y + Math.round(area.height / 2) };
}
