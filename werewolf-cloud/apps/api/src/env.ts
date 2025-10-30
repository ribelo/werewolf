export type WerewolfBindings = {
  DB: D1Database;
  KV: KVNamespace;
  ENV: 'development' | 'staging' | 'production' | 'test';
  'werewolf-contest-room': DurableObjectNamespace;
  ADMIN_PASSWORD: string;
};

export type WerewolfVariables = {
  requestId: string;
  startedAt: number;
  sessionId?: string;
};

export type WerewolfEnvironment = {
  Bindings: WerewolfBindings;
  Variables: WerewolfVariables;
};
