import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { YtFetchResult } from '@shared/ipc';
import { downloadToFile } from '../net/http';
import { friendlyYtdlpError, isAcceptableUrl, parsePrintedResult } from './errors';

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

export interface ProcessRunner {
  (exe: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: string }>;
}

export const nodeRunner: ProcessRunner = (exe, args, env) =>
  new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      { env, maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 5 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(friendlyYtdlpError(String(stderr || err.message))));
        else resolve({ stdout: String(stdout) });
      },
    );
  });

export interface YtDlpDeps {
  /** folder where the binary and downloaded audio live */
  dataDir: string;
  /** the running Electron binary: doubles as the Node runtime yt-dlp needs for YouTube */
  jsRuntimePath: string;
  download?: (url: string, dest: string) => Promise<string>;
  run?: ProcessRunner;
}

/** Downloads the audio of a link (YouTube and everything else yt-dlp supports) through yt-dlp. */
export class YtDlpService {
  private readonly download: (url: string, dest: string) => Promise<string>;
  private readonly run: ProcessRunner;

  constructor(private readonly deps: YtDlpDeps) {
    this.download = deps.download ?? downloadToFile;
    this.run = deps.run ?? nodeRunner;
  }

  private get binaryPath(): string {
    return join(this.deps.dataDir, 'tools', 'yt-dlp.exe');
  }

  async ensureBinary(): Promise<string> {
    mkdirSync(join(this.deps.dataDir, 'tools'), { recursive: true });
    if (!existsSync(this.binaryPath)) await this.download(YTDLP_URL, this.binaryPath);
    return this.binaryPath;
  }

  async fetchAudio(url: string): Promise<YtFetchResult> {
    try {
      if (!isAcceptableUrl(url)) throw new Error('Please paste a full https:// link');
      const exe = await this.ensureBinary();
      const cacheDir = join(this.deps.dataDir, 'music-cache');
      mkdirSync(cacheDir, { recursive: true });

      const { stdout } = await this.run(
        exe,
        [
          '--js-runtimes', `node:${this.deps.jsRuntimePath}`,
          '--no-playlist', '--no-simulate',
          '-f', 'bestaudio[ext=m4a]/bestaudio',
          '-o', join(cacheDir, '%(id)s.%(ext)s'),
          '--print', 'after_move:%(title)s|||%(filepath)s',
          url,
        ],
        { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      );

      const printed = parsePrintedResult(stdout);
      if (!printed) throw new Error('The downloader returned no file.');
      const bytes = readFileSync(printed.file);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return { ok: true, title: printed.title, ext: extname(printed.file).slice(1), data };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
