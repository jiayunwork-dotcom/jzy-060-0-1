import { WebSocket } from 'ws';

/**
 * Server-push layer. A single long-lived WebSocket per browser; the server
 * decides when to send (never client polling):
 *
 *   { type: 'snapshot', sources, points, alerts, rules }  on connect
 *   { type: 'point',    point: {source, ts, value} }      ~once per second
 *   { type: 'sources',  sources }                         switch/status change
 *   { type: 'alert-fired' | 'alert-resolved', alert }     alert lifecycle
 */
export class Hub {
  constructor() {
    /** @type {Set<WebSocket>} */
    this.clients = new Set();
  }

  attach(fastify, path, snapshotProvider) {
    // Relies on @fastify/websocket being registered on the instance; we do NOT
    // create our own WebSocketServer (that would clash with the plugin's
    // upgrade handler).
    fastify.get(path, { websocket: true }, (socket) => {
      this.clients.add(socket);
      socket.send(JSON.stringify({ type: 'snapshot', ...snapshotProvider() }));
      socket.on('close', () => this.clients.delete(socket));
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  broadcastPoint(point) {
    this.broadcast({ type: 'point', point });
  }

  broadcastSources(sources) {
    this.broadcast({ type: 'sources', sources });
  }

  broadcastAlert(type, alert) {
    this.broadcast({ type, alert });
  }

  close() {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        /* already closing */
      }
    }
    this.clients.clear();
  }
}
