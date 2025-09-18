import type { LiveEvent } from './types';

export class ContestRoom {
  private readonly state: DurableObjectState;
  private readonly connections = new Set<WebSocket>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get('Upgrade');

    if (upgrade === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      if (!client || !server) {
        return new Response('Failed to establish WebSocket pair', { status: 500 });
      }

      server.accept();
      this.addConnection(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      try {
        const event = (await request.json()) as LiveEvent;
        this.broadcast(event);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }

  private addConnection(ws: WebSocket): void {
    this.connections.add(ws);

    ws.addEventListener('message', (evt) => {
      // Optional: allow ping/pong from clients
      try {
        const data = typeof evt.data === 'string' ? evt.data : '';
        if (data === 'ping') ws.send('pong');
      } catch {}
    });

    ws.addEventListener('close', () => {
      this.connections.delete(ws);
      this.maybeStopHeartbeat();
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch {}
      this.connections.delete(ws);
      this.maybeStopHeartbeat();
    });

    this.ensureHeartbeat();
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const event: LiveEvent = {
        type: 'heartbeat',
        contestId: this.state.id.toString(),
        timestamp: new Date().toISOString(),
        payload: { connections: this.connections.size },
      };
      this.broadcast(event);
    }, 25000);
  }

  private maybeStopHeartbeat(): void {
    if (this.connections.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private broadcast(event: LiveEvent): void {
    const message = JSON.stringify(event);
    for (const ws of this.connections) {
      try {
        ws.send(message);
      } catch {
        try { ws.close(); } catch {}
        this.connections.delete(ws);
      }
    }
  }
}

export type ContestRoomNamespace = DurableObjectNamespace;
