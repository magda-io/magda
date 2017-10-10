const jwt = require("jsonwebtoken");
import * as nock from "nock";
import { Test, Response } from "supertest";

export { Response };

export default function mockAuthorization(
    adminApiUrl: string,
    isAdmin: boolean,
    req: Test
): Promise<Response> {
    const userId = "1";
    const scope = nock(adminApiUrl);
    scope.get(`/private/users/${userId}`).reply(200, { isAdmin });

    const id = jwt.sign(
        { userId: userId },
        process.env.JWT_SECRET || process.env.npm_package_config_JWT_SECRET
    );

    return req.set("X-Magda-Session", id).then(res => {
        scope.done();
        return res;
    });
}
