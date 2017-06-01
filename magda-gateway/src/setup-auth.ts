import * as express from 'express';
import pool from "./pool";
import * as passport from 'passport';
const session = require("express-session");


export default function setupApp(app: express.Application) {
    if (!process.env.JWT_SECRET) {
        throw new Error("No JWT_SECRET env variable passed");
    }
    if (!process.env.SESSION_SECRET) {
        throw new Error("No SESSION_SECRET env variable passed");
    }

    // Configure view engine to render EJS templates.
    app.set("views", __dirname + "/views");
    app.set("view engine", "ejs");

    passport.serializeUser(function (user: string, cb) {
        cb(null, user);
    });

    passport.deserializeUser(function (userId: string, cb) {
        cb(null, userId);
    });

    const store = new (require("connect-pg-simple")(session))({
        pool
    });
    app.use(require("morgan")("combined"));
    app.use(require("cookie-parser")());
    app.use(require("body-parser").urlencoded({ extended: true }));
    app.use(
        session({
            store,
            secret: process.env.SESSION_SECRET,
            cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
            resave: false,
            saveUninitialized: false,
            rolling: true
        })
    );
    app.use(passport.initialize());
    app.use(passport.session());
}

