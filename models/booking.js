const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const bookingSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    guest: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return this.checkIn && value > this.checkIn;
        },
        message: "Check-out must be after check-in.",
      },
    },
    guests: {
      type: Number,
      // Retained for historical bookings; new requests do not collect occupancy.
      required: false,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Guest count must be a whole number.",
      },
    },
    nights: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Night count must be a whole number.",
      },
    },
    pricePerNightPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Price must be stored in whole paise.",
      },
    },
    totalAmountPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Total must be stored in whole paise.",
      },
    },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "cancelled", "completed"],
      default: "pending",
      required: true,
      index: true,
    },
    guestMessage: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    statusUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// This index supports the availability query used when a host confirms a booking.
// It does not by itself prevent overlapping date ranges; that is business logic.
bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
