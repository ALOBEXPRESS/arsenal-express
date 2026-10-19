const BASE = "https://api.postzen.dev";

export async function postzen<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env["POSTZEN_API_KEY"];
  if (!key) throw new Error("Chave da PostZen não configurada");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    console.error("[postzen]", path, res.status, text.slice(0, 500));
    const msg = body?.error || body?.message || `PostZen respondeu ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}
