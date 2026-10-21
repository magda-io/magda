import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import Loader from "rsuite/Loader";
import Modal from "rsuite/Modal";
import OrgUnitDropDown from "../Dataset/Add/OrgUnitDropDown";
import {
    AgentSkillAccess,
    AgentSkillMetadata,
    AgentSkillRecipient,
    addAgentSkillRecipient,
    getAgentSkillAccess,
    listAgentSkillRecipients,
    removeAgentSkillRecipient,
    sharingErrorMessage,
    updateAgentSkillAccess
} from "../../api-clients/AgentSkillApis";

const RECIPIENT_PAGE_SIZE = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Feedback = { type: "success" | "error"; message: string };

function FeedbackLine({ feedback }: { feedback?: Feedback }) {
    if (!feedback) return null;
    return (
        <p
            role={feedback.type === "error" ? "alert" : "status"}
            className={`agent-skill-feedback feedback-${feedback.type}`}
        >
            {feedback.message}
        </p>
    );
}

/**
 * Selected users who may read one publication (#3861): add by MAGDA user ID,
 * search, page and remove with confirmation. Changing this list never
 * installs the skill for anyone, and never changes the published ZIP.
 */
export const SkillRecipientsPanel: FunctionComponent<{
    skill: Pick<AgentSkillMetadata, "type" | "id" | "name">;
}> = ({ skill }) => {
    const [userId, setUserId] = useState("");
    const [searchText, setSearchText] = useState("");
    const [keyword, setKeyword] = useState("");
    const [offset, setOffset] = useState(0);
    const [items, setItems] = useState<AgentSkillRecipient[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<Feedback>();
    const [removing, setRemoving] = useState<AgentSkillRecipient>();
    const sequence = useRef(0);

    const load = useCallback(async () => {
        const current = ++sequence.current;
        setLoading(true);
        try {
            const page = await listAgentSkillRecipients(skill, {
                offset,
                limit: RECIPIENT_PAGE_SIZE,
                keyword
            });
            if (current !== sequence.current) return;
            setItems(page.items);
            setTotal(page.total);
        } catch (error) {
            if (current !== sequence.current) return;
            setItems([]);
            setFeedback({ type: "error", message: sharingErrorMessage(error) });
        } finally {
            if (current === sequence.current) setLoading(false);
        }
    }, [skill, offset, keyword]);

    useEffect(() => {
        load();
    }, [load]);

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        const id = userId.trim().toLowerCase();
        if (!UUID.test(id)) {
            setFeedback({
                type: "error",
                message:
                    "Enter a Magda user ID, for example 00000000-0000-4000-8000-000000000000. Recipients can find their ID on their Account page."
            });
            return;
        }
        setBusy(true);
        setFeedback(undefined);
        try {
            const result = await addAgentSkillRecipient(skill, id);
            setUserId("");
            setFeedback({
                type: "success",
                message: result.added
                    ? `Shared with ${id}. They can now find “${skill.name}” under Shared Skills and choose to install it.`
                    : `${id} already has access.`
            });
            await load();
        } catch (error) {
            setFeedback({ type: "error", message: sharingErrorMessage(error) });
        } finally {
            setBusy(false);
        }
    };

    const confirmRemove = async () => {
        const recipient = removing;
        setRemoving(undefined);
        if (!recipient) return;
        setBusy(true);
        setFeedback(undefined);
        try {
            await removeAgentSkillRecipient(skill, recipient.id);
            setFeedback({
                type: "success",
                message: `Removed ${
                    recipient.displayName || recipient.id
                }. They can no longer read or download “${
                    skill.name
                }”; copies already on their computers are removed at their next successful sync.`
            });
            if (offset > 0 && items.length === 1)
                setOffset(Math.max(0, offset - RECIPIENT_PAGE_SIZE));
            else await load();
        } catch (error) {
            setFeedback({ type: "error", message: sharingErrorMessage(error) });
        } finally {
            setBusy(false);
        }
    };

    const headingId = `recipients-${skill.id}`;
    return (
        <section className="agent-skill-recipients" aria-labelledby={headingId}>
            <h3 id={headingId}>Selected users</h3>
            <form className="agent-skill-recipient-add" onSubmit={add}>
                <label htmlFor={`${headingId}-user`}>Magda user ID</label>
                <Input
                    id={`${headingId}-user`}
                    value={userId}
                    maxLength={36}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    onChange={(value) => setUserId(value)}
                />
                <Button type="submit" appearance="primary" disabled={busy}>
                    Add user
                </Button>
            </form>
            <form
                className="agent-skill-recipient-search"
                role="search"
                onSubmit={(event) => {
                    event.preventDefault();
                    setOffset(0);
                    setKeyword(searchText.trim());
                }}
            >
                <Input
                    type="search"
                    aria-label="Search selected users by ID or display name"
                    placeholder="Search by ID or name"
                    value={searchText}
                    maxLength={200}
                    onChange={(value) => setSearchText(value)}
                />
                <Button type="submit">Search</Button>
            </form>
            <FeedbackLine feedback={feedback} />
            {loading ? (
                <Loader content="Loading users…" />
            ) : items.length ? (
                <table className="agent-skill-recipient-table">
                    <thead>
                        <tr>
                            <th scope="col">User ID</th>
                            <th scope="col">Display name</th>
                            <th scope="col">
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((recipient) => (
                            <tr key={recipient.id}>
                                <td>
                                    <code>{recipient.id}</code>
                                </td>
                                <td>{recipient.displayName || "—"}</td>
                                <td>
                                    <Button
                                        size="sm"
                                        appearance="ghost"
                                        disabled={busy}
                                        aria-label={`Remove ${
                                            recipient.displayName ||
                                            recipient.id
                                        }`}
                                        onClick={() => setRemoving(recipient)}
                                    >
                                        Remove
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p role="status">
                    {keyword
                        ? `No selected users match “${keyword}”.`
                        : "Not shared with any selected users."}
                </p>
            )}
            {total > RECIPIENT_PAGE_SIZE ? (
                <nav
                    className="agent-skills-pagination"
                    aria-label="Selected users pages"
                >
                    <Button
                        disabled={offset === 0}
                        onClick={() =>
                            setOffset(Math.max(0, offset - RECIPIENT_PAGE_SIZE))
                        }
                    >
                        Previous
                    </Button>
                    <span aria-live="polite">
                        {offset + 1}–
                        {Math.min(offset + RECIPIENT_PAGE_SIZE, total)} of{" "}
                        {total}
                    </span>
                    <Button
                        disabled={offset + RECIPIENT_PAGE_SIZE >= total}
                        onClick={() => setOffset(offset + RECIPIENT_PAGE_SIZE)}
                    >
                        Next
                    </Button>
                </nav>
            ) : null}
            <Modal
                role="alertdialog"
                aria-labelledby={`${headingId}-remove-title`}
                backdrop="static"
                open={!!removing}
                onClose={() => setRemoving(undefined)}
                size="xs"
            >
                <Modal.Header>
                    <Modal.Title id={`${headingId}-remove-title`}>
                        Remove access?
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        {removing?.displayName || removing?.id} will no longer
                        be able to read, download or newly install “{skill.name}
                        ”. Copies already on their computers or in their
                        Workspaces are removed at their next successful skill
                        sync; copies they edited are kept until they discard
                        them.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        color="red"
                        onClick={confirmRemove}
                    >
                        Remove access
                    </Button>
                    <Button
                        appearance="subtle"
                        onClick={() => setRemoving(undefined)}
                    >
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
        </section>
    );
};

/**
 * System skill audience (#3861): Public skill (default on), one OrgUnit and
 * selected users. Paths are additive: turning Public off keeps the OrgUnit
 * and users, which then become the only ways to read the skill.
 */
export const SystemSkillAudience: FunctionComponent<{
    skill: Pick<AgentSkillMetadata, "type" | "id" | "name">;
    access: AgentSkillAccess;
    onSaved: (access: AgentSkillAccess) => void;
}> = ({ skill, access, onSaved }) => {
    const [isPublic, setIsPublic] = useState(access.public === true);
    const [orgUnitId, setOrgUnitId] = useState<string | undefined>(
        access.orgUnitId
    );
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<Feedback>();
    const changed =
        isPublic !== (access.public === true) ||
        (orgUnitId || undefined) !== (access.orgUnitId || undefined);

    const save = async () => {
        setSaving(true);
        setFeedback(undefined);
        try {
            const saved = await updateAgentSkillAccess(skill, {
                public: isPublic,
                orgUnitId: orgUnitId || null
            });
            onSaved(saved);
            setFeedback({
                type: "success",
                message:
                    "Access settings saved. Workspaces pick up the change at their next skill sync."
            });
        } catch (error) {
            setFeedback({ type: "error", message: sharingErrorMessage(error) });
        } finally {
            setSaving(false);
        }
    };

    const helpId = `public-help-${skill.id}`;
    return (
        <section
            className="agent-skill-audience"
            aria-label="Who can use this skill"
        >
            <div className="agent-skill-public">
                <input
                    id={`public-${skill.id}`}
                    type="checkbox"
                    checked={isPublic}
                    aria-describedby={helpId}
                    onChange={(event) => setIsPublic(event.target.checked)}
                />{" "}
                <label htmlFor={`public-${skill.id}`}>Public skill</label>
                <p id={helpId} className="agent-skills-hint">
                    When enabled, this skill is available to all users with a
                    system-skill read permission that allows public access,
                    regardless of their organisation or individual grants. It is
                    not available anonymously.
                </p>
            </div>
            <div className="agent-skill-orgunit">
                <label>Organisation</label>
                <OrgUnitDropDown
                    orgUnitId={orgUnitId}
                    onChange={(value) => setOrgUnitId(value)}
                />
            </div>
            <p className="agent-skills-hint">
                {isPublic
                    ? "While Public skill is on, the organisation and selected users below do not restrict who can use this skill. Turn Public skill off to restrict it to them; your selections are kept."
                    : "Only managers, members of the selected organisation and the selected users below can use this skill. With neither, only managers can."}
            </p>
            <Button
                appearance="primary"
                disabled={!changed || saving}
                onClick={save}
            >
                Save access settings
            </Button>
            <FeedbackLine feedback={feedback} />
        </section>
    );
};

/** Manage who can read one published skill. */
const AgentSkillAccessDialog: FunctionComponent<{
    skill?: AgentSkillMetadata;
    onClose: () => void;
}> = ({ skill, onClose }) => {
    const [access, setAccess] = useState<AgentSkillAccess>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        setAccess(undefined);
        setError(undefined);
        if (!skill) return;
        let cancelled = false;
        getAgentSkillAccess(skill).then(
            (value) => !cancelled && setAccess(value),
            (failure) => !cancelled && setError(sharingErrorMessage(failure))
        );
        return () => {
            cancelled = true;
        };
    }, [skill]);

    const titleId = "agent-skill-access-title";
    return (
        <Modal
            aria-labelledby={titleId}
            open={!!skill}
            onClose={onClose}
            size="md"
        >
            <Modal.Header>
                <Modal.Title id={titleId}>
                    {skill?.type === "system"
                        ? `Manage access to ${skill?.name}`
                        : `Share ${skill?.name}`}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {skill?.type === "user" ? (
                    <p>
                        Your skill stays private unless you share it. Users you
                        add can read it and choose to install it from Shared
                        Skills; it is never installed for them automatically.
                        Updates you publish reach their copies at their next
                        skill sync.
                    </p>
                ) : null}
                {error ? (
                    <p
                        role="alert"
                        className="agent-skill-feedback feedback-error"
                    >
                        {error}
                    </p>
                ) : !access || !skill ? (
                    <Loader content="Loading access settings…" />
                ) : (
                    <>
                        {skill.type === "system" ? (
                            <SystemSkillAudience
                                skill={skill}
                                access={access}
                                onSaved={setAccess}
                            />
                        ) : null}
                        <SkillRecipientsPanel skill={skill} />
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="subtle" onClick={onClose}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default AgentSkillAccessDialog;
