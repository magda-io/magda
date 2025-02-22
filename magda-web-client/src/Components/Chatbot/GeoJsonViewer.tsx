import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { Message } from "rsuite";
import { config } from "config";
import { useAsync } from "react-async-hook";
import stripJsonComments from "strip-json-comments";

function generate_init_data(geoJson: any): any {
    const catlogData = {
        initSources: [
            {
                homeCamera: {
                    north: -8,
                    east: 158,
                    south: -45,
                    west: 109
                },
                baseMapName: "Positron (Light)",
                catalog: [
                    {
                        type: "geojson",
                        id: "my-data-id",
                        name: "my query data points",
                        isEnabled: true,
                        zoomOnEnable: true,
                        data: geoJson
                    }
                ]
            }
        ]
    };
    return catlogData;
}

interface GeoJsonViewerProps {
    geoJson: any;
    // if not specified or set to true, it will be assumed that geoJson is a JSON string
    // When set to false, geoJson will be treated as an object
    isJsonString?: boolean;
}

const GeoJsonViewer: FunctionComponent<GeoJsonViewerProps> = ({
    geoJson,
    isJsonString
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function onIframeMessageReceived(e) {
            const iframeWindow = iframeRef?.current?.contentWindow;
            if (!iframeWindow || iframeWindow !== e.source) return;

            if (e.data === "ready") {
                setIsReady(true);
                return;
            } else {
                try {
                    const data = JSON.parse(e.data);
                    if (data?.type === "error") {
                        setError(data.message);
                    }
                } catch (e) {}
            }
        }
        window.addEventListener("message", onIframeMessageReceived);
        return () => {
            window.removeEventListener("message", onIframeMessageReceived);
        };
    });

    useAsync(
        async (isReady, geoJson, isJsonString) => {
            const iframeWindow = iframeRef?.current?.contentWindow;
            if (!isReady || !iframeWindow) {
                return;
            }
            let data = {};
            if (isJsonString !== false) {
                const geoJsonContent = String(geoJson).trim();
                try {
                    data = {};
                    data = JSON.parse(geoJsonContent);
                } catch (e) {
                    try {
                        data = JSON.parse(stripJsonComments(geoJsonContent));
                    } catch (e) {
                        setError(`${e}`);
                        console.warn(
                            "Failed to parse geoJSON: ",
                            e,
                            geoJsonContent
                        );
                    }
                }
            } else {
                data = geoJson;
            }
            const catalogData = generate_init_data(data);
            iframeWindow.postMessage(catalogData, "*");
        },
        [isReady, geoJson, isJsonString]
    );

    return (
        <div>
            {error ? (
                <Message showIcon type="error">
                    {`Failed to render GeoJson: ${error}`}
                </Message>
            ) : (
                <iframe
                    title="GeoJson Viewer"
                    frameBorder={0}
                    ref={iframeRef}
                    src={
                        config.previewMapBaseUrl +
                        "#mode=preview&hideExplorerPanel=1&map=2d"
                    }
                    style={{ width: "100%", height: "500px" }}
                />
            )}
        </div>
    );
};

export default GeoJsonViewer;
