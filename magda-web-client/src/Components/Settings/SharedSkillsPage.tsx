import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { useSelector } from "react-redux";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Modal from "rsuite/Modal";
import Breadcrumb from "./Breadcrumb";
import SideNavigation from "./SideNavigation";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import { hasPermission } from "helpers/accessControlUtils";
import {
    AgentSkillApiError,
    AgentSkillInstallation,
    AgentSkillInstallationItem,
    AgentSkillMetadata,
    installSharedAgentSkill,
    installedNameError,
    listAgentSkillInstallations,
    listAgentSkills,
    listAllAgentSkillInstallations,
    sharingErrorMessage,
    uninstallAgentSkill
} from "../../api-clients/AgentSkillApis";
import "./main.scss";
import "./AgentSkillsPage.scss";

const PAGE_SIZE = 10;

type Tab = "available" | "installed";
type Feedback = { type: "success" | "error" | "info"; message: string };

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

const SYNC_HINT =
    "Nothing changes on your computers yet: running Agent Workspaces receive it at their next skill sync (use Retry / Re-check on Open Workspace), and coding-agent harnesses on your computer when you run `mgd agent-skill sync`.";

export const SharedSkillsGuide: FunctionComponent = () => (
    <details className="agent-skills-guide">
        <summary>How do shared skills work?</summary>
        <div className="agent-skills-guide-body">
            <ul>
                <li>
                    <strong>Sharing permits access.</strong> Another user's
                    published skill appears under All available only after they
                    share it with you.
                </li>
                <li>
                    <strong>Installing is explicit.</strong> A shared skill
                    reaches your Agent Workspace and your coding-agent harnesses
                    only after you install it. You can install it under a
                    different name if the name is already used.
                </li>
                <li>
                    <strong>Updates arrive at the next sync.</strong> When the
                    publisher updates their skill, your installed copies are
                    updated the next time your skills sync. Copies you edited
                    are kept and reported instead of being overwritten.
                </li>
                <li>
                    <strong>Revocation stops future access.</strong> If the
                    publisher stops sharing or deletes the skill, you can no
                    longer download it, and unedited copies are removed at your
                    next successful sync. Copies already on a computer cannot be
                    erased remotely in that moment; uninstall it to tidy up.
                </li>
            </ul>
            <p>
                Uninstalling removes only your installation. The publisher's
                skill is never changed.
            </p>
        </div>
    </details>
);

