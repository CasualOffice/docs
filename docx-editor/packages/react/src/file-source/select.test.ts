/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';

import { BrowserFileSource } from './browser';
import { PersonalFileSource } from './personal';
import { chooseFileSource, extractWopiContext } from './select';
import { WopiFileSource } from './wopi';

function userJson(body: { id: number; username: string }) {
  // collab wraps /auth/me as { user }.
  return new Response(
    JSON.stringify({ user: { ...body, isAdmin: false, createdAt: 1_700_000_000_000 } }),
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
      return userJson({ id: 42, username: 'forty-two' });
    }) as unknown as typeof fetch;

    const source = await chooseFileSource({
      gatewayBuild: true,
      baseUrl: 'http://gateway.test',
      fetchImpl,
    });
    expect(asked).toBe('http://gateway.test/auth/me');
    expect(source).toBeInstanceOf(PersonalFileSource);
    expect(source.label).toBe('forty-two');
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

  it('returns WopiFileSource when the URL matches /doc/{id}?access_token=', async () => {
    const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    const source = await chooseFileSource({
      gatewayBuild: true,
      baseUrl: 'http://gateway.test',
      fetchImpl,
      wopiContext: { docId: 'aHR0cDovL2hvc3QvZmlsZXMveA', accessToken: 'tok-abc' },
    });
    expect(source).toBeInstanceOf(WopiFileSource);
    expect(source.kind).toBe('wopi');
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

describe('extractWopiContext', () => {
  it('parses a /doc/{id}?access_token=… URL', () => {
    const ctx = extractWopiContext({
      pathname: '/doc/aHR0cDovL2hvc3QvZmlsZXMvYWJj',
      search: '?access_token=jwt-xyz',
    });
    expect(ctx).toEqual({ docId: 'aHR0cDovL2hvc3QvZmlsZXMvYWJj', accessToken: 'jwt-xyz' });
  });

  it('tolerates a trailing slash on /doc/{id}', () => {
    const ctx = extractWopiContext({
      pathname: '/doc/abc123/',
      search: '?access_token=tok',
    });
    expect(ctx).toEqual({ docId: 'abc123', accessToken: 'tok' });
  });

  it('returns null when access_token is missing', () => {
    expect(
      extractWopiContext({
        pathname: '/doc/abc',
        search: '',
      })
    ).toBeNull();
  });

  it('returns null for non-/doc paths', () => {
    expect(
      extractWopiContext({
        pathname: '/home',
        search: '?access_token=tok',
      })
    ).toBeNull();
  });

  it('returns null when docId carries characters outside the base64url set', () => {
    expect(
      extractWopiContext({
        pathname: '/doc/has spaces',
        search: '?access_token=tok',
      })
    ).toBeNull();
  });
});
