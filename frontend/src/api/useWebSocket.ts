import { useEffect, useRef } from 'react';
import type { WsMessage } from '../types';

type Handler = (msg: WsMessage) => void;

/**
 * Opens the single long-lived server-push connection and reconnects with
 * backoff if it drops. The browser never polls: every live update arrives
 * here, initiated by the server.
 */
export function useWebSocket(handler: Handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closedByUs = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data) as WsMessage);
        } catch (e) {
          console.error('bad ws message', e);
        }
      };
      ws.onclose = () => {
        if (closedByUs) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 400 * 2 ** retry);
      };
      ws.onopen = () => {
        retry = 0;
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  return wsRef;
}
