import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getPrincipal, json, unauthorized } from '../lib/auth';

export async function me(req: HttpRequest): Promise<HttpResponseInit> {
  const p = getPrincipal(req);
  if (!p) return unauthorized();
  return json(200, {
    userId: p.userId,
    provider: p.identityProvider,
    serverTime: new Date().toISOString(),
  });
}

app.http('me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: me });
