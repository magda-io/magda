import React, { FunctionComponent, useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "react-async-hook";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Pagination from "rsuite/Pagination";
import Table from "rsuite/Table";
import { MdSearch } from "react-icons/md";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import {
    describeUsageError,
    getUserDailyUsage,
    getUserUsage,
    listUserUsage,
    UsageQuery,
    UsageUser,
    UserUsageRow
} from "api-clients/LlmServicesApis";
import {
    DailyUsageHistory,
    EMPTY_FILTERS,
    TokenCount,
    UsageFilterControls,
    UsageFilters,
    UsageReportView
} from "./UsageReport";
import "./main.scss";
import "./UsageReport.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const DEFAULT_PAGE_SIZE = 20;

export const USER_USAGE_PATH = "/settings/llm-services/user-usage";

export const userUsagePath = (userId: string) =>
    `${USER_USAGE_PATH}/${encodeURIComponent(userId)}`;

const userUsageBreadcrumb = { to: USER_USAGE_PATH, title: "User LLM Usage" };

/** Shown for a name or email the viewer may not read (API-12). */
export const NOT_VISIBLE = "Not available";

/**
 * The user's name for the list. A viewer who may not read users sees
 * neither name nor email (API-12): the ID is shown instead, so rows can
 * still be told apart.
 */
export const UserName: FunctionComponent<{ user: UsageUser }> = ({ user }) =>
    user.displayName ? (
        <>{user.displayName}</>
    ) : user.email ? null : (
        <code className="llm-usage-user-id">{user.id}</code>
    );

/** The report page's user details: name, email and ID. */
export const UserDetails: FunctionComponent<{ user: UsageUser }> = ({
    user
}) => (
    <dl className="llm-usage-user-details">
        <div>
            <dt>Name</dt>
            <dd>{user.displayName || NOT_VISIBLE}</dd>
        </div>
        <div>
            <dt>Email</dt>
            <dd>{user.email || NOT_VISIBLE}</dd>
        </div>
        <div>
            <dt>ID</dt>
            <dd>
                <code>{user.id}</code>
            </dd>
        </div>
    </dl>
);

/** User Usage (UI doc): find users with usage, by ID, name or email. */
export const UserUsageListPage: FunctionComponent = () => {
    const [searchText, setSearchText] = useState("");
    const [q, setQ] = useState("");
    const [filters, setFilters] = useState<UsageFilters>(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;
    const invalidRange =
        !!filters.from && !!filters.to && filters.from > filters.to;

    const search = () => {
        setQ(searchText.trim());
        setPage(1);
    };

    const { result, loading, error, execute } = useAsync(
        async (q: string, filters: UsageFilters, offset: number, limit) =>
            invalidRange
                ? undefined
                : listUserUsage({ q, ...filters, offset, limit }),
        [q, filters, offset, limit]
    );
    const rows = (result?.items || []).map((row) => ({
        ...row,
        id: row.userId
    }));

    return (
        <div className="flex-main-container setting-page-main-container user-usage-page">
            <SideNavigation />
            <div className="main-content-container llm-user-usage-list">
                <Breadcrumb items={[userUsageBreadcrumb]} />
                <h1 className="sr-only">User LLM Usage</h1>
                <p className="llm-usage-note">
                    Find a user by ID. Name and email search, and the names
                    shown, only include users you're allowed to see; others are
                    shown by ID.
                </p>
                <div className="llm-usage-search">
                    <label htmlFor="llm-user-usage-search">
                        Search by user ID, name or email
                    </label>
                    <InputGroup size="md" inside>
                        <Input
                            id="llm-user-usage-search"
                            placeholder="User ID, name or email..."
                            value={searchText}
                            onChange={setSearchText}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    search();
                                }
                            }}
                        />
                        <InputGroup.Button aria-label="Search" onClick={search}>
                            <MdSearch />
                        </InputGroup.Button>
                    </InputGroup>
                </div>
                <UsageFilterControls
                    idPrefix="llm-user-usage"
                    value={filters}
                    onChange={(value) => {
                        setFilters(value);
                        setPage(1);
                    }}
                />
                {invalidRange ? (
                    <Message showIcon type="warning">
                        The From date must not be after the To date.
                    </Message>
                ) : error ? (
                    <Message
                        showIcon
                        type="error"
                        header="Unable to load usage"
                    >
                        <p>{describeUsageError(error)}</p>
                        <Button
                            appearance="link"
                            onClick={() => execute(q, filters, offset, limit)}
                        >
                            Retry
                        </Button>
                    </Message>
                ) : !loading && !rows.length ? (
                    <Message showIcon type="info">
                        {q
                            ? `No users with usage match "${q}". Name and email search only finds users you're allowed to see; try the user ID.`
                            : "No usage recorded yet."}
                    </Message>
                ) : (
                    <>
                        <Table
                            autoHeight={true}
                            data={rows}
                            loading={loading}
                            rowKey="id"
                        >
                            <Column width={200} flexGrow={2}>
                                <HeaderCell>Name</HeaderCell>
                                <Cell fullText>
                                    {(row: UserUsageRow) => (
                                        <UserName user={row.user} />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={240} flexGrow={3}>
                                <HeaderCell>Email</HeaderCell>
                                <Cell fullText>
                                    {(row: UserUsageRow) =>
                                        row.user.email || ""
                                    }
                                </Cell>
                            </Column>
                            <Column width={110} align="right">
                                <HeaderCell>Total tokens</HeaderCell>
                                <Cell>
                                    {(row: UserUsageRow) => (
                                        <TokenCount value={row.tokens} />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={110} align="right">
                                <HeaderCell>Measured</HeaderCell>
                                <Cell>
                                    {(row: UserUsageRow) => (
                                        <TokenCount
                                            value={
                                                row.measuredInputTokens +
                                                row.measuredOutputTokens
                                            }
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={100} align="right">
                                <HeaderCell>Estimated</HeaderCell>
                                <Cell>
                                    {(row: UserUsageRow) => (
                                        <TokenCount
                                            value={row.estimatedTokens}
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={110}>
                                <HeaderCell>Last usage</HeaderCell>
                                <Cell>
                                    {(row: UserUsageRow) =>
                                        row.lastUsageDate || "None"
                                    }
                                </Cell>
                            </Column>
                            <Column width={170}>
                                <HeaderCell>Report</HeaderCell>
                                <Cell className="llm-usage-report-cell">
                                    {(row: UserUsageRow) => (
                                        <Button
                                            as={Link}
                                            to={userUsagePath(row.userId)}
                                            size="sm"
                                            appearance="ghost"
                                            aria-label={`Open usage report for ${
                                                row.user.displayName ||
                                                row.user.email ||
                                                row.userId
                                            }`}
                                        >
                                            Open usage report
                                        </Button>
                                    )}
                                </Cell>
                            </Column>
                        </Table>
                        <div className="pagination-container">
                            <Pagination
                                prev
                                next
                                first
                                last
                                ellipsis
                                boundaryLinks
                                maxButtons={5}
                                size="xs"
                                layout={["total", "-", "limit", "|", "pager"]}
                                total={result?.total || 0}
                                limitOptions={[DEFAULT_PAGE_SIZE, 50, 100]}
                                limit={limit}
                                activePage={page}
                                onChangePage={setPage}
                                onChangeLimit={(value) => {
                                    setLimit(value);
                                    setPage(1);
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

/** User Usage for one user: the My Usage sections, for that user. */
export const UserUsageDetailPage: FunctionComponent = () => {
    const { userId } = useParams<{ userId: string }>();
    const { result: report, loading, error, execute } = useAsync(
        async (userId: string) => getUserUsage(userId),
        [userId]
    );
    const loadDaily = useCallback(
        (query: UsageQuery) => getUserDailyUsage(userId, query),
        [userId]
    );

    return (
        <div className="flex-main-container setting-page-main-container user-usage-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[userUsageBreadcrumb, { title: "Usage report" }]}
                />
                <h1 className="llm-usage-user-heading">User usage report</h1>
                <UserDetails user={report?.user ?? { id: userId }} />
                <p className="llm-usage-note">
                    This usage may come from several profiles.
                </p>
                {error ? (
                    <Message
                        showIcon
                        type="error"
                        header="Unable to load usage"
                    >
                        <p>{describeUsageError(error)}</p>
                        <Button
                            appearance="link"
                            onClick={() => execute(userId)}
                        >
                            Retry
                        </Button>
                    </Message>
                ) : loading || !report ? (
                    <Loader content="Loading usage…" />
                ) : (
                    <>
                        <UsageReportView report={report} subject="other" />
                        <DailyUsageHistory
                            load={loadDaily}
                            models={report.models.map((m) => m.modelAlias)}
                        />
                    </>
                )}
                <p>
                    <Link to={USER_USAGE_PATH}>Back to User LLM Usage</Link>
                </p>
            </div>
        </div>
    );
};
