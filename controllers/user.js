const User = require("../models/user.js");
const { isAuthenticatedSessionForUser } = require("../utils/sessionValidation.js");
const { userIsHost } = require("../middleware.js");

const isValidProfileInput = (username, email) => {
    if (!username || username.length > 100) {
        return "Enter a username of 100 characters or fewer.";
    }

    // The application has historically accepted usernames with spaces, so this
    // deliberately avoids imposing a new character policy on existing users.
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "Enter a valid email address.";
    }

    return null;
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
            req.flash("success", "Welcome to Wanderlust");
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
    req.flash("success", "Welcome back to Wanderlust!");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
}

module.exports.profile = async (req, res) => {
    const user = await User.findById(req.user._id).select("-hash -salt -activeSessionId");
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/login");
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
    const isHost = await userIsHost(user);
    res.render("user/editProfile.ejs", { user, isHost });
}

module.exports.updateProfile = async (req, res, next) => {
    let { username, email } = req.body;
    username = username ? username.trim() : "";
    email = email ? email.trim().toLowerCase() : "";

    const inputError = isValidProfileInput(username, email);
    if (inputError) {
        req.flash("error", inputError);
        return res.redirect("/profile/edit");
    }

    if (username === req.user.username && email === req.user.email) {
        req.flash("success", "Profile is already up to date.");
        return res.redirect("/profile");
    }

    try {
        if (username !== req.user.username) {
            const existingUserByUsername = await User.findOne({
                username,
                _id: { $ne: req.user._id }
            });
            if (existingUserByUsername) {
                req.flash("error", "An account with this username already exists. Please choose a different username.");
                return res.redirect("/profile/edit");
            }
        }

        if (email !== req.user.email) {
            const existingUserByEmail = await User.findOne({
                email,
                _id: { $ne: req.user._id }
            });
            if (existingUserByEmail) {
                req.flash("error", "An account with this email already exists. Please use a different email address.");
                return res.redirect("/profile/edit");
            }
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/login");
        }

        const usernameChanged = user.username !== username;
        user.username = username;
        user.email = email;
        await user.save();

        if (usernameChanged) {
            return req.login(user, (err) => {
                if (err) return next(err);
                req.flash("success", "Profile updated successfully!");
                res.redirect("/profile");
            });
        }

        req.flash("success", "Profile updated successfully!");
        res.redirect("/profile");
    } catch (err) {
        if (err.name === "UserExistsError") {
            req.flash("error", "An account with this username already exists. Please choose a different username.");
        } else if (err.code === 11000) {
            const isEmail = Boolean(
                (err.keyPattern && err.keyPattern.email) ||
                (err.keyValue && err.keyValue.email) ||
                (err.message && err.message.includes("email"))
            );
            if (isEmail) {
                req.flash("error", "An account with this email already exists. Please use a different email address.");
            } else {
                req.flash("error", "An account with this username already exists. Please choose a different username.");
            }
        } else {
            console.error("Profile update failed:", err);
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

        // Maintain single-active-session: ensure current session is active
        await User.updateOne(
            { _id: user._id },
            { $set: { activeSessionId: req.sessionID } }
        );

        // Keep current session authenticated
        req.login(user, (err) => {
            if (err) return next(err);
            req.flash("success", "Password changed successfully!");
            req.session.save((saveErr) => {
                if (saveErr) console.error("Session save error after password change:", saveErr);
                res.redirect("/profile");
            });
        });
    } catch (err) {
        if (err.name === "IncorrectPasswordError") {
            req.flash("error", "Current password is incorrect.");
        } else {
            console.error("Password change failed:", err);
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
