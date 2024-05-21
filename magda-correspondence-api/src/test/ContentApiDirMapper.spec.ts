import {} from "mocha";
import { expect } from "chai";
import nock from "nock";
import ContentApiDirMapper from "../ContentApiDirMapper.js";

const CONTENT_API_URL: string = "https://content-api.example.com";
const userId = "a3ed2cb6-9d5a-4689-a080-a09cf060d93a";
const jwtSecret = "408e19bf-3a2b-4701-a2c8-3b81508ef810";

describe("ContentApiDirMapper", function (this) {
    let contentDirMapper: ContentApiDirMapper;
    let contentApi: nock.Scope;

    this.beforeEach(() => {
        nock.cleanAll();
        nock.disableNetConnect();
        contentApi = nock(CONTENT_API_URL);
        contentDirMapper = new ContentApiDirMapper(
            CONTENT_API_URL,
            userId,
            jwtSecret
        );
    });

    this.afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it("Should conclude none-existence of resource when receive 404", async () => {
        contentApi.head("/emailTemplates/assets/top-left-logo.jpg").reply(404);
        const r = await contentDirMapper.fileExist(
            "emailTemplates/assets/top-left-logo.jpg"
        );
        expect(r).to.be.false;
    });

    it("Should throw an error when receive 500", async () => {
        contentApi
            .head("/emailTemplates/assets/top-left-logo.jpg")
            .reply(500, "Internal Server Error");
        try {
            await contentDirMapper.fileExist(
                "emailTemplates/assets/top-left-logo.jpg"
            );
            expect.fail("Should throw an error when receive 500 response");
        } catch (e) {
            expect((e as Error).message).to.equal(
                "Failed to check file existence from https://content-api.example.com/emailTemplates/assets/top-left-logo.jpg: 500 "
            );
        }
    });

    it("Should conclude existence of resource when receive 200 or 202", async () => {
        contentApi.head("/emailTemplates/assets/top-left-logo.jpg").reply(200);
        contentApi.head("/emailTemplates/assets/top-left-logo2.jpg").reply(202);
        let r = await contentDirMapper.fileExist(
            "emailTemplates/assets/top-left-logo.jpg"
        );
        expect(r).to.be.true;
        r = await contentDirMapper.fileExist(
            "emailTemplates/assets/top-left-logo2.jpg"
        );
        expect(r).to.be.true;
    });
});
