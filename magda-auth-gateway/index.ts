require("isomorphic-fetch");
const session = require("express-session");

import * as passport from 'passport';
import * as express from 'express';

const httpProxy = require('http-proxy');
const jwt = require('jsonwebtoken');

import googleAuthRouter from './src/oauth2/google';
import fbAuthRouter from './src/oauth2/facebook';
import ckanAuthRouter from './src/oauth2/ckan';
import { getUser } from './src/auth-api-client';
import pool from "./src/pool";

passport.serializeUser(function (user: string, cb) {
  cb(null, user);
});

passport.deserializeUser(function (userId: string, cb) {
  cb(null, userId);
});

// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

const store = new (require("connect-pg-simple")(session))({
  pool
});

function setupApp(app: express.Application) {
  app.use(require("morgan")("combined"));
  app.use(require("cookie-parser")());
  app.use(require("body-parser").urlencoded({ extended: true }));
  app.use(
    session({
      store,
      secret: "keyboard cat",
      cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
      resave: false,
      saveUninitialized: false
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
}

setupApp(app);

const authRouter = express.Router();

// Define routes.
authRouter.get("/", function (req, res) {
  res.render("home", { user: req.user });
});

authRouter.get("/login", function (req, res) {
  res.render("login");
});

authRouter.use('/login/google', googleAuthRouter);
authRouter.use('/login/facebook', fbAuthRouter);
authRouter.use('/login/ckan', ckanAuthRouter);

authRouter.get("/profile", require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  getUser(req.user).then(user =>
    res.render("profile", { user: user.valueOrThrow() })
  );
});

authRouter.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/auth");
});

var proxy = httpProxy.createProxyServer({});

app.use('/auth', authRouter);

app.get("*", (req, res) => {
  proxy.web(req, res, { target: 'http://192.168.99.100:30013' });
});

const JWT_SECRET = "squirrel";

proxy.on('proxyReq', function (proxyReq: any, req: express.Request, res: Response, options: any) {
  if (req.user) {
    const token = jwt.sign({ userId: req.user }, JWT_SECRET)
    proxyReq.setHeader('X-Magda-Session', token);
  }
});

app.listen(3000);

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
