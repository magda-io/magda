import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import fetch from "node-fetch";

const saveToContentApi = async (
    fileName: string,
    cssContent: string,
    contentApiUrl: string,
    jwtSecret: string,
    userId: string
) => {
    const res = await fetch(`${contentApiUrl}/${fileName}`, {
        method: "PUT",
        headers: {
            "X-Magda-Session": buildJwt(jwtSecret, userId),
            "Content-type": "text/css"
        },
        body: cssContent
    });
    if (!res.ok) {
        throw new Error(
            `The content API was failed to process the request: ${res.status} ${res.statusText}`
        );
    }

    try {
        const resData = (await res.json()) as any;
        if (resData?.result !== "SUCCESS") {
            throw new Error(
                "The content API was failed to process the request."
            );
        }
        return true;
    } catch (e) {
        throw new Error(
            `The content API was failed to process the request: ${res.status} ${res.statusText}`
        );
    }
};

export default saveToContentApi;