/** Ask for a different installed name, e.g. after a name conflict. */
export const InstallAliasDialog: FunctionComponent<{
    skill?: AgentSkillMetadata;
    reason?: string;
    suggestedAlias?: string;
    busy: boolean;
    error?: string;
    onInstall: (alias: string) => void;
    onCancel: () => void;
}> = ({ skill, reason, suggestedAlias, busy, error, onInstall, onCancel }) => {
    const [alias, setAlias] = useState("");
    useEffect(() => {
        setAlias(suggestedAlias || "");
    }, [skill, suggestedAlias]);
    const problem = alias ? installedNameError(alias) : undefined;
    const titleId = "install-alias-title";
    return (
        <Modal
            aria-labelledby={titleId}
            backdrop="static"
            open={!!skill}
            onClose={onCancel}
            size="sm"
        >
            <Modal.Header>
                <Modal.Title id={titleId}>
                    Install {skill?.name} under another name
                </Modal.Title>
            </Modal.Header>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!installedNameError(alias)) onInstall(alias);
                }}
            >
                <Modal.Body>
                    {reason ? <p>{reason}</p> : null}
                    <label htmlFor="install-alias-input">Installed name</label>
                    <Input
                        id="install-alias-input"
                        value={alias}
                        maxLength={46}
                        aria-invalid={!!problem}
                        aria-describedby="install-alias-help"
                        onChange={(value) => setAlias(value)}
                    />
                    <p id="install-alias-help" className="agent-skills-hint">
                        {problem ||
                            "Your agent will see the skill under this name. To rename it later, uninstall it and install it again."}
                    </p>
                    {error ? (
                        <p
                            role="alert"
                            className="agent-skill-feedback feedback-error"
                        >
                            {error}
                        </p>
                    ) : null}
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        type="submit"
                        appearance="primary"
                        disabled={busy || !alias || !!problem}
                    >
                        Install
                    </Button>
                    <Button appearance="subtle" onClick={onCancel}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export const SharedSkillCard: FunctionComponent<{
    skill: AgentSkillMetadata;
    installedAs: string[];
    canInstall: boolean;
    busy: boolean;
    feedback?: Feedback;
    onInstall: () => void;
    onInstallAs: () => void;
}> = ({
    skill,
    installedAs,
    canInstall,
    busy,
    feedback,
    onInstall,
    onInstallAs
}) => {
    const headingId = `shared-skill-${skill.id}`;
    return (
        <li className="agent-skill-card" aria-labelledby={headingId}>
            <div className="agent-skill-card-header">
                <h3 id={headingId}>{skill.name}</h3>
                {installedAs.length ? (
                    <span className="agent-skill-type status-installed">
                        Installed
                    </span>
                ) : null}
            </div>
            <p className="agent-skill-description">
                {skill.description || "No description."}
            </p>
            <p className="agent-skill-updated">
                Shared by <code>{skill.userId}</code> · Updated{" "}
                {formatDate(skill.updatedAt)}
            </p>
            {installedAs.length ? (
                <p role="status">
                    Installed as{" "}
                    {installedAs.map((name, index) => (
                        <React.Fragment key={name}>
                            {index ? ", " : ""}
                            <code>{name}</code>
                        </React.Fragment>
                    ))}
                    .
                </p>
            ) : canInstall ? (
                <div className="agent-skill-actions">
                    <Button
                        size="sm"
                        appearance="primary"
                        disabled={busy}
                        aria-label={`Install ${skill.name}`}
                        onClick={onInstall}
                    >
                        Install
                    </Button>
                    <Button
                        size="sm"
                        appearance="ghost"
                        disabled={busy}
                        aria-label={`Install ${skill.name} under another name`}
                        onClick={onInstallAs}
                    >
                        Install as…
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

export const InstalledSkillCard: FunctionComponent<{
    item: AgentSkillInstallationItem;
    canUninstall: boolean;
    busy: boolean;
    feedback?: Feedback;
    onUninstall: () => void;
}> = ({ item, canUninstall, busy, feedback, onUninstall }) => {
    const installation = "problem" in item ? undefined : item;
    const name = installation?.effectiveName || item.id;
    const headingId = `installed-skill-${item.id}`;
    const source = installation?.source;
    return (
        <li className="agent-skill-card" aria-labelledby={headingId}>
            <div className="agent-skill-card-header">
                <h3 id={headingId}>{name}</h3>
                {source?.status === "unavailable" || !installation ? (
                    <span className="agent-skill-type status-unavailable">
                        Unavailable
                    </span>
                ) : null}
            </div>
            {!installation ? (
                <p>
                    This installation record is invalid. Uninstall it; nothing
                    else is affected.
                </p>
            ) : source?.status === "available" ? (
                <>
                    <p className="agent-skill-description">
                        {source.skill.description || "No description."}
                    </p>
                    <p className="agent-skill-updated">
                        {installation.alias
                            ? `Installed as ${installation.alias} from ${source.skill.name}. `
                            : ""}
                        Shared by <code>{source.skill.userId}</code> · Updated{" "}
                        {formatDate(source.skill.updatedAt)}
                    </p>
                </>
            ) : source?.status === "pending" ? (
                <p>
                    The publisher is updating this skill. Your copies are kept
                    and updated at a later sync.
                </p>
            ) : (
                <p>
                    This skill is no longer available to you: it was unshared or
                    deleted. It is not synchronised any more, and unedited
                    copies are removed at your next successful sync. Uninstall
                    it to remove it from this list.
                </p>
            )}
            <details className="agent-skill-details">
                <summary>
                    <span className="agent-skill-details-label">Details</span>
                </summary>
                <dl className="agent-skill-metadata">
                    <div>
                        <dt>Installation ID</dt>
                        <dd>
                            <code>{item.id}</code>
                        </dd>
                    </div>
                    {installation ? (
                        <>
                            <div>
                                <dt>Original skill</dt>
                                <dd>
                                    <code>{installation.sourceSkillId}</code>
                                </dd>
                            </div>
                            <div>
                                <dt>Installed</dt>
                                <dd>{formatDate(installation.createdAt)}</dd>
                            </div>
                        </>
                    ) : null}
                </dl>
            </details>
            {canUninstall ? (
                <div className="agent-skill-actions">
                    <Button
                        size="sm"
                        appearance="ghost"
                        disabled={busy}
                        aria-label={`Uninstall ${name}`}
                        onClick={onUninstall}
                    >
                        Uninstall
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

const SharedSkillsPage: FunctionComponent = () => {
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const canInstall = hasPermission("object/agentSkill/install/create", user);
    const canUninstall = hasPermission(
        "object/agentSkill/install/delete",
        user
    );
    const canReadShared = hasPermission("object/agentSkill/user/read", user);
    const [tab, setTab] = useState<Tab>(
        canReadShared ? "available" : "installed"
    );
    const [searchText, setSearchText] = useState("");
    const [query, setQuery] = useState("");
    const [pageTokens, setPageTokens] = useState<Array<string | undefined>>([
        undefined
    ]);
    const [pageIndex, setPageIndex] = useState(0);
    const [available, setAvailable] = useState<AgentSkillMetadata[]>([]);
    const [installed, setInstalled] = useState<AgentSkillInstallationItem[]>(
        []
    );
    const [allInstalled, setAllInstalled] = useState<
        AgentSkillInstallationItem[]
    >([]);
    const [nextPageToken, setNextPageToken] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>();
    const [busy, setBusy] = useState<string>();
    const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
    const [aliasFor, setAliasFor] = useState<{
        skill: AgentSkillMetadata;
        reason?: string;
        suggestedAlias?: string;
        error?: string;
    }>();
    const [uninstalling, setUninstalling] = useState<
        AgentSkillInstallationItem
    >();
    const sequence = useRef(0);

    const load = useCallback(async () => {
        const current = ++sequence.current;
        setLoading(true);
        setLoadError(undefined);
        try {
            if (tab === "available") {
                const [page, installations] = await Promise.all([
                    listAgentSkills("shared", {
                        q: query,
                        pageToken: pageTokens[pageIndex],
                        limit: PAGE_SIZE
                    }),
                    canUninstall || canInstall
                        ? listAllAgentSkillInstallations()
                        : Promise.resolve([] as AgentSkillInstallationItem[])
                ]);
                if (current !== sequence.current) return;
                setAvailable(page.items);
                setAllInstalled(installations);
                setNextPageToken(page.hasMore ? page.nextPageToken : undefined);
            } else {
                const page = await listAgentSkillInstallations({
                    pageToken: pageTokens[pageIndex],
                    limit: PAGE_SIZE
                });
                if (current !== sequence.current) return;
                setInstalled(page.items);
                setNextPageToken(page.hasMore ? page.nextPageToken : undefined);
            }
        } catch (error) {
            if (current !== sequence.current) return;
            setAvailable([]);
            setInstalled([]);
            setNextPageToken(undefined);
            setLoadError(
                error instanceof AgentSkillApiError && error.status === 403
                    ? "You don't have permission to view shared skills."
                    : sharingErrorMessage(error)
            );
        } finally {
            if (current === sequence.current) setLoading(false);
        }
    }, [tab, query, pageTokens, pageIndex, canInstall, canUninstall]);

    useEffect(() => {
        load();
    }, [load]);

    const installedNames = useMemo(() => {
        const names = new Map<string, string[]>();
        for (const item of allInstalled) {
            if ("problem" in item) continue;
            names.set(item.sourceSkillId, [
                ...(names.get(item.sourceSkillId) || []),
                item.effectiveName
            ]);
        }
        return names;
    }, [allInstalled]);

    const resetPaging = () => {
        setPageTokens([undefined]);
        setPageIndex(0);
        setFeedback({});
    };

    const selectTab = (value: Tab) => {
        if (value === tab) return;
        setTab(value);
        resetPaging();
    };

    const setItemFeedback = (id: string, value?: Feedback) =>
        setFeedback((current) => {
            const next = { ...current };
            if (value) next[id] = value;
            else delete next[id];
            return next;
        });

    const install = async (skill: AgentSkillMetadata, alias?: string) => {
        setBusy(skill.id);
        setItemFeedback(skill.id);
        try {
            const result = await installSharedAgentSkill(skill.id, alias);
            setAliasFor(undefined);
            setItemFeedback(skill.id, {
                type: "success",
                message: `Installed as “${result.effectiveName}”. ${SYNC_HINT}`
            });
            setAllInstalled((current) => [...current, result]);
        } catch (error) {
            if (
                error instanceof AgentSkillApiError &&
                (error.code === "AGENT_SKILL_NAME_CONFLICT" ||
                    error.code === "INVALID_ALIAS")
            ) {
                // Never shadow an existing skill: ask for another name.
                setAliasFor({
                    skill,
                    reason:
                        error.code === "AGENT_SKILL_NAME_CONFLICT"
                            ? `${
                                  alias ? `“${alias}”` : `“${skill.name}”`
                              } is already used by one of your skills. Choose a different name for this installation.`
                            : undefined,
                    suggestedAlias:
                        typeof error.details?.suggestedAlias === "string"
                            ? (error.details.suggestedAlias as string)
                            : alias,
                    error:
                        error.code === "INVALID_ALIAS"
                            ? error.message
                            : undefined
                });
            } else if (aliasFor) {
                setAliasFor({ ...aliasFor, error: sharingErrorMessage(error) });
            } else {
                setItemFeedback(skill.id, {
                    type: "error",
                    message: sharingErrorMessage(error)
                });
            }
        } finally {
            setBusy(undefined);
        }
    };

    const confirmUninstall = async () => {
        const item = uninstalling;
        setUninstalling(undefined);
        if (!item) return;
        setBusy(item.id);
        setItemFeedback(item.id);
        try {
            await uninstallAgentSkill(item.id);
            setInstalled((current) =>
                current.filter((entry) => entry.id !== item.id)
            );
            setItemFeedback(item.id, {
                type: "success",
                message: "Uninstalled."
            });
            setFeedback((current) => ({
                ...current,
                page: {
                    type: "success",
                    message: `Uninstalled ${
                        "problem" in item ? item.id : item.effectiveName
                    }. Copies are removed at your next skill sync; edited copies are kept until you discard them.`
                }
            }));
        } catch (error) {
            setItemFeedback(item.id, {
                type: "error",
                message: sharingErrorMessage(error)
            });
        } finally {
            setBusy(undefined);
        }
    };

    const renderList = () => {
        if (loading) {
            return (
                <div className="agent-skills-loading" aria-live="polite">
                    <Loader content="Loading shared skills…" />
                </div>
            );
        }
        if (loadError) {
            return (
                <Message showIcon type="error" header="Shared Skills error">
                    <p>{loadError}</p>
                    <Button size="sm" onClick={load}>
                        Try Again
                    </Button>
                </Message>
            );
        }
        if (tab === "available") {
            if (!available.length)
                return (
                    <p className="agent-skills-empty" role="status">
                        {query
                            ? `No shared skills match “${query}”.`
                            : pageIndex > 0
                            ? "There are no more shared skills."
                            : "No skills have been shared with you yet. When another user shares a published skill with you, it appears here."}
                    </p>
                );
            return (
                <ul className="agent-skills-list" aria-label="Shared skills">
                    {available.map((skill) => (
                        <SharedSkillCard
                            key={skill.id}
                            skill={skill}
                            installedAs={installedNames.get(skill.id) || []}
                            canInstall={canInstall}
                            busy={busy === skill.id}
                            feedback={feedback[skill.id]}
                            onInstall={() => install(skill)}
                            onInstallAs={() => setAliasFor({ skill })}
                        />
                    ))}
                </ul>
            );
        }
        if (!installed.length)
            return (
                <p className="agent-skills-empty" role="status">
                    {pageIndex > 0
                        ? "There are no more installed skills."
                        : "You haven't installed any shared skills."}
                </p>
            );
        return (
            <ul
                className="agent-skills-list"
                aria-label="Installed shared skills"
            >
                {installed.map((item) => (
                    <InstalledSkillCard
                        key={item.id}
                        item={item}
                        canUninstall={canUninstall}
                        busy={busy === item.id}
                        feedback={feedback[item.id]}
                        onUninstall={() => setUninstalling(item)}
                    />
                ))}
            </ul>
        );
    };

    const tabs: Array<{ value: Tab; label: string }> = [
        ...(canReadShared
            ? [{ value: "available" as Tab, label: "All available" }]
            : []),
        { value: "installed", label: "Installed" }
    ];
    const uninstallName = uninstalling
        ? "problem" in uninstalling
            ? uninstalling.id
            : (uninstalling as AgentSkillInstallation).effectiveName
        : "";

    return (
        <div className="flex-main-container setting-page-main-container agent-skills-page">
            <SideNavigation />
            <main className="main-content-container">
                <Breadcrumb
                    items={[
                        { title: "Agent Workspace" },
                        { title: "Shared Skills" }
                    ]}
                />
                <section className="agent-skills-panel">
                    <div className="agent-skills-header">
                        <h1 className="sr-only">Shared Skills</h1>
                        <p>
                            Find skills other users shared with you, and choose
                            which to install in your Agent Workspace and
                            coding-agent harnesses.
                        </p>
                    </div>
                    <SharedSkillsGuide />
                </section>
                <section className="agent-skills-catalogue" aria-busy={loading}>
                    <div className="agent-skills-controls">
                        <div
                            role="tablist"
                            aria-label="Shared skills"
                            className="agent-skills-filters"
                        >
                            {tabs.map((option) => (
                                <Button
                                    key={option.value}
                                    role="tab"
                                    id={`shared-skills-tab-${option.value}`}
                                    aria-selected={tab === option.value}
                                    aria-controls="shared-skills-panel"
                                    appearance={
                                        tab === option.value
                                            ? "primary"
                                            : "default"
                                    }
                                    onClick={() => selectTab(option.value)}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </div>
                        {tab === "available" ? (
                            <form
                                className="agent-skills-search"
                                role="search"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    setQuery(searchText.trim());
                                    resetPaging();
                                }}
                            >
                                <Input
                                    type="search"
                                    aria-label="Search shared skills by keyword"
                                    placeholder="Keyword search"
                                    value={searchText}
                                    maxLength={200}
                                    onChange={(value) => setSearchText(value)}
                                />
                                <Button type="submit">Search</Button>
                                {query ? (
                                    <Button
                                        appearance="link"
                                        onClick={() => {
                                            setSearchText("");
                                            setQuery("");
                                            resetPaging();
                                        }}
                                    >
                                        Clear
                                    </Button>
                                ) : null}
                            </form>
                        ) : null}
                    </div>
                    <p className="agent-skills-hint">
                        {tab === "available"
                            ? "Skills other users have shared with you. Installing one adds it to your skills; nothing is installed automatically."
                            : "Shared skills you installed. Uninstalling removes only your installation."}
                    </p>
                    <div
                        id="shared-skills-panel"
                        role="tabpanel"
                        aria-labelledby={`shared-skills-tab-${tab}`}
                    >
                        {feedback.page ? (
                            <p
                                role="status"
                                className="agent-skills-page-feedback"
                            >
                                {feedback.page.message}
                            </p>
                        ) : null}
                        {renderList()}
                        {!loading &&
                        !loadError &&
                        (pageIndex > 0 || nextPageToken) ? (
                            <nav
                                className="agent-skills-pagination"
                                aria-label="Shared skills pages"
                            >
                                <Button
                                    disabled={pageIndex === 0}
                                    onClick={() => {
                                        setPageIndex(pageIndex - 1);
                                        setFeedback({});
                                    }}
                                >
                                    Previous
                                </Button>
                                <span aria-live="polite">
                                    Page {pageIndex + 1}
                                </span>
                                <Button
                                    disabled={!nextPageToken}
                                    onClick={() => {
                                        setPageTokens((tokens) => [
                                            ...tokens.slice(0, pageIndex + 1),
                                            nextPageToken
                                        ]);
                                        setPageIndex(pageIndex + 1);
                                        setFeedback({});
                                    }}
                                >
                                    Next
                                </Button>
                            </nav>
                        ) : null}
                    </div>
                </section>
            </main>
            <InstallAliasDialog
                skill={aliasFor?.skill}
                reason={aliasFor?.reason}
                suggestedAlias={aliasFor?.suggestedAlias}
                error={aliasFor?.error}
                busy={!!busy}
                onInstall={(alias) =>
                    aliasFor && install(aliasFor.skill, alias)
                }
                onCancel={() => setAliasFor(undefined)}
            />
            <Modal
                role="alertdialog"
                aria-labelledby="uninstall-title"
                backdrop="static"
                open={!!uninstalling}
                onClose={() => setUninstalling(undefined)}
                size="xs"
            >
                <Modal.Header>
                    <Modal.Title id="uninstall-title">
                        Uninstall {uninstallName}?
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        This removes only your installation. The publisher's
                        skill is not changed, and you can install it again while
                        it is shared with you.
                    </p>
                    <p>
                        Installed copies are removed at your next skill sync.
                        Copies you edited are kept until you discard them.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        color="red"
                        onClick={confirmUninstall}
                    >
                        Uninstall
                    </Button>
                    <Button
                        appearance="subtle"
                        onClick={() => setUninstalling(undefined)}
                    >
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default SharedSkillsPage;
