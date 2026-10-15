import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 30 MB per clip is plenty for a soundboard and keeps a stray video file out. */
export const MAX_SOUND_BYTES = 30 * 1024 * 1024;

const ID_PATTERN = /^[a-f0-9]{16}$/;

export interface SoundFiles {
  mkdir(path: string): void;
  write(path: string, data: Buffer): void;
  read(path: string): Buffer;
  remove(path: string): void;
}

const nodeFiles: SoundFiles = {
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  write: (p, d) => writeFileSync(p, d),
  read: (p) => readFileSync(p),
  remove: (p) => rmSync(p, { force: true }),
};

/** Keeps soundboard clips as files in the user-data folder. Ids are random hex, never paths. */
export class SoundStore {
  constructor(
    private readonly dir: string,
    private readonly files: SoundFiles = nodeFiles,
    private readonly makeId: () => string = () => randomBytes(8).toString('hex'),
  ) {}

  add(data: ArrayBuffer | Buffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buffer.length === 0) throw new Error('The file is empty.');
    if (buffer.length > MAX_SOUND_BYTES) throw new Error('That file is larger than 30 MB.');
    this.files.mkdir(this.dir);
    const id = this.makeId();
    this.files.write(join(this.dir, id), buffer);
    return id;
  }

  read(id: string): ArrayBuffer | null {
    if (!ID_PATTERN.test(id)) return null;
    try {
      const buf = this.files.read(join(this.dir, id));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }

  remove(id: string): void {
    if (!ID_PATTERN.test(id)) return;
    this.files.remove(join(this.dir, id));
  }
}
