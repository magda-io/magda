import React, { FunctionComponent } from "react";
import { config } from "../../config";

interface MarkdownMermaidProps {
    definition: string;
}

const noDataHtml = "<html><body><h1>No data to display...</h1></body></html>";
const MIN_IFRAME_HEIGHT = 500;

function createMermaidHtml(
    definition: string,
    height: number = MIN_IFRAME_HEIGHT
) {
    const graphDefJson = JSON.stringify(definition);
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <base href="${config.uiBaseUrl}">
            <script src="./assets/libs/d3.v6.min.js"></script>
            <script>
            const graphDef = ${graphDefJson};
            </script>
        </head>
        <body>
        <div id="loading-div">Please wait, rendering...</div>
        <div id="graph-container" class="mermaid">&nbsp;</div>
            <script type="module">
            import mermaid from './assets/libs/mermaid/mermaid.esm.min.mjs';
            const loadingDiv = document.querySelector("#loading-div");
            try {
                mermaid.initialize({ 
                    startOnLoad: false, 
                    maxEdges: 999999999999999, 
                    maxTextSize: 999999999999999 
                });
                const el = document.querySelector('#graph-container');
                const { svg: svgData } = await mermaid.render('graph-svg', graphDef, el);
                el.innerHTML = svgData;
                const svgs = d3.selectAll(".mermaid svg");
                svgs.style("min-height", "${height}px");
                svgs.each(function() {
                    const svg = d3.select(this);
                    svg.html("<g>" + svg.html() + "</g>");
                    const inner = svg.select("g");
                    const zoom = d3.zoom().on("zoom", function(event) {
                    inner.attr("transform", event.transform);
                    });
                    svg.call(zoom);
                });
                loadingDiv.remove();
            } catch(e) {
                loadingDiv.innerText = "Error rendering graph: " + e;
            }
            </script>
        </body>
        </html>
    `;
}

const MarkdownMermaid: FunctionComponent<MarkdownMermaidProps> = ({
    definition
}) => {
    const iframeContent = definition
        ? createMermaidHtml(definition)
        : noDataHtml;

    return (
        <div>
            <iframe
                title={"Mermaid Chart Viewer"}
                srcDoc={iframeContent}
                style={{
                    width: "100%",
                    height: `${MIN_IFRAME_HEIGHT + 10}px`,
                    border: "0px"
                }}
            />
        </div>
    );
};

export default MarkdownMermaid;
