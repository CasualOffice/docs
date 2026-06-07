import { describe, expect, it } from 'bun:test';

import { BrowserFileSource } from './browser';
import { PersonalFileSource } from './personal';
import { chooseFileSource } from './select';

function userJson(body: { userId: string; displayName: string }) {
  return new Response(
    JSON.stringify({ ...body, email: 'x@y', createdAt: '2026-01-01T00:00:00Z' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

describe('chooseFileSource', () => {
  it('returns BrowserFileSource when gatewayBuild is false', async () => {
    const source = await chooseFileSource({ gatewayBuild: false });
    expect(source).toBeInstanceOf(BrowserFileSource);
    expect(source.kind).toBe('browser');
  });

  it('returns PersonalFileSource when /auth/me responds 200 in a gateway build', async () => {
    let asked = '';
    const fetchImpl = (async (input: RequestInfo | URL) => {
      asked = typeof input === 'string' ? input : input.toString();
      return userJson({ userId: 'user_42', displayName: 'Forty-Two' });
    }) as unknown as typeof fetch;

    const source = await chooseFileSource({
      gatewayBuild: true,
      baseUrl: 'http://gateway.test',
      fetchImpl,
    });
    expect(asked).toBe('http://gateway.test/auth/me');
    expect(source).toBeInstanceOf(PersonalFileSource);
    expect(source.label).toBe('Forty-Two');
  });

  it('falls back to BrowserFileSource when /auth/me returns 401', async () => {
    const fetchImpl = (async () =>
      new Response('{"code":"not_authenticated","message":"no session"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const source = await chooseFileSource({
      gatewayBuild: true,
      baseUrl: 'http://gateway.test',
      fetchImpl,
    });
    expect(source).toBeInstanceOf(BrowserFileSource);
  });

  it('falls back to BrowserFileSource when the gateway is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const source = await chooseFileSource({
      gatewayBuild: true,
      baseUrl: 'http://gateway.test',
      fetchImpl,
    });
    expect(source).toBeInstanceOf(BrowserFileSource);
  });
});
