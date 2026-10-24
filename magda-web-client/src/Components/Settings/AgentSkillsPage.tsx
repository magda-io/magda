import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Button from "rsuite/Button";
import ButtonGroup from "rsuite/ButtonGroup";
import Input from "rsuite/Input";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Breadcrumb from "./Breadcrumb";
import AgentSkillAccessDialog from "./AgentSkillAccessDialog";
import SideNavigation from "./SideNavigation";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import { hasPermission } from "helpers/accessControlUtils";
import { canAccessAgentWorkspace } from "./agentWorkspaceAccess";
import {
    AgentSkillApiError,
    AgentSkillFilter,
    AgentSkillMetadata,
    downloadAgentSkillArchive,
    listAgentSkills,
    replaceAgentSkillArchive,
    replaceErrorMessage
} from "../../api-clients/AgentSkillApis";
import "./main.scss";
import "./AgentSkillsPage.scss";

const PAGE_SIZE = 10;

const FILTERS: Array<{ value: AgentSkillFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "mine", label: "My Skills" },
    { value: "system", label: "System Skills" }
];

const EMPTY_MESSAGES: Record<AgentSkillFilter, string> = {
    all: "No published Agent Skills are available to you yet.",
    mine: "You haven't published any Agent Skills yet.",
    system: "No system Agent Skills are available to you.",
    shared: "No skills have been shared with you yet."
};

const CSV_EXAMPLE =
    "We've just cleaned up a CSV with inconsistent column names and produced a new file with consistent headings. I often get similar CSVs from different teams. Can you capture the steps we used—including how we matched equivalent columns, handled ambiguous headings, and validated the output—as a skill I can reuse on new CSV files?";

type ItemFeedback = {
    type: "success" | "error" | "info";
    message: string;
};

function formatTime(value: string) {
    const time = new Date(value);
    return isNaN(time.getTime()) ? value : time.toLocaleString();
}

function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatDate(value: string) {
    const time = new Date(value);
    return isNaN(time.getTime())
        ? value
        : time.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric"
          });
}

export const AgentSkillsHeader: FunctionComponent<{
    canOpenWorkspace: boolean;
}> = ({ canOpenWorkspace }) => (
    <div className="agent-skills-header">
        {/* The breadcrumb already shows the page name; keep the h1 for
            assistive technology without repeating it visually. */}
        <h1 className="sr-only">Agent Skills</h1>
        <p>Discover and manage reusable skills for your Agent Workspace.</p>
        {canOpenWorkspace ? (
            <Button
                as={Link}
                appearance="primary"
                to="/settings/agent-workspace"
            >
                Open Workspace
            </Button>
        ) : null}
    </div>
);

/**
 * The explanation of Agent Skills, collapsed once the user has skills so the
 * catalogue stays near the top of the page.
 */
export const AgentSkillsGuide: FunctionComponent<{
    open: boolean;
    canOpenWorkspace: boolean;
    onToggle: (open: boolean) => void;
}> = ({ open, canOpenWorkspace, onToggle }) => (
    <details
        className="agent-skills-guide"
        open={open}
        onToggle={(event) =>
            onToggle((event.currentTarget as HTMLDetailsElement).open)
        }
    >
        <summary>What are Agent Skills? How do I create one?</summary>
        <div className="agent-skills-guide-body">
            <p>
                An Agent Skill is a reusable set of instructions your agent can
                follow in Agent Workspace, such as the steps, checks and
                decisions of a task you repeat. Published skills are copied into
                your Agent Workspace, so the agent can use them in later
                sessions and new workspaces.
            </p>
            <ul>
                <li>
                    <strong>My Skills</strong> are skills you published. They
                    stay with your Magda account when a workspace is reset.
                </li>
                <li>
                    <strong>System Skills</strong> are published for Magda users
                    by your organisation and are available to you according to
                    your permissions.
                </li>
            </ul>
            <h2>Create a skill by talking to your agent</h2>
            <ol>
                <li>Complete a task with your agent in Agent Workspace.</li>
                <li>
                    Ask the agent to capture the steps as a skill. It drafts the
                    skill in your workspace.
                </li>
                <li>
                    Review the draft, ask for changes, then approve publishing.
                </li>
            </ol>
            <p>For example, after a CSV clean-up you could ask:</p>
            <blockquote className="agent-skills-example">
                {CSV_EXAMPLE}
            </blockquote>
            {canOpenWorkspace ? null : (
                <p className="agent-skills-note">
                    Creating skills needs Agent Workspace access. Ask your Magda
                    administrator if you need it.
                </p>
            )}
        </div>
    </details>
);

