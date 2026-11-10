import { serverText } from "./server-text";

/** What the person reads when the API itself failed (its body only says «internal») or can't be reached. */
const SERVER_ERROR = "حصل خطأ في السيستم · جرّب تاني كمان شوية";
const OFFLINE = "مفيش اتصال بالسيستم · اتأكد من النت وجرّب تاني";

/** Thin fetch wrapper: same-origin /api (proxied to the API), session cookie included, errors as Error(message). */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method, credentials: "include",
    // FormData (file uploads) sets its own multipart Content-Type with the boundary
    ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => { throw new Error(serverText(OFFLINE)); });
  // a lost session sends you to sign in, except on the sign-in pages themselves (wrong password is also a 401)
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) window.location.href = "/login";
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    // a 500 says «internal» in English: the person gets a sentence instead
    throw new Error(serverText(res.status >= 500 ? SERVER_ERROR : e.issues?.[0]?.message ?? e.error ?? res.statusText));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/**
 * Downloads a file the API builds (Excel export, PDF) with the session cookie, and saves it under its own name.
 * With a `body` it's a POST (a PDF that also records something, like a client's unit list).
 */
async function download(path: string, fallbackName: string, body?: unknown): Promise<void> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => { throw new Error(serverText(OFFLINE)); });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(serverText(res.status >= 500 ? SERVER_ERROR : e.issues?.[0]?.message ?? e.error ?? res.statusText));
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? fallbackName);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // Firefox / Safari cancel a download whose URL is revoked at once
}

export const api = {
  download,
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  /** One file as multipart field `file` (Excel import, attachments). */
  upload: <T>(p: string, file: File) => { const f = new FormData(); f.append("file", file); return request<T>("POST", p, f); },
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string, b?: unknown) => request<T>("DELETE", p, b),
};
