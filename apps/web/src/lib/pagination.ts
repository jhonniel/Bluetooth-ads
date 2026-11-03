export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function parsePageRequest(params: { page?: string | string[]; pageSize?: string | string[] }, defaultSize = 20): PageRequest {
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(first(params.pageSize) ?? String(defaultSize), 10) || defaultSize));
  return { page, pageSize };
}

export function paginate<T>(items: T[], total: number, request: PageRequest): Paginated<T> {
  return { items, total, page: request.page, pageSize: request.pageSize, pageCount: Math.max(1, Math.ceil(total / request.pageSize)) };
}

export function skipTake(request: PageRequest) {
  return { skip: (request.page - 1) * request.pageSize, take: request.pageSize };
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
