import getAbsoluteUrlPath from "./getAbsoluteUrlPath";
import openWindow from "./openWindow";

const openRegistryRecordEditor = (recordId: string) =>
    openWindow(
        getAbsoluteUrlPath(
            `/settings/records/${encodeURIComponent(recordId)}?popup`
        )
    );

export default openRegistryRecordEditor;
