export type SqlValue = string | number | null | Uint8Array;

/**
 * The only thing the rest of the app knows about SQLite. Think of it like the
 * `db` object you'd pass to Express handlers: query, run, and a transaction helper.
 * Each platform (browser, Capacitor native) provides its own implementation.
 */
export interface Database {
  /** Run a SELECT and return rows as plain objects keyed by column name. */
  query<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run INSERT/UPDATE/DELETE/DDL. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /**
   * Run `fn` atomically: commits if it resolves, rolls back if it throws.
   * Use the `tx` argument inside `fn`, not the outer database.
   */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
