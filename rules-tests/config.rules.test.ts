import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/** The off switch for licensed translations (config/licensedTranslations): everyone reads it, nobody writes it from the app. */
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-simple-bible-memory', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore() as unknown as Firestore, 'config', 'licensedTranslations'), { all: false, off: ['NASB2020'] }); }); // as set in the console
});
afterAll(() => env.cleanup());

const signedIn = () => env.authenticatedContext('alice').firestore() as unknown as Firestore;
const stranger = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const ref = (db: Firestore) => doc(db, 'config', 'licensedTranslations');

describe('config/licensedTranslations', () => {
  it('can be read by anyone, signed in or not', async () => {
    await assertSucceeds(getDoc(ref(stranger())));
    expect((await getDoc(ref(signedIn()))).data()).toEqual({ all: false, off: ['NASB2020'] });
  });

  it('cannot be written, changed or deleted from the app, by anyone', async () => {
    await assertFails(setDoc(ref(signedIn()), { all: true, off: [] }));
    await assertFails(setDoc(ref(stranger()), { all: true, off: [] }));
    await assertFails(setDoc(doc(signedIn(), 'config', 'other'), { x: 1 }));
    await assertFails(deleteDoc(ref(signedIn())));
  });
});
