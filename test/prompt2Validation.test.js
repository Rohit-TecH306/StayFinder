const assert = require("node:assert/strict");
const { listingSchema, bookingSchema, hostOnboardingSchema } = require("../schema.js");

const validListing = {
  title: "A comfortable stay",
  description: "A comfortable place close to the city center.",
  price: 2500,
  location: "Pune",
  country: "India",
  category: "Trending",
};

const validBooking = {
  booking: {
    checkIn: "2099-01-10",
    checkOut: "2099-01-12",
    guestMessage: "Please share check-in instructions."
  }
};

const validHost = {
  host: {
    fullName: "Test Host",
    phone: "9876543210",
    city: "Pune",
    propertyType: "private_room",
    termsAccepted: "true"
  }
};

assert.equal(listingSchema.validate(validListing).error, undefined);
assert.ok(listingSchema.validate({ ...validListing, maxGuests: 4 }).error, "Capacity is not accepted in the active listing form");
assert.equal(listingSchema.validate({ ...validListing, category: "Arctic" }).error, undefined, "Legacy listing categories remain valid");
assert.equal(listingSchema.validate({ ...validListing, category: "Beach & Island" }).error, undefined, "The new active beach category is valid");

assert.equal(bookingSchema.validate(validBooking).error, undefined);
assert.ok(bookingSchema.validate({ ...validBooking, booking: { ...validBooking.booking, guests: 2 } }).error, "Guest count is not accepted in new booking requests");

for (const phone of ["9876543210", "+919876543210", "+91 9876543210", "+91-9876543210"]) {
  assert.equal(hostOnboardingSchema.validate({ host: { ...validHost.host, phone } }).error, undefined, `${phone} should be valid`);
}
for (const phone of ["5876543210", "987654321", "+91987654321", "1234567890"]) {
  assert.ok(hostOnboardingSchema.validate({ host: { ...validHost.host, phone } }).error, `${phone} should be invalid`);
}

console.log("Prompt 2 validation tests passed.");
