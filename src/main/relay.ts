import { MAIN_PROCESS_COMMANDS, type QuickCommand } from '@shared/protocols';

/** What the relay may do in response to a command that belongs to the main process. */
export interface RelayActions {
  openStudio(): void;
  showIcon(): void;
  hidePanel(): void;
  showPanel(): void;
}

export interface EngineSink {
  /** forwards a command to the studio (engine) window */
  send(cmd: QuickCommand): void;
}

const isCommand = (v: unknown): v is QuickCommand =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/**
 * Routes commands coming from the compact panel / floating icon:
 * window management is handled here, everything else is forwarded to the engine window.
 */
export class CommandRelay {
  constructor(
    private readonly actions: RelayActions,
    private readonly engine: EngineSink,
  ) {}

  handle(raw: unknown): void {
    if (!isCommand(raw)) return;
    if (!MAIN_PROCESS_COMMANDS.includes(raw.type)) {
      this.engine.send(raw);
      return;
    }
    switch (raw.type) {
      case 'openStudio':
        this.actions.openStudio();
        break;
      case 'minimizeToIcon':
        this.actions.showIcon();
        break;
      case 'hideCompact':
        this.actions.hidePanel();
        break;
      case 'openCompact':
        this.actions.showPanel();
        break;
      default:
        break;
    }
  }
}