export const AgentSkillCard: FunctionComponent<{
    skill: AgentSkillMetadata;
    currentUserId?: string;
    canReplace: boolean;
    /** Owner sharing (user skills) or system skill access management. */
    canManageAccess?: boolean;
    busy?: "download" | "replace";
    feedback?: ItemFeedback;
    onDownload: () => void;
    onReplace: (file: File) => void;
    onManageAccess?: () => void;
}> = ({
    skill,
    currentUserId,
    canReplace,
    canManageAccess,
    busy,
    feedback,
    onDownload,
    onReplace,
    onManageAccess
}) => {
    const fileInput = useRef<HTMLInputElement>(null);
    const person = (id?: string) =>
        !id ? "—" : id === currentUserId ? "You" : <code>{id}</code>;
    const headingId = `agent-skill-${skill.id}`;
    return (
        <li className="agent-skill-card" aria-labelledby={headingId}>
            <div className="agent-skill-card-header">
                <h3 id={headingId}>{skill.name}</h3>
                <span className={`agent-skill-type type-${skill.type}`}>
                    {skill.type === "system" ? "System" : "User"}
                </span>
            </div>
            <p className="agent-skill-description">
                {skill.description || "No description."}
            </p>
            <details className="agent-skill-details">
                <summary>
                    <span className="agent-skill-updated">
                        Updated {formatDate(skill.updatedAt)}
                    </span>
                    <span className="agent-skill-details-label">Details</span>
                </summary>
                <dl className="agent-skill-metadata">
                    <div>
                        <dt>Publication ID</dt>
                        <dd>
                            <code>{skill.id}</code>
                        </dd>
                    </div>
                    <div>
                        <dt>Type</dt>
                        <dd>{skill.type}</dd>
                    </div>
                    {skill.type === "user" ? (
                        <div>
                            <dt>Intended user</dt>
                            <dd>{person(skill.userId)}</dd>
                        </div>
                    ) : null}
                    <div>
                        <dt>Owner</dt>
                        <dd>{person(skill.ownerId)}</dd>
                    </div>
                    <div>
                        <dt>Created</dt>
                        <dd>
                            {formatTime(skill.createdAt)} by{" "}
                            {person(skill.createdBy)}
                        </dd>
                    </div>
                    <div>
                        <dt>Last updated</dt>
                        <dd>
                            {formatTime(skill.updatedAt)} by{" "}
                            {person(skill.updatedBy)}
                        </dd>
                    </div>
                </dl>
            </details>
            {skill.type === "user" ? (
                <div className="agent-skill-actions">
                    <Button
                        size="sm"
                        appearance="ghost"
                        loading={busy === "download"}
                        disabled={!!busy}
                        aria-label={`Download ZIP for ${skill.name}`}
                        onClick={onDownload}
                    >
                        Download ZIP
                    </Button>
                    {canReplace ? (
                        <>
                            <Button
                                size="sm"
                                appearance="ghost"
                                loading={busy === "replace"}
                                disabled={!!busy}
                                aria-label={`Replace ZIP for ${skill.name}`}
                                onClick={() => fileInput.current?.click()}
                            >
                                Replace ZIP
                            </Button>
                            <input
                                ref={fileInput}
                                type="file"
                                accept=".zip,application/zip"
                                className="agent-skill-file-input"
                                aria-label={`ZIP file to replace ${skill.name}`}
                                tabIndex={-1}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) onReplace(file);
                                }}
                            />
                        </>
                    ) : null}
                    {canManageAccess ? (
                        <Button
                            size="sm"
                            appearance="ghost"
                            disabled={!!busy}
                            aria-label={`Share ${skill.name}`}
                            onClick={onManageAccess}
                        >
                            Share
                        </Button>
                    ) : null}
                </div>
            ) : canManageAccess ? (
                <div className="agent-skill-actions">
                    <Button
                        size="sm"
                        appearance="ghost"
                        aria-label={`Manage access to ${skill.name}`}
                        onClick={onManageAccess}
                    >
                        Manage access
                    </Button>
                </div>
            ) : null}
            {feedback ? (
                <div
                    role={feedback.type === "error" ? "alert" : "status"}
                    className={`agent-skill-feedback feedback-${feedback.type}`}
                >
                    {feedback.message}
                </div>
            ) : null}
        </li>
    );
};

