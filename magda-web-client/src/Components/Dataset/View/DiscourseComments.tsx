import React, { FunctionComponent, useRef, useEffect } from "react";
import { config } from "config";
import addTrailingSlash from "@magda/typescript-common/dist/addTrailingSlash.js";
import "./DiscourseComments.scss";

type PropsType = {
    datasetId: string;
    distributionId: string;
    title: string;
    type?: "dataset" | "distribution";
};

// in milseconds, how long time before auto adjust the iframe height according to the content again.
const iframeHeightAdjustInterval = 200;

function renderIframe(
    iframeRef: HTMLIFrameElement | null,
    props: PropsType
): number | null {
    const docRef = iframeRef?.contentWindow?.document;
    if (!docRef) {
        console.error("cannot locate document ref for discourse iframe!");
        return null;
    }
    const type = props.type ? props.type : "dataset";
    const baseUrl = addTrailingSlash(config.baseExternalUrl);
    const discourseUrl = addTrailingSlash(config.discourseSiteUrl!);

    let targetUrl;
    if (type === "dataset") {
        targetUrl = `${baseUrl}dataset/${props.datasetId}`;
    } else {
        targetUrl = `${baseUrl}dataset/${props.datasetId}/distribution/${props.distributionId}`;
    }

    docRef.open();
    docRef.write(`
        <style>
        body {
            margin: 0px;
        }
        </style>
        <div id='discourse-comments'></div>

        <script type="text/javascript">
        window.DiscourseEmbed = { discourseUrl: '${discourseUrl}',
                            discourseEmbedUrl: '${targetUrl}' };

        (function() {
            var d = document.createElement('script'); d.type = 'text/javascript'; d.async = true;
            d.src = window.DiscourseEmbed.discourseUrl + 'javascripts/embed.js';
            (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(d);
        })();
        </script>
    `);
    docRef.close();

    return window.setInterval(() => {
        if (iframeRef?.contentWindow?.document?.body) {
            iframeRef.style.height =
                iframeRef.contentWindow.document.body.scrollHeight + "px";
        }
    }, iframeHeightAdjustInterval);
}

const DiscourseComments: FunctionComponent<PropsType> = (props) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const heightAdjustTimer = useRef<number | null>(null);

    useEffect(() => {
        heightAdjustTimer.current = renderIframe(iframeRef.current, props);
        return () => {
            if (heightAdjustTimer.current) {
                clearInterval(heightAdjustTimer.current);
            }
        };
    }, [props.datasetId, props.distributionId]);

    return (
        <iframe
            className="magda-embedded-discourse-iframe"
            ref={(ref) => (iframeRef.current = ref)}
            title={props.title}
            frameBorder={0}
            width={"100%"}
            height={100}
        ></iframe>
    );
};

export default DiscourseComments;
