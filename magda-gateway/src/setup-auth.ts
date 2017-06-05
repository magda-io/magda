import * as express from 'express';
import pool from "./pool";
import * as passport from 'passport';
const session = require("express-session");


export default function setupApp(router: express.Router) {
    if (!process.env.JWT_SECRET) {
        throw new Error("No JWT_SECRET env variable passed");
    }
    if (!process.env.SESSION_SECRET) {
        throw new Error("No SESSION_SECRET env variable passed");
    }

    passport.serializeUser(function (user: string, cb) {
        cb(null, user);
    });

    passport.deserializeUser(function (userId: string, cb) {
        cb(null, userId);
    });

    const store = new (require("connect-pg-simple")(session))({
        pool
    });
    router.use(require("cookie-parser")());
    router.use(
        session({
            store,
            secret: process.env.SESSION_SECRET,
            cookie: { maxAge: 15 * 60 * 1000 },
            resave: false,
            saveUninitialized: false,
            rolling: true
        })
    );
    router.use(passport.initialize());
    router.use(passport.session());
}

