import React, { FunctionComponent } from "react";
import { useAsync } from "react-async-hook";
import Message from "rsuite/Message";
import {
    getNoAccessHelp,
    listInvocableModels,
    NoAccessHelp
} from "api-clients/LlmServicesApis";
import { config } from "../../config";

/** Only absolute `http:` / `https:` links are shown (DEP-3). */
export function safeHelpUrl(url?: string): string | undefined {
    if (!url) {
        return undefined;
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:"
            ? parsed.toString()
            : undefined;
    } catch (_) {
        return undefined;
    }
}

/** Shown when the operator set no `noAccessHelp.text`. */
export const DEFAULT_NO_ACCESS_HELP_TEXT =
    "Please contact system admin for access.";

/**
 * How to get access (DEP-3 `noAccessHelp`): the operator's text, or a short
 * default, then the operator's link when one is set.
 */
export const NoAccessHelpContent: FunctionComponent<{
    help?: NoAccessHelp | null;
}> = ({ help }) => {
    const text = help?.text?.trim() || DEFAULT_NO_ACCESS_HELP_TEXT;
    const url = safeHelpUrl(help?.url);
    return (
        <p className="llm-no-access-help">
            <span>{text}</span>
            {url ? (
                <>
                    {" "}
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        Request access
                    </a>
                </>
            ) : null}
        </p>
    );
};

/**
 * Has the signed-in user no model to use? `GET /api/v0/llm/v1/models`
 * (API-9) returned no aliases. A failed check answers "unknown" (`null`):
 * the agent's own errors then explain, rather than a guess here.
 */
export async function checkModelAccess(): Promise<{
    help: NoAccessHelp | null;
} | null> {
    if (!config.featureFlags?.llmServices) {
        return null;
    }
    let models: string[];
    try {
        models = await listInvocableModels();
    } catch (_) {
        return null;
    }
    if (models.length) {
        return null;
    }
    let help: NoAccessHelp | null = null;
    try {
        help = await getNoAccessHelp();
    } catch (_) {
        // the message stands without the optional help
    }
    return { help };
}

/**
 * Agent Workspace: no model access (UI doc, acceptance case 10). Shown
 * alongside the Workspace when the user has no eligible model, so the agent
 * doesn't fail without explanation.
 */
const NoModelAccessNotice: FunctionComponent = () => {
    const { result } = useAsync(async () => checkModelAccess(), []);
    if (!result) {
        return null;
    }
    return (
        <Message
            showIcon
            type="warning"
            role="alert"
            className="agent-workspace-no-model-access"
        >
            <p>
                <strong>No AI model access.</strong> Your account can open the
                Agent Workspace but has no LLM access yet.
            </p>
            <NoAccessHelpContent help={result.help} />
        </Message>
    );
};

export default NoModelAccessNotice;
