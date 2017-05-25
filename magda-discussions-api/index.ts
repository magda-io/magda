const session = require("express-session");

import * as passport from 'passport';
import * as express from 'express';

import apiRouter from './src/api/api';
import pool from "./src/db/pool";
import { User, get as getUser } from "./src/db/db";

// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Facebook profile is serialized
// and deserialized.
passport.serializeUser(function (user: User, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function (id: string, cb) {
  getUser(id).then(user => cb(null, user));
});

// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require("morgan")("combined"));
app.use(require("cookie-parser")());
app.use(require("body-parser").urlencoded({ extended: true }));

const store = new (require("connect-pg-simple")(session))({
  pool
});
app.use(
  session({
    store,
    secret: "keyboard cat",
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
    resave: false,
    saveUninitialized: false
  })
);

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

// Define routes.
app.get("/", function (req, res) {
  res.render("home", { user: req.user });
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.use('/google', googleAuthRouter);
app.use('/facebook', fbAuthRouter);
app.use('/ckan', ckanAuthRouter);
app.use('/api/v0', apiRouter);

app.get("/profile", require("connect-ensure-login").ensureLoggedIn(), function (
  req,
  res
) {
  res.render("profile", { user: req.user });
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.listen(3000);

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
