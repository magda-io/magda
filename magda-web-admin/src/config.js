const fallbackApiHost = "https://dev.magda.io/";

const serverConfig = window.magda_server_config || {};

export const config = {
    appName: "data.gov.au",
    baseUrl: serverConfig.baseUrl || fallbackApiHost,
    adminApiUrl:
        serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
    authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
    appTitle: "magda web-admin"
};
