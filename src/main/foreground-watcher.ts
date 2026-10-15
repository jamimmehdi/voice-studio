import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { RunningApp } from '@shared/features';
import { appNameFromExe } from '@shared/features';
import { runPowerShell } from './powershell';

/**
 * A PowerShell loop that prints the executable name of the foreground window whenever it changes.
 * It only reads the process name: nothing is injected into any process.
 */
export const FOREGROUND_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VsFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$last = ''
while ($true) {
  $h = [VsFg]::GetForegroundWindow()
  $name = ''
  if ($h -ne [IntPtr]::Zero) {
    $procId = 0
    [void][VsFg]::GetWindowThreadProcessId($h, [ref]$procId)
    $p = Get-Process -Id $procId
    if ($p) { $name = $p.ProcessName + '.exe' }
  }
  if ($name -ne $last) { $last = $name; [Console]::Out.WriteLine($name); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 1000
}
`;

export type SpawnFn = (command: string, args: string[]) => ChildProcessWithoutNullStreams;

const defaultSpawn: SpawnFn = (command, args) => spawn(command, args, { windowsHide: true });

/** Normalises what the script printed: lower case, no path, nothing for an empty / odd line. */
export function parseForegroundLine(line: string): string | null {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed || trimmed.length > 120 || !/^[\w .()+-]+\.exe$/.test(trimmed)) return null;
  return trimmed;
}

/** Watches which program is in front and reports changes. Windows only; elsewhere it stays idle. */
export class ForegroundWatcher {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private currentExe: string | null = null;
  private readonly listeners = new Set<(exe: string | null) => void>();

  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly spawnFn: SpawnFn = defaultSpawn,
  ) {}

  get current(): string | null {
    return this.currentExe;
  }

  onChange(cb: (exe: string | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.child || this.platform !== 'win32') return;
    const encoded = Buffer.from(FOREGROUND_SCRIPT, 'utf16le').toString('base64');
    const child = this.spawnFn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ]);
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.on('exit', () => {
      this.child = null;
    });
    child.on('error', () => {
      this.child = null;
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.buffer = '';
  }

  /** exposed for tests */
  onData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      const exe = parseForegroundLine(line);
      if (exe === this.currentExe) continue;
      this.currentExe = exe;
      for (const cb of this.listeners) cb(exe);
    }
  }
}

/** Programs that currently have a visible window, for the "Add running app" list. */
export async function listRunningApps(
  run: (cmd: string) => Promise<string> = runPowerShell,
): Promise<RunningApp[]> {
  const out = await run(
    'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique',
  );
  const seen = new Set<string>();
  const apps: RunningApp[] = [];
  for (const line of out.split(/\r?\n/)) {
    const exe = parseForegroundLine(`${line.trim()}.exe`);
    if (!exe || seen.has(exe)) continue;
    seen.add(exe);
    apps.push({ exe, name: appNameFromExe(exe) });
  }
  return apps.slice(0, 200);
}
