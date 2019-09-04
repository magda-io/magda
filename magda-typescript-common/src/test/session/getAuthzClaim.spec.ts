import { expect } from "chai";
import "mocha";
import * as yargs from "yargs";
import addJwtSecretFromEnvVar from "../../session/addJwtSecretFromEnvVar";
import * as GetUserId from "../../session/GetUserId";
import * as GetUserGroups from "../../session/GetUserGroups";
const { mockRequest } = require("mock-req-res");
const jwt = require("jsonwebtoken");

describe("Get authz claim from jwt token", () => {
    const argv = addJwtSecretFromEnvVar(
        yargs
            .config()
            .help()
            .option("jwtSecret", {
                describe:
                    "The secret to use to sign JSON Web Token (JWT) for authenticated requests.",
                type: "string"
            }).argv
    );

    it("should get userId", function() {
        const aUserId = "aTestUserId";
        const payload = `{"userId": "${aUserId}"}`;
        const jwtToken = jwt.sign(payload, argv.jwtSecret);

        const req = mockRequest({
            header(name: string) {
                if (name === "X-Magda-Session") return jwtToken;
                else return null;
            }
        });

        const actual = GetUserId.getUserId(req, argv.jwtSecret).valueOr(
            "wrong answer"
        );
        expect(actual).to.be.equal(aUserId);
    });

    it("should get user groups", function() {
        const aUserId = "aTestUserId";
        const groups = ["G1", "G2"];
        const payload = {
            userId: aUserId,
            groups: groups
        };

        const jwtToken = jwt.sign(payload, argv.jwtSecret);

        const req = mockRequest({
            header(name: string) {
                if (name === "X-Magda-Session") return jwtToken;
                else return null;
            }
        });

        const actual = GetUserGroups.getUserGroups(req, argv.jwtSecret).valueOr(
            []
        );
        expect(actual).to.be.deep.equal(groups);
    });
});
