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
    region: "South East Asia",
    countries: [
      { country: "Philippines", cities: ["Manila", "Palawan", "Cebu"] },
      { country: "Thailand", cities: ["Bangkok", "Phuket", "Chiang Mai"] },
      { country: "Bali", cities: ["Ubud", "Seminyak", "Nusa Penida"] },
      { country: "Vietnam", cities: ["Hanoi", "Ho Chi Minh City", "Da Nang"] },
    ]
  },
  {
    region: "East Asia",
    countries: [
      { country: "Japan", cities: ["Tokyo", "Kyoto", "Osaka"] },
      { country: "South Korea", cities: ["Seoul", "Busan", "Jeju Island"] },
    ]
  },
  {
    region: "Western Europe",
    countries: [
      { country: "Italy", cities: ["Milan", "Rome", "Florence", "Venice"] },
      { country: "France", cities: ["Paris", "Nice"] },
      { country: "Switzerland", cities: ["Zurich", "Lucerne", "Interlaken", "Zermatt"] },
      { country: "Netherlands", cities: ["Amsterdam"] },
      { country: "Germany", cities: ["Berlin", "Munich", "Hamburg", "Frankfurt"] },
      { country: "Belgium", cities: ["Brussels"] },
      { country: "Luxembourg", cities: ["Luxembourg City"] },
      { country: "Greece", cities: ["Mykonos", "Santorini", "Athens"] },
    ]
  },
  {
    region: "Eastern Europe & Caucasus",
    countries: [
      { country: "Georgia", cities: ["Tbilisi", "Batumi", "Kazbegi"] },
      { country: "Russia", cities: ["Moscow", "St. Petersburg", "Sochi"] },
      { country: "Iceland", cities: ["Reykjavik", "Vik", "Akureyri"] },
    ]
  },
  {
    region: "South Asia",
    countries: [
      { country: "Sri Lanka", cities: ["Colombo", "Kandy", "Ella", "Galle"] },
      { country: "Bhutan", cities: ["Thimphu", "Paro", "Punakha"] },
    ]
  },
  {
    region: "Central Asia",
    countries: [
      { country: "Kazakhstan", cities: ["Almaty", "Nur-Sultan", "Charyn Canyon"] },
      { country: "Mongolia", cities: ["Ulaanbaatar", "Gobi Desert", "Khuvsgul Lake"] },
    ]
  },
  {
    region: "Middle East",
    countries: [
      { country: "Dubai", cities: ["Dubai City", "Abu Dhabi", "Palm Jumeirah"] },
      { country: "Egypt", cities: ["Cairo", "Luxor", "Aswan", "Hurghada"] },
      { country: "Turkey", cities: ["Istanbul", "Cappadocia", "Antalya", "Bodrum"] },
      { country: "Oman", cities: ["Muscat", "Salalah", "Nizwa", "Wahiba Sands"] },
    ]
  },
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
