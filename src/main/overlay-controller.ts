import type { QuickState } from '@shared/protocols';
import {
  clampToArea,
  defaultIconPosition,
  defaultPanelPosition,
  type Point,
  type Rect,
  type Size,
} from './geometry';
import type { SettingsStore } from './settings-store';

/** What the controller needs from a compact window; implemented by Electron windows and by test doubles. */
export interface OverlayWindow {
  readonly size: Size;
  isVisible(): boolean;
  /** shows without activating (never steals focus from a game) */
  showAt(position: Point): void;
  hide(): void;
  sendState(state: QuickState): void;
  position(): Point | null;
  moveBy(dx: number, dy: number): void;
}

export interface OverlayDeps {
  panel: OverlayWindow;
  icon: OverlayWindow;
  settings: SettingsStore;
  workArea(): Rect;
}

/**
 * Decides which of the two always-on-top windows (compact panel / floating icon) is visible,
 * remembers where the user left them and feeds them the engine state.
 */
export class OverlayController {
  private latest: QuickState | null = null;

  constructor(private readonly deps: OverlayDeps) {}

  /** the most recent state the engine window reported (also handed to the phone remote) */
  get lastState(): QuickState | null {
    return this.latest;
  }

  get panelVisible(): boolean {
    return this.deps.panel.isVisible();
  }

  get iconVisible(): boolean {
    return this.deps.icon.isVisible();
  }

  showPanel(): void {
    const { panel, icon, settings } = this.deps;
    icon.hide();
    const area = this.deps.workArea();
    const saved = settings.value.panelPosition;
    const at = saved ? clampToArea(saved, panel.size, area) : defaultPanelPosition(area, panel.size);
    panel.showAt(at);
    if (this.latest) panel.sendState(this.latest);
  }

  showIcon(): void {
    const { panel, icon, settings } = this.deps;
    this.rememberPanelPosition();
    panel.hide();
    const area = this.deps.workArea();
    const saved = settings.value.iconPosition;
    const at = saved ? clampToArea(saved, icon.size, area) : defaultIconPosition(area, icon.size);
    icon.showAt(at);
    if (this.latest) icon.sendState(this.latest);
  }

  hidePanel(): void {
    this.rememberPanelPosition();
    this.deps.panel.hide();
  }

  hideAll(): void {
    this.hidePanel();
    this.deps.icon.hide();
  }

  /** Global shortcut: a visible panel shrinks to the icon, anything else brings the panel up. */
  toggle(): void {
    if (this.panelVisible) this.showIcon();
    else this.showPanel();
  }

  /** Moves the floating icon while the user drags it. */
  dragIcon(dx: number, dy: number): void {
    this.deps.icon.moveBy(dx, dy);
  }

  /** Called by the icon window after a drag. */
  rememberIconPosition(): void {
    const p = this.deps.icon.position();
    if (p) this.deps.settings.update({ iconPosition: p });
  }

  rememberPanelPosition(): void {
    const { panel, settings } = this.deps;
    if (!panel.isVisible()) return;
    const p = panel.position();
    if (p) settings.update({ panelPosition: p });
  }

  pushState(state: QuickState): void {
    this.latest = state;
    if (this.deps.panel.isVisible()) this.deps.panel.sendState(state);
    if (this.deps.icon.isVisible()) this.deps.icon.sendState(state);
  }
}
