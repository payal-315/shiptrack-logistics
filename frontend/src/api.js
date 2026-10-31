const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const request = async (method, endpoint, data, options = {}) => {
  const headers = { ...options.headers };
  const token = options.auth === false
    ? null
    : localStorage.getItem("authToken");

  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    signal: options.signal,
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      const expiredRole = localStorage.getItem("userRole")?.toLowerCase();
      localStorage.removeItem("authToken");
      localStorage.removeItem("userRole");
      localStorage.removeItem("driverApprovalStatus");
      clearShipmentSession();
      window.dispatchEvent(new CustomEvent("shiptrack:auth-expired", { detail: { role: expiredRole } }));
    }
    const error = new Error(result.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return result;
};

const encode = (value) => encodeURIComponent(value);

export const apiClient = {
  request,
  get: (endpoint, options) => request("GET", endpoint, undefined, options),
  post: (endpoint, data, options) => request("POST", endpoint, data, options),
  put: (endpoint, data, options) => request("PUT", endpoint, data, options),
  delete: (endpoint, options) => request("DELETE", endpoint, undefined, options)
};

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: "/auth/register",
    LOGIN: "/auth/login",
    FORGOT_PASSWORD: "/auth/forgot-password",
    VERIFY_OTP: "/auth/verify-otp",
    RESET_PASSWORD: "/auth/reset-password",
    ME: "/auth/me",
    PROFILE: "/auth/profile",
    CHANGE_PASSWORD: "/auth/change-password"
  },
  SHIPMENTS: {
    CREATE: "/shipments",
    GET_ALL: "/shipments",
    GET_BY_ID: (id) => `/shipments/${encode(id)}`,
    UPDATE: (id) => `/shipments/${encode(id)}`,
    ASSIGN: (id) => `/shipments/${encode(id)}/assign`,
    AVAILABLE_DRIVERS: (id) => `/shipments/${encode(id)}/available-drivers`,
    DELETE: (id) => `/shipments/${encode(id)}`
  },
  TRACKING: {
    TRACK: (id) => `/tracking/${encode(id)}`,
    PUBLIC: (id) => `/tracking/public/${encode(id)}`,
    GET_EVENTS: (id) => `/tracking/${encode(id)}/events`,
    UPDATE_STATUS: (id) => `/tracking/${encode(id)}/status`
  },
  DRIVERS: {
    SIGNUP: "/drivers/signup",
    CURRENT_LOCATION: "/drivers/me/location",
    PENDING: "/drivers/pending",
    SUMMARY: "/drivers/summary",
    APPROVE: (id) => `/drivers/${encode(id)}/approve`,
    REJECT: (id) => `/drivers/${encode(id)}/reject`,
    GET_ALL: "/drivers",
    GET_BY_ID: (id) => `/drivers/${encode(id)}`,
    UPDATE: (id) => `/drivers/${encode(id)}`
  }
};

export const getShipmentCheckpoints = async (id, options) => {
  const response = await apiClient.get(`${API_ENDPOINTS.SHIPMENTS.GET_BY_ID(id)}/checkpoints`, options);
  return response.data || [];
};

export const clearShipmentSession = () => {
  for (const key of Object.keys(localStorage)) {
    if (/shipment/i.test(key)) localStorage.removeItem(key);
  }
  sessionStorage.clear();
  window.dispatchEvent(new Event("shiptrack:session-changed"));
};

export const getShipments = async (options) => {
  const response = await apiClient.get(API_ENDPOINTS.SHIPMENTS.GET_ALL, options);
  return Array.isArray(response.data) ? response.data.filter(Boolean) : [];
};

export const createShipment = async (shipment, options) => {
  const response = await apiClient.post(
    API_ENDPOINTS.SHIPMENTS.CREATE,
    shipment,
    options
  );
  return response.data;
};

export const getPublicTracking = async (trackingNumber, options) => {
  const response = await apiClient.get(
    API_ENDPOINTS.TRACKING.PUBLIC(trackingNumber),
    { ...options, auth: false }
  );
  return response.data;
};

export const getTrackingEvents = async (trackingNumber, options) => {
  const response = await apiClient.get(
    API_ENDPOINTS.TRACKING.GET_EVENTS(trackingNumber),
    options
  );
  return response.data || [];
};

export const updateTracking = async (trackingNumber, update, options) => {
  const response = await apiClient.put(
    API_ENDPOINTS.TRACKING.UPDATE_STATUS(trackingNumber),
    update,
    options
  );
  return response.data;
};

export const getDrivers = async (options = {}) => {
  const { shipmentId, ...requestOptions } = options;
  const response = await apiClient.get(API_ENDPOINTS.DRIVERS.GET_ALL + (shipmentId ? "?shipmentId=" + encodeURIComponent(shipmentId) : ""), requestOptions);
  return Array.isArray(response.data) ? response.data.filter(Boolean) : [];
};
export const getAvailableDrivers = async (shipmentId, options) => {
  const response = await apiClient.get(API_ENDPOINTS.SHIPMENTS.AVAILABLE_DRIVERS(shipmentId), options);
  return Array.isArray(response.data) ? response.data.filter(Boolean) : [];
};
export const getDriverSummaries = async (options) => {
  const response = await apiClient.get(API_ENDPOINTS.DRIVERS.SUMMARY, options);
  return response.data || [];
};

export const getPendingDrivers = async (options) => {
  const response = await apiClient.get(API_ENDPOINTS.DRIVERS.PENDING, options);
  return Array.isArray(response.data) ? response.data.filter(Boolean) : [];
};

export const reviewDriver = async (id, decision, options) => {
  const endpoint = decision === "approve" ? API_ENDPOINTS.DRIVERS.APPROVE(id) : API_ENDPOINTS.DRIVERS.REJECT(id);
  return apiClient.post(endpoint, {}, options);
};
export const removeDriver = async (id, options) => apiClient.delete("/drivers/" + encodeURIComponent(id), options);

export const assignDriver = async (shipmentId, driverId, options) => {
  const response = await apiClient.put(
    API_ENDPOINTS.SHIPMENTS.ASSIGN(shipmentId),
    { driverId },
    options
  );
  return response.data;
};

export default apiClient;
