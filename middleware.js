const Listing = require("./models/listing");
const { listingSchema, ReviewSchema, bookingSchema, bookingStatusSchema, hostOnboardingSchema } = require("./schema.js");
const ExpressError = require("./utils/ExpressError.js");
const Review = require("./models/review.js");
const { cloudinary } = require("./cloudConfig.js");

const validationMessage = (error) => error.details
  .map((detail) => `${detail.path.join(".") || "Form"}: ${detail.message.replace(/^\"|\"$/g, "")}`)
  .join("; ");

const cleanupUploadedFile = async (file) => {
  if (!file || !file.filename) return;
  try {
    await cloudinary.uploader.destroy(file.filename);
  } catch (_) {
    console.error("Uploaded image cleanup failed.");
  }
};

const isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.session.redirectUrl = req.originalUrl;
    req.flash("error", "You must be logged in!");
    return res.redirect("/login");
  }

  next();
};

const saveRedirectUrl  = (req,res,next) =>{
if(req.session.redirectUrl){
  res.locals.redirectUrl = req.session.redirectUrl;
}
next();
}

const isOwner = async (req,res,next)=>{
  let { id } = req.params;
      let listing = await Listing.findById(id);
      if(!listing || !listing.owner || !req.user || !listing.owner.equals(req.user._id)){
      req.flash("error","You are not the owner of the Listing!");
      return res.redirect(`/listings/${id}`);
      }
      next();
}

const validateListing = async (req, res, next) => {
    let { error, value } = listingSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
        if (req.session) req.session.listingFormData = { ...req.body };
        await cleanupUploadedFile(req.file);
        req.flash("error", validationMessage(error));
        return res.redirect(req.params.id ? `/listings/${req.params.id}/edit` : "/listings/new");
    }
    req.validatedListing = value;
    next();
};

const validateReview = (req, res, next) => {
    let { error } = ReviewSchema.validate(req.body, { abortEarly: false });
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    }
    else {
        next();
    }
}

const validateBooking = (req, res, next) => {
  const { error, value } = bookingSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    const errMsg = error.details.map((el) => el.message).join(", ");
    throw new ExpressError(400, errMsg);
  }

  req.validatedBooking = value.booking;
  next();
};

const validateBookingStatus = (req, res, next) => {
  const { error, value } = bookingStatusSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    const errMsg = error.details.map((el) => el.message).join(", ");
    throw new ExpressError(400, errMsg);
  }

  req.validatedBookingStatus = value.booking.status;
  next();
};

const validateHostOnboarding = (req, res, next) => {
  const { error, value } = hostOnboardingSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    if (req.session) req.session.hostFormData = { ...(req.body.host || {}) };
    req.flash("error", validationMessage(error));
    return res.redirect("/become-a-host");
  }

  req.validatedHostOnboarding = value.host;
  next();
};

const userIsHost = async (user) => {
  if (!user) {
    return false;
  }

  if (user.hostOnboardingCompleted) {
    return true;
  }

  return Boolean(await Listing.exists({ owner: user._id }));
};

const isReviewAuthor = async (req,res,next)=>{
  let { id ,reviewId} = req.params;
      let review = await Review.findById(reviewId);
      if(!review || !review.author || !req.user || !review.author.equals(req.user._id)){
      req.flash("error","You are not the author of this review!");
      return res.redirect(`/listings/${id}`);
      }
      next();
}

module.exports = { isLoggedIn, saveRedirectUrl, isOwner, validateListing, validateReview, validateBooking, validateBookingStatus, validateHostOnboarding, userIsHost, isReviewAuthor };
