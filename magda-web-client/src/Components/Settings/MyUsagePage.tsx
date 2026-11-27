import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import {
    describeUsageError,
    getMyDailyUsage,
    getMyUsage
} from "api-clients/LlmServicesApis";
import { DailyUsageHistory, UsageReportView } from "./UsageReport";
import "./main.scss";

export const MY_USAGE_PATH = "/settings/llm-services/my-usage";

/**
 * My Usage (UI doc): the signed-in user's own usage and remaining quota. The
 * user comes from the session, never from the page (API-7).
 */
const MyUsagePage: FunctionComponent = () => {
    const { result: report, loading, error, execute } = useAsync(
        async () => getMyUsage(),
        []
    );

    return (
        <div className="flex-main-container setting-page-main-container my-usage-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={[{ title: "My LLM Usage" }]} />
                <h1 className="sr-only">My LLM Usage</h1>
                {error ? (
                    <Message
                        showIcon
                        type="error"
                        header="Unable to load your usage"
                    >
                        <p>{describeUsageError(error)}</p>
                        <Button appearance="link" onClick={() => execute()}>
                            Retry
                        </Button>
                    </Message>
                ) : loading || !report ? (
                    <Loader content="Loading your usage…" />
                ) : (
                    <>
                        <UsageReportView report={report} subject="self" />
                        <DailyUsageHistory
                            load={getMyDailyUsage}
                            models={report.models.map((m) => m.modelAlias)}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default MyUsagePage;
