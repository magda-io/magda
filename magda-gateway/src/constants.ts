const config = require("config");

export default {
    authHome: `${config.externalHost}/auth`,
    loginBaseUrl: `${config.externalHost}/auth/login`
}