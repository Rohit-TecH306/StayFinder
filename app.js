if (process.env.NODE_ENV != "production") {
    require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const ejsMate = require("ejs-mate");
app.engine("ejs", ejsMate);
const ExpressError = require("./utils/ExpressError.js");
const wrapAsync = require("./utils/wrapAsync.js");
const cors = require("cors");
const cookieParser = require("cookie-parser");
app.use(cors());
app.use(express.json());
app.use(cookieParser());
const session = require("express-session");
const MongoStore = require('connect-mongo').default;
const flash = require("connect-flash");
const listingsRouter = require("./routes/listing.js");
const reviewsRouter = require("./routes/review.js");
const bookingsRouter = require("./routes/booking.js");
const userBookingsRouter = require("./routes/userBooking.js");
const hostBookingsRouter = require("./routes/hostBooking.js");
const hostOnboardingRouter = require("./routes/hostOnboarding.js");
const userRouter = require("./routes/user.js");
const listingController = require("./controllers/listing.js");
const { userIsHost } = require("./middleware.js");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
const methodOverride = require("method-override");
app.use(methodOverride("_method"));

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

const atlasurl = process.env.MONGODB_ATLAS_URL;
const sessionSecret = process.env.SESSION_SECRET || process.env.SECRET;
const port = process.env.PORT || 8080;

if (!atlasurl || !sessionSecret) {
    throw new Error("MONGODB_ATLAS_URL and SESSION_SECRET are required");
}

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

async function main() {
    try {
        await mongoose.connect(atlasurl);
        console.log("CONNECTED TO MONGODB");

        app.listen(port, () => {
            console.log(`server is listening on port http://localhost:${port}`);
        });
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        process.exit(1);
    }
}

main();

const store = MongoStore.create({
    mongoUrl: atlasurl,
    crypto: {
        secret: sessionSecret,
    },
    touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.log("ERROR in MONGO SESSION STORE", err);
});

const sessionOption = {
    store,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
};


app.use(session(sessionOption));
app.use(flash());

app.use((req, res, next) => {
    const originalRedirect = res.redirect.bind(res);
    res.redirect = function (...args) {
        if (req.session) {
            return req.session.save((err) => {
                if (err) {
                    console.error("Session save error on redirect:", err);
                }
                originalRedirect(...args);
            });
        }
        originalRedirect(...args);
    };
    next();
});

app.use(passport.initialize());
app.use(passport.session());
// use static authenticate method of model in LocalStrategy
passport.use(new LocalStrategy(User.authenticate()));

// use static serialize and deserialize of model for passport session support
passport.serializeUser(User.serializeUser());   //User Info adding in the session
passport.deserializeUser(User.deserializeUser());  // User Info removing from the session

app.use(wrapAsync(async (req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    res.locals.isHost = await userIsHost(req.user);
    next();
}));

// app.get("/demouser", async (req, res) => {
//     let fakeUser = new User({
//         email: "student@gmai;.com",
//         username: "delta-student"
//     });
//     let registeredUser = await User.register(fakeUser, "helloworld");
//     res.send(registeredUser);
// })

app.use("/listings", listingsRouter);
app.use("/listings/:id/reviews", reviewsRouter);
app.use("/listings/:id/bookings", bookingsRouter);
app.use("/bookings", userBookingsRouter);
app.use("/host/bookings", hostBookingsRouter);
app.use("/", hostOnboardingRouter);
app.use("/", userRouter);
app.get("/", wrapAsync((req, res) => listingController.index(req, res, 9)));

app.get("/api/listings", wrapAsync(async (req, res) => {
    const Listing = require("./models/listing.js");
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const limit = Math.min(18, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const listings = await Listing.find({})
        .select("title price image location country")
        .skip(skip)
        .limit(limit + 1)   // fetch one extra to check if more remain
        .lean();
    const hasMore = listings.length > limit;
    res.json({ listings: listings.slice(0, limit), hasMore });
}));

// The route which we have not creted or nothing for tha :-
app.use((req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
})

// Express Error Handing Middalwere :-

app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Something went Wrong" } = err;
    res.status(statusCode).render("listings/error.ejs", { message });
});
