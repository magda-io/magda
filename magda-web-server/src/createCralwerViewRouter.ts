import { Router, Request } from "express";
import shouldRenderCrawlerView from "./shouldRenderCrawlerView.js";
import datasetView from "./cralwerViews/dataset.js";
import distributionView from "./cralwerViews/distribution.js";
import commonView from "./cralwerViews/commonView.js";
import RegistryClient from "magda-typescript-common/src/registry/RegistryClient.js";
import { MAGDA_TENANT_ID_HEADER } from "magda-typescript-common/src/registry/TenantConsts.js";
import * as yamlFrontMatter from "yaml-front-matter";
const { safeLoadFront } = yamlFrontMatter;

type OptionType = {
    enableDiscourseSupport: boolean;
    baseUrl: string;
    registryApiBaseUrl: string;
};

function getTenantIdFromReq(req: Request) {
    return req.headers[MAGDA_TENANT_ID_HEADER.toLowerCase()]
        ? req.headers[MAGDA_TENANT_ID_HEADER.toLowerCase()]
        : 0;
}

const createCralwerViewRouter = ({
    enableDiscourseSupport,
    registryApiBaseUrl,
    baseUrl
}: OptionType) => {
    const router: Router = Router();

    router.get("/dataset/:datasetId", async (req, res, next) => {
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
            const content = safeLoadFront(datasetView(datasetData, baseUrl));
            res.send(commonView(content as any));
        } catch (e) {
            console.warn(
                `Failed to producing cralwer view for datasetId \`${datasetId}\`: ${
                    "" + e
                } \nSkip to forwarding req to browser view.`
            );
            return next();
        }
    });

    router.get(
        "/dataset/:datasetId/distribution/:distributionId",
        async (req, res, next) => {
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
                if (
                    !shouldRenderCrawlerView(uaHeader, enableDiscourseSupport)
                ) {
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
                    distributionView(distributionData, datasetData, baseUrl)
                );
                res.send(commonView(content as any));
            } catch (e) {
                console.warn(
                    `Failed to producing cralwer view for distributionId \`${distributionId}\`: ${
                        "" + e
                    } \nSkip to forwarding req to browser view.`
                );
                return next();
            }
        }
    );

    return router;
};

export default createCralwerViewRouter;
