import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

const mockQueryUsers = jest.fn();
const mockQueryCount = jest.fn();
const mockQueryRoleUsers = jest.fn();
const mockQueryRoleCount = jest.fn();
const mockAddUser = jest.fn();
const mockRemoveUser = jest.fn();
const mockConfirmOpen = jest.fn();

jest.mock("api-clients/AuthApis", () => ({
    queryAccessGroupUsers: (...args: any[]) => mockQueryUsers(...args),
    queryAccessGroupUsersCount: (...args: any[]) => mockQueryCount(...args),
    queryRoleUsers: (...args: any[]) => mockQueryRoleUsers(...args),
    queryRoleUsersCount: (...args: any[]) => mockQueryRoleCount(...args),
    addUserToAccessGroup: (...args: any[]) => mockAddUser(...args),
    removeUserToAccessGroup: (...args: any[]) => mockRemoveUser(...args)
}));
jest.mock("../../helpers/reportError", () => jest.fn());
jest.mock("./reportInfo", () => jest.fn());
jest.mock("./ConfirmDialog", () => ({
    open: (...args: any[]) => mockConfirmOpen(...args)
}));
jest.mock("Components/OrgUnitNameLabel", () => () => null);
jest.mock("rsuite/Loader", () => () => null);
jest.mock("rsuite/Button", () => ({ children, disabled, onClick }: any) => (
    <button type="button" disabled={disabled} onClick={onClick}>
        {children}
    </button>
));
jest.mock("rsuite/IconButton", () => ({ onClick, ...rest }: any) => (
    <button type="button" aria-label={rest["aria-label"]} onClick={onClick} />
));
jest.mock("rsuite/Input", () => ({ onChange, ...rest }: any) => (
    <input {...rest} onChange={(event) => onChange(event.target.value)} />
));
jest.mock("rsuite/InputGroup", () => {
    const InputGroup = ({ children }: any) => <div>{children}</div>;
    InputGroup.Button = ({ onClick }: any) => (
        <button type="button" aria-label="Search" onClick={onClick} />
    );
    return InputGroup;
});
jest.mock("rsuite/Table", () => {
    const React = require("react");
    const RowContext = React.createContext({});
    const Table = ({ data, children }: any) => (
        <div>
            {data.map((row: any) => (
                <RowContext.Provider key={row.id} value={row}>
                    <div>{children}</div>
                </RowContext.Provider>
            ))}
        </div>
    );
    Table.Column = ({ children }: any) => <div>{children}</div>;
    Table.HeaderCell = () => null;
    const MockCell = ({ children, dataKey }: any) => {
        const row = React.useContext(RowContext);
        return (
            <span>
                {typeof children === "function" ? children(row) : row[dataKey]}
            </span>
        );
    };
    Table.Cell = MockCell;
    return Table;
});
jest.mock(
    "rsuite/Pagination",
    () => ({ total, activePage, onChangePage, onChangeLimit }: any) => (
        <div>
            <span data-testid="total">{total}</span>
            <button type="button" onClick={() => onChangePage(activePage + 1)}>
                Next page
            </button>
            <button type="button" onClick={() => onChangeLimit(20)}>
                Show 20
            </button>
        </div>
    )
);

// eslint-disable-next-line import/first
import AccessGroupUsersPanel from "./AccessGroupUsersPanel";

const groupId = "access-group-example";
const user = {
    id: "00000000-0000-4000-8000-00000000a11c",
    displayName: "Alice",
    email: "alice@example.com",
    photoURL: "",
    source: "test",
    sourceId: "alice",
    orgUnitId: ""
};
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    for (const mock of [
        mockQueryUsers,
        mockQueryCount,
        mockQueryRoleUsers,
        mockQueryRoleCount,
        mockAddUser,
        mockRemoveUser,
        mockConfirmOpen
    ]) {
        mock.mockReset();
    }
    mockQueryUsers.mockResolvedValue([user]);
    mockQueryCount.mockResolvedValue(21);
    mockAddUser.mockResolvedValue(true);
    mockRemoveUser.mockResolvedValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function flush() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function render(id = groupId) {
    act(() => root.render(<AccessGroupUsersPanel groupId={id} />));
    await flush();
}

async function click(label: string) {
    const button = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
    ).find(
        (item) =>
            item.textContent === label ||
            item.getAttribute("aria-label") === label
    );
    if (!button) throw new Error(`No button ${label}`);
    act(() => button.click());
    await flush();
}

