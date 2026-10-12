const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { isLoggedIn, saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/user.js");

router.route("/signup")
    .get(userController.signUpForm)
    .post(wrapAsync(userController.signUp));

router.route("/login")
    .get(userController.loginForm)
    .post(saveRedirectUrl,
        (req, res, next) => {
            if (req.body && typeof req.body.username === "string") {
                req.session.loginUsername = req.body.username.trim();
            }
            next();
        },
        passport.authenticate('local', {
            failureRedirect: '/login',
            failureFlash: "Incorrect username or password.",
        }), userController.login);

router.get("/logout", userController.logout);

router.get("/profile", isLoggedIn, wrapAsync(userController.profile));
router.get("/profile/edit", isLoggedIn, wrapAsync(userController.editProfileForm));

router.route("/profile")
    .put(isLoggedIn, wrapAsync(userController.updateProfile));

router.route("/profile/password")
    .put(isLoggedIn, wrapAsync(userController.changePassword));

module.exports = router;
