import {
    queryAccessGroupUsers,
    queryAccessGroupUsersCount,
    canManageAccessGroup
} from "./AuthApis";
import getRequest from "../helpers/getRequest";

jest.mock("../config", () => ({
    config: {
        authApiBaseUrl: "https://example.test/api/v0/auth/",
        registryApiReadOnlyBaseUrl: "https://example.test/api/v0/registry/"
    }
}));
jest.mock("../helpers/getRequest", () => ({
    __esModule: true,
    default: jest.fn()
}));

const mockGetAuthDecision = jest.fn();
jest.mock(
    "@magda/typescript-common/dist/opa/AuthDecisionQueryClient.js",
    () => ({
        __esModule: true,
        // a plain class: CRA's jest config resets mock implementations before each test
        default: class {
            getAuthDecision(...args: any[]) {
                return mockGetAuthDecision(...args);
            }
        }
    })
);

const mockGetRequest = getRequest as jest.Mock;
const groupId = "access-group/team & research";
const usersUrl =
    "https://example.test/api/v0/auth/accessGroups/access-group%2Fteam%20&%20research/users";

beforeEach(() => mockGetRequest.mockReset());

describe("access group member queries", () => {
    it("lists members via the encoded group endpoint with filters and pagination", async () => {
        const users = [{ id: "user-1", displayName: "Researcher" }];
        mockGetRequest.mockResolvedValue(users);
        const params = {
            keyword: "Research & data",
            id: "user-1",
            source: "local",
            orgUnitId: "org-1",
            sourceId: "researcher",
            offset: 10,
            limit: 20,
            noCache: true
        };

        expect(await queryAccessGroupUsers(groupId, params)).toBe(users);
        const [url, noCache] = mockGetRequest.mock.calls[0];
        const parsedUrl = new URL(url);
        expect(url.split("?")[0]).toBe(usersUrl);
        expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({
            keyword: params.keyword,
            id: params.id,
            source: params.source,
            orgUnitId: params.orgUnitId,
            sourceId: params.sourceId,
            offset: "10",
            limit: "20"
        });
        expect(noCache).toBe(true);
    });

    it("counts members via the group endpoint with the same filters", async () => {
        mockGetRequest.mockResolvedValue({ count: 12 });

        expect(
            await queryAccessGroupUsersCount(groupId, {
                keyword: "Research & data",
                source: "local",
                noCache: true
            })
        ).toBe(12);
        const [url, noCache] = mockGetRequest.mock.calls[0];
        expect(url.split("?")[0]).toBe(`${usersUrl}/count`);
        expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
            keyword: "Research & data",
            source: "local"
        });
        expect(noCache).toBe(true);
    });

    it("allows both queries without optional parameters", async () => {
        mockGetRequest.mockResolvedValueOnce([]).mockResolvedValueOnce({
            count: 0
        });

        expect(await queryAccessGroupUsers(groupId)).toEqual([]);
        expect(await queryAccessGroupUsersCount(groupId)).toBe(0);
        expect(mockGetRequest.mock.calls).toEqual([
            [usersUrl, undefined],
            [`${usersUrl}/count`, undefined]
        ]);
    });

    it("passes an explicit cache preference to both queries", async () => {
        mockGetRequest.mockResolvedValueOnce([]).mockResolvedValueOnce({
            count: 0
        });

        await queryAccessGroupUsers(groupId, { noCache: false });
        await queryAccessGroupUsersCount(groupId, { noCache: false });
        expect(mockGetRequest.mock.calls).toEqual([
            [usersUrl, false],
            [`${usersUrl}/count`, false]
        ]);
    });

    it.each([undefined, {}, { count: 0 }])(
        "returns zero for an empty count response (%p)",
        async (response) => {
            mockGetRequest.mockResolvedValue(response);
            expect(await queryAccessGroupUsersCount(groupId)).toBe(0);
        }
    );

    it("propagates request errors rather than treating denied access as an empty group", async () => {
        const error = new Error("Forbidden");
        mockGetRequest.mockRejectedValue(error);
        await expect(queryAccessGroupUsers(groupId)).rejects.toBe(error);
        await expect(queryAccessGroupUsersCount(groupId)).rejects.toBe(error);
    });
});

describe("canManageAccessGroup", () => {
    const record = {
        id: "group-1",
        aspects: {
            "access-group-details": {
                name: "A group",
                resourceUri: "object/record"
            },
            "access-control": {
                ownerId: "user-1",
                preAuthorisedPermissionIds: [] as string[]
            }
        }
    };

    beforeEach(() => mockGetAuthDecision.mockReset());

    it("asks for object/accessGroup/update with the group record as input.object.accessGroup", async () => {
        mockGetRequest.mockResolvedValue(record);
        mockGetAuthDecision.mockResolvedValue({
            hasResidualRules: false,
            result: true
        });
        expect(await canManageAccessGroup("group-1")).toBe(true);
        expect(mockGetRequest.mock.calls[0][0].split("?")[0]).toBe(
            "https://example.test/api/v0/registry/records/group-1"
        );
        expect(mockGetAuthDecision).toHaveBeenCalledWith({
            operationUri: "object/accessGroup/update",
            input: {
                object: {
                    accessGroup: { id: "group-1", ...record.aspects }
                }
            }
        });
    });

    it("is false for a conditional or false decision", async () => {
        mockGetRequest.mockResolvedValue(record);
        mockGetAuthDecision.mockResolvedValue({
            hasResidualRules: true,
            result: undefined
        });
        expect(await canManageAccessGroup("group-1")).toBe(false);
        mockGetAuthDecision.mockResolvedValue({
            hasResidualRules: false,
            result: false
        });
        expect(await canManageAccessGroup("group-1")).toBe(false);
    });
});
