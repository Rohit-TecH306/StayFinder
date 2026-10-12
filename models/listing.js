const mongoose = require("mongoose");
const Review = require("./review.js");
const { listingCategoryValues } = require("../utils/listingCategories.js");

const schema = mongoose.Schema;

const listingSchema = new schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    image: {
        url : String,
        filename : String,
    },
    price: Number,
    maxGuests: {
        type: Number,
        // Retained for legacy listings; capacity is no longer part of the active workflow.
        required: false,
        default: 1,
        min: 1,
        max: 50,
        validate: {
            validator: Number.isInteger,
            message: "Maximum guests must be a whole number.",
        },
    },
    location: String,
    country: String,
    category: {
        type: String,
        enum: listingCategoryValues,
        default: "Iconic Cities"
    },
    geometry: {
        type: {
            type: String,
            enum: ["Point"]
        },
        coordinates: {
            type: [Number]
        }
    },
    reviews: [{
        type: schema.Types.ObjectId,
        ref: "Review"
    }],
    owner :{
        type :schema.Types.ObjectId,
        ref : "User" ,
    },
});

listingSchema.index({ category: 1 });
listingSchema.index({ owner: 1 });
listingSchema.index({ title: "text", location: "text", country: "text" });
listingSchema.index({ geometry: "2dsphere" });

listingSchema.post("findOneAndDelete", async (listing) => {
    if (listing && listing.reviews.length) {
        await Review.deleteMany({ _id: { $in: listing.reviews } });
    }
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
