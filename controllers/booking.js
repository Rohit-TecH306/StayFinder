const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const mongoose = require("mongoose");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const parsePreviewDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

module.exports.previewBooking = async (req, res) => {
  const { checkIn: checkInValue, checkOut: checkOutValue } = req.query;
  const checkIn = parsePreviewDate(checkInValue);
  const checkOut = parsePreviewDate(checkOutValue);

  if (!checkIn || !checkOut) {
    return res.status(400).json({ message: "Choose valid check-in and check-out dates." });
  }

  const listing = await Listing.findById(req.params.id).select("owner price").lean();
  if (!listing) {
    return res.status(404).json({ message: "Listing not found." });
  }

  if (!listing.owner || listing.owner.equals(req.user._id)) {
    return res.status(403).json({ message: "You cannot book your own listing." });
  }

  if (checkIn < startOfTodayUtc()) {
    return res.status(400).json({ message: "Check-in date cannot be in the past." });
  }

  const nights = (checkOut.getTime() - checkIn.getTime()) / DAY_IN_MILLISECONDS;
  if (!Number.isInteger(nights) || nights < 1) {
    return res.status(400).json({ message: "Check-out must be after check-in." });
  }

  const pricePerNightPaise = Math.round(Number(listing.price) * 100);
  const totalAmountPaise = pricePerNightPaise * nights;
  if (!Number.isSafeInteger(pricePerNightPaise) || pricePerNightPaise < 0 || !Number.isSafeInteger(totalAmountPaise)) {
    return res.status(500).json({ message: "Booking total could not be calculated safely." });
  }

  const hasConfirmedConflict = await Booking.exists({
    listing: listing._id,
    status: "confirmed",
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  });

  if (hasConfirmedConflict) {
    return res.json({ available: false, message: "These dates are not available." });
  }

  res.json({
    available: true,
    nights,
    pricePerNightPaise,
    totalAmountPaise,
    currency: "INR",
  });
};

module.exports.createBooking = async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    throw new ExpressError(404, "Listing not found.");
  }

  if (!listing.owner || listing.owner.equals(req.user._id)) {
    throw new ExpressError(403, "You cannot book your own listing.");
  }

  const { checkIn, checkOut, guestMessage } = req.validatedBooking;
  if (checkIn < startOfTodayUtc()) {
    throw new ExpressError(400, "Check-in date cannot be in the past.");
  }

  const nights = (checkOut.getTime() - checkIn.getTime()) / DAY_IN_MILLISECONDS;
  if (!Number.isInteger(nights) || nights < 1) {
    throw new ExpressError(400, "Choose a valid check-in and check-out date.");
  }

  const pricePerNightPaise = Math.round(Number(listing.price) * 100);
  if (!Number.isSafeInteger(pricePerNightPaise) || pricePerNightPaise < 0) {
    throw new ExpressError(500, "This listing has an invalid price.");
  }

  const totalAmountPaise = pricePerNightPaise * nights;
  if (!Number.isSafeInteger(totalAmountPaise)) {
    throw new ExpressError(500, "Booking total could not be calculated safely.");
  }

  const hasConfirmedConflict = await Booking.exists({
    listing: listing._id,
    status: "confirmed",
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  });

  if (hasConfirmedConflict) {
    throw new ExpressError(409, "These dates are no longer available.");
  }

  await Booking.create({
    listing: listing._id,
    guest: req.user._id,
    checkIn,
    checkOut,
    nights,
    pricePerNightPaise,
    totalAmountPaise,
    guestMessage,
  });

  req.flash("success", "Booking request sent to the host.");
  res.redirect(`/listings/${listing._id}`);
};

module.exports.renderMyBookings = async (req, res) => {
  const bookings = await Booking.find({ guest: req.user._id })
    .populate("listing", "title image location country")
    .sort({ createdAt: -1 });

  res.render("bookings/index.ejs", { bookings });
};

module.exports.renderBookingDetails = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ExpressError(404, "Booking not found.");
  }

  const booking = await Booking.findOne({
    _id: req.params.id,
    guest: req.user._id,
  }).populate("listing", "title image location country");

  if (!booking) {
    throw new ExpressError(404, "Booking not found.");
  }

  res.render("bookings/show.ejs", { booking });
};

module.exports.cancelBooking = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new ExpressError(404, "Booking not found.");
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    throw new ExpressError(404, "Booking not found.");
  }

  if (!booking.guest || !booking.guest.equals(req.user._id)) {
    throw new ExpressError(403, "You can only cancel your own bookings.");
  }

  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new ExpressError(400, "Only pending or confirmed bookings can be cancelled.");
  }

  if (booking.checkIn <= startOfTodayUtc()) {
    throw new ExpressError(400, "A booking cannot be cancelled on or after its check-in date.");
  }

  booking.status = "cancelled";
  booking.statusUpdatedAt = new Date();
  await booking.save();

  req.flash("success", "Booking cancelled successfully.");
  res.redirect("/bookings");
};

module.exports.renderHostBookings = async (req, res) => {
  const listings = await Listing.find({ owner: req.user._id }).select("_id");
  const listingIds = listings.map((listing) => listing._id);

  const bookings = await Booking.find({ listing: { $in: listingIds } })
    .populate("listing", "title location country")
    .populate("guest", "username")
    .sort({ createdAt: -1 });

  res.render("bookings/host.ejs", { bookings });
};

module.exports.updateBookingStatus = async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate("listing", "owner title");
  if (!booking) {
    throw new ExpressError(404, "Booking not found.");
  }

  if (!booking.listing || !booking.listing.owner.equals(req.user._id)) {
    throw new ExpressError(403, "You can only manage bookings for your own listings.");
  }

  if (booking.status !== "pending") {
    throw new ExpressError(400, "Only pending booking requests can be updated.");
  }

  const newStatus = req.validatedBookingStatus;
  if (newStatus === "confirmed") {
    const hasConfirmedConflict = await Booking.exists({
      listing: booking.listing._id,
      status: "confirmed",
      _id: { $ne: booking._id },
      checkIn: { $lt: booking.checkOut },
      checkOut: { $gt: booking.checkIn },
    });

    if (hasConfirmedConflict) {
      throw new ExpressError(409, "These dates conflict with an existing confirmed booking.");
    }
  }

  const updatedBooking = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending" },
    { $set: { status: newStatus, statusUpdatedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!updatedBooking) {
    throw new ExpressError(409, "This booking request was already updated. Refresh the page to see its current status.");
  }

  req.flash("success", `Booking request ${newStatus}.`);
  res.redirect("/host/bookings");
};
