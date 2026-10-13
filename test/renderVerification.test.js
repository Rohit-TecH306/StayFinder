const assert = require("node:assert/strict");
const path = require("node:path");
const ejsMate = require("ejs-mate");

async function renderTemplate(viewPath, data) {
    return new Promise((resolve, reject) => {
        ejsMate(
            viewPath,
            {
                ...data,
                settings: {
                    views: path.join(__dirname, "..", "views"),
                    "view options": { layout: true }
                }
            },
            (err, str) => {
                if (err) return reject(err);
                resolve(str);
            }
        );
    });
}

async function testRenders() {
    console.log("Testing template renders with ejs-mate...");

    const mockBookings = [
        {
            _id: "660000000000000000000001",
            status: "confirmed",
            checkIn: new Date("2026-11-01"),
            checkOut: new Date("2026-11-05"),
            totalAmountPaise: 1200000,
            listing: {
                title: "Cozy Mountain Chalet",
                location: "Manali",
                country: "India"
            }
        }
    ];

    // 1. Test bookings index render
    const bookingsHtml = await renderTemplate(
        path.join(__dirname, "..", "views", "bookings", "index.ejs"),
        {
            bookings: mockBookings,
            currentUser: { username: "guestUser" },
            isHost: false,
            success: [],
            error: []
        }
    );
    assert.ok(bookingsHtml.includes("StayFinder"), "Boilerplate title has StayFinder");
    assert.ok(!bookingsHtml.includes("Wanderlust"), "No Wanderlust references in bookings page");
    assert.ok(bookingsHtml.includes("booking-col-property"), "Contains booking-col-property");
    assert.ok(bookingsHtml.includes("booking-col-action"), "Contains booking-col-action");
    assert.ok(bookingsHtml.includes('data-label="Check-in"'), "Contains data-label for mobile stacking");

    // 2. Test listings index render
    const listingsHtml = await renderTemplate(
        path.join(__dirname, "..", "views", "listings", "index.ejs"),
        {
            allListings: [],
            q: "Goa",
            selectedCategory: "Beach & Island",
            listingCategories: [{ value: "Beach & Island", label: "Beach & Island", icon: "fa-umbrella-beach" }],
            hasMore: false,
            currentUser: null,
            isHost: false,
            success: [],
            error: []
        }
    );
    assert.ok(listingsHtml.includes("StayFinder"), "Boilerplate title has StayFinder");
    assert.ok(listingsHtml.includes("Clear filters"), "Contains Clear filters link when searched");
    assert.ok(listingsHtml.includes("Browse all listings"), "Contains Browse all listings empty state action");
    assert.ok(!listingsHtml.includes("btn-view-more"), "Does not contain load-more button when hasMore is false");

    // 2b. Test listings index render with hasMore true
    const listingsWithMoreHtml = await renderTemplate(
        path.join(__dirname, "..", "views", "listings", "index.ejs"),
        {
            allListings: [],
            q: "",
            selectedCategory: "",
            listingCategories: [{ value: "Beach & Island", label: "Beach & Island", icon: "fa-umbrella-beach" }],
            hasMore: true,
            currentUser: null,
            isHost: false,
            success: [],
            error: []
        }
    );
    assert.ok(listingsWithMoreHtml.includes("btn-view-more"), "Contains btn-view-more button when hasMore is true");
    assert.ok(listingsWithMoreHtml.includes("Load More Listings"), "Contains Load More Listings text when hasMore is true");

    // 3. Test error page render
    const errorHtml = await renderTemplate(
        path.join(__dirname, "..", "views", "listings", "error.ejs"),
        {
            message: "Listing not found",
            currentUser: null,
            isHost: false,
            success: [],
            error: []
        }
    );
    assert.ok(errorHtml.includes("Back to listings"), "Contains Back to listings on error page");

    console.log("All template render tests passed successfully!");
}

testRenders().catch((err) => {
    console.error("Render verification failed:", err);
    process.exit(1);
});
