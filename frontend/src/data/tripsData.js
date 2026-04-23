export const domesticDestinations = [
  {
    state: "Kerala",
    highlight: "God's Own Country",
    thumbnail: "",
    about: "Backwaters, beaches and lush greenery",
    tours: [
      { id: 1, name: "Alleppey Houseboat", detail: "Stay in houseboats" },
      { id: 2, name: "Munnar Hills", detail: "Tea plantations" }
    ]
  },
  {
    state: "Rajasthan",
    highlight: "Royal Heritage",
    thumbnail: "",
    about: "Forts, deserts and culture",
    tours: [
      { id: 3, name: "Jaipur Tour", detail: "Pink city" }
    ]
  }
];

export const internationalDestinations = [
  {
    region: "Europe",
    countries: [
      {
        country: "France",
        cities: ["Paris", "Nice"]
      },
      {
        country: "Italy",
        cities: ["Rome", "Venice"]
      }
    ]
  }
];

export const categories = [
  { label: "Adventure", icon: "🏔️" },
  { label: "Beach", icon: "🏖️" },
  { label: "Heritage", icon: "🏛️" }
];

export const bestSellerTrips = [
  { id: 1, title: "Bali Escape" },
  { id: 2, title: "Dubai Luxury" },
  { id: 3, title: "Thailand Fun" },
  { id: 4, title: "Maldives Honeymoon" }
];

export const trips = [
  {
    id: 1,
    title: "Kerala Trip",
    result_type: "package",
    category: "Nature",
    price: "₹25,000"
  },
  {
    id: 2,
    title: "Paris",
    result_type: "country",
    subtitle: "France"
  }
];