function type(placeholder: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(
        `input[placeholder="${placeholder}"]`
    )!;
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("AccessGroupUsersPanel", () => {
    it("loads members and count by access group ID, never via role APIs", async () => {
        await render();
        expect(mockQueryUsers).toHaveBeenCalledWith(groupId, {
            keyword: undefined,
            noCache: true,
            offset: 0,
            limit: 10
        });
        expect(mockQueryCount).toHaveBeenCalledWith(groupId, {
            keyword: undefined,
            noCache: true
        });
        expect(mockQueryRoleUsers).not.toHaveBeenCalled();
        expect(mockQueryRoleCount).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Alice");
        expect(
            container.querySelector('[data-testid="total"]')?.textContent
        ).toBe("21");
    });

    it("reloads when the access group ID changes", async () => {
        await render();
        mockQueryUsers.mockResolvedValue([]);
        mockQueryCount.mockResolvedValue(0);
        await render("another-access-group");
        expect(mockQueryUsers).toHaveBeenLastCalledWith(
            "another-access-group",
            expect.objectContaining({ offset: 0, limit: 10, noCache: true })
        );
        expect(mockQueryCount).toHaveBeenLastCalledWith(
            "another-access-group",
            { keyword: undefined, noCache: true }
        );
        expect(container.textContent).not.toContain("Alice");
        expect(
            container.querySelector('[data-testid="total"]')?.textContent
        ).toBe("0");
    });

    it("uses the same committed keyword for members and count, omitting whitespace-only searches", async () => {
        await render();
        type("Enter a keyword to search...", "Alice");
        expect(mockQueryUsers).toHaveBeenCalledTimes(1);
        await click("Search");
        expect(mockQueryUsers).toHaveBeenLastCalledWith(groupId, {
            keyword: "Alice",
            noCache: true,
            offset: 0,
            limit: 10
        });
        expect(mockQueryCount).toHaveBeenLastCalledWith(groupId, {
            keyword: "Alice",
            noCache: true
        });
        type("Enter a keyword to search...", "   ");
        await click("Search");
        expect(mockQueryUsers).toHaveBeenLastCalledWith(
            groupId,
            expect.objectContaining({ keyword: undefined })
        );
        expect(mockQueryCount).toHaveBeenLastCalledWith(groupId, {
            keyword: undefined,
            noCache: true
        });
    });

    it("paginates members without passing pagination to the count helper", async () => {
        await render();
        await click("Next page");
        expect(mockQueryUsers).toHaveBeenLastCalledWith(groupId, {
            keyword: undefined,
            noCache: true,
            offset: 10,
            limit: 10
        });
        await click("Show 20");
        expect(mockQueryUsers).toHaveBeenLastCalledWith(groupId, {
            keyword: undefined,
            noCache: true,
            offset: 20,
            limit: 20
        });
        expect(mockQueryCount).toHaveBeenLastCalledWith(groupId, {
            keyword: undefined,
            noCache: true
        });
    });

    it("refreshes members and count after adding and confirming removal", async () => {
        mockQueryUsers.mockResolvedValue([]);
        mockQueryCount.mockResolvedValue(0);
        await render();
        expect(container.textContent).not.toContain("Alice");
        mockQueryUsers.mockResolvedValue([user]);
        mockQueryCount.mockResolvedValue(1);
        type("Please enter the ID of the user to be added...", user.id);
        await click("Add user to the group");
        expect(mockAddUser).toHaveBeenCalledWith(user.id, groupId);
        expect(mockQueryUsers).toHaveBeenCalledTimes(2);
        expect(mockQueryCount).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain("Alice");
        expect(
            container.querySelector('[data-testid="total"]')?.textContent
        ).toBe("1");

        await click("Remove the user from the access group");
        expect(mockConfirmOpen).toHaveBeenCalledTimes(1);
        expect(mockRemoveUser).not.toHaveBeenCalled();
        mockQueryUsers.mockResolvedValue([]);
        mockQueryCount.mockResolvedValue(0);
        await act(async () => {
            await mockConfirmOpen.mock.calls[0][0].confirmHandler();
        });
        await flush();
        expect(mockRemoveUser).toHaveBeenCalledWith(user.id, groupId);
        expect(mockQueryUsers).toHaveBeenCalledTimes(3);
        expect(mockQueryCount).toHaveBeenCalledTimes(3);
        expect(container.textContent).not.toContain("Alice");
        expect(
            container.querySelector('[data-testid="total"]')?.textContent
        ).toBe("0");
    });
});
