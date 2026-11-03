export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
export const assetUrl = (u) => (u && u.startsWith('/') ? `${API_BASE}${u}` : u);
export const eventsUrl = (id) => `${API_BASE}/api/jobs/${id}/events`;
export const reportUrl = (id, ext) => `${API_BASE}/api/jobs/${id}/report.${ext}`;

export async function createJob(url) {
  const res = await fetch(`${API_BASE}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.id;
}
export async function getJob(id) {
  const res = await fetch(`${API_BASE}/api/jobs/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'Audit not found' : `Request failed (${res.status})`);
  return res.json();
}
export async function getConfig() {
  const res = await fetch(`${API_BASE}/api/config`, { cache: 'no-store' });
  return res.ok ? res.json() : { demoUrl: null };
}
