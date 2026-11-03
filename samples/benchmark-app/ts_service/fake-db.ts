/**
 * Minimal stand-in db client for the benchmark fixture.
 * Not connected to anything real; exists so static analysis rules have a
 * well-formed query sink to reason about.
 */

export const db = {
  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    void sql;
    void params;
    return [];
  },
};
