import axios from "axios";
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api" });

api.setAuthToken = (token) => {
  if (token) {
    localStorage.setItem("novadesk_access_token", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem("novadesk_access_token");
    delete api.defaults.headers.common.Authorization;
  }
};

const existingToken = localStorage.getItem("novadesk_access_token");
if (existingToken) api.defaults.headers.common.Authorization = `Bearer ${existingToken}`;

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 &&
        !error.config?.url?.includes("/auth/login") &&
        !error.config?.url?.includes("/auth/register") &&
        !error.config?.url?.includes("/auth/accept-invitation")) {
      api.setAuthToken(null);
      window.dispatchEvent(new Event("novadesk-auth-expired"));
    }
    return Promise.reject(error);
  }
);

export default api;
