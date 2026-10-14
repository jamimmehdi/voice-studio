const MODIFIERS = new Set(['Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Enter', 'Return', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'Up', 'Down', 'Left', 'Right', 'Escape', 'Esc', 'Plus', 'Minus',
]);

/**
 * Validates an Electron accelerator string such as "Control+Alt+V".
 * A global shortcut needs at least one modifier (a bare key would hijack normal typing) and exactly one key.
 */
export function isValidAccelerator(accelerator: string): boolean {
  if (typeof accelerator !== 'string' || accelerator.length === 0 || accelerator.length > 60) return false;
  const parts = accelerator.split('+');
  if (parts.some((p) => p.length === 0)) return false;
  const key = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1);
  if (mods.length === 0) return false;
  if (new Set(mods).size !== mods.length) return false;
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (MODIFIERS.has(key)) return false;
  return /^[A-Z0-9]$/.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key) || NAMED_KEYS.has(key) || /^[`\-=[\]\\;',./]$/.test(key);
}
