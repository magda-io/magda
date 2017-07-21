import { Router } from "express";
import { getUser } from "@magda/auth-api/dist/client";
import setupAuth from "./setup-auth";

const authRouter: Router = Router();

setupAuth(authRouter);
authRouter.use(require("body-parser").urlencoded({ extended: true }));

const providers = [
  {
    id: "facebook",
    enabled:
      process.env.FACEBOOK_ENABLED ||
      process.env.npm_package_config_FACEBOOK_ENABLED,
    authRouter: "./oauth2/facebook"
  },
  {
    id: "google",
    enabled:
      process.env.GOOGLE_ENABLED ||
      process.env.npm_package_config_GOOGLE_ENABLED,
    authRouter: "./oauth2/google"
  },
  {
    id: "ckan",
    enabled:
      process.env.CKAN_ENABLED || process.env.npm_package_config_CKAN_ENABLED,
    authRouter: "./oauth2/ckan"
  }
];

// Define routes.
authRouter.get("/", function(req, res) {
  res.render("home", { user: req.user });
});

authRouter.get("/login", function(req, res) {
  res.render("login");
});

providers.filter(provider => provider.enabled).forEach(provider => {
  authRouter.use("/login/" + provider.id, require(provider.authRouter).default);
});

authRouter.get("/providers", (req, res) => {
  res.json(
    providers.filter(provider => provider.enabled).map(provider => provider.id)
  );
});

authRouter.get(
  "/profile",
  require("connect-ensure-login").ensureLoggedIn(),
  function(req, res) {
    getUser(req.user.id).then(user =>
      res.render("profile", { user: user.valueOrThrow() })
    );
  }
);

authRouter.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/auth");
});

export default authRouter;
