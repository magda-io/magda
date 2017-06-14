import * as express from "express";
import pool from "./pool";
import * as passport from "passport";
const session = require("express-session");

passport.serializeUser(function(user: string, cb) {
  cb(null, user);
});

passport.deserializeUser(function(userId: string, cb) {
  cb(null, userId);
});

const store = new (require("connect-pg-simple")(session))({
  pool
});

const cookieParserMiddleware = require("cookie-parser")();

const sessionMiddleware = session({
  store,
  secret: process.env.SESSION_SECRET,
  cookie: { maxAge: 7 * 60 * 60 * 1000 },
  resave: false,
  saveUninitialized: false,
  rolling: true
});

const passportMiddleware = passport.initialize();
const passportSessionMiddleware = passport.session();

export default function setupAuth(router: express.Router) {
  if (!process.env.JWT_SECRET) {
    throw new Error("No JWT_SECRET env variable passed");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("No SESSION_SECRET env variable passed");
  }
  router.use(cookieParserMiddleware);
  router.use(sessionMiddleware);
  router.use(passportMiddleware);
  router.use(passportSessionMiddleware);
}
