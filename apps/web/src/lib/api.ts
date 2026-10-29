/** Thin fetch wrapper: same-origin /api (proxied to the API), session cookie included, errors as Error(message). */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method, credentials: "include",
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  // a lost session sends you to sign in, except on the sign-in pages themselves (wrong password is also a 401)
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) window.location.href = "/login";
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.issues?.[0]?.message ?? e.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};
