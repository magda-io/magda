import React, { FunctionComponent, useState } from "react";
import { Message } from "rsuite";
import { useAsync } from "react-async-hook";
import stripJsonComments from "strip-json-comments";
import loadEcharts from "../../libs/loadEcharts";
import { parse } from "partial-json";

interface EchartsViewerProps {
    configJson: any;
    // if not specified or set to true, it will be assumed that configJson is a JSON string
    // When set to false, configJson will be treated as an object
    isJsonString?: boolean;
}

const EchartsViewer: FunctionComponent<EchartsViewerProps> = ({
    configJson,
    isJsonString
}) => {
    const [error, setError] = useState<string | null>(null);

    const {
        loading: loadingEcharts,
        result: ReactEcharts
    } = useAsync(async () => {
        try {
            return await loadEcharts();
        } catch (e) {
            reportError(`Failed to fetch initial value: ${e}`);
            return undefined;
        }
    }, []);

    const { result: chartOptions, loading: chartOptionLoading } = useAsync(
        async (configJson, isJsonString) => {
            let data: any = {};
            if (isJsonString !== false) {
                const configJsonContent = String(configJson).trim();
                try {
                    data = {};
                    data = parse(configJsonContent);
                } catch (e) {
                    try {
                        data = parse(stripJsonComments(configJsonContent));
                    } catch (e) {
                        setError(`${e}`);
                        console.warn(
                            "Failed to parse echarts config json: ",
                            e,
                            configJsonContent
                        );
                    }
                }
            } else {
                data = configJson;
            }
            if (!data) {
                setError("failed to create chart!");
            }
            return data;
        },
        [configJson, isJsonString]
    );

    return (
        <div className="markdown-echarts-block">
            {loadingEcharts || chartOptionLoading || !ReactEcharts ? (
                "loading..."
            ) : (
                <>
                    {error ? (
                        <Message showIcon type="error">
                            {`Failed to render echarts config JSON: ${error}`}
                        </Message>
                    ) : (
                        <ReactEcharts
                            style={{ height: "450px", color: "yellow" }}
                            lazyUpdate={true}
                            option={chartOptions}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default EchartsViewer;
