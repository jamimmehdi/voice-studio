import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { RemoteDevice } from '@shared/ipc';
import type { QuickCommand, QuickState } from '@shared/protocols';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const MAX_MESSAGE_BYTES = 2048;
const MAX_MESSAGES_PER_SECOND = 40;

/** Only the controls a phone needs. Anything else is dropped before it reaches the studio. */
const REMOTE_COMMANDS = new Set([
  'toggleEngine',
  'preset',
  'voice',
  'monitor',
  'bypass',
  'gate',
  'music',
  'mute',
  'sound',
]);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

/** Validates a message from a phone and returns the command, or null. */
export function parseRemoteCommand(raw: unknown): QuickCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.type !== 'string' || !REMOTE_COMMANDS.has(m.type)) return null;
  switch (m.type) {
    case 'preset':
      return str(m.name, 80) ? { type: 'preset', name: m.name } : null;
    case 'sound':
      return str(m.id, 64) ? { type: 'sound', id: m.id } : null;
    case 'voice': {
      const cmd: { type: 'voice'; pitch?: number; formant?: number } = { type: 'voice' };
      if (m.pitch !== undefined) {
        if (!finite(m.pitch)) return null;
        cmd.pitch = Math.min(12, Math.max(-12, m.pitch));
      }
      if (m.formant !== undefined) {
        if (!finite(m.formant)) return null;
        cmd.formant = Math.min(12, Math.max(-12, m.formant));
      }
      return cmd;
    }
    default:
      return { type: m.type } as QuickCommand;
  }
}

/** True for loopback and RFC 1918 / link-local addresses: the remote is LAN-only. */
export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (a === '::1' || a === '127.0.0.1') return true;
  if (/^(fe80:|fc|fd)/i.test(a)) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (!m) return false;
  const [o1, o2] = [Number(m[1]), Number(m[2])];
  return (
    o1 === 10 ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) ||
    (o1 === 192 && o2 === 168) ||
    (o1 === 169 && o2 === 254)
  );
}

/** "Pixel 8", "iPhone", "Windows PC" from a User-Agent string. */
export function deviceNameFromUserAgent(ua: string | undefined): string {
  if (!ua) return 'Phone';
  const android = /Android[^;]*;\s*([^;)]+?)(?:\s+Build|\)|;)/.exec(ua);
  if (android?.[1] && android[1] !== 'K') return android[1].trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Phone';
}

export interface RemoteServerOptions {
  /** directory that holds remote.html and assets/ */
  staticDir: string;
  /** the pairing token that every request must carry */
  token: () => string;
  /** preferred port (a random free one is used when it is taken) */
  port: number;
  onCommand(cmd: QuickCommand): void;
  /** called whenever a phone connects, to send it the current picture */
  currentState(): QuickState | null;
  now?: () => number;
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function makeToken(): string {
  return randomBytes(12).toString('base64url');
}

interface Client {
  id: string;
  ws: WebSocket;
  device: RemoteDevice;
  windowStart: number;
  count: number;
}

/**
 * The phone remote: a small LAN-only HTTP + WebSocket server. It serves the remote page and
 * relays control messages. Only control messages: audio never leaves the PC.
 */
export class RemoteServer {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<string, Client>();
  private readonly listeners = new Set<(devices: RemoteDevice[]) => void>();
  private actualPort = 0;
  private readonly now: () => number;

  constructor(private readonly options: RemoteServerOptions) {
    this.now = options.now ?? Date.now;
  }

  get port(): number {
    return this.actualPort;
  }

  get running(): boolean {
    return this.server !== null;
  }

  get devices(): RemoteDevice[] {
    return [...this.clients.values()].map((c) => c.device);
  }

  onDevices(cb: (devices: RemoteDevice[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async start(): Promise<number> {
    if (this.server) return this.actualPort;
    const server = createServer((req, res) => void this.handleHttp(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head, wss));

    const listen = (port: number): Promise<number> =>
      new Promise((resolve, reject) => {
        const onError = (error: Error): void => {
          server.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.removeListener('error', onError);
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '0.0.0.0');
      });

    try {
      this.actualPort = await listen(this.options.port);
    } catch {
      this.actualPort = await listen(0);
    }
    this.server = server;
    this.wss = wss;
    return this.actualPort;
  }

  stop(): void {
    for (const c of this.clients.values()) c.ws.close();
    this.clients.clear();
    this.wss?.close();
    this.server?.close();
    this.server = null;
    this.wss = null;
    this.actualPort = 0;
    this.emitDevices();
  }

  /** Drops every phone (used when the pairing code changes). */
  disconnectAll(): void {
    for (const c of this.clients.values()) c.ws.close(4001, 'code changed');
  }

  disconnect(id: string): void {
    this.clients.get(id)?.ws.close(4000, 'disconnected');
  }

  broadcast(state: QuickState): void {
    if (this.clients.size === 0) return;
    const message = JSON.stringify({ type: 'state', state });
    for (const c of this.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(message);
    }
  }

  private emitDevices(): void {
    const devices = this.devices;
    for (const cb of this.listeners) cb(devices);
  }

  private authorised(req: IncomingMessage): boolean {
    if (!isPrivateAddress(req.socket.remoteAddress)) return false;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const given = url.searchParams.get('t') ?? '';
    return tokensEqual(given, this.options.token());
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: string | Buffer, type = 'text/plain; charset=utf-8'): void => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(body);
    };

    if (req.method !== 'GET' || !isPrivateAddress(req.socket.remoteAddress)) {
      send(403, 'Forbidden');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/' || pathname === '/remote.html') {
      if (!this.authorised(req)) {
        send(403, 'This link is no longer valid. Scan the code in Voice Studio again.');
        return;
      }
      await this.serveFile('remote.html', '', send);
      return;
    }
    if (pathname.startsWith('/assets/')) {
      await this.serveFile(pathname.slice('/assets/'.length), 'assets', send);
      return;
    }
    send(404, 'Not found');
  }

  private async serveFile(
    relative: string,
    subdir: string,
    send: (status: number, body: string | Buffer, type?: string) => void,
  ): Promise<void> {
    const root = normalize(join(this.options.staticDir, subdir));
    const target = normalize(join(root, relative));
    if (target !== root && !target.startsWith(root + sep)) {
      send(403, 'Forbidden');
      return;
    }
    try {
      const data = await readFile(target);
      send(200, data, MIME[extname(target).toLowerCase()] ?? 'application/octet-stream');
    } catch {
      send(404, 'Not found');
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, wss: WebSocketServer): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws' || !this.authorised(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const id = randomBytes(6).toString('hex');
    const client: Client = {
      id,
      ws,
      device: { id, name: deviceNameFromUserAgent(req.headers['user-agent']), since: this.now() },
      windowStart: this.now(),
      count: 0,
    };
    this.clients.set(id, client);
    this.emitDevices();

    const state = this.options.currentState();
    if (state) ws.send(JSON.stringify({ type: 'state', state }));

    ws.on('message', (data) => {
      const t = this.now();
      if (t - client.windowStart > 1000) {
        client.windowStart = t;
        client.count = 0;
      }
      if (++client.count > MAX_MESSAGES_PER_SECOND) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const cmd = parseRemoteCommand(parsed);
      if (cmd) this.options.onCommand(cmd);
    });
    const gone = (): void => {
      if (this.clients.delete(id)) this.emitDevices();
    };
    ws.on('close', gone);
    ws.on('error', gone);
  }
}
