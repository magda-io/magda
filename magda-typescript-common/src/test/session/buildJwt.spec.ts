import { expect } from "chai";
import "mocha";
import * as yargs from "yargs";
import addJwtSecretFromEnvVar from "../../session/addJwtSecretFromEnvVar";
import { getUserId } from "../../session/GetUserId";
import { getUserSession } from "../../session/GetUserSession";
import buildJwt from "../../session/buildJwt";
const { mockRequest } = require("mock-req-res");

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
        const jwtToken = buildJwt(argv.jwtSecret, aUserId);

        const req = mockRequest({
            header(name: string) {
                if (name === "X-Magda-Session") return jwtToken;
                else return null;
            }
        });

        const actual = getUserId(req, argv.jwtSecret).valueOr("wrong answer");
        expect(actual).to.be.equal(aUserId);
    });

    it("should get user session", function() {
        const aUserId = "aTestUserId";
        const groups = ["G1", "G2"];
        const session = { session: { esriGroups: groups } };
        const jwtToken = buildJwt(argv.jwtSecret, aUserId, session);

        const req = mockRequest({
            header(name: string) {
                if (name === "X-Magda-Session") return jwtToken;
                else return null;
            }
        });

        const actual = getUserSession(req, argv.jwtSecret).valueOr({});
        expect(actual.session.esriGroups).to.be.deep.equal(groups);
    });

    it("should create jwt token", function() {
        const sessions = [
            {
                session: {
                    esriGroups: [
                        "Dep. A",
                        "Branch A, Dep. A",
                        "Branch B, Dep. A",
                        "Section C, Branch B, Dep. A"
                    ]
                }
            },
            { session: { esriGroups: ["Branch A, Dep. A"] } },
            {
                session: {
                    esriGroups: [
                        "Branch B, Dep. A",
                        "Section C, Branch B, Dep. A"
                    ]
                }
            },
            { session: { esriGroups: ["Section C, Branch B, Dep. A"] } }
        ];

        const userIds = [
            "00000000-0000-1000-0000-000000000000",
            "00000000-0000-1000-0001-000000000000",
            "00000000-0000-1000-0002-000000000000",
            "00000000-0000-1000-0003-000000000000"
        ];

        for (var i = 0; i < userIds.length; i++) {
            let userId = userIds[i];
            let session = sessions[i];
            let jwtToken = buildJwt(argv.jwtSecret, userId, session);
            console.log(`i: ${i}; \njwt: ${jwtToken}`);
        }
    });
});
