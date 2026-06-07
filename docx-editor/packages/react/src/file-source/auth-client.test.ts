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
      baseUrl: 'http://gateway.test',
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
  userId: 'user_42',
  email: 'alex@example.com',
  displayName: 'Alex',
  isAdmin: false,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('AuthClient', () => {
  it('me() returns the user on 200', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, ALEX));
    const u = await h.client.me();
    expect(u).toEqual(ALEX);
    expect(h.calls[0].url).toBe('http://gateway.test/auth/me');
    expect(h.calls[0].init?.credentials).toBe('include');
  });

  it('me() returns null on 401 (no session)', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(401, { code: 'not_authenticated', message: 'no session' }));
    expect(await h.client.me()).toBeNull();
  });

  it('me() throws on a 5xx (gateway down)', async () => {
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

  it('login() POSTs the credentials and returns the user', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(200, ALEX));
    const u = await h.client.login({ email: 'alex@example.com', password: 'passw0rd!' });
    expect(u).toEqual(ALEX);
    expect(h.calls[0].url).toBe('http://gateway.test/auth/login');
    expect(h.calls[0].init?.method).toBe('POST');
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      email: 'alex@example.com',
      password: 'passw0rd!',
    });
  });

  it('login() throws with code=invalid_credentials on 401', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(401, { code: 'invalid_credentials', message: 'no match' }));
    try {
      await h.client.login({ email: 'a@b', password: 'wrong' });
      throw new Error('expected throw');
    } catch (err) {
      const e = err as PersonalFileSourceError;
      expect(e).toBeInstanceOf(PersonalFileSourceError);
      expect(e.status).toBe(401);
      expect(e.code).toBe('invalid_credentials');
    }
  });

  it('signup() includes displayName in the body when present', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(201, ALEX));
    await h.client.signup({
      email: 'alex@example.com',
      password: 'passw0rd!',
      displayName: 'Alex',
    });
    expect(JSON.parse(h.calls[0].init?.body as string)).toEqual({
      email: 'alex@example.com',
      password: 'passw0rd!',
      displayName: 'Alex',
    });
  });

  it('signup() surfaces code=email_taken on 409', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(409, { code: 'email_taken', message: 'already' }));
    try {
      await h.client.signup({ email: 'dup@example.com', password: 'passw0rd!' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as PersonalFileSourceError).code).toBe('email_taken');
    }
  });

  it('signup() surfaces code=weak_password on 400', async () => {
    const h = makeHarness();
    h.setRespond(() => jsonRes(400, { code: 'weak_password', message: 'too short' }));
    try {
      await h.client.signup({ email: 'a@b', password: '123' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as PersonalFileSourceError).code).toBe('weak_password');
    }
  });

  it('logout() POSTs /auth/logout with credentials', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response(null, { status: 204 }));
    await h.client.logout();
    expect(h.calls[0].url).toBe('http://gateway.test/auth/logout');
    expect(h.calls[0].init?.method).toBe('POST');
    expect(h.calls[0].init?.credentials).toBe('include');
  });

  it('falls back to a synthesized error when the body is not JSON', async () => {
    const h = makeHarness();
    h.setRespond(() => new Response('plain html 502', { status: 502 }));
    try {
      await h.client.login({ email: 'a@b', password: 'x' });
      throw new Error('expected throw');
    } catch (err) {
      const e = err as PersonalFileSourceError;
      expect(e.status).toBe(502);
      expect(e.code).toBe('http_502');
    }
  });
});
