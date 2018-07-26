import * as express from "express";
import * as URI from "urijs";
import * as _ from "lodash";
import * as request from "request";

export type DGARedirectionRouterOptions = {
    dgaRedirectionDomain: string;
    registryApiBaseUrlInternal: string;
};

export default function buildDGARedirectionRouter({
    dgaRedirectionDomain,
    registryApiBaseUrlInternal
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

    class GenericError extends Error {
        constructor(message = "Unknown Error", errorData: any = null) {
            super(message);
            this.errorData = errorData;
        }
        errorData: any = null;
    }

    function queryRegistryRecordApi(
        aspectQuery: string[],
        aspect: string[],
        limit: number = 1
    ) {
        const queryParameters: any = {
            limit
        };
        if (aspectQuery && aspectQuery.length) {
            queryParameters["aspectQuery"] = aspectQuery;
        }
        if (aspect && aspect.length) {
            queryParameters["aspect"] = aspect;
        }

        const requestOptions = {
            uri: `${registryApiBaseUrlInternal}/records`,
            method: "GET",
            qs: queryParameters,
            qsStringifyOptions: {
                arrayFormat: "repeat"
            },
            json: false,
            encoding: "utf-8"
        };

        return new Promise((resolve, reject) => {
            try {
                request(requestOptions, (error, response, body) => {
                    try{
                        if (error) {
                            if (_.isError(error)) {
                                reject(error);
                            } else {
                                reject(
                                    new GenericError(
                                        "Failed to send request to Registry API.",
                                        error
                                    )
                                );
                            }
                        } else {
                            if (
                                response.statusCode >= 200 &&
                                response.statusCode <= 299
                            ) {
                                try{
                                    resolve(JSON.parse(body));
                                }catch(e){
                                    reject(new GenericError("Failed to parse response.",response));
                                }
                            } else {
                                reject(new GenericError("Registry API failed to process response.",response));
                            }
                        }
                    }catch(e){
                        reject(e);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

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

        const resData: any = await queryRegistryRecordApi(
            [query],
            retrieveAspects,
            limit
        );

        if (
            !resData ||
            !resData.records ||
            !resData.records.length
        )
            return null;
        return resData.records;
    }

    const uuidRegEx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

    async function getCkanDatasetMagdaId(ckanIdOrName: string) {
        return await getCkanRecordMagdaId(ckanIdOrName, "ckan-dataset");
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
