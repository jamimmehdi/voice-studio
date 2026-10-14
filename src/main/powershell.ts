import { execFile } from 'node:child_process';

/** Quotes a value for use inside a single-quoted PowerShell string. */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function runPowerShell(command: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err)
          reject(
            new Error(
              String(stderr || err.message)
                .trim()
                .slice(0, 300),
            ),
          );
        else resolve(String(stdout));
      },
    );
  });
}
