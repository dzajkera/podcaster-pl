// src/lib/api.js
export const API_BASE = import.meta.env.VITE_API_URL?.trim()?.replace(/\/+$/, '') 
  || (import.meta.env.DEV ? 'http://localhost:3000' : '');

export const getToken = () => localStorage.getItem('token') || '';

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

export async function apiPost(path, body, isFormData = false) {
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
  
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed`);
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
  return res.json();
}