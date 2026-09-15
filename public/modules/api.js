export async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }
  return payload;
}
