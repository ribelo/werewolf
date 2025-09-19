import type { LiveEvent } from './types';
import type { WerewolfBindings } from '../env';
import { convertKeysToCamelCase } from '../utils/database';

export async function publishEvent(env: WerewolfBindings, contestId: string, event: Omit<LiveEvent, 'contestId' | 'timestamp'> & { payload?: any }) {
  const namespace = env['werewolf-contest-room'];
  const id = namespace.idFromName(contestId);
  const stub = namespace.get(id);
  const normalisedPayload = event.payload !== undefined ? convertKeysToCamelCase(event.payload) : {};
  const fullEvent: LiveEvent = {
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
