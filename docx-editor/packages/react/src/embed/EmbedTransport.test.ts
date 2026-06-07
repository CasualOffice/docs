import { describe, expect, it } from 'bun:test';

import { EmbedTransport, isCasualEnvelope } from './';
import type { CasualEnvelope } from './';

/**
 * Fake host window — captures the (type, addEventListener)
 * callbacks. Tests fire synthetic message events through it.
 */
function fakeHostWindow() {
  let handler: ((ev: unknown) => void) | null = null;
  return {
    addEventListener(_type: string, h: EventListenerOrEventListenerObject) {
      handler = h as (ev: unknown) => void;
    },
    removeEventListener() {
      handler = null;
    },
    fire(ev: unknown) {
      if (handler) handler(ev);
    },
  };
}

function fakeParent() {
  const sent: Array<{ msg: unknown; origin: string; transfer?: Transferable[] }> = [];
  return {
    sent,
    postMessage(msg: unknown, origin: string, transfer?: Transferable[]) {
      sent.push({ msg, origin, transfer });
    },
  };
}

describe('isCasualEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    expect(
      isCasualEnvelope({
        type: 'casual.hello',
        app: 'docs',
        v: 1,
        data: {},
      } satisfies CasualEnvelope)
    ).toBe(true);
  });
  it('rejects foreign types', () => {
    expect(isCasualEnvelope({ type: 'other.hello', app: 'docs', v: 1, data: {} })).toBe(false);
  });
  it('rejects bad app values', () => {
    expect(isCasualEnvelope({ type: 'casual.hello', app: 'pdf', v: 1, data: {} })).toBe(false);
  });
  it('rejects non-v1', () => {
    expect(isCasualEnvelope({ type: 'casual.hello', app: 'docs', v: 2, data: {} })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isCasualEnvelope('hello')).toBe(false);
  });
});

describe('EmbedTransport', () => {
  it('drops messages from disallowed origins', async () => {
    const host = fakeHostWindow();
    const parent = fakeParent();
    let called = false;
    const transport = new EmbedTransport({
      app: 'docs',
      hostOrigin: 'https://drive.example',
      version: '1.0.0',
      commit: 'abc',
      capabilities: [],
      parentWindow: parent,
      hostWindow: host,
    });
    transport.on({
      onHostHello: () => {
        called = true;
      },
    });
    // Fire a message from the WRONG origin.
    host.fire({
      origin: 'https://evil.example',
      data: { type: 'casual.hello', app: 'docs', v: 1, data: { capabilities: [] } },
    });
    // Give the async dispatch a turn.
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(false);
  });

  it('routes a valid host.hello to onHostHello + replies with editor.ready', async () => {
    const host = fakeHostWindow();
    const parent = fakeParent();
    let received: unknown = null;
    const transport = new EmbedTransport({
      app: 'docs',
      hostOrigin: 'https://drive.example',
      version: '1.0.0',
      commit: 'abc',
      capabilities: [],
      parentWindow: parent,
      hostWindow: host,
    });
    transport.on({
      onHostHello: (data) => {
        received = data;
      },
    });
    host.fire({
      origin: 'https://drive.example',
      data: { type: 'casual.hello', app: 'docs', v: 1, data: { capabilities: ['saveDocument'] } },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(received).toEqual({ capabilities: ['saveDocument'] });
    // editor.ready was posted in response.
    const lastSent = parent.sent[parent.sent.length - 1].msg as CasualEnvelope;
    expect(lastSent.type).toBe('casual.ready');
    expect(lastSent.app).toBe('docs');
  });

  it('sendHello emits an editor.hello envelope', () => {
    const host = fakeHostWindow();
    const parent = fakeParent();
    const transport = new EmbedTransport({
      app: 'docs',
      hostOrigin: 'https://drive.example',
      version: '1.2.3',
      commit: 'deadbee',
      capabilities: ['save', 'load'],
      parentWindow: parent,
      hostWindow: host,
    });
    transport.sendHello();
    expect(parent.sent).toHaveLength(1);
    const env = parent.sent[0].msg as CasualEnvelope;
    expect(env.type).toBe('casual.hello');
    expect((env.data as { version: string }).version).toBe('1.2.3');
    expect((env.data as { capabilities: string[] }).capabilities).toEqual(['save', 'load']);
  });

  it('requestLoad resolves when the host posts back with the matching id', async () => {
    const host = fakeHostWindow();
    const parent = fakeParent();
    const transport = new EmbedTransport({
      app: 'docs',
      hostOrigin: 'https://drive.example',
      version: '1.0.0',
      commit: 'abc',
      capabilities: [],
      parentWindow: parent,
      hostWindow: host,
    });
    const pending = transport.requestLoad('doc-1');
    // Extract the id off the outbound envelope.
    const outbound = parent.sent[0].msg as CasualEnvelope;
    expect(outbound.type).toBe('casual.load.request');
    expect(outbound.id).toBeDefined();
    // Reply.
    host.fire({
      origin: 'https://drive.example',
      data: {
        type: 'casual.load.response',
        app: 'docs',
        id: outbound.id,
        v: 1,
        data: { ok: true, bytes: new ArrayBuffer(4), fileName: 'demo.docx', etag: 'v1' },
      },
    });
    const result = await pending;
    expect(result).toEqual({
      ok: true,
      bytes: expect.any(ArrayBuffer),
      fileName: 'demo.docx',
      etag: 'v1',
    } as never);
  });

  it('destroy detaches the listener', () => {
    const host = fakeHostWindow();
    const transport = new EmbedTransport({
      app: 'docs',
      hostOrigin: 'https://drive.example',
      version: '1.0.0',
      commit: 'abc',
      capabilities: [],
      parentWindow: fakeParent(),
      hostWindow: host,
    });
    let called = false;
    transport.on({
      onHostHello: () => {
        called = true;
      },
    });
    transport.destroy();
    host.fire({
      origin: 'https://drive.example',
      data: { type: 'casual.hello', app: 'docs', v: 1, data: { capabilities: [] } },
    });
    expect(called).toBe(false);
  });
});
