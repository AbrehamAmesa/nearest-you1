import axios from 'axios';
import api from './axios.ts';

// UserAuthController
export const userApi = {
  register: (payload: unknown) => api.post('/api/v1/auth/register', payload),
  login: (payload: unknown) => api.post('/api/v1/auth/login', payload),
  syncCredentials: (password: string) => api.post('/api/v1/auth/sync-credentials', { password }),
  changePassword: (payload: { currentPassword?: string; newPassword: string }) =>
    api.post('/api/v1/auth/change-password', payload),
  me: () => api.get('/api/v1/auth/me'),
  updateProfile: (payload: unknown) => api.put('/api/v1/users/profile', payload),
  getWorkspace: () => api.get('/api/v1/me/workspace'),
};

// PublicCatalogController
export const catalogApi = {
  getCatalog: (params?: { lat?: number; lng?: number }) =>
    api.get('/api/v1/catalog', { params }),
  getLocation: (params?: { lat?: number; lng?: number }) =>
    api.get('/api/v1/catalog/location', { params }),
  getRecommendations: (params?: { lat?: number; lng?: number; limit?: number }) =>
    api.get('/api/v1/catalog/recommendations', { params }),
  search: (params: Record<string, unknown>) => api.get('/api/v1/catalog/search', { params }),
  searchByImage: (payload: {
    imageBase64: string;
    mimeType?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  }) => api.post('/api/v1/catalog/image-search', payload),
};

// ProviderController
export const providerApi = {
  getMe: () => api.get('/api/v1/provider/me'),
  register: (payload: unknown) => api.post('/api/v1/provider/register', payload),
  regenerateQr: () => api.post('/api/v1/provider/regenerate-qr'),
  vouchScan: (payload: unknown) => api.post('/api/v1/provider/vouch-scan', payload),
  getApprovals: () => api.get('/api/v1/provider/approvals'),
  approve: (id: number | string, payload: unknown) => api.post(`/api/v1/providers/${id}/approve`, payload),
  updateLocation: (payload: unknown) => api.post('/api/v1/provider/location', payload),
};

// BusinessPortalController
export const businessApi = {
  getPortal: () => api.get('/api/v1/business/portal'),
  createBusiness: (payload: unknown) => api.post('/api/v1/businesses', payload),
  createListing: (payload: unknown) => api.post('/api/v1/listings', payload),
  updateAvailability: (id: number | string, payload: unknown) => api.patch(`/api/v1/listings/${id}/availability`, payload),
};

export const jobSeekerApi = {
  getMine: () => api.get('/api/v1/job-seekers/mine'),
  advertise: (payload: unknown) => api.post('/api/v1/job-seekers/advertise', payload),
  remove: (id: number | string) => api.delete(`/api/v1/job-seekers/${id}`),
};

// CommerceAndDispatchController
export const commerceApi = {
  createOrder: (payload: unknown) => api.post('/api/v1/orders', payload),
  updateOrderStatus: (id: number | string, payload: unknown) => api.post(`/api/v1/orders/${id}/status`, payload),
  createBooking: (payload: unknown) => api.post('/api/v1/bookings', payload),
  updateBookingStatus: (id: number | string, payload: unknown) => api.post(`/api/v1/bookings/${id}/status`, payload),
  getDeliveries: (params?: Record<string, unknown>) => api.get('/api/v1/deliveries', { params }),
  trackDelivery: (trackingCode: string, params?: Record<string, unknown>) => api.get(`/api/v1/deliveries/track/${encodeURIComponent(trackingCode)}`, { params }),
  updateDriverLocation: (id: number | string, payload: unknown) => api.post(`/api/v1/deliveries/${id}/driver-location`, payload),
  createDelivery: (payload: unknown) => api.post('/api/v1/deliveries', payload),
  transitionDelivery: (id: number | string, payload: unknown) => api.post(`/api/v1/deliveries/${id}/transition`, payload),
  raiseDispute: (id: number | string, payload: unknown) => api.post(`/api/v1/deliveries/${id}/dispute`, payload),
  raiseConflict: (id: number | string, payload: unknown) => api.post(`/api/v1/deliveries/${id}/conflict`, payload),
  submitConflictStatement: (id: number | string, payload: unknown) => api.post(`/api/v1/deliveries/${id}/conflict-statement`, payload),
};

