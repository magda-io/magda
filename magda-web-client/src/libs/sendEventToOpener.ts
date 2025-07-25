import { config } from "../config";

const { postMessageTargetOrigin } = config;

export const EVENT_TYPE_DATASET_CREATION_COMPLETE = "datasetCreationComplete";
export const EVENT_TYPE_DATASET_EDITING_COMPLETE = "datasetEditingComplete";
export const EVENT_TYPE_DATASET_DRAFT_SAVED = "datasetDraftSaved";
export const EVENT_TYPE_DATASET_EDITOR_REACH_END_PAGE =
    "datasetEditorReachEndPage";

function sendEventToOpener(
    eventType: string,
    eventData: { [key: string]: any }
) {
    if (!window?.opener?.postMessage) {
        return;
    }
    if (!eventType) {
        throw new Error(
            "Failed to sendEventToOpener: eventType cannot be empty"
        );
    }
    try {
        window.opener.postMessage(
            { type: eventType, payload: eventData },
            postMessageTargetOrigin
                ? postMessageTargetOrigin
                : window.location.origin
        );
    } catch (e) {
        console.error("Failed to sendEventToOpener: ", e);
    }
}

export default sendEventToOpener;
