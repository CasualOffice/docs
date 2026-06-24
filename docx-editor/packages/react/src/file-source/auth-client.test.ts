import { describe, expect, it } from 'bun:test';

import { AuthClient } from './auth-client';
import { PersonalFileSourceError } from './personal';

type Call = { url: string; init: RequestInit | undefined };

function makeHarness() {
  const calls: Call[] = [];
  let respond: (call: Call) => Response | Promise<Response> = () => {
    throw new Error('mock fetch called with no responder set');
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const call: Call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return {
    calls,
    setRespond(fn: typeof respond) {
      respond = fn;
    },
    client: new AuthClient({
      baseUrl: 'http://collab.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALEX = {
  id: 42,
  username: 'alex',
  isAdmin: false,
  createdAt: 1_700_000_000_000,
};

describe('AuthClient', () => {
  it('me() unwraps { user } on 200', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, { user: ALEX }));
    const u = await h.client.me();
    expect(u).toEqual(ALEX);
    expect(h.calls[0].url).toBe('http://collab.test/auth/me');
    expect(h.calls[0].init?.credentials).toBe('include');
  });

  it('me() returns null on 401 (no session)', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(401, { error: 'unauthenticated' }));
    expect(await h.client.me()).toBeNull();
  });

  it('me() returns null on 503 (personal mode disabled)', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(503, { error: 'personal-mode-disabled' }));
    expect(await h.client.me()).toBeNull();
  });

  it('me() throws on a 5xx (collab down)', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response('upstream down', { status: 502 }));
    try {
      await h.client.me();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonalFileSourceError);
      expect((err as PersonalFileSourceError).status).toBe(502);
    }
  });

  it('login() POSTs username + password and unwraps the user', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, { user: ALEX }));
    const u = await h.client.login({ username: 'alex', password: 'passw0rd!' });
    expect(u).toEqual(ALEX);
    expect(h.calls[0].url).toBe('http://collab.test/auth/login');
    expect(h.calls[0].init?.method).toBe('POST');
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      username: 'alex',
      password: 'passw0rd!',
    });
  });

  it('login() throws with code=invalid-credentials on 401', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(401, { error: 'invalid-credentials' }));
    try {
      await h.client.login({ username: 'alex', password: 'wrong' });
      throw new Error('expected throw');
    } catch (err) {
      const e = err as PersonalFileSourceError;
      expect(e).toBeInstanceOf(PersonalFileSourceError);
      expect(e.status).toBe(401);
      expect(e.code).toBe('invalid-credentials');
    }
  });

  it('signup() POSTs username + password only', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(201, { user: ALEX }));
    await h.client.signup({ username: 'alex', password: 'passw0rd!' });
    expect(h.calls[0].url).toBe('http://collab.test/auth/signup');
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      username: 'alex',
      password: 'passw0rd!',
    });
  });

  it('signup() surfaces code=username-taken on 409', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(409, { error: 'username-taken' }));
    try {
      await h.client.signup({ username: 'dup', password: 'passw0rd!' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as PersonalFileSourceError).code).toBe('username-taken');
    }
  });

  it('signup() surfaces code=weak-password on 400', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(400, { error: 'weak-password' }));
    try {
      await h.client.signup({ username: 'alex', password: '123' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as PersonalFileSourceError).code).toBe('weak-password');
    }
  });

  it('logout() POSTs /auth/logout with credentials', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response(null, { status: 204 }));
    await h.client.logout();
    expect(h.calls[0].url).toBe('http://collab.test/auth/logout');
    expect(h.calls[0].init?.method).toBe('POST');
    expect(h.calls[0].init?.credentials).toBe('include');
  });

  it('getProfile() GETs /auth/profile and unwraps { profile }', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        user: ALEX,
        profile: {
          displayName: 'Alex',
          email: 'alex@example.com',
          timezone: 'America/Los_Angeles',
          hasAvatar: false,
          preferences: { locale: 'en-US' },
        },
      })
    );
    const profile = await h.client.getProfile();
    expect(h.calls[0].url).toBe('http://collab.test/auth/profile');
    expect(h.calls[0].init?.credentials).toBe('include');
    expect(profile.timezone).toBe('America/Los_Angeles');
    expect((profile.preferences as { locale: string }).locale).toBe('en-US');
  });

  it('updateProfile() PATCHes the patch and unwraps { profile }', async () => {
    const h = makeHarness();
    h.setRespond(() =>
      jsonRes(200, {
        profile: {
          displayName: 'Alex Tomato',
          email: null,
          timezone: 'UTC',
          hasAvatar: false,
          preferences: {},
        },
      })
    );
    const result = await h.client.updateProfile({
      displayName: 'Alex Tomato',
      timezone: 'UTC',
    });
    expect(h.calls[0].url).toBe('http://collab.test/auth/profile');
    expect(h.calls[0].init?.method).toBe('PATCH');
    const body = JSON.parse((h.calls[0].init?.body as string) ?? '{}');
    expect(body).toEqual({ displayName: 'Alex Tomato', timezone: 'UTC' });
    expect(result.displayName).toBe('Alex Tomato');
  });

  it('updateProfile() surfaces 409 errors with the code', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(409, { error: 'conflict-or-invalid' }));
    try {
      await h.client.updateProfile({ displayName: '' });
      throw new Error('expected throw');
    } catch (err) {
      const e = err as PersonalFileSourceError;
      expect(e.code).toBe('conflict-or-invalid');
      expect(e.status).toBe(409);
    }
  });

  it('falls back to a synthesized error when the body is not JSON', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response('plain html 502', { status: 502 }));
    try {
      await h.client.login({ username: 'alex', password: 'x' });
      throw new Error('expected throw');
    } catch (err) {
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(502);
      expect(e.code).toBe('http_502');
    }
  });
});
