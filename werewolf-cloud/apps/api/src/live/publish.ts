import type { LiveEvent, LiveEventPayloads, LiveEventType } from './types';
import type { WerewolfBindings } from '../env';
import { convertKeysToCamelCase } from '../utils/database';

export type LiveEventInput<K extends LiveEventType = LiveEventType> = {
  type: K;
  payload?: LiveEventPayloads[K];
};

export async function publishEvent<K extends LiveEventType>(
  env: WerewolfBindings,
  contestId: string,
  event: LiveEventInput<K>,
): Promise<void> {
  const namespace = env['werewolf-contest-room'];
  const id = namespace.idFromName(contestId);
  const stub = namespace.get(id);
  const normalisedPayload = (
    event.payload !== undefined ? convertKeysToCamelCase(event.payload) : {}
  ) as LiveEventPayloads[K];
  const fullEvent: LiveEvent<K> = {
    type: event.type,
    contestId,
    timestamp: new Date().toISOString(),
    payload: normalisedPayload,
  };
  await stub.fetch('https://room/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fullEvent),
  });
}
