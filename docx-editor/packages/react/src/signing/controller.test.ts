import { describe, expect, it } from 'bun:test';

import { createSigningController } from './controller';
import type { SignatureField, SignedFieldPayload } from './types';

const ALICE: SignatureField = {
  fieldId: 'alice',
  label: 'Alice',
  required: true,
  anchor: { kind: 'doc', paraId: 'P1' },
  methods: ['drawn'],
};

const BOB: SignatureField = {
  fieldId: 'bob',
  label: 'Bob',
  required: true,
  anchor: { kind: 'doc', paraId: 'P2' },
  methods: ['typed'],
};

const CAROL_OPTIONAL: SignatureField = {
  fieldId: 'carol',
  label: 'Carol (witness)',
  required: false,
  anchor: { kind: 'doc', paraId: 'P3' },
  methods: ['drawn', 'typed'],
};

function payload(fieldId: string): SignedFieldPayload {
  return {
    fieldId,
    method: 'drawn',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    mime: 'image/png',
    signedAt: '2026-06-08T00:00:00Z',
  };
}

describe('createSigningController', () => {
  it('starts with the first required field active', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    expect(c.snapshot().activeFieldIndex).toBe(0);
    expect(c.snapshot().canComplete).toBe(false);
    expect(c.snapshot().isComplete).toBe(false);
  });

  it('signField advances activeFieldIndex to the next required', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    c.signField(payload('alice'));
    expect(c.snapshot().activeFieldIndex).toBe(1);
    expect(c.snapshot().canComplete).toBe(false);
  });

  it('canComplete flips true once every required field is signed', () => {
    const c = createSigningController([ALICE, BOB, CAROL_OPTIONAL], 'sequential');
    c.signField(payload('alice'));
    c.signField(payload('bob'));
    expect(c.snapshot().canComplete).toBe(true);
    // Optional Carol still unsigned, but canComplete is true.
    expect(c.snapshot().signed['carol']).toBeUndefined();
  });

  it('complete throws when required fields are still unsigned', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    c.signField(payload('alice'));
    expect(() => c.complete()).toThrow();
  });

  it('complete succeeds when all required done; emits a snapshot with isComplete', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    c.signField(payload('alice'));
    c.signField(payload('bob'));
    const snap = c.complete();
    expect(snap.isComplete).toBe(true);
    expect(snap.activeFieldIndex).toBe(-1);
  });

  it('cancel is idempotent and prevents further signField', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    c.cancel();
    c.cancel();
    expect(c.snapshot().isCancelled).toBe(true);
    // signField is a no-op post-cancel.
    c.signField(payload('alice'));
    expect(c.snapshot().signed['alice']).toBeUndefined();
  });

  it('focusField in sequential mode rejects jumps to non-active fields', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    c.focusField('bob'); // Alice is active, Bob is a jump-ahead
    expect(c.snapshot().activeFieldIndex).toBe(0);
  });

  it('focusField in concurrent mode allows any unsigned field', () => {
    const c = createSigningController([ALICE, BOB], 'concurrent');
    c.focusField('bob');
    expect(c.snapshot().activeFieldIndex).toBe(1);
  });

  it('subscribers receive snapshots on every change', () => {
    const c = createSigningController([ALICE, BOB], 'sequential');
    const events: number[] = [];
    const unsub = c.subscribe((s) => events.push(s.activeFieldIndex));
    c.signField(payload('alice'));
    c.signField(payload('bob'));
    c.complete();
    unsub();
    expect(events).toEqual([1, -1, -1]);
  });

  it('signField throws on unknown fieldId', () => {
    const c = createSigningController([ALICE], 'sequential');
    expect(() =>
      c.signField({
        ...payload('not-a-field'),
        fieldId: 'not-a-field',
      })
    ).toThrow();
  });

  it('rejects duplicate fieldId at construction', () => {
    expect(() =>
      createSigningController([ALICE, { ...BOB, fieldId: 'alice' }], 'sequential')
    ).toThrow();
  });

  it('rejects empty field array at construction', () => {
    expect(() => createSigningController([], 'sequential')).toThrow();
  });
});
