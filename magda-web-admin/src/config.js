const fallbackApiHost = "http://magda-dev.terria.io/";

const serverConfig = window.magda_server_config || {};
const adminApiUrl = serverConfig.baseUrl
const adminApiUrlFallback = "http://192.168.99.100:30100/api/v0/admin/"

export const config = {
  appName: "data.gov.au",
  baseUrl: serverConfig.baseUrl || fallbackApiHost,
  adminApiUrl: serverConfig.adminApiUrl || adminApiUrlFallback,
  authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
  appTitle: 'magda web-admin',
};
