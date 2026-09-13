import type { HttpRequest } from '@azure/functions';

export interface Principal {
  userId: string;
  userDetails: string;
  identityProvider: string;
}

/** The only provider we accept. userId is provider-scoped, so allowing a second
 *  one would silently produce a separate, empty dataset. */
export const ALLOWED_PROVIDER = 'github';

/**
 * Static Web Apps injects x-ms-client-principal and strips any inbound copy, so
 * this header is trustworthy. Every data path derives the partition key from
 * here and never from the request body or query string.
 */
export function getPrincipal(req: HttpRequest): Principal | null {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    if (!decoded?.userId || !decoded?.identityProvider) return null;
    if (decoded.identityProvider !== ALLOWED_PROVIDER) return null;
    return {
      userId: decoded.userId,
      userDetails: decoded.userDetails ?? '',
      identityProvider: decoded.identityProvider,
    };
  } catch {
    return null;
  }
}

export const json = (status: number, body: unknown) => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': 'no-store' },
});

export const unauthorized = () => json(401, { error: 'not_authenticated' });
