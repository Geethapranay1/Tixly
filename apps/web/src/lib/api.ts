const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export function getApiUrl() {
  return API_URL;
}

export class ApiAbortError extends Error {
  constructor(message = "Aborted") {
    super(message);
    this.name = "AbortError";
  }
}

function isAbortError(err: unknown, signal?: AbortSignal | null) {
  if (signal?.aborted) return true;
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.name === "ApiAbortError" ||
    /aborted|AbortError/i.test(err.message)
  );
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; sessionToken?: string | null } = {},
): Promise<T> {
  const { token, sessionToken, headers, signal, ...rest } = options;
  const hasBody = rest.body !== undefined && rest.body !== null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
        ...headers,
      },
    });
  } catch (err) {
    if (isAbortError(err, signal)) throw new ApiAbortError();
    throw new Error(
      "Failed to reach API. Is the server running on port 3001?",
    );
  }
  if (!res.ok) {
    if (res.status === 499) throw new ApiAbortError();
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
