import { Router } from "express";
import getAbsoluteUrl from "magda-typescript-common/src/getAbsoluteUrl.js";
import shouldRenderCrawlerView from "./shouldRenderCrawlerView.js";
import datasetView from "./crawlerViews/dataset.js";
import distributionView from "./crawlerViews/distribution.js";
import commonView from "./crawlerViews/commonView.js";
import RegistryClient from "magda-typescript-common/src/registry/RegistryClient.js";
import { MAGDA_TENANT_ID_HEADER } from "magda-typescript-common/src/registry/TenantConsts.js";
import yamlFrontMatter from "yaml-front-matter";
import QueryString from "qs";
import { Request, Response, NextFunction } from "express-serve-static-core";
const { safeLoadFront } = yamlFrontMatter;

type OptionType = {
    enableDiscourseSupport: boolean;
    uiBaseUrl: string;
    baseExternalUrl: string;
    registryApiBaseUrl: string;
};

function getTenantIdFromReq(req: Request) {
    return req.headers[MAGDA_TENANT_ID_HEADER.toLowerCase()]
        ? req.headers[MAGDA_TENANT_ID_HEADER.toLowerCase()]
        : 0;
}

const createCrawlerViewRouter = ({
    enableDiscourseSupport,
    registryApiBaseUrl,
    uiBaseUrl,
    baseExternalUrl
}: OptionType) => {
    const router: Router = Router();
    const sitemapUrl = `${getAbsoluteUrl(
        uiBaseUrl,
        baseExternalUrl ? baseExternalUrl : "/"
    )}sitemap.xml`;

    async function datasetViewHandler(
        req: Request<
            {
                datasetId: string;
            },
            any,
            any,
            QueryString.ParsedQs,
            Record<string, any>
        >,
        res: Response<any, Record<string, any>, number>,
        next: NextFunction
    ) {
        const datasetId = req?.params?.datasetId;
        if (typeof datasetId !== "string" || !datasetId) {
            return next();
        }
        try {
            const uaHeader = req?.headers?.["user-agent"];
            if (!shouldRenderCrawlerView(uaHeader, enableDiscourseSupport)) {
                // forward to browser view
                return next();
            }
            const registryClient = new RegistryClient({
                baseUrl: registryApiBaseUrl,
                tenantId: getTenantIdFromReq(req) as number
            });
            const datasetData = await registryClient.getRecord(
                datasetId,
                ["dcat-dataset-strings"],
                [
                    "dcat-distribution-strings",
                    "dataset-distributions",
                    "dataset-publisher"
                ],
                true
            );
            if (datasetData instanceof Error) {
                throw datasetData;
            }
            const content = safeLoadFront(datasetView(datasetData, uiBaseUrl));
            res.send(
                commonView({
                    ...content,
                    sitemapUrl,
                    canonicalUrl: getAbsoluteUrl(
                        `${uiBaseUrl}dataset/${datasetId}`,
                        baseExternalUrl
                    )
                })
            );
        } catch (e) {
            console.warn(
                `Failed to producing crawler view for datasetId \`${datasetId}\`: ${
                    "" + e
                } \nSkip to forwarding req to browser view.`
            );
            return next();
        }
    }

    router.get("/dataset/:datasetId", datasetViewHandler);
    router.get("/dataset/:datasetId/details", datasetViewHandler);

    async function distributionViewHandler(
        req: Request<
            {
                datasetId: string;
            } & {
                distributionId: string;
            },
            any,
            any,
            QueryString.ParsedQs,
            Record<string, any>
        >,
        res: Response<any, Record<string, any>, number>,
        next: NextFunction
    ) {
        const datasetId = req?.params?.datasetId;
        const distributionId = req?.params?.distributionId;
        if (
            typeof datasetId !== "string" ||
            !datasetId ||
            typeof distributionId !== "string" ||
            !distributionId
        ) {
            return next();
        }
        try {
            const uaHeader = req?.headers?.["user-agent"];
            if (!shouldRenderCrawlerView(uaHeader, enableDiscourseSupport)) {
                // forward to browser view
                return next();
            }
            const registryClient = new RegistryClient({
                baseUrl: registryApiBaseUrl,
                tenantId: getTenantIdFromReq(req) as number
            });
            const datasetData = await registryClient.getRecord(
                datasetId,
                ["dcat-dataset-strings"],
                ["dcat-distribution-strings", "dataset-publisher"],
                true
            );
            if (datasetData instanceof Error) {
                throw datasetData;
            }

            const distributionData = await registryClient.getRecord(
                distributionId,
                ["dcat-distribution-strings"],
                ["dataset-format"],
                true
            );
            if (distributionData instanceof Error) {
                throw distributionData;
            }

            const content = safeLoadFront(
                distributionView(distributionData, datasetData, uiBaseUrl)
            );
            res.send(
                commonView({
                    ...content,
                    sitemapUrl,
                    canonicalUrl: getAbsoluteUrl(
                        `${uiBaseUrl}dataset/${datasetId}/distribution/${distributionId}`,
                        baseExternalUrl
                    )
                })
            );
        } catch (e) {
            console.warn(
                `Failed to producing crawler view for distributionId \`${distributionId}\`: ${
                    "" + e
                } \nSkip to forwarding req to browser view.`
            );
            return next();
        }
    }

    router.get(
        "/dataset/:datasetId/distribution/:distributionId",
        distributionViewHandler
    );
    router.get(
        "/dataset/:datasetId/distribution/:distributionId/details",
        distributionViewHandler
    );

    return router;
};

export default createCrawlerViewRouter;
