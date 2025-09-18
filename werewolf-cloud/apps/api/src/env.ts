export type WerewolfBindings = {
  DB: D1Database;
  KV: KVNamespace;
  ENV: 'development' | 'staging' | 'production';
  'werewolf-contest-room': DurableObjectNamespace;
};

export type WerewolfVariables = {
  requestId: string;
  startedAt: number;
};

export type WerewolfEnvironment = {
  Bindings: WerewolfBindings;
  Variables: WerewolfVariables;
};