// EngagementController
export const engagementApi = {
  toggleFavorite: (listingId: number | string) => api.post('/api/v1/favorites/toggle', { listingId }),
  sendMessage: (payload: unknown) => api.post('/api/v1/messages', payload),
  applyForJob: (id: number | string, payload: unknown) => api.post(`/api/v1/jobs/${id}/applications`, payload),
  updateApplicationStatus: (id: number | string, payload: unknown) => api.post(`/api/v1/applications/${id}/status`, payload),
  createReview: (payload: unknown) => api.post('/api/v1/reviews', payload),
};

// AdminPortalController
export const adminApi = {
  getPortal: () => api.get('/api/v1/admin/portal'),
  getTaxReport: (params?: Record<string, unknown>) => api.get('/api/v1/admin/tax-report', { params }),
  resolveDispute: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/deliveries/${id}/resolve-dispute`, payload),
  resolveConflict: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/deliveries/${id}/resolve-conflict`, payload),
  getDocumentTypes: () => api.get('/api/v1/admin/document-types'),
  createDocumentType: (payload: unknown) => api.post('/api/v1/admin/document-types', payload),
  updateDocumentType: (id: number | string, payload: unknown) => api.put(`/api/v1/admin/document-types/${id}`, payload),
  deleteDocumentType: (id: number | string) => api.delete(`/api/v1/admin/document-types/${id}`),
  createRequirement: (payload: unknown) => api.post('/api/v1/admin/requirements', payload),
  deleteRequirement: (id: number | string) => api.delete(`/api/v1/admin/requirements/${id}`),
  verifyProvider: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/providers/${id}/verify`, payload),
  verifyBusiness: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/businesses/${id}/verify`, payload),
  createCategory: (payload: unknown) => api.post('/api/v1/admin/categories', payload),
  updateCategory: (id: number | string, payload: unknown) => api.put(`/api/v1/admin/categories/${id}`, payload),
  updateCategoryStatus: (id: number | string, status: string) => api.patch(`/api/v1/admin/categories/${id}/status`, { status }),
  deleteCategory: (id: number | string) => api.delete(`/api/v1/admin/categories/${id}`),
  updatePricingPolicy: (payload: unknown) => api.put('/api/v1/admin/pricing-policy', payload),
  updateOnboardingGovernance: (payload: unknown) => api.put('/api/v1/admin/onboarding-governance', payload),
  updateUserStatus: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/users/${id}/status`, payload),
  updateAdminRole: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/users/${id}/admin-role`, payload),
  vouchEarly: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/users/${id}/vouch-early`, payload),
  updateUserRoles: (id: number | string, payload: unknown) => api.post(`/api/v1/admin/users/${id}/roles`, payload),
};

// OpenStreetMap / OSRM public services (not Spring controller endpoints)
const geoApi = axios.create({ timeout: 15000, headers: { 'Accept-Language': 'en' } });
export const mapsApi = {
  searchPlaces: async (query: string) => {
    const q = query.trim() ? `${query.trim()}, Addis Ababa, Ethiopia` : 'Addis Ababa, Ethiopia';
    const response = await geoApi.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'jsonv2', limit: 8, addressdetails: 1, viewbox: '38.55,9.15,38.95,8.85', bounded: 0 },
    });
    return { data: { results: (response.data || []).map((item: any) => ({ placeId: String(item.place_id), displayName: item.display_name, subCity: item.address?.suburb || item.address?.city_district || '', lat: Number(item.lat), lng: Number(item.lon), source: 'NOMINATIM' })) } };
  },
  reverseGeocode: async (lat: number, lng: number) => {
    const response = await geoApi.get('https://nominatim.openstreetmap.org/reverse', { params: { lat, lon: lng, format: 'jsonv2' } });
    return { status: response.status, data: { formattedAddress: response.data?.display_name || '', placeId: response.data?.place_id ? String(response.data.place_id) : null } };
  },
  getRoute: async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    const response = await geoApi.get(`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}`, { params: { overview: 'full', geometries: 'geojson', steps: false } });
    const route = response.data?.routes?.[0];
    return { data: route ? { distanceKm: route.distance / 1000, durationMin: route.duration / 60, geometry: (route.geometry?.coordinates || []).map(([lng, lat]: [number, number]) => [lat, lng]), source: 'OSRM' } : null };
  },
};
