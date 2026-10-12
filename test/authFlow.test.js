const assert = require("node:assert/strict");
const userController = require("../controllers/user.js");
const User = require("../models/user.js");
const { userIsHost } = require("../middleware.js");
const Listing = require("../models/listing.js");

async function runTests() {
    console.log("Starting authentication & profile flow tests...");

    // Test 1: Failed login UX preserves username and clears session username on form render
    {
        const req = {
            session: { loginUsername: "existingUser123" }
        };
        let renderedView = null;
        let renderedData = null;
        const res = {
            render(view, data) {
                renderedView = view;
                renderedData = data;
            }
        };

        userController.loginForm(req, res);
        assert.equal(renderedView, "user/login.ejs");
        assert.equal(renderedData.username, "existingUser123", "Preserved username passed to login view");
        assert.equal(req.session.loginUsername, undefined, "Preserved username cleared from session after render");
    }

    // Test 2: Login form renders empty username if no failed login username in session
    {
        const req = { session: {} };
        let renderedData = null;
        const res = {
            render(view, data) {
                renderedData = data;
            }
        };

        userController.loginForm(req, res);
        assert.equal(renderedData.username, "", "Default username is empty on clean visit");
    }

    // Test 3: Duplicate username detection in signUp
    {
        const originalFind = User.find;
        User.find = async () => [{ username: "duplicateUser", email: "other@example.com" }];

        let flashType = null;
        let flashMsg = null;
        let redirectedTo = null;

        const req = {
            body: { username: "duplicateUser", email: "new@example.com", password: "password123" },
            session: {},
            flash(type, msg) {
                flashType = type;
                flashMsg = msg;
            }
        };
        const res = {
            redirect(url) {
                redirectedTo = url;
            }
        };

        await userController.signUp(req, res, () => {});
        User.find = originalFind;

        assert.equal(redirectedTo, "/signup");
        assert.equal(flashType, "error");
        assert.match(flashMsg, /username already exists/i, "Username duplicate error displayed");
        assert.equal(req.session.signupData.email, "new@example.com", "Preserves valid email");
    }

    // Test 4: Duplicate email detection in signUp
    {
        const originalFind = User.find;
        User.find = async () => [{ username: "differentUser", email: "duplicate@example.com" }];

        let flashType = null;
        let flashMsg = null;
        let redirectedTo = null;

        const req = {
            body: { username: "uniqueUser", email: "duplicate@example.com", password: "password123" },
            session: {},
            flash(type, msg) {
                flashType = type;
                flashMsg = msg;
            }
        };
        const res = {
            redirect(url) {
                redirectedTo = url;
            }
        };

        await userController.signUp(req, res, () => {});
        User.find = originalFind;

        assert.equal(redirectedTo, "/signup");
        assert.equal(flashType, "error");
        assert.match(flashMsg, /email already exists/i, "Email duplicate error displayed");
        assert.equal(req.session.signupData.username, "uniqueUser", "Preserves valid username");
    }

    // Test 5: MongoDB duplicate-key error handling (code 11000) for email
    {
        const originalFind = User.find;
        const originalRegister = User.register;
        User.find = async () => [];
        User.register = async () => {
            const err = new Error("E11000 duplicate key error dup key: { email: \"dup@example.com\" }");
            err.code = 11000;
            err.keyPattern = { email: 1 };
            throw err;
        };

        let flashMsg = null;
        const req = {
            body: { username: "someUser", email: "dup@example.com", password: "password123" },
            session: {},
            flash(type, msg) {
                flashMsg = msg;
            }
        };
        const res = {
            redirect() {}
        };

        await userController.signUp(req, res, () => {});
        User.find = originalFind;
        User.register = originalRegister;

        assert.match(flashMsg, /email already exists/i, "Duplicate key error for email handled safely");
    }

    // Test 6: MongoDB duplicate-key error handling (code 11000) for username
    {
        const originalFind = User.find;
        const originalRegister = User.register;
        User.find = async () => [];
        User.register = async () => {
            const err = new Error("E11000 duplicate key error dup key: { username: \"dupUser\" }");
            err.code = 11000;
            err.keyPattern = { username: 1 };
            throw err;
        };

        let flashMsg = null;
        const req = {
            body: { username: "dupUser", email: "user@example.com", password: "password123" },
            session: {},
            flash(type, msg) {
                flashMsg = msg;
            }
        };
        const res = {
            redirect() {}
        };

        await userController.signUp(req, res, () => {});
        User.find = originalFind;
        User.register = originalRegister;

        assert.match(flashMsg, /username already exists/i, "Duplicate key error for username handled safely");
    }

    // Test 7: Profile controller renders user profile excluding secrets
    {
        const originalFindById = User.findById;
        let selectedFields = null;
        User.findById = (id) => ({
            select(fields) {
                selectedFields = fields;
                return Promise.resolve({
                    _id: id,
                    username: "profileTester",
                    email: "profile@example.com",
                    hostOnboardingCompleted: true
                });
            }
        });

        let renderedView = null;
        let renderedData = null;
        const req = {
            user: { _id: "user123" }
        };
        const res = {
            render(view, data) {
                renderedView = view;
                renderedData = data;
            }
        };

        await userController.profile(req, res);
        User.findById = originalFindById;

        assert.equal(renderedView, "user/profile.ejs");
        assert.equal(renderedData.user.username, "profileTester");
        assert.equal(renderedData.user.email, "profile@example.com");
        assert.equal(renderedData.isHost, true, "Host status is detected correctly");
        assert.match(selectedFields, /-hash/, "hash is excluded");
        assert.match(selectedFields, /-salt/, "salt is excluded");
        assert.match(selectedFields, /-activeSessionId/, "activeSessionId is excluded");
    }

    // Test 8: userIsHost correctly distinguishes host capabilities
    {
        const hostUser = { _id: "h1", hostOnboardingCompleted: true };
        const nonHostUser = { _id: "g1", hostOnboardingCompleted: false };

        const originalExists = Listing.exists;
        Listing.exists = async ({ owner }) => owner === "l1";

        assert.equal(await userIsHost(hostUser), true, "Completed onboarding is a host");
        assert.equal(await userIsHost({ _id: "l1", hostOnboardingCompleted: false }), true, "Owner of listing is a host");
        assert.equal(await userIsHost(nonHostUser), false, "Guest without listings or onboarding is not host");
        assert.equal(await userIsHost(null), false, "Null user is not host");

        Listing.exists = originalExists;
    }

    // Test 9: Profile editing rejects duplicate username from another user
    {
        const originalFindOne = User.findOne;
        User.findOne = async (query) => {
            if (query.username === "takenUsername") {
                return { _id: "otherUser456", username: "takenUsername" };
            }
            return null;
        };

        let flashMsg = null;
        let redirectedTo = null;
        const req = {
            user: { _id: "myUser123", username: "currentName", email: "me@example.com" },
            body: { username: "takenUsername", email: "me@example.com" },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.updateProfile(req, res, () => {});
        User.findOne = originalFindOne;

        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /username already exists/i, "Duplicate username rejected");
    }

    // Test 9b: Profile editing validates trimmed required fields and email format
    {
        let flashMsg = null;
        let redirectedTo = null;
        const req = {
            user: { _id: "myUser123", username: "currentName", email: "current@example.com" },
            body: { username: "   ", email: "not-an-email" },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = { redirect(url) { redirectedTo = url; } };

        await userController.updateProfile(req, res, () => {});
        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /username/i, "Whitespace-only username rejected");

        req.body = { username: "validName", email: "not-an-email" };
        await userController.updateProfile(req, res, () => {});
        assert.match(flashMsg, /valid email/i, "Invalid email rejected server-side");
    }

    // Test 10: Profile editing rejects duplicate email from another user
    {
        const originalFindOne = User.findOne;
        User.findOne = async (query) => {
            if (query.email === "taken@example.com") {
                return { _id: "otherUser456", email: "taken@example.com" };
            }
            return null;
        };

        let flashMsg = null;
        let redirectedTo = null;
        const req = {
            user: { _id: "myUser123", username: "currentName", email: "current@example.com" },
            body: { username: "currentName", email: "taken@example.com" },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.updateProfile(req, res, () => {});
        User.findOne = originalFindOne;

        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /email already exists/i, "Duplicate email rejected");
    }

    // Test 11: Profile editing successfully updates username and re-authenticates session
    {
        const originalFindOne = User.findOne;
        const originalFindById = User.findById;
        const originalUpdateOne = User.updateOne;

        User.findOne = async () => null;

        const fakeDoc = {
            _id: "myUser123",
            username: "oldName",
            email: "old@example.com",
            save: async function () {}
        };
        User.findById = async () => fakeDoc;
        let syncedSession = null;
        User.updateOne = async (filter, update) => {
            syncedSession = { filter, update };
            return { matchedCount: 1 };
        };

        let reLoggedInUser = null;
        let redirectedTo = null;
        let flashMsg = null;

        const req = {
            user: { _id: "myUser123", username: "oldName", email: "old@example.com" },
            body: { username: "newName", email: "new@example.com" },
            login(user, cb) {
                reLoggedInUser = user;
                this.sessionID = "regenerated-session-123";
                cb();
            },
            sessionID: "original-session-123",
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.updateProfile(req, res, () => {});
        User.findOne = originalFindOne;
        User.findById = originalFindById;
        User.updateOne = originalUpdateOne;

        assert.equal(fakeDoc.username, "newName");
        assert.equal(fakeDoc.email, "new@example.com");
        assert.equal(reLoggedInUser, fakeDoc, "Session re-serialized with updated username");
        assert.equal(syncedSession.filter.activeSessionId, "original-session-123", "Sync is conditional on the prior active session");
        assert.equal(syncedSession.update.$set.activeSessionId, "regenerated-session-123", "Database stores Passport's final session ID");
        assert.equal(redirectedTo, "/profile");
        assert.match(flashMsg, /updated successfully/i);
    }

    // Test 12: Password change validates password matching and minimum length
    {
        let flashMsg = null;
        let redirectedTo = null;
        const req = {
            user: { _id: "u1" },
            body: { currentPassword: "cur", newPassword: "pass", confirmPassword: "mismatch" },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.changePassword(req, res, () => {});
        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /do not match/i, "Mismatched passwords rejected");

        // Short password
        req.body.confirmPassword = "pass";
        await userController.changePassword(req, res, () => {});
        assert.match(flashMsg, /at least 6 characters/i, "Short passwords rejected");
    }

    // Test 13: Password change rejects wrong current password
    {
        const originalFindById = User.findById;
        User.findById = async () => ({
            _id: "u1",
            changePassword: async () => {
                const err = new Error("Password or username is incorrect");
                err.name = "IncorrectPasswordError";
                throw err;
            }
        });

        let flashMsg = null;
        let redirectedTo = null;
        const req = {
            user: { _id: "u1" },
            body: { currentPassword: "wrongCurrentPassword", newPassword: "newSecurePassword123", confirmPassword: "newSecurePassword123" },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.changePassword(req, res, () => {});
        User.findById = originalFindById;

        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /Current password is incorrect/i, "Incorrect current password caught safely");
    }

    // Test 14: Password change succeeds and preserves single active session
    {
        const originalFindById = User.findById;
        const originalUpdateOne = User.updateOne;

        let updatedSessionFilter = null;
        let changePasswordCalled = false;
        let sessionReLoggedIn = false;

        const fakeUser = {
            _id: "u1",
            changePassword: async (cur, next) => {
                assert.equal(cur, "correctCurrent");
                assert.equal(next, "newPassword123");
                changePasswordCalled = true;
            }
        };
        User.findById = async () => fakeUser;
        User.updateOne = async (filter, update) => {
            updatedSessionFilter = { filter, update };
            return { matchedCount: 1 };
        };

        let redirectedTo = null;
        let flashMsg = null;
        const req = {
            sessionID: "activeSession999",
            user: { _id: "u1" },
            body: {
                currentPassword: "correctCurrent",
                newPassword: "newPassword123",
                confirmPassword: "newPassword123"
            },
            login(user, cb) {
                sessionReLoggedIn = true;
                req.sessionID = "regenerated-session-999";
                cb();
            },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = {
            redirect(url) { redirectedTo = url; }
        };

        await userController.changePassword(req, res, () => {});
        User.findById = originalFindById;
        User.updateOne = originalUpdateOne;

        assert.equal(changePasswordCalled, true, "changePassword method invoked");
        assert.equal(updatedSessionFilter.filter.activeSessionId, "activeSession999", "Update is conditional on the prior active session");
        assert.equal(updatedSessionFilter.update.$set.activeSessionId, "regenerated-session-999", "Final regenerated session is stored");
        assert.equal(sessionReLoggedIn, true, "Session kept authenticated");
        assert.equal(redirectedTo, "/profile");
        assert.match(flashMsg, /Password changed successfully/i);
    }

    // Test 15: Session synchronization failure does not silently claim a session
    {
        const originalFindById = User.findById;
        const originalUpdateOne = User.updateOne;
        User.findById = async () => ({
            _id: "u1",
            changePassword: async () => {}
        });
        User.updateOne = async () => {
            throw new Error("temporary database failure");
        };

        let redirectedTo = null;
        let flashMsg = null;
        let loggedOut = false;
        const req = {
            sessionID: "old-session",
            user: { _id: "u1" },
            body: {
                currentPassword: "correctCurrent",
                newPassword: "newPassword123",
                confirmPassword: "newPassword123"
            },
            login(user, cb) {
                this.sessionID = "new-session";
                cb();
            },
            logout(cb) {
                loggedOut = true;
                cb();
            },
            flash(type, msg) { flashMsg = msg; }
        };
        const res = { redirect(url) { redirectedTo = url; } };

        await userController.changePassword(req, res, () => {});
        User.findById = originalFindById;
        User.updateOne = originalUpdateOne;

        assert.equal(loggedOut, true, "Failed synchronization logs out the newly regenerated session");
        assert.equal(redirectedTo, "/profile/edit");
        assert.match(flashMsg, /could not be updated safely/i);
    }

    console.log("All authentication & profile flow tests passed successfully!");
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
