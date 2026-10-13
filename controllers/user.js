const User = require("../models/user.js");
const { isAuthenticatedSessionForUser } = require("../utils/sessionValidation.js");
const { userIsHost } = require("../middleware.js");

const isValidProfileInput = (username) => {
    if (!username) {
        return "Username cannot be empty.";
    }
    // The application has historically accepted usernames with spaces, so this
    // deliberately avoids imposing a new character policy on existing users.
    return null;
};

// Passport regenerates the session during req.login(). Keep the account's
// single-session pointer synchronized with the ID Passport actually assigns.
// The conditional update prevents a concurrent login from being overwritten.
const reloginAndSyncActiveSession = (req, user, done) => {
    const previousSessionId = req.sessionID;

    req.login(user, async (loginError) => {
        if (loginError) return done(loginError);

        const finalSessionId = req.sessionID;
        try {
            const result = await User.updateOne(
                { _id: user._id, activeSessionId: previousSessionId },
                { $set: { activeSessionId: finalSessionId } }
            );
            const matchedCount = result && (result.matchedCount ?? result.n);
            if (matchedCount === 0 && previousSessionId !== finalSessionId) {
                const conflictError = new Error("The account session changed while the profile was being updated.");
                conflictError.code = "ACTIVE_SESSION_CONFLICT";
                return req.logout(() => done(conflictError));
            }
            done(null);
        } catch (syncError) {
            // The new session must not remain usable when its active-session
            // record could not be synchronized. Logout is best-effort here;
            // the database is never overwritten unconditionally.
            req.logout(() => done(syncError));
        }
    });
};

const preserveProfileInput = (req, username, displayName) => {
    if (req.session) {
        req.session.profileData = { username, displayName: displayName || "" };
    }
};

module.exports.signUpForm = (req, res) => {
    const signupData = req.session.signupData || {};
    delete req.session.signupData;
    res.render("user/signup.ejs", {
        username: signupData.username || "",
        email: signupData.email || ""
    });
}

module.exports.signUp = async (req, res, next) => {
    let { username, email, password } = req.body;
    username = username ? username.trim() : "";
    email = email ? email.trim().toLowerCase() : "";

    try {
        const existingUsers = await User.find({
            $or: [{ username }, { email }]
        });

        const usernameTaken = existingUsers.some(u => u.username === username);
        const emailTaken = existingUsers.some(u => u.email && u.email.toLowerCase() === email);

        if (usernameTaken) {
            req.session.signupData = { email };
            req.flash("error", "An account with this username already exists. Please choose a different username.");
            return res.redirect("/signup");
        }

        if (emailTaken) {
            req.session.signupData = { username };
            req.flash("error", "An account with this email already exists. Please log in.");
            return res.redirect("/signup");
        }

        const newUser = new User({ email, username });
        const registeredUser = await User.register(newUser, password);
        req.login(registeredUser, async (err) => {
            if (err) {
                return next(err);
            }
            await User.updateOne(
                { _id: registeredUser._id },
                { $set: { activeSessionId: req.sessionID } }
            );
            delete req.session.signupData;
            req.flash("success", "Welcome to StayFinder");
            res.redirect("/listings");
        });
    }
    catch (err) {
        if (err.name === "UserExistsError") {
            req.session.signupData = { email };
            req.flash("error", "An account with this username already exists. Please choose a different username.");
        } else if (err.code === 11000) {
            const isEmailDuplicate = Boolean(
                (err.keyPattern && err.keyPattern.email) ||
                (err.keyValue && err.keyValue.email) ||
                (err.message && err.message.includes("email"))
            );
            if (isEmailDuplicate) {
                req.session.signupData = { username };
                req.flash("error", "An account with this email already exists. Please log in.");
            } else {
                req.session.signupData = { email };
                req.flash("error", "An account with this username already exists. Please choose a different username.");
            }
        } else {
            req.flash("error", err.message);
        }
        res.redirect("/signup");
    }
}

module.exports.loginForm = (req, res) => {
    const username = req.session.loginUsername || "";
    delete req.session.loginUsername;
    res.render("user/login.ejs", { username });
}

module.exports.login = async (req, res) => {
    const existingSessionId = req.user.activeSessionId;

    if (existingSessionId && existingSessionId !== req.sessionID) {
        const isSessionAlive = await isAuthenticatedSessionForUser(
            req.sessionStore,
            existingSessionId,
            req.user._id
        );

        if (isSessionAlive) {
            return req.logout((err) => {
                if (err) {
                    return res.status(500).render("listings/error.ejs", { message: err.message });
                }
                req.flash("error", "This account is already logged in on another device. Please log out from that device to continue.");
                res.redirect("/login");
            });
        }
    }

    // The filter must match the value we just inspected. This atomically replaces a
    // stale reference, but never takes over a session claimed by another request.
    const activeSessionMatch = existingSessionId
        ? { activeSessionId: existingSessionId }
        : {
            $or: [
                { activeSessionId: null },
                { activeSessionId: "" },
                { activeSessionId: { $exists: false } }
            ]
        };

    const claimed = await User.findOneAndUpdate(
        { _id: req.user._id, ...activeSessionMatch },
        { $set: { activeSessionId: req.sessionID } },
        { new: true }
    );

    if (!claimed) {
        return req.logout((err) => {
            if (err) {
                return res.status(500).render("listings/error.ejs", { message: err.message });
            }
            req.flash("error", "This account is already logged in on another device. Please log out from that device to continue.");
            res.redirect("/login");
        });
    }

    delete req.session.loginUsername;
    delete req.session.redirectUrl;
    req.flash("success", "Welcome back to StayFinder!");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
}

