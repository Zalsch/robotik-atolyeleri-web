import "server-only";
import { throwDbError } from "./http";

type Page<T> = { data: T[] | null; error: { code?: string; message: string } | null };

// PostgREST limits each response. Walk pages so class and student counts have no app cap.
export async function allRows<T>(fetchPage: (from: number, to: number) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    throwDbError(error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

export function chunks<T>(items: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}
