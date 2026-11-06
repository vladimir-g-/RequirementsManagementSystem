import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function createAuth(store) {
  const sessions = new Map();

  function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  function verifyPassword(password, storedHash) {
    const scryptMatch = /^scrypt\$([a-f\d]{32})\$([a-f\d]{128})$/i.exec(storedHash || '');
    if (scryptMatch) {
      const expected = Buffer.from(scryptMatch[2], 'hex');
      const supplied = scryptSync(password, Buffer.from(scryptMatch[1], 'hex'), expected.length);
      return timingSafeEqual(supplied, expected);
    }

    if (/^[a-f\d]{64}$/i.test(storedHash || '')) {
      const supplied = Buffer.from(createHash('sha256').update(password).digest('hex'), 'hex');
      const expected = Buffer.from(storedHash, 'hex');
      return timingSafeEqual(supplied, expected);
    }

    scryptSync(password, randomBytes(16), 64);
    return false;
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
    const suppliedPassword = typeof password === 'string' ? password : '';
    const passwordMatches = verifyPassword(suppliedPassword, user?.passwordHash);
    if (!user || !passwordMatches) return null;
    const token = randomBytes(32).toString('hex');
    sessions.set(token, user.id);
    return { token, user: publicUser(user) };
  }

  function logout(request) {
    sessions.delete(parseCookies(request).session);
  }

  function changePassword(request, userId, password) {
    const user = store.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('Пользователь не найден');

    const previousPasswordHash = user.passwordHash;
    user.passwordHash = hashPassword(password);
    try {
      store.save();
    } catch (error) {
      user.passwordHash = previousPasswordHash;
      throw error;
    }

    const currentToken = parseCookies(request).session;
    let failedSessionCount = 0;
    for (const [token, sessionUserId] of sessions) {
      if (sessionUserId !== userId) continue;
      try {
        sessions.delete(token);
      } catch (error) {
        failedSessionCount += 1;
        console.error('Не удалось завершить сеанс пользователя:', error);
      }
    }

    return {
      currentSessionTerminated: !sessions.has(currentToken),
      failedSessionCount
    };
  }

  function can(user, action, projectId) {
    if (!user || !user.permissions?.[action]) return false;
    return user.role === 'Администратор' || user.projectIds.includes(projectId);
  }

  return { hashPassword, publicUser, userFromRequest, login, logout, changePassword, can };
}
