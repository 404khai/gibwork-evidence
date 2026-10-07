import { GibworkClient, type TaskDetails, type WalletSigner } from '@gibwork/sdk';

export interface TaskReader {
  get(id: string): Promise<TaskDetails>;
}
export interface TaskSnapshot {
  source: 'sdk-live' | 'sdk-stage' | 'sdk-fixture';
  details: TaskDetails;
}

// Integrators provide their own wallet adapter. This module never loads keys.
// The client is restricted to one GET; write methods are not exposed here.
export function liveTaskReader(signer: WalletSigner, environment: 'stage' | 'production' = 'stage'): TaskReader {
  const readOnlySigner: WalletSigner = {
    publicKey: signer.publicKey,
    signMessage: message => signer.signMessage(message),
    signTransaction: async () => { throw new Error('Evidence packager cannot sign transactions'); },
  };
  const client = new GibworkClient({ signer: readOnlySigner, production: environment === 'production', timeoutMs: 15_000 });
  return { get: (id) => client.tasks.get(id) };
}

export function validateTask(value: unknown, id: string): TaskDetails {
  if (!value || typeof value !== 'object') throw new Error('Task response must be an object');
  const task = value as TaskDetails;
  if (task.id !== id || typeof task.title !== 'string' || typeof task.content !== 'string'
      || typeof task.isOpen !== 'boolean' || typeof task.status !== 'string'
      || !(task.deadline === null || (typeof task.deadline === 'string' && Number.isFinite(Date.parse(task.deadline))))
      || !task.asset || typeof task.asset.symbol !== 'string'
      || !Number.isFinite(task.asset.amount) || task.asset.amount < 0) {
    throw new Error('Task response is missing valid identity, scope, status, deadline or reward data');
  }
  return task;
}

export async function readTask(reader: TaskReader, id: string, source: TaskSnapshot['source']): Promise<TaskSnapshot> {
  return { source, details: validateTask(await reader.get(id), id) };
}

// The actual SDK performs its auth, routing and response handling, but its
// transport is replaced by an in-memory fixture. No call can reach a network.
export function fixtureTaskReader(task: unknown): TaskReader {
  const address = '11111111111111111111111111111111';
  const signer = {
    publicKey: { toBase58: () => address },
    signMessage: async () => new Uint8Array(64),
    signTransaction: async () => { throw new Error('Fixture transaction signing is forbidden'); },
  } as unknown as WalletSigner;
  const client = new GibworkClient({
    signer, production: false, baseUrl: 'https://fixture.invalid',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname !== 'fixture.invalid' || init?.method !== 'GET'
          || !/^\/v2\/int\/tasks\/[0-9a-f-]{36}$/.test(url.pathname)) {
        throw new Error('Fixture transport permits only a single task GET');
      }
      return new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { get: (id) => client.tasks.get(id) };
}
