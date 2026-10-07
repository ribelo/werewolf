import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContestRoom } from '../src/live/contest-room';

type Listener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  public readonly sent: string[] = [];
  public sendAttempts = 0;
  public closed = false;
  public failSend = false;
  private readonly listeners = new Map<string, Listener[]>();

  public accept(): void {
    // The Durable Object only calls accept; the fake socket needs no handshake.
  }

  public send(message: string): void {
    this.sendAttempts += 1;

    if (this.failSend) {
      throw new Error('socket is closed');
    }

    this.sent.push(message);
  }

  public close(): void {
    this.closed = true;
    this.emit('close', {});
  }

  public addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  private emit(type: string, event: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const createState = (): DurableObjectState =>
  ({ id: { toString: () => 'opaque-durable-object-id' } }) as unknown as DurableObjectState;

const lastHeartbeat = (socket: FakeWebSocket): { type: string; contestId: string; payload: { connections: number } } => {
  const message = socket.sent.at(-1);
  if (!message) {
    throw new Error('no message was sent to the socket');
  }

  return JSON.parse(message) as { type: string; contestId: string; payload: { connections: number } };
};

describe('ContestRoom live fan-out', () => {
  let servers: FakeWebSocket[] = [];
  let originalResponse: typeof Response;

  beforeEach(() => {
    vi.useFakeTimers();
    servers = [];
    originalResponse = globalThis.Response;

    // Node's Response rejects the 101 status the Durable Object answers an
    // upgrade with; the fan-out behaviour under test does not depend on it.
    class TestResponse extends Response {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      }
    }

    globalThis.Response = TestResponse as unknown as typeof Response;
    (globalThis as unknown as Record<string, unknown>)['WebSocketPair'] = class {
      constructor() {
        const client = new FakeWebSocket();
        const server = new FakeWebSocket();
        servers.push(server);
        return [client, server];
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Response = originalResponse;
    delete (globalThis as unknown as Record<string, unknown>)['WebSocketPair'];
  });

  const upgrade = (room: ContestRoom, contestId: string): Promise<Response> =>
    room.fetch(new Request(`https://room/ws/contests/${contestId}`, {
      headers: { Upgrade: 'websocket' },
    }));

  it('broadcasts the heartbeat with the contest the socket joined', async () => {
    const room = new ContestRoom(createState(), {});
    await upgrade(room, 'contest-42');

    await vi.advanceTimersByTimeAsync(25000);

    const socket = servers.at(-1);
    if (!socket) {
      throw new Error('no websocket server was created');
    }

    expect(lastHeartbeat(socket)).toMatchObject({
      type: 'heartbeat',
      contestId: 'contest-42',
      payload: { connections: 1 },
    });
  });

  it('stops the heartbeat once a failed send removed the last connection', async () => {
    const room = new ContestRoom(createState(), {});
    await upgrade(room, 'contest-7');

    const socket = servers.at(-1);
    if (!socket) {
      throw new Error('no websocket server was created');
    }

    socket.failSend = true;
    await vi.advanceTimersByTimeAsync(25000);

    expect(socket.closed).toBe(true);
    const attemptsAfterFailure = socket.sendAttempts;

    await vi.advanceTimersByTimeAsync(75000);

    expect(socket.sendAttempts).toBe(attemptsAfterFailure);
  });

  it('keeps the heartbeat while another connection is still open', async () => {
    const room = new ContestRoom(createState(), {});
    await upgrade(room, 'contest-7');
    await upgrade(room, 'contest-7');

    const failing = servers[0];
    const healthy = servers[1];
    if (!failing || !healthy) {
      throw new Error('expected two websocket servers');
    }

    failing.failSend = true;

    await vi.advanceTimersByTimeAsync(50000);

    expect(failing.closed).toBe(true);
    expect(healthy.sent).toHaveLength(2);
    expect(lastHeartbeat(healthy)).toMatchObject({
      type: 'heartbeat',
      contestId: 'contest-7',
      payload: { connections: 1 },
    });
  });
});
