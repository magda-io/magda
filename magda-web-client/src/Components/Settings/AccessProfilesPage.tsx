import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAsync } from "react-async-hook";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import Message from "rsuite/Message";
import Pagination from "rsuite/Pagination";
import Table from "rsuite/Table";
import { MdAddCircle, MdSearch } from "react-icons/md";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import { OrgUnitName } from "./AccessProfileOrgUnitPicker";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import {
    AccessProfile,
    ALL_MODELS,
    describeLlmServicesError,
    listAccessProfiles
} from "api-clients/LlmServicesApis";
import {
    canManageLlmAccess,
    LLM_ACCESS_CREATE_OPERATION
} from "./llmServicesAccess";
import "./main.scss";
import "./AccessProfilesPage.scss";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

const DEFAULT_PAGE_SIZE = 10;

export const ACCESS_PROFILES_PATH = "/settings/llm-services/access-profiles";

export const accessProfilePath = (id: string, tab?: "roles") =>
    `${ACCESS_PROFILES_PATH}/${encodeURIComponent(id)}${tab ? `/${tab}` : ""}`;

export const accessProfilesBreadcrumb = {
    to: ACCESS_PROFILES_PATH,
    title: "LLM Access Profiles"
};

export const ALL_MODELS_LABEL = "All available models (*)";

export function formatModels(models: string[]): string {
    return models.length === 1 && models[0] === ALL_MODELS
        ? ALL_MODELS_LABEL
        : models.join(", ");
}

const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
});

/** A compact token limit; blank (announced as "Unlimited") when `null`. */
export const TokenLimit: FunctionComponent<{ value: number | null }> = ({
    value
}) =>
    value === null ? (
        <span className="sr-only">Unlimited</span>
    ) : (
        <span title={`${value.toLocaleString("en")} tokens`}>
            {compactNumber.format(value)}
        </span>
    );

/** Org unit name, **Public**, both, or **Roles only** (UI doc, List). */
export const ProfileAudience: FunctionComponent<{
    profile: Pick<AccessProfile, "orgUnitId" | "constraintExemption">;
}> = ({ profile }) => {
    if (!profile.orgUnitId && !profile.constraintExemption) {
        return <>Roles only</>;
    }
    return (
        <>
            {profile.orgUnitId ? <OrgUnitName id={profile.orgUnitId} /> : null}
            {profile.orgUnitId && profile.constraintExemption ? " + " : null}
            {profile.constraintExemption ? "Public" : null}
        </>
    );
};

const AccessProfilesPage: FunctionComponent = () => {
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const canCreate = canManageLlmAccess(LLM_ACCESS_CREATE_OPERATION, user);
    const [searchInputText, setSearchInputText] = useState<string>("");
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
    const offset = (page - 1) * limit;

    const search = () => {
        setKeyword(searchInputText.trim());
        setPage(1);
    };

    const { result, loading, error, execute } = useAsync(
        async (keyword: string, offset: number, limit: number) =>
            listAccessProfiles({ q: keyword, offset, limit }),
        [keyword, offset, limit]
    );

    const profiles = result?.items || [];
    const total = result?.total || 0;

    return (
        <div className="flex-main-container setting-page-main-container access-profiles-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={[accessProfilesBreadcrumb]} />
                <h1 className="sr-only">LLM Access Profiles</h1>
                <p className="access-profiles-intro">
                    An access profile lets people use LLM models in Magda,
                    within per-user token limits. People get a profile through
                    its org unit, the Public setting, or roles you add to it.
                </p>
                <div className="search-button-container">
                    {canCreate ? (
                        <div className="left-button-area-container">
                            <Button
                                as={Link}
                                to={getUrlWithPopUpQueryString(
                                    `${ACCESS_PROFILES_PATH}/new`
                                )}
                                color="blue"
                                appearance="primary"
                                startIcon={<MdAddCircle />}
                            >
                                Create profile
                            </Button>
                        </div>
                    ) : null}
                    <div className="search-button-inner-wrapper">
                        <label
                            htmlFor="access-profiles-search"
                            className="sr-only"
                        >
                            Search profiles by name
                        </label>
                        <InputGroup size="md" inside>
                            <Input
                                id="access-profiles-search"
                                placeholder="Search profiles by name..."
                                value={searchInputText}
                                onChange={setSearchInputText}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        search();
                                    }
                                }}
                            />
                            <InputGroup.Button
                                aria-label="Search"
                                onClick={search}
                            >
                                <MdSearch />
                            </InputGroup.Button>
                        </InputGroup>
                    </div>
                </div>
                {error ? (
                    <Message
                        showIcon
                        type="error"
                        header="Unable to load access profiles"
                    >
                        <p>{describeLlmServicesError(error)}</p>
                        <Button
                            appearance="link"
                            onClick={() => execute(keyword, offset, limit)}
                        >
                            Retry
                        </Button>
                    </Message>
                ) : !loading && !profiles.length ? (
                    <Message showIcon type="info">
                        {keyword
                            ? `No access profiles match "${keyword}".`
                            : canCreate
                            ? "There are no access profiles yet. Create one to give people access to LLM models."
                            : "There are no access profiles yet."}
                    </Message>
                ) : (
                    <>
                        <Table
                            autoHeight={true}
                            data={profiles}
                            loading={loading}
                            rowKey="id"
                        >
                            <Column width={220} resizable>
                                <HeaderCell>Name</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) => (
                                        <Link
                                            to={getUrlWithPopUpQueryString(
                                                accessProfilePath(row.id)
                                            )}
                                        >
                                            {row.name}
                                        </Link>
                                    )}
                                </Cell>
                            </Column>
                            <Column width={200} flexGrow={1}>
                                <HeaderCell>Models</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) =>
                                        formatModels(row.allowedModels)
                                    }
                                </Cell>
                            </Column>
                            <Column width={180} resizable>
                                <HeaderCell>Audience</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) => (
                                        <ProfileAudience profile={row} />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={90} align="right">
                                <HeaderCell>Daily limit</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) => (
                                        <TokenLimit
                                            value={row.allowedDailyTokens}
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={90} align="right">
                                <HeaderCell>Weekly limit</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) => (
                                        <TokenLimit
                                            value={row.allowedWeeklyTokens}
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={100} align="right">
                                <HeaderCell>Monthly limit</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) => (
                                        <TokenLimit
                                            value={row.allowedMonthlyTokens}
                                        />
                                    )}
                                </Cell>
                            </Column>
                            <Column width={100}>
                                <HeaderCell>Status</HeaderCell>
                                <Cell>
                                    {(row: AccessProfile) =>
                                        row.enabled ? "Enabled" : "Disabled"
                                    }
                                </Cell>
                            </Column>
                        </Table>
                        <p className="access-profiles-limits-note">
                            Limits are tokens per user and per model. A blank
                            limit means no limit.
                        </p>
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
                                layout={[
                                    "total",
                                    "-",
                                    "limit",
                                    "|",
                                    "pager",
                                    "skip"
                                ]}
                                total={total}
                                limitOptions={[DEFAULT_PAGE_SIZE, 20, 50]}
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

export default AccessProfilesPage;
