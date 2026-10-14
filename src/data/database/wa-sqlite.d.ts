// wa-sqlite ships its VFS examples as untyped JS.
declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(name?: string, options?: { durability?: 'default' | 'strict' | 'relaxed' });
  }
}
declare module 'wa-sqlite/src/examples/MemoryAsyncVFS.js' {
  export class MemoryAsyncVFS {
    constructor();
  }
}
