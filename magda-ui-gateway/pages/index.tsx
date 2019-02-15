import React from "react";
import fetch from "isomorphic-fetch";

type Props = {
    headerText?: string;
};

class Home extends React.Component<Props> {
    // state = {} as {
    //     headerText?: string;
    // };

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
        const response = await fetch("http://localhost:3001/header");
        const text = await response.text();

        const doc = await (typeof window !== "undefined"
            ? parseHtmlBrowser(text)
            : parseHtmlNode(text));

        return {
            headerText: doc.body.innerHTML
        };
    }

    render() {
        return (
            <div>
                {this.props.headerText && (
                    <header
                        dangerouslySetInnerHTML={{
                            __html: this.props.headerText
                        }}
                    />
                )}
                <div>body</div>
            </div>
        );
    }
}

export default Home;
