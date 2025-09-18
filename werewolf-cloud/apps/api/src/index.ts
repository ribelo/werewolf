import { createApp } from './app';

const app = createApp();

export default app;

// Export Durable Object class for Wrangler binding
export { ContestRoom } from './live/contest-room';
