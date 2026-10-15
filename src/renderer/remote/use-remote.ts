import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickCommand, QuickState } from '@shared/protocols';

export type Connection = 'connecting' | 'open' | 'closed' | 'denied';

export interface RemoteLink {
  state: QuickState | null;
  connection: Connection;
  send(cmd: QuickCommand): void;
}

const RETRY_MS = [500, 1000, 2000, 4000];

/** URL of the control socket for the page that is open (same host, token from the address). */
export function socketUrl(location: Pick<Location, 'protocol' | 'host' | 'search'>): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = new URLSearchParams(location.search).get('t') ?? '';
  return `${scheme}://${location.host}/ws?t=${encodeURIComponent(token)}`;
}

/** Keeps a WebSocket to the PC open, reconnecting with a short back-off. */
export function useRemote(): RemoteLink {
  const [state, setState] = useState<QuickState | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (!alive) return;
      setConnection('connecting');
      const ws = new WebSocket(socketUrl(window.location));
      socket.current = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        attempt = 0;
        setConnection('open');
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as { type?: string; state?: QuickState };
          if (msg.type === 'state' && msg.state) setState(msg.state);
        } catch {
          /* ignore malformed messages */
        }
      };
      ws.onclose = (event) => {
        socket.current = null;
        if (!alive) return;
        // 4001: the pairing code was replaced; a refused handshake never opened
        if (event.code === 4001 || (!opened && attempt >= RETRY_MS.length)) {
          setConnection('denied');
          return;
        }
        setConnection('closed');
        timer = setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
      };
    };
    connect();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      socket.current?.close();
    };
  }, []);

  const send = useCallback((cmd: QuickCommand): void => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
  }, []);

  return { state, connection, send };
}
