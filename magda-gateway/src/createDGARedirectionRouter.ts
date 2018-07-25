import * as express from "express";
import { RecordsApi } from "@magda/typescript-common/dist/generated/registry/api";
import * as URI from "urijs";
import * as _ from "lodash";

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

    async function queryCkanAspect(
        ckanIdOrName: string,
        aspectName: string,
        retrieveAspectContent: boolean = true,
        retrieveAspects: string[] = [],
        limit: number = 1
    ): Promise<any[]> {
        const query = `${aspectName}.${
            uuidRegEx.test(ckanIdOrName) ? "id" : "name"
        }:${ckanIdOrName}`;

        let aspectList: string[] = [];

        if (retrieveAspects && retrieveAspects.length) {
            aspectList = retrieveAspects;
        } else {
            //--- this param only take effect when `retrieveAspects` is missing
            if (retrieveAspectContent) {
                aspectList.push(aspectName);
            }
        }

        aspectList = _.uniq(aspectList);

        const resData: any = await recordsApi.getAll(
            retrieveAspects.length ? retrieveAspects : undefined,
            undefined,
            undefined,
            undefined,
            limit,
            undefined,
            [query]
        );

        if (
            !resData ||
            !resData.body ||
            !resData.body.records ||
            !resData.body.records.length
        )
            return null;
        return resData.body.records;
    }

    const uuidRegEx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/gi;
    const notFoundPageBaseUrl = "/error";

    async function getCkanRecordMagdaId(
        ckanIdOrName: string,
        aspectName: string
    ) {
        const records = await queryCkanAspect(ckanIdOrName, aspectName, false);
        if (!records || !records.length || !records[0]["id"]) {
            return null;
        } else {
            return records[0]["id"];
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
    async function getCkanDatasetMagdaIdByCkanDistributionId(
        ckanIdOrName: string
    ) {
        const records = await queryCkanAspect(ckanIdOrName, "ckan-resource");
        if (
            !records ||
            !records.length ||
            !records[0]["aspects"] ||
            !records[0]["aspects"]["ckan-resource"] ||
            !records[0]["aspects"]["ckan-resource"]["package_id"]
        ) {
            return null;
        } else {
            const ckanDatsetID =
                records[0]["aspects"]["ckan-resource"]["package_id"];
            return await getCkanDatasetMagdaId(ckanDatsetID);
        }
    }

    /**
     * Unfortunately, aspect `organization-details` has no `id` field.
     * That means we can't query it as the ckan url may contain ckan-organization id.
     * Luckily, aspect `ckan-dataset`.`organization` has that id.
     * We will query against `ckan-dataset.organization` and then pull `dataset-publisher` aspect of that dataset.
     * Thanks to registry API's flexible `records` aspectQuery interface. We actually can shorten the whole story into one query:
     * /records?aspectQuery=ckan-dataset.organization.id:5a9f3a8e-2673-4c6e-be5b-e8f7287993c5&aspect=dataset-publisher&limt=1
     */
    async function getCkanOrganisationMagdaId(ckanIdOrName: string) {
        const records = await queryCkanAspect(
            ckanIdOrName,
            "ckan-dataset.organization",
            true,
            ["dataset-publisher"]
        );
        if (
            !records ||
            !records.length ||
            !records[0]["aspects"] ||
            !records[0]["aspects"]["dataset-publisher"] ||
            !records[0]["aspects"]["dataset-publisher"]["publisher"]
        ) {
            return null;
        } else {
            return records[0]["aspects"]["dataset-publisher"]["publisher"];
        }
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
                datasetMagdaId = await getCkanDatasetMagdaIdByCkanDistributionId(
                    disIdOrName
                );
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

    router.get("/organization/:ckanIdOrName", async function(req, res) {
        try {
            const ckanIdOrName = req.params.ckanIdOrName;
            if (!ckanIdOrName)
                throw new Error(`Invalid ckanIdOrName ${ckanIdOrName}`);

            const magdaId = await getCkanOrganisationMagdaId(ckanIdOrName);

            if (!magdaId) {
                const redirectUri = new URI(notFoundPageBaseUrl).search({
                    errorCode: 404,
                    recordType: "ckan-organization-details",
                    recordId: ckanIdOrName
                });
                res.redirect(307, redirectUri.toString());
            } else {
                res.redirect(308, `/organisations/${magdaId}`);
            }
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });

    return router;
}
