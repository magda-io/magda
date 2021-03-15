import { Router, Request } from "express";
import shouldRenderCrawlerView from "./shouldRenderCrawlerView";
import { safeLoadFront } from "yaml-front-matter";
import datasetView from "./cralwerViews/dataset";
import commonView from "./cralwerViews/commonView";
import RegistryClient from "magda-typescript-common/src/registry/RegistryClient";
import { MAGDA_TENANT_ID_HEADER } from "magda-typescript-common/src/registry/TenantConsts";

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

    return router;
};

export default createCralwerViewRouter;
