import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SimpleResult } from '@shared/ipc';
import { downloadToFile, getText } from '../net/http';
import { psQuote, runPowerShell } from '../powershell';

/*
 * VB-Audio's licence forbids bundling VB-CABLE inside another installer without their agreement.
 * This class therefore only fetches the OFFICIAL package from vb-audio.com when the user asks,
 * verifies the digital signature and starts VB-Audio's own, unmodified setup program.
 */

export const VBCABLE_PAGE = 'https://vb-audio.com/Cable/';
export const VBCABLE_FALLBACK = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';

const PACK_URL = /https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack(\d+)\.zip/g;

/** Picks the newest `VBCABLE_Driver_PackNN.zip` link from the vendor page. */
export function findLatestPackUrl(html: string): string | null {
  const found = [...html.matchAll(PACK_URL)].map((m) => ({ url: m[0], n: Number(m[1]) })).sort((a, b) => b.n - a.n);
  return found[0]?.url ?? null;
}

/** `Get-AuthenticodeSignature` output "Valid|CN=BUREL VINCENT…" is trusted only for VB-Audio's author. */
export function isTrustedSignature(output: string): boolean {
  return /^Valid\|.*(BUREL VINCENT|VB-Audio)/i.test(output.trim());
}

export interface VbCableDeps {
  getText?: (url: string) => Promise<string>;
  download?: (url: string, dest: string) => Promise<string>;
  powershell?: (command: string) => Promise<string>;
  makeTempDir?: () => string;
  fileExists?: (path: string) => boolean;
}

export class VbCableInstaller {
  private readonly getText: (url: string) => Promise<string>;
  private readonly download: (url: string, dest: string) => Promise<string>;
  private readonly powershell: (command: string) => Promise<string>;
  private readonly makeTempDir: () => string;
  private readonly fileExists: (path: string) => boolean;

  constructor(deps: VbCableDeps = {}) {
    this.getText = deps.getText ?? getText;
    this.download = deps.download ?? downloadToFile;
    this.powershell = deps.powershell ?? ((c) => runPowerShell(c));
    this.makeTempDir = deps.makeTempDir ?? (() => mkdtempSync(join(tmpdir(), 'vbcable-')));
    this.fileExists = deps.fileExists ?? existsSync;
  }

  async install(): Promise<SimpleResult> {
    try {
      let url = VBCABLE_FALLBACK;
      try {
        url = findLatestPackUrl(await this.getText(VBCABLE_PAGE)) ?? VBCABLE_FALLBACK;
      } catch {
        /* the vendor page is only used to find a newer version; the pinned link still works */
      }

      const dir = this.makeTempDir();
      const zip = join(dir, 'vbcable.zip');
      await this.download(url, zip);

      const out = join(dir, 'pkg');
      await this.powershell(`Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(out)} -Force`);
      const setup = join(out, 'VBCABLE_Setup_x64.exe');
      if (!this.fileExists(setup)) throw new Error('Setup file missing in the VB-CABLE package');

      const sig = await this.powershell(
        `$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(setup)}; "$($s.Status)|$($s.SignerCertificate.Subject)"`,
      );
      if (!isTrustedSignature(sig)) throw new Error('The downloaded installer signature could not be verified.');

      // Windows shows its administrator prompt for the vendor's own installer
      await this.powershell(`Start-Process -FilePath ${psQuote(setup)} -Verb RunAs`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
