import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

const mockGetAccessGroupById = jest.fn();
const mockCanManageAccessGroup = jest.fn();
const mockReportError = jest.fn();

jest.mock("api-clients/AuthApis", () => ({
    getAccessGroupById: (...args: any[]) => mockGetAccessGroupById(...args),
    canManageAccessGroup: (...args: any[]) => mockCanManageAccessGroup(...args)
}));
jest.mock("../../helpers/reportError", () => (...args: any[]) =>
    mockReportError(...args)
);
jest.mock("./SideNavigation", () => () => null);
jest.mock("./Breadcrumb", () => () => null);
jest.mock("./AccessGroupDatasetsPanel", () => () => (
    <div data-testid="datasets-panel" />
));
jest.mock("./AccessGroupUsersPanel", () => () => (
    <div data-testid="users-panel" />
));
jest.mock("Components/UserNameLabel", () => () => null);
jest.mock("Components/DateDisplayWithTooltip", () => () => null);
jest.mock("rsuite/Nav", () => {
    const Nav = ({ children }: any) => <nav>{children}</nav>;
    Nav.Item = ({ children, eventKey }: any) => (
        <button data-key={eventKey}>{children}</button>
    );
    return Nav;
});
jest.mock("rsuite/Panel", () => ({ children }: any) => <div>{children}</div>);
jest.mock("rsuite/Placeholder", () => ({
    Paragraph: ({ children }: any) => <div>{children}</div>
}));
jest.mock("rsuite/Loader", () => () => <span>loading</span>);
jest.mock("rsuite/Message", () => ({ children }: any) => <div>{children}</div>);
jest.mock("rsuite/Tag", () => ({ children }: any) => <span>{children}</span>);
jest.mock("rsuite/TagGroup", () => ({ children }: any) => (
    <span>{children}</span>
));
jest.mock("rsuite/Whisper", () => ({ children }: any) => <>{children}</>);
jest.mock("rsuite/Popover", () => ({ children }: any) => (
    <span>{children}</span>
));

// eslint-disable-next-line import/first
import AccessGroupDetailsPage from "./AccessGroupDetailsPage";

const groupId = "00000000-0000-4000-8000-0000000000d1";
const group = {
    id: groupId,
    name: "A group",
    description: "",
    resourceUri: "object/record",
    keywords: [] as string[],
    operationUris: ["object/record/read"],
    permissionId: "00000000-0000-4000-8000-0000000000e2",
    roleId: "00000000-0000-4000-8000-0000000000e1",
    ownerId: null as string | null,
    orgUnitId: null as string | null
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    mockGetAccessGroupById.mockReset();
    mockCanManageAccessGroup.mockReset();
    mockReportError.mockReset();
    mockGetAccessGroupById.mockResolvedValue(group);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function render(path: string) {
    act(() =>
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <AccessGroupDetailsPage />
            </MemoryRouter>
        )
    );
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

const usersTabKey = `/settings/accessGroups/${groupId}/users`;

function usersTab() {
    return container.querySelector(`button[data-key="${usersTabKey}"]`);
}

describe("AccessGroupDetailsPage", () => {
    it("shows the Users tab when the user can manage the group", async () => {
        mockCanManageAccessGroup.mockResolvedValue(true);
        await render(`/settings/accessGroups/${groupId}`);
        expect(mockCanManageAccessGroup).toHaveBeenCalledWith(groupId);
        expect(usersTab()).not.toBeNull();
    });

    it("hides the Users tab for a member", async () => {
        mockCanManageAccessGroup.mockResolvedValue(false);
        await render(`/settings/accessGroups/${groupId}`);
        expect(usersTab()).toBeNull();
        expect(
            container.querySelector(
                `button[data-key="/settings/accessGroups/${groupId}/datasets"]`
            )
        ).not.toBeNull();
    });

    it("hides the Users tab and logs when the decision request fails", async () => {
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        mockCanManageAccessGroup.mockRejectedValue(
            new Error("decision failed")
        );
        await render(`/settings/accessGroups/${groupId}`);
        expect(usersTab()).toBeNull();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it("opening /users directly as a member doesn't show the member list", async () => {
        mockCanManageAccessGroup.mockResolvedValue(false);
        await render(usersTabKey);
        expect(
            container.querySelector('[data-testid="users-panel"]')
        ).toBeNull();
    });

    it("opening /users as a manager shows the member list", async () => {
        mockCanManageAccessGroup.mockResolvedValue(true);
        await render(usersTabKey);
        expect(
            container.querySelector('[data-testid="users-panel"]')
        ).not.toBeNull();
    });
});
