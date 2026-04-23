const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

export async function fetchDomesticDestinations() {
  try {
    const res = await fetch(`${API_BASE}/destinations/domestic`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchInternationalDestinations() {
  try {
    const res = await fetch(`${API_BASE}/destinations/international`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function searchTrips(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchTrips(params = {}) {
  try {
    const queryString = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/trips${queryString ? `?${queryString}` : ''}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
