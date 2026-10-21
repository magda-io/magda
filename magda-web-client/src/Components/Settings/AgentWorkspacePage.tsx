import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import Button from "rsuite/Button";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Modal from "rsuite/Modal";
import Panel from "rsuite/Panel";
import Breadcrumb from "./Breadcrumb";
import SideNavigation from "./SideNavigation";
import {
    AGENT_WORKSPACE_RUNTIME_URL,
    AgentWorkspaceSkillSync,
    AgentWorkspaceStatus,
    AgentWorkspaceState,
    deleteAgentWorkspace,
    getAgentWorkspaceStatus,
    isAgentWorkspacePollingState,
    isAgentWorkspaceRunning,
    resetAgentWorkspace,
    resumeAgentWorkspace,
    retryAgentWorkspaceSkillSync,
    startAgentWorkspace,
    startAgentWorkspaceStatusPolling
} from "../../api-clients/AgentWorkspaceApis";
import "./main.scss";
import "./AgentWorkspacePage.scss";

const TRANSITION_POLL_INTERVAL_MS = 2000;
const READY_POLL_INTERVAL_MS = 10000;

const STATE_DETAILS: Record<
    Exclude<AgentWorkspaceState, "ABSENT" | "READY">,
    { title: string; description: string }
> = {
    ALLOCATING: {
        title: "Allocating your Agent Workspace",
        description: "A private workspace is being assigned to your account."
    },
    BOOTSTRAPPING: {
        title: "Preparing your Agent Workspace",
        description:
            "The agent, Magda tools and your workspace configuration are being prepared."
    },
    SUSPENDING: {
        title: "Suspending your Agent Workspace",
        description: "Your persisted workspace state is being safely suspended."
    },
    SUSPENDED: {
        title: "Agent Workspace suspended",
        description:
            "The workspace was suspended after inactivity. Its persisted files and session state can be resumed."
    },
    RESUMING: {
        title: "Resuming your Agent Workspace",
        description: "Your saved workspace state is being restored."
    },
    DELETING: {
        title: "Deleting the previous Agent Workspace",
        description:
            "The old workspace and its files are being permanently removed."
    },
    FAILED: {
        title: "Agent Workspace failed",
        description: "The workspace could not be prepared or restored."
    },
    DEGRADED: {
        title: "Agent Workspace is unavailable",
        description:
            "The workspace is running in a degraded state and cannot be opened safely."
    }
};

function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "The Agent Workspace request failed. Please try again.";
}

const WorkspaceInformation: FunctionComponent = () => (
    <div className="agent-workspace-information">
        <p>
            Agent Workspace creates one private, managed workspace for your
            Magda account. It includes the DSH-based agent, <code>mgd</code>,
            working files and analysis tools.
        </p>
        <ul>
            <li>
                One current Agent Workspace is supported per user. You can keep
                multiple DSH Sessions in its shared files and tools.
            </li>
            <li>
                The agent acts with your Magda authority. Normal Magda
                authorization rules still apply to everything it does.
            </li>
            <li>
                The workspace may be suspended after inactivity and resumed with
                its persisted files and session state, according to the platform
                lifecycle policy.
            </li>
            <li>
                <strong>Logging out permanently destroys the workspace.</strong>
            </li>
            <li>
                <strong>
                    Resetting or starting a new workspace permanently deletes
                    the current DSH sessions, files and storage volume.
                </strong>
            </li>
            <li>
                Workspace files are temporary, not durable Magda content. Save
                important results first by publishing or uploading them to
                Magda, or by copying them to another durable destination.
            </li>
        </ul>
        <p className="agent-workspace-access-note">
            Agent Workspace access is granted through your Magda roles. You can
            only open your own workspace.
        </p>
    </div>
);

