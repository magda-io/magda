import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import Message from "rsuite/Message";
import Pagination from "rsuite/Pagination";
import SelectPicker from "rsuite/SelectPicker";
import Table from "rsuite/Table";
import {
    DailyUsage,
    DailyUsageRow,
    describeUsageError,
    ModelUsage,
    RemainingQuota,
    UsageAmounts,
    UsageQuery,
    UsageReport
} from "api-clients/LlmServicesApis";
import { NoAccessHelpContent } from "./NoModelAccessNotice";
import "./UsageReport.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const DEFAULT_PAGE_SIZE = 10;

export function formatTokens(value: number): string {
    return value.toLocaleString("en");
}

/** USE-8: a number, **Unlimited**, **Exhausted** or **No eligible model profile**. */
export const RemainingValue: FunctionComponent<{
    remaining: RemainingQuota;
}> = ({ remaining }) => {
    switch (remaining.status) {
        case "unlimited":
            return <span className="llm-remaining unlimited">Unlimited</span>;
        case "exhausted":
            return <span className="llm-remaining exhausted">Exhausted</span>;
        case "no_eligible_profile":
            return (
                <span className="llm-remaining no-profile">
                    No eligible model profile
                </span>
            );
        default:
            return (
                <span className="llm-remaining limited">
                    {formatTokens(remaining.remainingTokens)} tokens
                </span>
            );
    }
};

const AmountsTile: FunctionComponent<{
    title: string;
    amounts: UsageAmounts;
}> = ({ title, amounts }) => (
    <div className="llm-usage-tile">
        <h3>{title}</h3>
        <p className="llm-usage-tile-total">
            {formatTokens(amounts.tokens)} <span>tokens</span>
        </p>
        <dl>
            <div>
                <dt>Measured</dt>
                <dd>
                    {formatTokens(
                        amounts.measuredInputTokens +
                            amounts.measuredOutputTokens
                    )}
                </dd>
            </div>
            <div>
                <dt>Estimated</dt>
                <dd>{formatTokens(amounts.estimatedTokens)}</dd>
            </div>
        </dl>
    </div>
);

const PERIODS: Array<{
    key: "day" | "week" | "month";
    title: string;
}> = [
    { key: "day", title: "Today" },
    { key: "week", title: "This week" },
    { key: "month", title: "This month" }
];

