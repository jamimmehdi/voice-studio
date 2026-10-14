export type CaptureResult =
  { kind: 'wait' } | { kind: 'invalid'; reason: string } | { kind: 'ok'; accelerator: string };

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** KeyboardEvent.code -> the key part of an Electron accelerator, or null if it cannot be used. */
export function keyNameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

/** Converts a key press into an Electron accelerator ("Control+Alt+V"). */
export function acceleratorFromEvent(e: KeyLike): CaptureResult {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return { kind: 'wait' };
  const key = keyNameFromCode(e.code);
  const mods = [
    e.ctrlKey && 'Control',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Super',
  ].filter(Boolean) as string[];
  if (!key || mods.length === 0) {
    return { kind: 'invalid', reason: 'Please include Ctrl, Alt or Shift together with a key.' };
  }
  return { kind: 'ok', accelerator: [...mods, key].join('+') };
}
