import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createAuth(store) {
  const sessions = new Map();

  function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
  }

  function parseCookies(request) {
    return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((cookie) => {
      const [key, ...value] = cookie.trim().split('=');
      return [key, decodeURIComponent(value.join('='))];
    }));
  }

  function publicUser(user) {
    if (!user) return null;
    return { id: user.id, username: user.username, name: user.name, role: user.role, projectIds: user.projectIds, permissions: user.permissions };
  }

  function userFromRequest(request) {
    const token = parseCookies(request).session;
    const userId = sessions.get(token);
    return store.data.users.find((user) => user.id === userId) || null;
  }

  function login(username, password) {
    const user = store.data.users.find((item) => item.username === username);
    const supplied = Buffer.from(hashPassword(password || ''));
    const expected = Buffer.from(user?.passwordHash || hashPassword(randomBytes(16).toString('hex')));
    if (!user || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const token = randomBytes(32).toString('hex');
    sessions.set(token, user.id);
    return { token, user: publicUser(user) };
  }

  function logout(request) {
    sessions.delete(parseCookies(request).session);
  }

  function can(user, action, projectId) {
    if (!user || !user.permissions?.[action]) return false;
    return user.role === 'Администратор' || user.projectIds.includes(projectId);
  }

  return { hashPassword, publicUser, userFromRequest, login, logout, can };
}
