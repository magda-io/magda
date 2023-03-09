import {} from "mocha";
import sinon from "sinon";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import yargs from "yargs";
import addJwtSecretFromEnvVar from "../session/addJwtSecretFromEnvVar";
import mockAuthApiHost from "./mockAuthApiHost";
import ApiClient from "../authorization-api/ApiClient";
import mockUserDataStore from "./mockUserDataStore";
import urijs from "urijs";

chai.use(chaiAsPromised);
const expect = chai.expect;

const mockUserData = mockUserDataStore.getData();

describe("Test ApiClient.ts", function () {
    const argv = addJwtSecretFromEnvVar(
        yargs
            .config()
            .help()
            .option("authorizationApi", {
                describe: "The base URL of the authorization API.",
                type: "string",
                default: "http://localhost:6104/v0"
            })
            .option("jwtSecret", {
                describe:
                    "The secret to use to sign JSON Web Token (JWT) for authenticated requests.  This can also be specified with the JWT_SECRET environment variable.",
                type: "string"
            })
            .option("userId", {
                describe:
                    "The user id to use when making authenticated requests to the registry",
                type: "string",
                demand: true,
                default:
                    process.env.USER_ID || process.env.npm_package_config_userId
            }).argv
    );

    const mockHost = new mockAuthApiHost(
        argv.authorizationApi,
        argv.jwtSecret,
        argv.userId
    );

    beforeEach(function () {
        sinon.stub(console, "error").callsFake(() => {});
        sinon.stub(console, "warn").callsFake(() => {});
        mockHost.start();
    });

    afterEach(function () {
        (console.error as any).restore();
        (console.warn as any).restore();
        mockHost.stop();
    });

    it("`lookupUser` should throw 'Unauthorised' error if called without specifying source or sourceId", async function () {
        const api = new ApiClient(argv.authorizationApi);
        try {
            await api.lookupUser(undefined, "testuser");
            expect.fail("expect an error thrown");
        } catch (e) {}
        try {
            await api.lookupUser("testsource", undefined);
            expect.fail("expect an error thrown");
        } catch (e) {}
    });

    it("`lookupUser` should request /public/users API with correct query parameters", async function () {
        const api = new ApiClient(argv.authorizationApi);
        let hasCalled = false;
        mockHost.scope
            .get("/public/users")
            .query(true)
            .reply(function (this: any, uri, requestBody) {
                const parsedUri = urijs(uri);
                const queries = parsedUri.search(true);
                expect(queries).to.have.property("source", "source1");
                expect(queries).to.have.property("sourceId", "testuser");
                expect(queries).to.have.property("limit", "1");
                hasCalled = true;
                return [200, JSON.stringify([{ id: "xxx1" }])];
            });

        const user = await api.lookupUser("source1", "testuser");

        expect(user.valueOrThrow()).to.have.property("id", "xxx1");
        expect(hasCalled).to.be.true;
    });

    it("`getUser` should return 'Unauthorised' error if called without sepecifying user ID", async function () {
        const api = new ApiClient(argv.authorizationApi);
        return expect(
            api.getUser(mockUserData[1].id)
        ).to.eventually.rejectedWith("Unauthorised");
    });

    it("`getUser` should return 'Can only be accessed by Admin users' error if called as a standard user", async function () {
        const api = new ApiClient(
            argv.authorizationApi,
            argv.jwtSecret,
            mockUserData[1].id
        );
        return expect(api.getUser(mockUserData[1].id)).eventually.rejectedWith(
            "Can only be accessed by Admin users"
        );
    });

    it("`getUser` should return the correct test user record if called as admin user", async function () {
        const api = new ApiClient(
            argv.authorizationApi,
            argv.jwtSecret,
            argv.userId
        );
        const data = (await api.getUser(mockUserData[1].id)).valueOr(null);
        expect(data).to.deep.equal(mockUserData[1]);
    });

    const newUserDataToBeInserted = {
        displayName: "Test User2",
        email: "test@test.com",
        photoURL: "http://example.com",
        source: "manual",
        sourceId: "2",
        isAdmin: false
    };

    it(`\`createUser\` should return 'Encountered error 401 when POSTing new user to ${argv.authorizationApi}' error if called without sepecifying user ID`, async function () {
        const api = new ApiClient(argv.authorizationApi);
        return expect(
            api.createUser(newUserDataToBeInserted)
        ).to.eventually.rejectedWith(
            "Encountered error 401: Unauthorised when creating new user to http://localhost:6104/v0/public/users"
        );
    });

    it(`\`createUser\` should return 'Encountered error 403 when POSTing new user to ${argv.authorizationApi}' error if called as a standard user`, async function () {
        const api = new ApiClient(
            argv.authorizationApi,
            argv.jwtSecret,
            mockUserData[1].id
        );
        return expect(
            api.createUser(newUserDataToBeInserted)
        ).to.eventually.rejectedWith(
            "Encountered error 403: Can only be accessed by Admin users when creating new user to http://localhost:6104/v0/public/users"
        );
    });

    let newlyCreatedUserId: string = null;

    it("`createUser` should return the new user data if called as admin user", async function () {
        const api = new ApiClient(
            argv.authorizationApi,
            argv.jwtSecret,
            argv.userId
        );
        const newUser = await api.createUser(newUserDataToBeInserted);
        expect(newUser).to.have.property("id");
        expect(newUser.id).to.be.a("string");
        expect(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(
                newUser.id
            )
        ).to.be.true;
        newlyCreatedUserId = newUser.id;
        expect(newUser).to.deep.equal({
            ...newUserDataToBeInserted,
            id: newUser.id
        });
    });

    it("After `createUser` call, the same user record should be able to retrieved via `getUser`", async function () {
        if (!newlyCreatedUserId) {
            this.skip();
            return;
        }
        const api = new ApiClient(
            argv.authorizationApi,
            argv.jwtSecret,
            argv.userId
        );
        const user: any = (await api.getUser(newlyCreatedUserId)).valueOrThrow(
            null
        );
        expect(user).to.deep.equal({
            ...newUserDataToBeInserted,
            id: newlyCreatedUserId
        });
    });
});
