const jwt = require("jsonwebtoken");
import * as nock from "nock";
import { Request, Response } from "superagent";

export { Response };

export default function mockAuthorization(
    adminApiUrl: string,
    isAdmin: boolean,
    jwtSecret: string,
    req: Request
) {
    const userId = "1";
    const scope = nock(adminApiUrl);
    scope.get(`/private/users/${userId}`).reply(200, { isAdmin });

    const id = jwt.sign({ userId: userId }, jwtSecret);

    return req.set("X-Magda-Session", id).then(res => {
        scope.done();
        return res;
    });
}
