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

/** Downloads a file the API builds (Excel export, PDF) with the session cookie, and saves it under its own name. */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/v1${path}`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  download,
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};
