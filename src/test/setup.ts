import '@testing-library/jest-dom/vitest';
import { act } from '@testing-library/react';
import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Component tests should exercise the tracker, not the network. Default every
 * request to "signed out", which is also the correct default for a user who has
 * never authenticated. Individual tests can override fetch.
 */
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: 'not_authenticated' }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )));
});

// The sync hook's identity check settles after the test body, so let it land
// inside act() rather than emitting an unwrapped-update warning.
afterEach(async () => {
  await act(async () => { await Promise.resolve(); });
});
