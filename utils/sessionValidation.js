function getSession(sessionStore, sessionId) {
    return new Promise((resolve) => {
        sessionStore.get(sessionId, (error, session) => {
            resolve(error ? null : session);
        });
    });
}

async function isAuthenticatedSessionForUser(sessionStore, sessionId, userId) {
    if (!sessionId) return false;

    const session = await getSession(sessionStore, sessionId);
    if (!session) return false;

    const expires = session.cookie?.expires;
    if (expires) {
        const expiryDate = new Date(expires);
        if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
            return false;
        }
    }

    const passportUserId = session.passport?.user;
    return passportUserId !== undefined && String(passportUserId) === String(userId);
}

module.exports = { isAuthenticatedSessionForUser };
