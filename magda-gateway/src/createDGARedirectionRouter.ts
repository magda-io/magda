import * as express from "express";
import Registry from "@magda/typescript-common/dist/registry/RegistryClient";
import * as URI from "urijs";

export type DGARedirectionRouterOptions = {
    dgaRedirectionDomain: string;
    registry: Registry;
};

export default function buildDGARedirectionRouter({
    dgaRedirectionDomain,
    registry
}: DGARedirectionRouterOptions): express.Router {
    const router = express.Router();

    router.get("/about", function(req, res) {
        res.redirect(308, "/page/about");
    });

    router.all("/api/3/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    /**
     * Needs to cover:
     * /dataset/edit
     * /dataset/edit* e.g. /dataset/edit?q=22 but not /dataset/newxx
     * /dataset/edit/*
     */
    router.all(/^\/dataset\/(edit|edit\?.*|edit\/.*)$/, function(req, res) {
        res.redirect(
            307,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    /**
     * Needs to cover:
     * /dataset/new
     * /dataset/new* e.g. /dataset/new?q=22 but not /dataset/newxx
     * /dataset/new/*
     */
    router.all(/^\/dataset\/(new|new\?.*|new\/.*)$/, function(req, res) {
        res.redirect(
            307,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all("/fanstatic/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all("/geoserver/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all(/^\/(group|group\?.*|group\/.*)$/, function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    /**
     * match /organization & /organization?q=xxx&sort
     */
    router.get(/^\/(organization|organization\?.*)$/, function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .segment(0, "organisations")
                .removeSearch(["page", "sort"])
                .toString()
        );
    });

    router.all(/^\/(showcase|showcase\?.*|showcase\/.*)$/, function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all("/storage/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all("/uploads/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all(/^\/(user|user\?.*|user\/.*)$/, function(req, res) {
        res.redirect(
            307,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.all("/vendor/leaflet/*", function(req, res) {
        res.redirect(
            308,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    router.get(/^\/dataset\/(?!ds-)[^\/]+$/, function(req, res) {
        res.redirect(
            307,
            URI(req.originalUrl)
                .domain(dgaRedirectionDomain)
                .protocol("https")
                .toString()
        );
    });

    return router;
}