module.exports.profile = async (req, res) => {
    const user = await User.findById(req.user._id).select("-hash -salt -activeSessionId");
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/login");
    }
    if (!user.displayName && user.username && typeof user.save === "function") {
        user.displayName = user.username;
        await user.save();
    }
    const isHost = await userIsHost(user);
    res.render("user/profile.ejs", { user, isHost });
}

module.exports.editProfileForm = async (req, res) => {
    const user = await User.findById(req.user._id).select("-hash -salt -activeSessionId");
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/login");
    }
    if (!user.displayName && user.username && typeof user.save === "function") {
        user.displayName = user.username;
        await user.save();
    }
    const isHost = await userIsHost(user);
    const profileData = req.session && req.session.profileData;
    if (req.session) delete req.session.profileData;
    res.render("user/editProfile.ejs", {
        user: {
            ...user.toObject ? user.toObject() : user,
            username: profileData && Object.prototype.hasOwnProperty.call(profileData, "username")
                ? profileData.username : user.username,
            displayName: profileData && Object.prototype.hasOwnProperty.call(profileData, "displayName")
                ? profileData.displayName : (user.displayName || ""),
            email: user.email
        },
        isHost
    });
}

module.exports.updateProfile = async (req, res, next) => {
    let { username, displayName } = req.body;
    username = username ? username.trim() : "";
    const trimmedDisplayName = typeof displayName === "string" ? displayName.trim() : undefined;

    const inputError = isValidProfileInput(username);
    if (inputError) {
        preserveProfileInput(req, username, trimmedDisplayName);
        req.flash("error", inputError);
        return res.redirect("/profile/edit");
    }

    const usernameChanged = username !== req.user.username;
    const currentDisplayName = req.user.displayName || "";
    const displayNameChanged = trimmedDisplayName !== undefined && trimmedDisplayName !== currentDisplayName;

    if (!usernameChanged && !displayNameChanged) {
        req.flash("success", "Profile is already up to date.");
        return res.redirect("/profile");
    }

    try {
        if (usernameChanged) {
            const existingUserByUsername = await User.findOne({
                username,
                _id: { $ne: req.user._id }
            });
            if (existingUserByUsername) {
                preserveProfileInput(req, username, trimmedDisplayName);
                req.flash("error", "An account with this username already exists. Please choose a different username.");
                return res.redirect("/profile/edit");
            }
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/login");
        }

        if (usernameChanged) {
            user.username = username;
        }

        if (displayNameChanged) {
            user.displayName = trimmedDisplayName;
        }

        await user.save();

        if (usernameChanged) {
            return reloginAndSyncActiveSession(req, user, (err) => {
                if (err) {
                    console.error("Profile session synchronization failed.");
                    req.flash("error", "Your profile could not be updated safely. Please try again.");
                    return res.redirect("/profile/edit");
                }
                req.flash("success", "Profile updated successfully!");
                res.redirect("/profile");
            });
        }

        req.flash("success", "Profile updated successfully!");
        res.redirect("/profile");
    } catch (err) {
        if (err.name === "UserExistsError") {
            preserveProfileInput(req, username, trimmedDisplayName);
            req.flash("error", "An account with this username already exists. Please choose a different username.");
        } else if (err.code === 11000) {
            preserveProfileInput(req, username, trimmedDisplayName);
            req.flash("error", "An account with this username already exists. Please choose a different username.");
        } else {
            preserveProfileInput(req, username, trimmedDisplayName);
            console.error("Profile update failed.");
            req.flash("error", "We could not update your profile. Please try again.");
        }
        res.redirect("/profile/edit");
    }
}

module.exports.changePassword = async (req, res, next) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
        req.flash("error", "All password fields are required.");
        return res.redirect("/profile/edit");
    }

    if (newPassword !== confirmPassword) {
        req.flash("error", "New password and confirmation do not match.");
        return res.redirect("/profile/edit");
    }

    if (newPassword.length < 6) {
        req.flash("error", "New password must be at least 6 characters long.");
        return res.redirect("/profile/edit");
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/login");
        }

        await user.changePassword(currentPassword, newPassword);

        return reloginAndSyncActiveSession(req, user, (err) => {
            if (err) {
                console.error("Password session synchronization failed.");
                req.flash("error", "Your password could not be updated safely. Please try again.");
                return res.redirect("/profile/edit");
            }
            req.flash("success", "Password changed successfully!");
            res.redirect("/profile");
        });
    } catch (err) {
        if (err.name === "IncorrectPasswordError") {
            req.flash("error", "Current password is incorrect.");
        } else {
            console.error("Password change failed.");
            req.flash("error", "We could not change your password. Please try again.");
        }
        res.redirect("/profile/edit");
    }
}

module.exports.logout = async (req, res, next) => {
    try {
        if (req.user && req.sessionID) {
            await User.updateOne(
                { _id: req.user._id, activeSessionId: req.sessionID },
                { $set: { activeSessionId: null } }
            );
        }
    } catch (e) {
        console.error("Error clearing active session on logout:", e);
    }
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("error", "You are logged out!");
        req.session.save((err) => {
            if (err) {
                return next(err);
            }
            res.redirect("/listings");
        });
    });
}
