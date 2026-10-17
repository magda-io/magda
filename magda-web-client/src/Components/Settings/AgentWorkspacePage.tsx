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
    AgentWorkspaceStatus,
    AgentWorkspaceState,
    deleteAgentWorkspace,
    getAgentWorkspaceStatus,
    isAgentWorkspacePollingState,
    isAgentWorkspaceRunning,
    resetAgentWorkspace,
    resumeAgentWorkspace,
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
        <p className="agent-workspace-admin-note">
            Agent Workspace is currently available to administrators only.
        </p>
    </div>
);

export const AgentWorkspaceReady: FunctionComponent<{
    skillSync?: AgentWorkspaceStatus["skillSync"];
    terminateButton?: React.ReactNode;
    resetButton?: React.ReactNode;
}> = ({ skillSync, terminateButton, resetButton }) => (
    <div className="agent-workspace-ready">
        <div className="agent-workspace-toolbar">
            <div className="agent-workspace-toolbar-heading">
                <strong>Agent Workspace</strong>
                <span>Private workspace running with your Magda authority</span>
                {skillSync?.status === "partial" ||
                skillSync?.status === "failed" ? (
                    <span role="status">
                        Some published skills could not be synchronized. The
                        Workspace remains available; run `mgd agent-skill sync`
                        to retry.
                    </span>
                ) : skillSync?.status === "notAttempted" ? (
                    <span role="status">
                        Published skill synchronization has not completed.
                    </span>
                ) : null}
            </div>
            <ButtonToolbar className="agent-workspace-toolbar-actions">
                {terminateButton}
                {resetButton}
            </ButtonToolbar>
        </div>
        <iframe
            className="agent-workspace-runtime"
            src={AGENT_WORKSPACE_RUNTIME_URL}
            title="Agent Workspace"
            allow="clipboard-read; clipboard-write"
        />
    </div>
);

const AgentWorkspacePage: FunctionComponent = () => {
    const [status, setStatus] = useState<AgentWorkspaceStatus>();
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState<
        "start" | "resume" | "terminate" | "reset"
    >();
    const [requestError, setRequestError] = useState<string>();
    const [terminateOpen, setTerminateOpen] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);
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
        return startAgentWorkspaceStatusPolling(
            refresh,
            status?.state === "READY"
                ? READY_POLL_INTERVAL_MS
                : TRANSITION_POLL_INTERVAL_MS
        );
    }, [action, pageVisible, refresh, status?.state]);

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
                <Breadcrumb items={[{ title: "Agent Workspace" }]} />
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
