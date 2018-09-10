import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import * as request from "request";

const saveToContentApi = (
    cssContent: string,
    contentApiUrl: string,
    jwtSecret: string,
    userId: string
) => {
    return new Promise((resolve, reject) => {
        request(
            `${contentApiUrl}/stylesheet`,
            {
                method: "POST",
                headers: {
                    "X-Magda-Session": buildJwt(jwtSecret, userId),
                    "Content-type": "text/css"
                },
                body: cssContent
            },
            (err, httpResponse, body) => {
                try {
                    if (err) {
                        throw err;
                    } else {
                        try {
                            const res = JSON.parse(body);
                            if (res.result === "SUCCESS") {
                                resolve(true);
                            } else {
                                throw new Error(
                                    "The content API was failed to process the request."
                                );
                            }
                        } catch (e) {
                            throw new Error(body);
                        }
                    }
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
};

export default saveToContentApi;