const AgentSkillsPage: FunctionComponent = () => {
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const [filter, setFilter] = useState<AgentSkillFilter>("all");
    const [searchText, setSearchText] = useState("");
    const [query, setQuery] = useState("");
    // pageTokens[n] is the token for page n; page 0 has none.
    const [pageTokens, setPageTokens] = useState<Array<string | undefined>>([
        undefined
    ]);
    const [pageIndex, setPageIndex] = useState(0);
    const [items, setItems] = useState<AgentSkillMetadata[]>([]);
    const [nextPageToken, setNextPageToken] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [busy, setBusy] = useState<
        Record<string, "download" | "replace" | undefined>
    >({});
    const [feedback, setFeedback] = useState<Record<string, ItemFeedback>>({});
    const [managing, setManaging] = useState<AgentSkillMetadata>();
    // Collapsed until the first unfiltered page loads; then open only when
    // there is nothing to browse yet. A user's own toggle always wins.
    const [guideOpen, setGuideOpen] = useState(false);
    const guideDecided = useRef(false);
    const requestSequence = useRef(0);

    const load = useCallback(async () => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError(undefined);
        try {
            const page = await listAgentSkills(filter, {
                q: query,
                pageToken: pageTokens[pageIndex],
                limit: PAGE_SIZE
            });
            if (sequence !== requestSequence.current) return;
            setItems(page.items);
            setNextPageToken(page.hasMore ? page.nextPageToken : undefined);
            if (
                !guideDecided.current &&
                filter === "all" &&
                !query &&
                pageIndex === 0
            ) {
                guideDecided.current = true;
                if (!page.items.length) setGuideOpen(true);
            }
        } catch (error) {
            if (sequence !== requestSequence.current) return;
            setItems([]);
            setNextPageToken(undefined);
            setLoadError(
                error instanceof AgentSkillApiError && error.status === 403
                    ? "You don't have permission to view Agent Skills."
                    : error instanceof Error
                    ? error.message
                    : "Agent Skills could not be loaded."
            );
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, [filter, query, pageTokens, pageIndex]);

    useEffect(() => {
        load();
    }, [load]);

    const resetPaging = () => {
        setPageTokens([undefined]);
        setPageIndex(0);
        setFeedback({});
    };

    const selectFilter = (value: AgentSkillFilter) => {
        if (value === filter) return;
        setFilter(value);
        resetPaging();
    };

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        setQuery(searchText.trim());
        resetPaging();
    };

    const clearSearch = () => {
        setSearchText("");
        setQuery("");
        resetPaging();
    };

    const goNext = () => {
        if (!nextPageToken) return;
        setPageTokens((tokens) => [
            ...tokens.slice(0, pageIndex + 1),
            nextPageToken
        ]);
        setPageIndex(pageIndex + 1);
        setFeedback({});
    };

    const goPrevious = () => {
        if (pageIndex === 0) return;
        setPageIndex(pageIndex - 1);
        setFeedback({});
    };

    const setItemBusy = (id: string, value?: "download" | "replace") =>
        setBusy((current) => ({ ...current, [id]: value }));
    const setItemFeedback = (id: string, value?: ItemFeedback) =>
        setFeedback((current) => {
            const next = { ...current };
            if (value) next[id] = value;
            else delete next[id];
            return next;
        });

    const download = async (skill: AgentSkillMetadata) => {
        setItemBusy(skill.id, "download");
        setItemFeedback(skill.id);
        try {
            const { blob, filename } = await downloadAgentSkillArchive(skill);
            saveBlob(blob, filename);
        } catch (error) {
            setItemFeedback(skill.id, {
                type: "error",
                message:
                    error instanceof AgentSkillApiError && error.status === 403
                        ? "You don't have permission to download this skill."
                        : `The ZIP could not be downloaded: ${
                              error instanceof Error
                                  ? error.message
                                  : "unknown error"
                          }`
            });
        } finally {
            setItemBusy(skill.id);
        }
    };

    const replace = async (skill: AgentSkillMetadata, file: File) => {
        setItemBusy(skill.id, "replace");
        setItemFeedback(skill.id, {
            type: "info",
            message: `Uploading ${file.name}…`
        });
        try {
            const updated = await replaceAgentSkillArchive(skill, file);
            setItems((current) =>
                current.map((item) =>
                    item.id === skill.id ? { ...item, ...updated } : item
                )
            );
            setItemFeedback(skill.id, {
                type: "success",
                message:
                    "Your published skill has been updated. If you already have an Agent Workspace running, ask your agent to resynchronise your skills, or run `mgd agent-skill sync` within Agent Workspace."
            });
        } catch (error) {
            setItemFeedback(skill.id, {
                type: "error",
                message: replaceErrorMessage(error)
            });
        } finally {
            setItemBusy(skill.id);
        }
    };

    const canUpdateUserSkills = hasPermission(
        "object/agentSkill/user/update",
        user
    );
    // Navigation hint only: Agent Services authorizes the typed update of the
    // actual skill before any access change.
    const canManageSystemSkills = hasPermission(
        "object/agentSkill/system/update",
        user
    );

    const renderCatalogue = () => {
        if (loading) {
            return (
                <div className="agent-skills-loading" aria-live="polite">
                    <Loader content="Loading Agent Skills…" />
                </div>
            );
        }
        if (loadError) {
            return (
                <Message showIcon type="error" header="Agent Skills error">
                    <p>{loadError}</p>
                    <Button size="sm" onClick={load}>
                        Try Again
                    </Button>
                </Message>
            );
        }
        if (!items.length) {
            return (
                <p className="agent-skills-empty" role="status">
                    {query
                        ? `No published skills match “${query}”.`
                        : pageIndex > 0
                        ? "There are no more skills."
                        : EMPTY_MESSAGES[filter]}
                </p>
            );
        }
        return (
            <ul className="agent-skills-list" aria-label="Published skills">
                {items.map((skill) => (
                    <AgentSkillCard
                        key={skill.id}
                        skill={skill}
                        currentUserId={user?.id}
                        canReplace={
                            skill.type === "user" &&
                            skill.userId === user?.id &&
                            canUpdateUserSkills
                        }
                        canManageAccess={
                            skill.type === "user"
                                ? skill.userId === user?.id &&
                                  canUpdateUserSkills
                                : canManageSystemSkills
                        }
                        onManageAccess={() => setManaging(skill)}
                        busy={busy[skill.id]}
                        feedback={feedback[skill.id]}
                        onDownload={() => download(skill)}
                        onReplace={(file) => replace(skill, file)}
                    />
                ))}
            </ul>
        );
    };

    return (
        <div className="flex-main-container setting-page-main-container agent-skills-page">
            <SideNavigation />
            <main className="main-content-container">
                <Breadcrumb
                    items={[
                        { title: "Agent Workspace" },
                        { title: "Agent Skills" }
                    ]}
                />
                <section className="agent-skills-panel">
                    <AgentSkillsHeader
                        canOpenWorkspace={canAccessAgentWorkspace(user)}
                    />
                    <AgentSkillsGuide
                        open={guideOpen}
                        canOpenWorkspace={canAccessAgentWorkspace(user)}
                        onToggle={(open) => {
                            guideDecided.current = true;
                            setGuideOpen(open);
                        }}
                    />
                </section>
                <section
                    className="agent-skills-catalogue"
                    aria-labelledby="agent-skills-catalogue-heading"
                    aria-busy={loading}
                >
                    <h2 id="agent-skills-catalogue-heading">
                        Published skills
                    </h2>
                    <div className="agent-skills-controls">
                        <ButtonGroup
                            role="group"
                            aria-label="Show skills"
                            className="agent-skills-filters"
                        >
                            {FILTERS.map((option) => (
                                <Button
                                    key={option.value}
                                    appearance={
                                        filter === option.value
                                            ? "primary"
                                            : "default"
                                    }
                                    aria-pressed={filter === option.value}
                                    onClick={() => selectFilter(option.value)}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </ButtonGroup>
                        <form
                            className="agent-skills-search"
                            role="search"
                            onSubmit={submitSearch}
                        >
                            <Input
                                type="search"
                                aria-label="Search published skills by keyword"
                                placeholder="Keyword search"
                                value={searchText}
                                maxLength={200}
                                onChange={(value) => setSearchText(value)}
                            />
                            <Button type="submit">Search</Button>
                            {query ? (
                                <Button appearance="link" onClick={clearSearch}>
                                    Clear
                                </Button>
                            ) : null}
                        </form>
                    </div>
                    <p className="agent-skills-hint">
                        Keyword search matches whole words in published skill
                        metadata, such as names and descriptions.
                    </p>
                    {renderCatalogue()}
                    {!loading &&
                    !loadError &&
                    (pageIndex > 0 || nextPageToken) ? (
                        <nav
                            className="agent-skills-pagination"
                            aria-label="Published skills pages"
                        >
                            <Button
                                disabled={pageIndex === 0}
                                onClick={goPrevious}
                            >
                                Previous
                            </Button>
                            <span aria-live="polite">Page {pageIndex + 1}</span>
                            <Button disabled={!nextPageToken} onClick={goNext}>
                                Next
                            </Button>
                        </nav>
                    ) : null}
                </section>
            </main>
            <AgentSkillAccessDialog
                skill={managing}
                onClose={() => setManaging(undefined)}
            />
        </div>
    );
};

export default AgentSkillsPage;
