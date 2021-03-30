import React, { FunctionComponent, useRef, useEffect } from "react";
import { config } from "config";
import addTrailingSlash from "@magda/typescript-common/dist/addTrailingSlash";
import "./DiscourseComments.scss";

type PropsType = {
    datasetId: string;
    distributionId: string;
    title: string;
    type?: "dataset" | "distribution";
};

function renderIframe(docRef: Document, props: PropsType) {
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
}

const DiscourseComments: FunctionComponent<PropsType> = (props) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    useEffect(() => {
        const iframeDocRef = iframeRef?.current?.contentWindow?.document;
        if (iframeDocRef) {
            renderIframe(iframeDocRef, props);
        } else {
            console.error("iframeDocRef is not available!");
        }
    }, [props.datasetId, props.distributionId]);

    return (
        <iframe
            className="magda-embedded-discourse-iframe"
            ref={(ref) => (iframeRef.current = ref)}
            title={props.title}
            frameBorder={0}
            width={600}
            height={500}
        ></iframe>
    );
};

export default DiscourseComments;
