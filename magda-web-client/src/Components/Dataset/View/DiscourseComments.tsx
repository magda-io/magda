import React, { FunctionComponent, useRef, useEffect } from "react";
import "./DiscourseComments.scss";

type PropsType = {
    id: string;
    title: string;
};

function renderIframe(docRef: Document, props: PropsType) {
    docRef.open();
    docRef.write(`
        <div id='discourse-comments'></div>

        <script type="text/javascript">
        window.DiscourseEmbed = { discourseUrl: 'https://discourse.minikube.com/',
                            discourseEmbedUrl: 'https://www.w3schools.com/jsref/met_doc_write.asp' };

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
    }, [props.id]);

    return (
        <iframe
            ref={(ref) => (iframeRef.current = ref)}
            title={props.title}
            frameBorder={0}
            width={600}
            height={500}
        ></iframe>
    );
};

export default DiscourseComments;
