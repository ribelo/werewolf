import type { LiveEvent, LiveEventType } from '../../src/live/types';

/**
 * An event captured from a publish call, together with the room (contest) the
 * app routed it to. The room id is what `idFromName` received, so a test can
 * tell apart events published for different contests.
 */
export type RecordedLiveEvent = {
  roomId: string;
  type: string;
  contestId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  pathname: string;
};

export type LiveRecorder = {
  /** Binding compatible with the `werewolf-contest-room` Durable Object namespace. */
  namespace: DurableObjectNamespace;
  /** Every event recorded so far, in publish order. */
  events: RecordedLiveEvent[];
  /** Events published to the room of `roomId` (normally a contest id). */
  eventsFor: (roomId: string) => RecordedLiveEvent[];
  /** Events of one live event type, across all rooms. */
  ofType: (type: LiveEventType) => RecordedLiveEvent[];
  /** Drop everything recorded so far. */
  reset: () => void;
};

const isLiveEvent = (value: unknown): value is LiveEvent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const event = value as Partial<LiveEvent>;

  return typeof event.type === 'string' && typeof event.contestId === 'string';
};

/**
 * Recording stand-in for the contest room Durable Object: instead of fanning
 * events out over WebSockets it stores every published event so tests can
 * assert on it.
 */
export function createLiveRecorder(): LiveRecorder {
  const events: RecordedLiveEvent[] = [];
  const roomIds = new Map<DurableObjectId, string>();

  const namespace = {
    idFromName: (name: string): DurableObjectId => {
      const id = { name, toString: () => name } as unknown as DurableObjectId;
      roomIds.set(id, name);
      return id;
    },
    idFromString: (id: string): DurableObjectId => {
      const objectId = { name: id, toString: () => id } as unknown as DurableObjectId;
      roomIds.set(objectId, id);
      return objectId;
    },
    get: (id: DurableObjectId) => {
      const roomId = roomIds.get(id) ?? String(id);

      return {
        fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const request = input instanceof Request ? input : new Request(input, init);
          const pathname = new URL(request.url).pathname;

          if (request.method !== 'POST' || !pathname.endsWith('/broadcast')) {
            if (request.headers.get('Upgrade') === 'websocket') {
              return new Response('Recording live namespace has no WebSocket support', { status: 501 });
            }

            return new Response('Not found', { status: 404 });
          }

          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 });
          }

          if (!isLiveEvent(body)) {
            return new Response(JSON.stringify({ ok: false, error: 'invalid event' }), { status: 400 });
          }

          events.push({
            roomId,
            type: body.type,
            contestId: body.contestId,
            timestamp: body.timestamp,
            payload: (body.payload ?? {}) as Record<string, unknown>,
            pathname,
          });

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      };
    },
  } as unknown as DurableObjectNamespace;

  return {
    namespace,
    events,
    eventsFor: (roomId) => events.filter((event) => event.roomId === roomId),
    ofType: (type) => events.filter((event) => event.type === type),
    reset: () => {
      events.length = 0;
    },
  };
}