const ModelsTable: FunctionComponent<{ models: ModelUsage[] }> = ({
    models
}) => (
    <div className="llm-usage-models-wrapper">
        <table className="llm-usage-models">
            <caption className="sr-only">
                Remaining quota and usage per model
            </caption>
            <thead>
                <tr>
                    <th scope="col">Model</th>
                    <th scope="col">Remaining</th>
                    {PERIODS.map((period) => (
                        <th scope="col" key={period.key}>
                            {period.title}
                        </th>
                    ))}
                    <th scope="col">Measured (all time)</th>
                    <th scope="col">Estimated (all time)</th>
                </tr>
            </thead>
            <tbody>
                {models.map((model) => (
                    <tr key={model.modelAlias}>
                        <th scope="row">
                            <code>{model.modelAlias}</code>
                        </th>
                        <td>
                            <RemainingValue remaining={model.remaining} />
                        </td>
                        {PERIODS.map((period) => (
                            <td key={period.key}>
                                <span className="llm-usage-used">
                                    {formatTokens(
                                        model.usage[period.key].tokens
                                    )}{" "}
                                    used
                                </span>
                                {model.eligible ? (
                                    <span className="llm-usage-left">
                                        Left:{" "}
                                        <RemainingValue
                                            remaining={
                                                model.periodRemaining[
                                                    period.key
                                                ]
                                            }
                                        />
                                    </span>
                                ) : null}
                            </td>
                        ))}
                        <td>
                            {formatTokens(
                                model.usage.allTime.measuredInputTokens +
                                    model.usage.allTime.measuredOutputTokens
                            )}
                        </td>
                        <td>
                            {formatTokens(model.usage.allTime.estimatedTokens)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

/**
 * The My Usage / User Usage sections (UI doc): totals, per-model remaining
 * quota, or the no-access state, with the accounting time zone.
 */
export const UsageReportView: FunctionComponent<{
    report: UsageReport;
    /** "you" on My Usage; "this user" on User Usage. */
    subject: "self" | "other";
}> = ({ report, subject }) => {
    const noAccess = report.access === "none";
    return (
        <div className="llm-usage-report">
            <p className="llm-usage-time-zone">
                Times are in <strong>{report.timeZone}</strong>. Today is{" "}
                {report.periods.day}; this week started{" "}
                {report.periods.weekStart} (Monday) and this month started{" "}
                {report.periods.monthStart}.
            </p>

            <section aria-labelledby="llm-usage-totals-heading">
                <h2 id="llm-usage-totals-heading">Totals</h2>
                <div className="llm-usage-tiles">
                    <AmountsTile
                        title="Total (all time)"
                        amounts={report.totals.allTime}
                    />
                    <AmountsTile title="Today" amounts={report.totals.day} />
                    <AmountsTile
                        title="This week"
                        amounts={report.totals.week}
                    />
                    <AmountsTile
                        title="This month"
                        amounts={report.totals.month}
                    />
                </div>
                <p className="llm-usage-note">
                    Measured tokens are the input and output the model reported.
                    Estimated tokens are charged when a response had no usable
                    final usage.
                </p>
            </section>

            <section aria-labelledby="llm-usage-models-heading">
                <h2 id="llm-usage-models-heading">Models</h2>
                {noAccess ? (
                    <Message
                        showIcon
                        type="warning"
                        className="llm-no-eligible-profile"
                    >
                        <p>
                            <strong>No eligible model profile.</strong>{" "}
                            {subject === "self"
                                ? "Ask your administrator for access."
                                : "This user can't use any model now."}
                        </p>
                        {subject === "self" ? (
                            <NoAccessHelpContent help={report.noAccessHelp} />
                        ) : null}
                    </Message>
                ) : null}
                {report.access === "administrator" ? (
                    <p className="llm-usage-note">
                        {subject === "self"
                            ? "You're an administrator: "
                            : "This user is an administrator: "}
                        token limits don't apply, but usage is recorded.
                    </p>
                ) : null}
                {report.models.length ? (
                    <>
                        <ModelsTable models={report.models} />
                        <p className="llm-usage-note">
                            Remaining is an estimate of when new requests will
                            be refused. Requests already running can go over it.
                        </p>
                        <p className="llm-usage-note">
                            When several profiles cover a model, the amount left
                            in each period is that of the profile giving the
                            most remaining. A period it doesn&apos;t limit shows
                            Unlimited.
                        </p>
                    </>
                ) : null}
            </section>
        </div>
    );
};

const DailyTable: FunctionComponent<{
    rows: DailyUsageRow[];
    loading: boolean;
}> = ({ rows, loading }) => (
    <Table
        autoHeight={true}
        data={rows.map((row) => ({
            ...row,
            id: `${row.localDate}-${row.modelAlias}`
        }))}
        loading={loading}
        rowKey="id"
    >
        <Column width={120}>
            <HeaderCell>Date</HeaderCell>
            <Cell dataKey="localDate" />
        </Column>
        <Column width={200} flexGrow={1}>
            <HeaderCell>Model</HeaderCell>
            <Cell dataKey="modelAlias" />
        </Column>
        <Column width={140} align="right">
            <HeaderCell>Measured input</HeaderCell>
            <Cell>
                {(row: DailyUsageRow) => formatTokens(row.measuredInputTokens)}
            </Cell>
        </Column>
        <Column width={140} align="right">
            <HeaderCell>Measured output</HeaderCell>
            <Cell>
                {(row: DailyUsageRow) => formatTokens(row.measuredOutputTokens)}
            </Cell>
        </Column>
        <Column width={120} align="right">
            <HeaderCell>Estimated</HeaderCell>
            <Cell>
                {(row: DailyUsageRow) => formatTokens(row.estimatedTokens)}
            </Cell>
        </Column>
        <Column width={120} align="right">
            <HeaderCell>Total</HeaderCell>
            <Cell>{(row: DailyUsageRow) => formatTokens(row.tokens)}</Cell>
        </Column>
    </Table>
);

export interface UsageFilters {
    model: string;
    from: string;
    to: string;
}

export const EMPTY_FILTERS: UsageFilters = { model: "", from: "", to: "" };

/** Model and inclusive date range filters, shared by both pages. */
export const UsageFilterControls: FunctionComponent<{
    idPrefix: string;
    /** The aliases to choose from; `undefined` for a free-text alias. */
    models?: string[];
    value: UsageFilters;
    onChange: (value: UsageFilters) => void;
}> = ({ idPrefix, models, value, onChange }) => (
    <div className="llm-usage-filters">
        <div>
            <label htmlFor={`${idPrefix}-model`}>Model</label>
            {models ? (
                <SelectPicker
                    id={`${idPrefix}-model`}
                    data={[
                        { label: "All models", value: "" },
                        ...models.map((model) => ({
                            label: model,
                            value: model
                        }))
                    ]}
                    value={value.model}
                    searchable={false}
                    cleanable={false}
                    onChange={(model) =>
                        onChange({ ...value, model: (model as string) || "" })
                    }
                />
            ) : (
                <Input
                    id={`${idPrefix}-model`}
                    placeholder="Any model alias"
                    value={value.model}
                    onChange={(model) => onChange({ ...value, model })}
                />
            )}
        </div>
        <div>
            <label htmlFor={`${idPrefix}-from`}>From</label>
            <Input
                id={`${idPrefix}-from`}
                type="date"
                value={value.from}
                onChange={(from) => onChange({ ...value, from })}
            />
        </div>
        <div>
            <label htmlFor={`${idPrefix}-to`}>To</label>
            <Input
                id={`${idPrefix}-to`}
                type="date"
                value={value.to}
                onChange={(to) => onChange({ ...value, to })}
            />
        </div>
        {value.model || value.from || value.to ? (
            <Button appearance="link" onClick={() => onChange(EMPTY_FILTERS)}>
                Clear filters
            </Button>
        ) : null}
    </div>
);

/** Daily history: paginated, filtered by model and date range. */
export const DailyUsageHistory: FunctionComponent<{
    load: (query: UsageQuery) => Promise<DailyUsage>;
    models: string[];
}> = ({ load, models }) => {
    const [filters, setFilters] = useState<UsageFilters>(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;
    const invalidRange =
        !!filters.from && !!filters.to && filters.from > filters.to;

    const { result, loading, error, execute } = useAsync(
        async (filters: UsageFilters, offset: number, limit: number) =>
            invalidRange
                ? undefined
                : load({
                      model: filters.model,
                      from: filters.from,
                      to: filters.to,
                      offset,
                      limit
                  }),
        [filters, offset, limit]
    );

    const rows = result?.items || [];
    return (
        <section
            aria-labelledby="llm-usage-daily-heading"
            className="llm-usage-daily"
        >
            <h2 id="llm-usage-daily-heading">Daily history</h2>
            <UsageFilterControls
                idPrefix="llm-usage-daily"
                models={models}
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
                <Message showIcon type="error" header="Unable to load history">
                    <p>{describeUsageError(error)}</p>
                    <Button
                        appearance="link"
                        onClick={() => execute(filters, offset, limit)}
                    >
                        Retry
                    </Button>
                </Message>
            ) : !loading && !rows.length ? (
                <Message showIcon type="info">
                    {filters.model || filters.from || filters.to
                        ? "No usage matches these filters."
                        : "No usage recorded yet."}
                </Message>
            ) : (
                <>
                    <DailyTable rows={rows} loading={loading} />
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
                            limitOptions={[DEFAULT_PAGE_SIZE, 31, 100]}
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
        </section>
    );
};
