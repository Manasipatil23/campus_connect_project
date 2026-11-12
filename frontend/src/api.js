const TOKEN_KEY = "cc_token";

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && path !== "/auth/login") {
      setToken(null);
      window.location.href = "/login";
    }
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => `${String(d.loc?.at(-1) ?? "").replace(/_/g, " ")}: ${d.msg}`).join("; ")
      : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}
