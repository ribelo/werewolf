import type { Hono } from 'hono';
import type { WerewolfEnvironment } from '../env';
import attempts, { contestAttempts, registrationAttempts } from './attempts';
import contests from './contests';
import competitors from './competitors';
import plateSets from './plate-sets';
import categories from './categories';
import tags from './tags';
import reference from './reference';
import registrations, { contestRegistrations } from './registrations';
import results, { contestResults } from './results';
import settings from './settings';
import system from './system';
import live from './live';
import auth from './auth';
import contestDisplay from './display';

export const registerRoutes = (app: Hono<WerewolfEnvironment>) => {
  app.route('/contests', contests);
  app.route('/registrations', registrations);
  app.route('/contests/:contestId/registrations', contestRegistrations);
  app.route('/competitors', competitors);
  app.route('/attempts', attempts);
  app.route('/contests/:contestId/attempts', contestAttempts);
  app.route('/contests/:contestId/registrations/:registrationId/attempts', registrationAttempts);
  app.route('/results', results);
  app.route('/contests/:contestId/results', contestResults);
  app.route('/settings', settings);
  app.route('/system', system);
  app.route('/reference', reference);
  app.route('/contests/:contestId/platesets', plateSets);
  app.route('/contests/:contestId/categories', categories);
  app.route('/contests/:contestId/tags', tags);
  app.route('/contests/:contestId/display', contestDisplay);
  app.route('/', live);
  app.route('/auth', auth);

  // results.ts registers GET /results/:registrationId; the registration-scoped
  // alias hands the same request to that app with the mount prefix removed so
  // the id is read from the route instead of a second path segment.
  app.get('/registrations/:registrationId/results', async (c) => {
    const registrationId = c.req.param('registrationId');
    const url = new URL(c.req.url);
    url.pathname = `/${registrationId}`;

    return results.fetch(new Request(url, c.req.raw), c.env);
  });
};
