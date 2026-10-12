const activeListingCategories = [
  { value: "Iconic Cities", label: "City Stays", icon: "fa-city" },
  { value: "Mountains", label: "Mountain Stays", icon: "fa-mountain" },
  { value: "Farms", label: "Nature Retreats", icon: "fa-tree" },
  { value: "Castles", label: "Heritage Stays", icon: "fa-landmark" },
  { value: "Beach & Island", label: "Beach & Island", icon: "fa-umbrella-beach" },
];

// Keep historic values valid so existing listings can still be displayed and edited.
const legacyListingCategories = ["Trending", "Rooms", "Campings", "Arctic", "Boats"];
const listingCategoryValues = [
  ...activeListingCategories.map((category) => category.value),
  ...legacyListingCategories,
];

module.exports = { activeListingCategories, legacyListingCategories, listingCategoryValues };
