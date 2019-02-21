import React from "react";
import fetch from "isomorphic-fetch";
import { Script } from "vm";
import { node } from "prop-types";

type Props = {
    headerText?: string;
    scripts: string;
};
declare global {
    namespace JSX {
        interface IntrinsicElements {
            "x-heyo": any;
            slot: any;
        }
    }
}

const SOURCE_URL = "http://localhost:3001/header";
// const SOURCE_URL = "https://nationalmap.gov.au";
class MicroFrontend extends React.Component<Props> {
    state = { isClient: false } as {
        isClient: boolean;
    };

    static async getInitialProps(ctx: any) {
        async function parseHtmlNode(html: string): Promise<Document> {
            const { JSDOM } = await import("jsdom");

            const { document: doc } = new JSDOM(html).window;

            return doc;
        }

        async function parseHtmlBrowser(html: string): Promise<Document> {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            return doc;
        }
        const response = await fetch(SOURCE_URL);
        const text = await response.text();

        const doc = await (typeof window !== "undefined"
            ? parseHtmlBrowser(text)
            : parseHtmlNode(text));

        const scripts = [];
        const scriptTags = doc.querySelectorAll("script");

        scriptTags.forEach(script => {
            const newScript = {} as any;

            for (let i = 0; i < script.attributes.length; i++) {
                const attr = script.attributes.item(i);

                if (attr.value) {
                    newScript[attr.name] = attr.value;
                }
            }

            // if (script.src && script.src !== "") {
            //     newScript.src = SOURCE_URL + "/" + script.src;
            // }

            newScript.innerHTML = script.innerHTML;

            scripts.push(newScript);
        });

        scriptTags.forEach(script => script.parentElement.removeChild(script));

        return {
            headerText: doc.body.innerHTML, // + "\n" + scriptString
            scripts
        };
    }

    componentDidMount() {
        this.setState({
            isClient: true
        });
    }

    // onRefAdded = (element: HTMLDivElement) => {
    //     if (element) {
    //         const scripts = element.querySelectorAll("script");

    //         scripts.forEach(script => {
    //             const newScript = document.createElement("script");
    //             script.text = script.innerHTML;
    //             for (var i = script.attributes.length - 1; i >= 0; i--) {
    //                 newScript.setAttribute(
    //                     script.attributes[i].name,
    //                     script.attributes[i].value
    //                 );
    //             }
    //             script.parentNode.replaceChild(newScript, script);
    //             console.log(`replaced ${newScript.src}`);
    //         });
    //     }
    // };

    render() {
        return (
            <div
                dangerouslySetInnerHTML={{
                    __html: this.props.headerText
                }}
            />
        );
    }
}

export default MicroFrontend;
