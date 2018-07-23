import * as express from "express";
//import Registry from "@magda/typescript-common/dist/registry/RegistryClient";
import * as URI from "urijs";

export type DGARedirectionRouterOptions = {
    dgaRedirectionDomain: string;
};

export default function buildDGARedirectionRouter({
    dgaRedirectionDomain
}: DGARedirectionRouterOptions): express.Router {
    const router = express.Router();

    router.get("/about", function (req, res){
        res.redirect(308, "/page/about");
    });

    router.all("/api/3/*", function (req, res){
        res.redirect(308, URI(req.originalUrl).domain(dgaRedirectionDomain).protocol("https").toString());
    });

    router.all("/data/*", function (req, res){
        res.redirect(308, URI(req.originalUrl).domain(dgaRedirectionDomain).toString());
    });

    return router;
}
