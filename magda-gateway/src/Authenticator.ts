import * as express from "express";
import createPool from "./createPool";
import * as passport from "passport";
const session = require("express-session");

export interface AuthenticatorOptions {
    sessionSecret: string;
    dbHost: string;
    dbPort: number;
}

export default class Authenticator {
    private cookieParserMiddleware: express.RequestHandler;
    private sessionMiddleware: express.RequestHandler;
    private passportMiddleware: express.RequestHandler;
    private passportSessionMiddleware: express.RequestHandler;

    constructor(options: AuthenticatorOptions) {
        passport.serializeUser(function(user: any, cb) {
            cb(null, user);
        });

        passport.deserializeUser(function(user: any, cb) {
            cb(null, user);
        });

        const store = new (require("connect-pg-simple")(session))({
            pool: createPool(options)
        });

        this.cookieParserMiddleware = require("cookie-parser")();

        this.sessionMiddleware = session({
            store,
            secret: options.sessionSecret,
            cookie: { maxAge: 7 * 60 * 60 * 1000 },
            resave: false,
            saveUninitialized: false,
            rolling: true
        });

        this.passportMiddleware = passport.initialize();
        this.passportSessionMiddleware = passport.session();
    }

    applyToRoute(router: express.Router) {
        router.use(this.cookieParserMiddleware);
        router.use(this.sessionMiddleware);
        router.use(this.passportMiddleware);
        router.use(this.passportSessionMiddleware);
    }
}
