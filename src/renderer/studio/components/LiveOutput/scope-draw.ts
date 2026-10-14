import { SCOPE_BARS } from '../../../lib/scope-math';

export interface ScopeHandle {
  x: number;
  y: number;
  index: number;
  active: boolean;
}

export interface ScopeFrame {
  width: number;
  height: number;
  /** 0..1 level per bar */
  bars: readonly number[];
  /** y pixel for each horizontal sample of the EQ curve (length = width / 2 + 1) */
  curveY: readonly number[];
  handles: readonly ScopeHandle[];
  showHandles: boolean;
}

/** Draws the live spectrum bars, the EQ curve and (optionally) the band handles. Pure drawing, no state. */
export function drawScope(ctx: CanvasRenderingContext2D, frame: ScopeFrame): void {
  const { width: w, height: h } = frame;
  ctx.clearRect(0, 0, w, h);

  // 0 dB centre line
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // spectrum bars
  const padX = 6;
  const gap = 2;
  const count = frame.bars.length || SCOPE_BARS;
  const bw = (w - padX * 2 - gap * (count - 1)) / count;
  const gradient = ctx.createLinearGradient(0, h, 0, 0);
  gradient.addColorStop(0, '#3b4ea8');
  gradient.addColorStop(1, '#7c8cff');
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.85;
  frame.bars.forEach((level, i) => {
    const bh = Math.max(3, level * h * 0.92);
    const x = padX + i * (bw + gap);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, h - bh, bw, bh, [2, 2, 0, 0]);
    else ctx.rect(x, h - bh, bw, bh);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // EQ + high-pass curve
  ctx.beginPath();
  frame.curveY.forEach((y, i) => {
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * 2, y);
  });
  ctx.strokeStyle = '#5eead4';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!frame.showHandles) return;
  ctx.font = '700 8px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  for (const handle of frame.handles) {
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = handle.active ? '#5eead4' : '#454d5b';
    ctx.fill();
    ctx.strokeStyle = '#05070a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#04201c';
    ctx.fillText(String(handle.index + 1), handle.x, handle.y + 3);
  }
  ctx.textAlign = 'start';
}
