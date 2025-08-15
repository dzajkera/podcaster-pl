// src/lib/api.js
const RAW_API_BASE = import.meta.env.VITE_API_URL?.trim()?.replace(/\/+$/, '') 
  || (import.meta.env.DEV ? 'http://localhost:3000' : '');

export const API_BASE = RAW_API_BASE;

export const getToken = () => localStorage.getItem('token') || '';

function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parseMaybeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  // 204/empty
  const text = await res.text().catch(() => '');
  try { return JSON.parse(text); } catch { return text || null; }
}

async function handle(res, method, url) {
  if (!res.ok) {
    const body = await parseMaybeJson(res);
    const msg = typeof body === 'string' ? body : (body?.error || body?.message || `${method} ${url} failed (${res.status})`);
    throw new Error(msg);
  }
  return parseMaybeJson(res);
}

export async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  console.info('[API][GET] ', url);
  const res = await fetch(url, { headers: { ...authHeader() } });
  return handle(res, 'GET', url);
}

export async function apiPost(path, body, isFormData = false) {
  const url = `${API_BASE}${path}`;
  console.info('[API][POST]', url);
  const headers = isFormData ? { ...authHeader() } : { 'Content-Type': 'application/json', ...authHeader() };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
  return handle(res, 'POST', url);
}

export async function apiDelete(path) {
  const url = `${API_BASE}${path}`;
  console.info('[API][DELETE]', url);
  const res = await fetch(url, { method: 'DELETE', headers: { ...authHeader() } });
  return handle(res, 'DELETE', url);
}