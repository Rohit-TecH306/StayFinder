const activeListingCategories = [
  { value: "Iconic Cities", label: "City Stays", icon: "fa-city" },
  { value: "Mountains", label: "Mountain Stays", icon: "fa-mountain" },
  { value: "Farms", label: "Nature Retreats", icon: "fa-tree" },
  { value: "Castles", label: "Heritage Stays", icon: "fa-landmark" },
  { value: "Beach & Island", label: "Beach & Island", icon: "fa-umbrella-beach" },
];

// Keep historic values valid so existing listings can still be displayed and edited.
const legacyListingCategories = ["Trending", "Rooms", "Campings", "Arctic", "Boats"];

const categoryLabels = activeListingCategories.map((c) => c.label);

const listingCategoryValues = Array.from(new Set([
  ...activeListingCategories.map((category) => category.value),
  ...categoryLabels,
  ...legacyListingCategories,
]));

// Mapping between category values/labels and related legacy values
const categoryMappings = {
  "Castles": ["Castles", "Heritage Stays"],
  "Heritage Stays": ["Castles", "Heritage Stays"],
  "Iconic Cities": ["Iconic Cities", "City Stays", "Rooms"],
  "City Stays": ["Iconic Cities", "City Stays", "Rooms"],
  "Mountains": ["Mountains", "Mountain Stays", "Arctic"],
  "Mountain Stays": ["Mountains", "Mountain Stays", "Arctic"],
  "Farms": ["Farms", "Nature Retreats", "Campings"],
  "Nature Retreats": ["Farms", "Nature Retreats", "Campings"],
  "Beach & Island": ["Beach & Island", "Trending", "Boats"],
  "Rooms": ["Rooms", "Iconic Cities", "City Stays"],
  "Arctic": ["Arctic", "Mountains", "Mountain Stays"],
  "Campings": ["Campings", "Farms", "Nature Retreats"],
  "Trending": ["Trending", "Beach & Island"],
  "Boats": ["Boats", "Beach & Island"],
};

function getCategoryFilterValues(cat) {
  if (!cat) return [];
  const trimmed = String(cat).trim();
  if (categoryMappings[trimmed]) {
    return categoryMappings[trimmed];
  }
  for (const [key, values] of Object.entries(categoryMappings)) {
    if (key.toLowerCase() === trimmed.toLowerCase()) {
      return values;
    }
  }
  return [trimmed];
}

function isCategoryActive(selectedCategory, categoryObj) {
  if (!selectedCategory) return false;
  const sel = String(selectedCategory).trim().toLowerCase();
  if (categoryObj.value.toLowerCase() === sel || categoryObj.label.toLowerCase() === sel) {
    return true;
  }
  const mapped = getCategoryFilterValues(categoryObj.value).map(v => v.toLowerCase());
  return mapped.includes(sel);
}

module.exports = {
  activeListingCategories,
  legacyListingCategories,
  listingCategoryValues,
  categoryMappings,
  getCategoryFilterValues,
  isCategoryActive,
};