const PROBLEM_REASONS: Record<string, string> = {
    LOCAL_MODIFICATION:
        "edited in this Workspace, so the installed copy was kept",
    UNVERIFIED_SOURCE:
        "a folder with this name wasn't installed from Magda, so it was kept",
    UNRECOGNIZED_DIRECTORY:
        "an unrecognised folder uses this name, so it was kept",
    RECOVERY_RETAINED: "an interrupted update was kept for recovery",
    UNSAFE_PATH: "the installation path is unsafe",
    OPERATION_FAILED: "the installed copy couldn't be updated",
    DOWNLOAD_FAILED: "the published skill couldn't be downloaded",
    SOURCE_UNRESOLVED: "the published source couldn't be resolved",
    MANIFEST_UNAVAILABLE: "the list of published skills couldn't be loaded"
};

function problemReason(code: string) {
    if (PROBLEM_REASONS[code]) return PROBLEM_REASONS[code];
    if (code.startsWith("MANIFEST_WARNING_")) {
        return "the list of published skills couldn't be fully verified";
    }
    return `reason code ${code}`;
}

function countSummary(counts?: AgentWorkspaceSkillSync["counts"]) {
    if (!counts) return undefined;
    const parts = ([
        ["installed", counts.installed],
        ["updated", counts.updated],
        ["unchanged", counts.unchanged],
        ["removed", counts.removed],
        ["kept or skipped", counts.skipped],
        ["failed", counts.failed]
    ] as Array<[string, number]>)
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${count} ${label}`);
    return `Last sync: ${
        parts.length ? parts.join(", ") : "no published skills"
    }`;
}

/** How long a newly completed successful sync stays expanded above DSH. */
export const SKILL_SYNC_SUCCESS_DISPLAY_MS = 15_000;

/**
 * True for SKILL_SYNC_SUCCESS_DISPLAY_MS after a successful Manager sync
 * completes while this page is open. Keyed on `completedAt`, so status
 * polling never restarts it, and a success that completed before the page
 * loaded is not replayed.
 */
export function useNewSkillSyncSuccess(skillSync?: AgentWorkspaceSkillSync) {
    // undefined until the first status; null when it had no completed attempt
    const baseline = useRef<string | null>();
    const [flashing, setFlashing] = useState(false);
    if (baseline.current === undefined && skillSync) {
        baseline.current = skillSync.inProgress
            ? null
            : skillSync.completedAt ?? null;
    }
    const successKey =
        skillSync?.status === "success" && !skillSync.inProgress
            ? skillSync.completedAt
            : undefined;
    useEffect(() => {
        if (!successKey || successKey === baseline.current) return;
        baseline.current = successKey;
        setFlashing(true);
        const timer = setTimeout(
            () => setFlashing(false),
            SKILL_SYNC_SUCCESS_DISPLAY_MS
        );
        return () => {
            clearTimeout(timer);
            setFlashing(false);
        };
    }, [successKey]);
    return flashing;
}

/** Sync states that stay expanded until resolved. */
function needsAttention(skillSync?: AgentWorkspaceSkillSync) {
    return (
        !!skillSync?.inProgress ||
        skillSync?.status === "partial" ||
        skillSync?.status === "failed"
    );
}

function chipLabel(skillSync: AgentWorkspaceSkillSync, retrying?: boolean) {
    if (retrying || skillSync.inProgress) return "Skills: checking…";
    switch (skillSync.status) {
        case "success":
            return "Skills: up to date";
        case "partial":
            return "Skills: need attention";
        case "failed":
            return "Skills: sync failed";
        default:
            return "Skills: not synchronised yet";
    }
}

/**
 * Manager-owned skill sync status, shown above DSH. It never blocks the
 * Workspace. Retry / Re-check is offered after a partial or failed sync.
 */
export const SkillSyncStatusBanner: FunctionComponent<{
    skillSync?: AgentWorkspaceSkillSync;
    retrying?: boolean;
    retryError?: string;
    onRetry?: () => void;
    onDismissError?: () => void;
}> = ({ skillSync, retrying, retryError, onRetry, onDismissError }) => {
    if (!skillSync) return null;
    const inProgress = retrying || skillSync.inProgress;
    const counts = countSummary(skillSync.counts);
    const canRetry =
        !inProgress &&
        !!onRetry &&
        (skillSync.status === "partial" || skillSync.status === "failed");
    let tone: "success" | "warning" | "info" = "info";
    let summary: string;
    if (inProgress) {
        summary = "Checking your published skills…";
    } else if (skillSync.status === "success") {
        tone = "success";
        summary = "Your published skills are up to date.";
    } else if (skillSync.status === "partial") {
        tone = "warning";
        summary = "Some published skills need attention.";
    } else if (skillSync.status === "failed") {
        tone = "warning";
        summary =
            skillSync.diagnosticCode === "REMOTE_SOURCE_FAILED"
                ? "Published skills couldn't be checked because Magda's skill service was unavailable. No installed skills were changed."
                : skillSync.diagnosticCode === "TIMEOUT"
                ? "Skill synchronisation took too long and was stopped."
                : skillSync.diagnosticCode
                ? "Skill synchronisation couldn't run in this Workspace."
                : "Published skills couldn't be synchronised.";
    } else {
        summary = "Published skills haven't been synchronised yet.";
    }
    return (
        <section
            id="agent-workspace-skill-sync"
            className={`agent-workspace-skill-sync tone-${tone}`}
            aria-label="Published skill synchronisation"
        >
            <div className="agent-workspace-skill-sync-main">
                <div role="status" aria-live="polite">
                    {inProgress ? <Loader size="xs" /> : null}
                    <strong>{summary}</strong>
                    {!inProgress && counts ? (
                        <span className="agent-workspace-skill-sync-counts">
                            {" "}
                            ({counts}.)
                        </span>
                    ) : null}
                    {!inProgress && skillSync.status !== "success" ? (
                        <span> Your Workspace remains available.</span>
                    ) : null}
                </div>
                {canRetry ? (
                    <Button size="sm" appearance="ghost" onClick={onRetry}>
                        Retry / Re-check skill sync
                    </Button>
                ) : null}
            </div>
            {!inProgress && skillSync.problems?.length ? (
                <ul className="agent-workspace-skill-sync-problems">
                    {skillSync.problems.map((problem, index) => (
                        <li key={`${problem.name}-${index}`}>
                            <code>{problem.name}</code>:{" "}
                            {problemReason(problem.code)}
                        </li>
                    ))}
                    {skillSync.problemsTruncated ? (
                        <li>More skills need attention.</li>
                    ) : null}
                </ul>
            ) : null}
            {!inProgress && skillSync.status === "partial" ? (
                <p className="agent-workspace-skill-sync-hint">
                    To keep your local changes, ask your agent to resynchronise
                    your skills, or run <code>mgd agent-skill sync</code> within
                    Agent Workspace.
                </p>
            ) : null}
            {retryError ? (
                <p role="alert" className="agent-workspace-skill-sync-error">
                    {retryError}{" "}
                    {onDismissError ? (
                        <Button
                            size="xs"
                            appearance="link"
                            onClick={onDismissError}
                        >
                            Dismiss
                        </Button>
                    ) : null}
                </p>
            ) : null}
        </section>
    );
};

export const SkillSyncRetryDialog: FunctionComponent<{
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ open, onConfirm, onCancel }) => (
    <Modal
        role="alertdialog"
        aria-labelledby="skill-sync-retry-title"
        backdrop="static"
        open={open}
        onClose={onCancel}
        size="sm"
    >
        <Modal.Header>
            <Modal.Title id="skill-sync-retry-title">
                Re-check skills and replace local changes?
            </Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <p>
                This runs a forced skill synchronisation in your current Agent
                Workspace. Installed copies of your published skills and the
                system skills available to you are replaced with their published
                versions.
            </p>
            <p>
                <strong>
                    Local changes to those installed skill folders, including
                    unpublished edits and folders with the same name as a
                    published skill, may be replaced or removed.
                </strong>{" "}
                To keep them, ask your agent to publish them, or copy them
                elsewhere, before continuing.
            </p>
            <p>
                If Magda can't download the published skills, nothing is
                changed. Your Workspace stays available either way.
            </p>
        </Modal.Body>
        <Modal.Footer>
            <Button appearance="primary" color="red" onClick={onConfirm}>
                Replace local changes and re-check
            </Button>
            <Button appearance="subtle" onClick={onCancel}>
                Cancel
            </Button>
        </Modal.Footer>
    </Modal>
);

export const AgentWorkspaceReady: FunctionComponent<{
    skillSync?: AgentWorkspaceStatus["skillSync"];
    terminateButton?: React.ReactNode;
    resetButton?: React.ReactNode;
    retryingSkillSync?: boolean;
    skillSyncRetryError?: string;
    onRetrySkillSync?: () => void;
    onDismissSkillSyncError?: () => void;
}> = ({
    skillSync,
    terminateButton,
    resetButton,
    retryingSkillSync,
    skillSyncRetryError,
    onRetrySkillSync,
    onDismissSkillSyncError
}) => {
    // DSH is the main working area: show sync details above it only while
    // they matter, keeping a compact status in the toolbar otherwise.
    // undefined follows the automatic display; true/false is the user's choice.
    const [expanded, setExpanded] = useState<boolean>();
    const recentSuccess = useNewSkillSyncSuccess(skillSync);
    useEffect(() => {
        // A newly completed sync is shown again even if details were hidden.
        if (recentSuccess) setExpanded(undefined);
    }, [recentSuccess]);
    const pinned =
        !!retryingSkillSync ||
        !!skillSyncRetryError ||
        needsAttention(skillSync);
    const showBanner = !!skillSync && (pinned || (expanded ?? recentSuccess));
    return (
        <div className="agent-workspace-ready">
            <div className="agent-workspace-toolbar">
                <div className="agent-workspace-toolbar-heading">
                    <strong>Agent Workspace</strong>
                    <span>
                        Private workspace running with your Magda authority
                    </span>
                </div>
                <ButtonToolbar className="agent-workspace-toolbar-actions">
                    {skillSync ? (
                        pinned ? (
                            <span className="agent-workspace-skill-chip">
                                {chipLabel(skillSync, retryingSkillSync)}
                            </span>
                        ) : (
                            <Button
                                appearance="subtle"
                                className="agent-workspace-skill-chip"
                                aria-expanded={showBanner}
                                aria-controls="agent-workspace-skill-sync"
                                onClick={() => setExpanded(!showBanner)}
                            >
                                {chipLabel(skillSync)}
                            </Button>
                        )
                    ) : null}
                    {terminateButton}
                    {resetButton}
                </ButtonToolbar>
            </div>
            {showBanner ? (
                <SkillSyncStatusBanner
                    skillSync={skillSync}
                    retrying={retryingSkillSync}
                    retryError={skillSyncRetryError}
                    onRetry={onRetrySkillSync}
                    onDismissError={onDismissSkillSyncError}
                />
            ) : null}
            <iframe
                className="agent-workspace-runtime"
                src={AGENT_WORKSPACE_RUNTIME_URL}
                title="Agent Workspace"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    );
};

const AgentWorkspacePage: FunctionComponent = () => {
    const [status, setStatus] = useState<AgentWorkspaceStatus>();
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState<
        "start" | "resume" | "terminate" | "reset"
    >();
    const [requestError, setRequestError] = useState<string>();
    const [terminateOpen, setTerminateOpen] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);
    const [retryOpen, setRetryOpen] = useState(false);
    const [retryingSkillSync, setRetryingSkillSync] = useState(false);
    const [skillSyncRetryError, setSkillSyncRetryError] = useState<string>();
    const [pageVisible, setPageVisible] = useState(
        typeof document === "undefined" || document.visibilityState !== "hidden"
    );
    const requestSequence = useRef(0);

    const refresh = useCallback(async (showLoading = false) => {
        const sequence = ++requestSequence.current;
        if (showLoading) {
            setLoading(true);
        }
        try {
            const nextStatus = await getAgentWorkspaceStatus();
            if (sequence === requestSequence.current) {
                setStatus(nextStatus);
                setRequestError(undefined);
            }
        } catch (error) {
            if (sequence === requestSequence.current) {
                setRequestError(errorMessage(error));
            }
        } finally {
            if (sequence === requestSequence.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        refresh(true);
        return () => {
            requestSequence.current += 1;
        };
    }, [refresh]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            const visible = document.visibilityState !== "hidden";
            setPageVisible(visible);
            if (visible) {
                // Refresh immediately when returning to a tab that may have been
                // idle long enough for KAS to suspend its workspace.
                refresh();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () =>
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
    }, [refresh]);

    useEffect(() => {
        if (
            !pageVisible ||
            !isAgentWorkspacePollingState(status?.state) ||
            action
        ) {
            return;
        }

        // Transitions need quick feedback, while stable READY polling is slower
        // to avoid continuous Kubernetes API load from open workspace tabs.
        // A running skill re-check also gets quick feedback.
        return startAgentWorkspaceStatusPolling(
            refresh,
            status?.state === "READY" && !status?.skillSync?.inProgress
                ? READY_POLL_INTERVAL_MS
                : TRANSITION_POLL_INTERVAL_MS
        );
    }, [
        action,
        pageVisible,
        refresh,
        status?.state,
        status?.skillSync?.inProgress
    ]);

    // Called only after the user confirmed the forced re-check.
    const retrySkillSync = async () => {
        setRetryOpen(false);
        setRetryingSkillSync(true);
        setSkillSyncRetryError(undefined);
        // Ignore any status response already in flight from before the retry.
        requestSequence.current += 1;
        try {
            const result = await retryAgentWorkspaceSkillSync();
            setStatus((current) =>
                current ? { ...current, skillSync: result.skillSync } : current
            );
        } catch (error) {
            setSkillSyncRetryError(
                `Skill re-check failed: ${errorMessage(error)}`
            );
            refresh();
        } finally {
            setRetryingSkillSync(false);
        }
    };

    const runAction = async (
        nextAction: "start" | "resume" | "terminate" | "reset",
        operation: () => Promise<AgentWorkspaceStatus>
    ) => {
        requestSequence.current += 1;
        setAction(nextAction);
        setRequestError(undefined);
        try {
            const nextStatus = await operation();
            setStatus(nextStatus);
            if (nextAction === "terminate") {
                setTerminateOpen(false);
            } else if (nextAction === "reset") {
                setResetOpen(false);
            }
        } catch (error) {
            setRequestError(errorMessage(error));
        } finally {
            setAction(undefined);
        }
    };

    const terminateButton = (
        <Button
            appearance="ghost"
            color="red"
            disabled={!!action}
            onClick={() => setTerminateOpen(true)}
        >
            Terminate Workspace
        </Button>
    );

    const resetButton = (
        <Button
            appearance="ghost"
            color="red"
            disabled={!!action}
            onClick={() => setResetOpen(true)}
        >
            Start New Workspace
        </Button>
    );

    const renderContent = () => {
        if (loading && !status) {
            return (
                <Panel
                    bordered
                    shaded
                    className="agent-workspace-loading"
                    aria-live="polite"
                >
                    <Loader
                        size="lg"
                        vertical
                        content="Checking Agent Workspace…"
                    />
                </Panel>
            );
        }

        if (!status) {
            return (
                <Panel bordered shaded className="agent-workspace-state-card">
                    <h2>Agent Workspace could not be loaded</h2>
                    <p>
                        Check your connection and try again. If the problem
                        continues, contact your Magda administrator.
                    </p>
                    <Button appearance="primary" onClick={() => refresh(true)}>
                        Try Again
                    </Button>
                </Panel>
            );
        }

        if (status.state === "ABSENT") {
            return (
                <Panel bordered shaded className="agent-workspace-introduction">
                    <h1>Agent Workspace</h1>
                    <WorkspaceInformation />
                    <Button
                        appearance="primary"
                        size="lg"
                        loading={action === "start"}
                        disabled={!!action}
                        onClick={() => runAction("start", startAgentWorkspace)}
                    >
                        Start Agent Workspace
                    </Button>
                </Panel>
            );
        }

        if (isAgentWorkspaceRunning(status.state)) {
            return (
                <AgentWorkspaceReady
                    skillSync={status.skillSync}
                    terminateButton={terminateButton}
                    resetButton={resetButton}
                    retryingSkillSync={retryingSkillSync}
                    skillSyncRetryError={skillSyncRetryError}
                    onRetrySkillSync={() => setRetryOpen(true)}
                    onDismissSkillSyncError={() =>
                        setSkillSyncRetryError(undefined)
                    }
                />
            );
        }

        const details = STATE_DETAILS[status.state];
        const isFailure =
            status.state === "FAILED" || status.state === "DEGRADED";
        const isSuspended = status.state === "SUSPENDED";

        return (
            <Panel
                bordered
                shaded
                className={`agent-workspace-state-card state-${status.state.toLowerCase()}`}
                aria-live="polite"
            >
                {!isFailure && !isSuspended ? (
                    <Loader
                        size="lg"
                        content="Workspace provisioning in progress"
                    />
                ) : null}
                <h1>{details.title}</h1>
                <p>{status.message || details.description}</p>
                {isSuspended ? (
                    <Button
                        appearance="primary"
                        size="lg"
                        loading={action === "resume"}
                        disabled={!!action}
                        onClick={() =>
                            runAction("resume", resumeAgentWorkspace)
                        }
                    >
                        Resume Agent Workspace
                    </Button>
                ) : null}
                {isFailure ? (
                    <ButtonToolbar className="agent-workspace-state-actions">
                        <Button
                            appearance="primary"
                            disabled={!!action}
                            onClick={() => refresh(true)}
                        >
                            {status.retryable === false
                                ? "Check Status"
                                : "Try Again"}
                        </Button>
                        {resetButton}
                    </ButtonToolbar>
                ) : null}
                {status.updatedAt ? (
                    <small>
                        Last updated{" "}
                        {new Date(status.updatedAt).toLocaleString()}
                    </small>
                ) : null}
            </Panel>
        );
    };

    return (
        <div className="flex-main-container setting-page-main-container agent-workspace-page">
            <SideNavigation />
            <main className="main-content-container">
                <Breadcrumb
                    items={[
                        { title: "Agent Workspace" },
                        { title: "Open Workspace" }
                    ]}
                />
                {requestError ? (
                    <Message
                        className="agent-workspace-request-error"
                        showIcon
                        closable
                        type="error"
                        header="Agent Workspace error"
                        onClose={() => setRequestError(undefined)}
                    >
                        {requestError}
                    </Message>
                ) : null}
                {renderContent()}
            </main>

            <SkillSyncRetryDialog
                open={retryOpen}
                onConfirm={retrySkillSync}
                onCancel={() => setRetryOpen(false)}
            />

            <Modal
                role="alertdialog"
                backdrop="static"
                open={terminateOpen}
                onClose={() => !action && setTerminateOpen(false)}
                size="sm"
            >
                <Modal.Header>
                    <Modal.Title>Terminate Agent Workspace?</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        This permanently deletes the current DSH sessions,
                        workspace files and storage volume (PVC). The workspace
                        cannot be recovered.
                    </p>
                    <p>
                        Save important results to Magda or another durable
                        destination before continuing. No replacement workspace
                        will be started automatically.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        color="red"
                        loading={action === "terminate"}
                        disabled={!!action}
                        onClick={() =>
                            runAction("terminate", deleteAgentWorkspace)
                        }
                    >
                        Permanently Terminate Workspace
                    </Button>
                    <Button
                        appearance="subtle"
                        disabled={!!action}
                        onClick={() => setTerminateOpen(false)}
                    >
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal
                role="alertdialog"
                backdrop="static"
                open={resetOpen}
                onClose={() => !action && setResetOpen(false)}
                size="sm"
            >
                <Modal.Header>
                    <Modal.Title>Reset Agent Workspace?</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        This permanently deletes the current DSH sessions,
                        workspace files and storage volume (PVC). The previous
                        workspace cannot be recovered.
                    </p>
                    <p>
                        Save important results to Magda or another durable
                        destination before continuing. A fresh workspace will be
                        provisioned for you.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        color="red"
                        loading={action === "reset"}
                        disabled={!!action}
                        onClick={() => runAction("reset", resetAgentWorkspace)}
                    >
                        Permanently Reset Workspace
                    </Button>
                    <Button
                        disabled={!!action}
                        onClick={() => setResetOpen(false)}
                    >
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default AgentWorkspacePage;
