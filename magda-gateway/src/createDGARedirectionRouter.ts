import * as express from "express";
import { RecordsApi } from "@magda/typescript-common/dist/generated/registry/api";
import * as URI from "urijs";

export type DGARedirectionRouterOptions = {
    dgaRedirectionDomain: string;
    registryApiBaseUrlInternal: string;
};

export default function buildDGARedirectionRouter({
    dgaRedirectionDomain,
    registryApiBaseUrlInternal
}: DGARedirectionRouterOptions): express.Router {
    const router = express.Router();
    const recordsApi = new RecordsApi(registryApiBaseUrlInternal);

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

    function queryCkanAspect(
        ckanIdOrName: string,
        aspectName: string,
        retrieveAspectContent: boolean = true,
        limit: number = 1
    ) {
        const query = `${aspectName}.${
            uuidRegEx.test(ckanIdOrName) ? "id" : "name"
        }=${ckanIdOrName}`;

        return recordsApi.getAll(
            retrieveAspectContent ? [aspectName] : undefined,
            undefined,
            undefined,
            undefined,
            limit,
            undefined,
            [query]
        );
    }

    const uuidRegEx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/gi;
    const notFoundPageBaseUrl = "/error";

    async function getCkanRecordMagdaId(
        ckanIdOrName: string,
        aspectName: string
    ) {
        const resData = await queryCkanAspect(ckanIdOrName, aspectName, false);
        if (
            !resData ||
            !resData.body ||
            !resData.body.length ||
            !resData.body[0]["id"]
        ) {
            return null;
        } else {
            return resData.body[0]["id"];
        }
    }

    function getCkanDatasetMagdaId(ckanIdOrName: string) {
        return getCkanRecordMagdaId(ckanIdOrName, "ckan-dataset");
    }

    /**
     * Currently, there is no API can retrieve dataset id by distribution ID directly.
     * We can, however, get ckan `package_id` (this is the ckan dataset Id) from `ckan-resource` aspect for a distribution.
     * And then use `package_id` to query registry API for madga dataset id again.
     */
    async function getCkanDatasetMagdaIdByCkanDistributionId(ckanIdOrName: string){
        const resData =  await queryCkanAspect(ckanIdOrName, "ckan-resource");
        if (
            !resData ||
            !resData.body ||
            !resData.body.length ||
            !resData.body[0]["aspects"] ||
            !resData.body[0]["aspects"]["ckan-resource"] ||
            !resData.body[0]["aspects"]["ckan-resource"]["package_id"]
        ) {
            return null;
        } else {
            const ckanDatsetID = resData.body[0]["aspects"]["ckan-resource"]["package_id"];
            return await getCkanDatasetMagdaId(ckanDatsetID);
        }
    }

    function getCkanOrganisationMagdaId(ckanIdOrName: string) {
        return getCkanRecordMagdaId(ckanIdOrName, "organization-details");
    }

    router.get(/^\/dataset\/(?!ds-)[^\/]+$/, async function(req, res) {
        try {
            const originUri = new URI(req.originalUrl);
            const dsIdOrName = originUri.segmentCoded(1).trim();

            const magdaId = await getCkanDatasetMagdaId(dsIdOrName);

            if (!magdaId) {
                const redirectUri = new URI(notFoundPageBaseUrl).search({
                    errorCode: 404,
                    recordType: "ckan-dataset",
                    recordId: dsIdOrName
                });
                res.redirect(307, redirectUri.toString());
            } else {
                res.redirect(308, `/dataset/${magdaId}/details`);
            }
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });

    router.get(/^\/dataset\/(?!ds-)[^\/]+\/resource\/[^\/]+$/, async function(
        req,
        res
    ) {
        try {
            const originUri = new URI(req.originalUrl);
            const dsIdOrName = originUri.segmentCoded(1).trim();

            let datasetMagdaId = await getCkanDatasetMagdaId(dsIdOrName);
            if (!datasetMagdaId) {
                const disIdOrName = originUri.segmentCoded(3).trim();
                datasetMagdaId = await getCkanDatasetMagdaIdByCkanDistributionId(disIdOrName);
                if (!datasetMagdaId) {
                    const redirectUri = new URI(notFoundPageBaseUrl).search({
                        errorCode: 404,
                        recordType: "ckan-resource",
                        recordId: disIdOrName
                    });
                    res.redirect(307, redirectUri.toString());
                    return;
                }
            }

            res.redirect(308, `/dataset/${datasetMagdaId}/details`);

        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });

    return router;
}
