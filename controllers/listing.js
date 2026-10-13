const Listing = require("../models/listing.js");
const { cloudinary } = require("../cloudConfig.js");
const { activeListingCategories, getCategoryFilterValues } = require("../utils/listingCategories.js");

const destroyImage = async (filename) => {
    if (!filename) return;
    try {
        await cloudinary.uploader.destroy(filename);
    } catch (_) {
        console.error("Cloudinary image cleanup failed.");
    }
};

const destroyIfUnreferenced = async (filename, listingId) => {
    if (!filename) return;
    const stillReferenced = await Listing.exists({
        "image.filename": filename,
        _id: { $ne: listingId }
    });
    if (!stillReferenced) await destroyImage(filename);
};

module.exports.index = async (req, res, limit) => {
    const { q, category } = req.query;
    const normalizedQuery = typeof q === "string" ? q.trim() : "";
    const filters = {};

    if (normalizedQuery) {
        filters.$text = { $search: normalizedQuery };
    }

    if (category) {
        const matchingValues = getCategoryFilterValues(category);
        if (matchingValues.length === 1) {
            filters.category = { $regex: new RegExp(`^${matchingValues[0]}$`, "i") };
        } else if (matchingValues.length > 1) {
            filters.category = {
                $in: matchingValues.map(v => new RegExp(`^${v}$`, "i"))
            };
        }
    }

    const pageLimit = typeof limit === "number" ? limit : 9;

    const allListings = await Listing.find(filters)
        .select("title price image location country category")
        .lean();

    const displayedListings = pageLimit ? allListings.slice(0, pageLimit) : allListings;
    const hasMore = pageLimit ? allListings.length > pageLimit : false;
    const isHomepage = Boolean(pageLimit && !normalizedQuery && !category);

    res.render("listings/index.ejs", {
        allListings: displayedListings,
        q: normalizedQuery,
        selectedCategory: category || "",
        listingCategories: activeListingCategories,
        hasMore,
        isHomepage,
    });
}

module.exports.renderNewForm = (req, res) => {
    const formData = req.session && req.session.listingFormData;
    if (req.session) delete req.session.listingFormData;
    res.render("listings/new.ejs", { formData: formData || {}, listingCategories: activeListingCategories });
}

module.exports.createListing = async (req, res, next) => {
    if (!req.file) {
        if (req.session) req.session.listingFormData = { ...req.body };
        req.flash("error", "Please upload an image before creating the listing.");
        return res.redirect("/listings/new");
    }

    try {
        const { location, country } = req.validatedListing;
        const searchQuery = encodeURIComponent(`${location}, ${country}`);
        const geocodingResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${searchQuery}`,
            { headers: { "User-Agent": "WanderlustStudentProject/1.0" } }
        );

        if (!geocodingResponse.ok) {
            const error = new Error("Location service is currently unavailable. Please try again.");
            error.statusCode = 503;
            throw error;
        }

        const locations = await geocodingResponse.json();
        if (!locations.length) {
            const error = new Error("Location could not be found. Please enter a valid location and country.");
            error.statusCode = 400;
            throw error;
        }

        const newListing = new Listing(req.validatedListing);
        newListing.owner = req.user._id;
        newListing.image = { url: req.file.path, filename: req.file.filename };
        newListing.geometry = {
            type: "Point",
            coordinates: [Number(locations[0].lon), Number(locations[0].lat)]
        };
        await newListing.save();
    } catch (error) {
        await destroyImage(req.file.filename);
        if (error.statusCode && req.session) {
            req.session.listingFormData = { ...req.validatedListing };
            req.flash("error", error.message);
            return res.redirect("/listings/new");
        }
        throw error;
    }
    req.flash("success", "New Listing Added!");
    res.redirect("/listings");
}

module.exports.showListing = async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            select: "comment rating createdAt author",
            populate: {
                path: "author",
                select: "username",
            }
        })
        .populate({
            path: "owner",
            select: "username displayName hostFullName",
        })
        .lean();

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist !");
        return res.redirect("/listings");
    }

    res.render("listings/show.ejs", { listing });
}

module.exports.editListingForm = async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing you requested for does not exist !");
        return res.redirect("/listings");
    }
    let originalUrl = listing.image.url;
originalUrl = originalUrl.replace("/upload/", "/upload/c_fill,h_300,w_250/");
    const formData = req.session && req.session.listingFormData;
    if (req.session) delete req.session.listingFormData;
    res.render("listings/edit.ejs", {
        listing,
        originalUrl,
        formData: formData || {},
        listingCategories: activeListingCategories,
    });
}

module.exports.updateListing = async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist !");
        return res.redirect("/listings");
    }

    const previousFilename = listing.image && listing.image.filename;
    const replacementFilename = req.file && req.file.filename;
    try {
        const { location, country } = req.validatedListing;
        const locationChanged = listing.location !== location || listing.country !== country;

        if (locationChanged) {
            const searchQuery = encodeURIComponent(`${location}, ${country}`);
            const geocodingResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${searchQuery}`,
                { headers: { "User-Agent": "WanderlustStudentProject/1.0" } }
            );

            if (!geocodingResponse.ok) {
                const error = new Error("Location service is currently unavailable. Please try again.");
                error.statusCode = 503;
                throw error;
            }

            const locations = await geocodingResponse.json();
            if (!locations.length) {
                const error = new Error("Location could not be found. Please enter a valid location and country.");
                error.statusCode = 400;
                throw error;
            }

            listing.geometry = {
                type: "Point",
                coordinates: [Number(locations[0].lon), Number(locations[0].lat)]
            };
        }

        Object.assign(listing, req.validatedListing);
        if (req.file) listing.image = { url: req.file.path, filename: req.file.filename };
        await listing.save();
    } catch (error) {
        if (replacementFilename) await destroyImage(replacementFilename);
        if (error.statusCode && req.session) {
            req.session.listingFormData = { ...req.validatedListing };
            req.flash("error", error.message);
            return res.redirect(`/listings/${id}/edit`);
        }
        throw error;
    }

    if (replacementFilename && replacementFilename !== previousFilename) {
        await destroyIfUnreferenced(previousFilename, listing._id);
    }
    req.flash("success", "Listing Updated !");
    res.redirect(`/listings/${id}`);
}

module.exports.destroyListing = async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    if (deletedListing && deletedListing.image && deletedListing.image.filename) {
        await destroyIfUnreferenced(deletedListing.image.filename, deletedListing._id);
    }
    req.flash("success", "Listing Deleted !");
    res.redirect("/listings");
}
