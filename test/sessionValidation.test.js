const assert = require("node:assert/strict");
const { isAuthenticatedSessionForUser } = require("../utils/sessionValidation.js");

function storeFor(session) {
    return {
        get(_sessionId, callback) {
            callback(null, session);
        },
    };
}

async function run() {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    assert.equal(
        await isAuthenticatedSessionForUser(
            storeFor({ cookie: { expires: future }, passport: { user: "user-1" } }),
            "session-1",
            "user-1"
        ),
        true,
        "an unexpired Passport session for the same user is active"
    );
    assert.equal(
        await isAuthenticatedSessionForUser(
            storeFor({ cookie: { expires: future } }),
            "session-1",
            "user-1"
        ),
        false,
        "a session record without Passport authentication is stale"
    );
    assert.equal(
        await isAuthenticatedSessionForUser(
            storeFor({ cookie: { expires: future }, passport: { user: "other-user" } }),
            "session-1",
            "user-1"
        ),
        false,
        "another user's Passport session cannot block this user"
    );
    assert.equal(
        await isAuthenticatedSessionForUser(
            storeFor({ cookie: { expires: past }, passport: { user: "user-1" } }),
            "session-1",
            "user-1"
        ),
        false,
        "an expired Passport session is stale"
    );

    console.log("session validation tests passed");
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
