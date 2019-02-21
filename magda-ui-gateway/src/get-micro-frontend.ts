import fetch from "isomorphic-fetch";

export default async function getMicroFrontend(sourceUrl: string) {
    const isClient = typeof window !== "undefined";

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
    const response = await fetch(
        sourceUrl + (isClient ? "&render=false" : "&render=false")
    );
    const text = await response.text();

    const doc = await (typeof window !== "undefined"
        ? parseHtmlBrowser(text)
        : parseHtmlNode(text));

    // const scripts: any[] = [];
    // const scriptTags = doc.querySelectorAll("script");

    // scriptTags.forEach(script => {
    //     const newScript = {} as any;

    //     for (let i = 0; i < script.attributes.length; i++) {
    //         const attr = script.attributes.item(i);

    //         if (attr && attr.value) {
    //             newScript[attr.name] = attr.value;
    //         }
    //     }

    //     // if (script.src && script.src !== "") {
    //     //     newScript.src = SOURCE_URL + "/" + script.src;
    //     // }

    //     newScript.innerHTML = script.innerHTML;

    //     scripts.push(newScript);
    // });

    // if (isClient) {
    //     scriptTags.forEach(script => script.parentElement!.removeChild(script));
    // }

    return {
        html: doc.body.innerHTML
        // scripts
    };
}
