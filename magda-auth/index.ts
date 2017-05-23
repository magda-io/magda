var GoogleStrategy = require("passport-google-oauth20").Strategy;
var LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");

import * as passport from 'passport';
import * as express from 'express';
import { Strategy as FBStrategy } from 'passport-facebook';
import loginToCkan from "./src/ckan/login-to-ckan";

const pool = require("./src/db/pool");
const db = require("./src/db/db");

// Configure the Facebook strategy for use by Passport.
//
// OAuth 2.0-based strategies require a `verify` function which receives the
// credential (`accessToken`) for accessing the Facebook API on the user's
// behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(
  new FBStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/login/facebook/return",
      profileFields: ["displayName", "picture", "email"]
    },
    function (accessToken, refreshToken, profile, cb) {
      db.createOrGet(profile, 'facebook');
      return cb(null, profile);
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/login/google/return"
    },
    function (accessToken: string, refreshToken: string, profile: passport.Profile, cb: (error: any, user?: any, info?: any) => void) {
      return cb(null, profile);
    }
  )
);

passport.use(
  new LocalStrategy(function (username: string, password: string, cb: (error: any, user?: any, info?: any) => void) {
    loginToCkan(username, password).then(result => {
      result.caseOf({
        left: error => cb(error),
        right: profile => cb(null, profile)
      });
    });
  })
);

// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Facebook profile is serialized
// and deserialized.
passport.serializeUser(function (user, cb) {
  cb(null, user);
});

passport.deserializeUser(function (obj, cb) {
  cb(null, obj);
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
    resave: false
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

app.get(
  "/login/facebook",
  passport.authenticate("facebook", { scope: ["public_profile", "email"] })
);

app.get(
  "/login/facebook/return",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect("/");
  }
);

app.get(
  "/login/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/login/google/return",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect("/");
  }
);

app.get("/login/ckan", function (req, res) {
  res.render("form");
});

app.post(
  "/login/ckan",
  passport.authenticate("local", { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect("/");
  }
);

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
