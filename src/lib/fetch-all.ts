/**
 * The database API returns at most 1000 rows per request and silently drops
 * the rest. Use this for any list that can grow past that (readings above all).
 * `build(from, to)` must return a query with a stable `.order(...)` applied.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}
