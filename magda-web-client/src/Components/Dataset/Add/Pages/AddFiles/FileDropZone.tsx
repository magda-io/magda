import React, { FunctionComponent, useCallback } from "react";
import FileDrop from "react-file-drop";
import partial from "lodash/partial";
import {
    State,
    DatasetStateUpdaterType,
    createId,
    Distribution,
    DistributionState,
    DistributionSource,
    saveRuntimeStateToStorage
} from "../../DatasetAddCommon";
import getDownloadUrl from "./getDownloadUrl";
import processFile from "./processFile";
import { getFiles } from "helpers/readFile";

import "./FileDropZone.scss";

type PropsType = {
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    datasetId: string;
    initDistProps?: Partial<Distribution>;
    onError: (error: Error) => void;
    onFilesProcessed?: (dists: Distribution[]) => void;
};

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

function turnPunctuationToSpaces(filename: string) {
    return filename.replace(PUNCTUATION_REGEX, " ");
}
const PUNCTUATION_REGEX = /[-_]+/g;

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return (
            txt.charAt(0).toUpperCase() +
            txt
                .substr(1)
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
        );
    });
}

function fileFormat(file): string {
    const extensionIndex = file.name.lastIndexOf(".");
    const extensionLength = file.name.length - extensionIndex - 1;
    if (extensionIndex !== -1 && extensionLength > 0 && extensionLength < 5) {
        return file.name.substr(extensionIndex + 1).toUpperCase();
    } else {
        return file.type || "unknown";
    }
}

function isDirItem(idx: number, event: any) {
    try {
        if (!event) return false;
        // --- access web browser raw API to test whether it's a directory
        const rawItem = event.dataTransfer.items[idx];
        // --- test `getAsEntry` first as it could be the future standard
        const rawEntry = rawItem.getAsEntry
            ? rawItem.getAsEntry()
            : rawItem.webkitGetAsEntry();
        if (rawEntry.isFile === false || rawEntry.isDirectory === true)
            return true;
        else return false;
    } catch (e) {
        // --- If the API is not supported, the web browser must not support drop a directory
        return false;
    }
}

const FileDropZone: FunctionComponent<PropsType> = (props) => {
    const {
        datasetStateUpdater,
        stateData,
        datasetId,
        onError,
        onFilesProcessed
    } = props;
    const initDistProps = props.initDistProps ? props.initDistProps : {};

    const addFiles = useCallback(
        async (fileList: FileList, event: any = null) => {
            datasetStateUpdater((state) => ({ ...state, error: null }));

            const newDists = [] as Distribution[];

            for (let i = 0; i < fileList.length; i++) {
                const thisFile = fileList.item(i);

                if (!thisFile || isDirItem(i, event)) {
                    // --- skip the directory item
                    continue;
                }

                const distRecordId = createId("dist");

                const dist: Distribution = {
                    id: distRecordId,
                    datasetTitle: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim(),
                    title: thisFile.name,
                    byteSize: thisFile.size,
                    modified: new Date(thisFile.lastModified),
                    format: fileFormat(thisFile),
                    _state: DistributionState.Added,
                    license: "No license",
                    creationSource: DistributionSource.File,
                    useStorageApi: stateData.datasetAccess.useStorageApi
                        ? true
                        : false,
                    downloadURL: stateData.datasetAccess.useStorageApi
                        ? getDownloadUrl(datasetId, distRecordId, thisFile.name)
                        : undefined,
                    // --- allow other component to overwrite distribution status
                    ...initDistProps
                };

                const distAfterProcessing = await processFile(
                    datasetId,
                    thisFile,
                    dist,
                    partial(
                        saveRuntimeStateToStorage,
                        datasetId,
                        datasetStateUpdater
                    ),
                    datasetStateUpdater,
                    stateData.datasetAccess.useStorageApi
                );

                newDists.push(distAfterProcessing);

                if (stateData.datasetAccess.useStorageApi) {
                    // Save now so that we don't end up with orphaned uploaded files
                    // if the user leaves without saving
                    await saveRuntimeStateToStorage(
                        datasetId,
                        datasetStateUpdater
                    );
                }
            }
            if (typeof onFilesProcessed === "function") {
                onFilesProcessed(newDists);
            }
        },
        [
            datasetStateUpdater,
            onFilesProcessed,
            stateData.datasetAccess.useStorageApi,
            datasetId,
            initDistProps
        ]
    );

    const onBrowse = useCallback(async () => {
        try {
            await addFiles(await getFiles("*.*"));
        } catch (e) {
            onError(e);
        }
    }, [onError, addFiles]);

    const onDrop = useCallback(
        async (fileList: FileList | null, event: any) => {
            try {
                if (fileList) {
                    await addFiles(fileList, event);
                }
            } catch (e) {
                onError(e);
            }
        },
        [onError, addFiles]
    );

    return (
        <div className="file-drop-zone row justify-content-center">
            <div className="col-xs-12" onClick={onBrowse}>
                <FileDrop
                    onDrop={onDrop}
                    className="dataset-add-files-dropZone"
                    targetClassName="dataset-add-files-dropTarget"
                >
                    <button
                        className="au-btn filedrop-zone-button"
                        aria-label="Press enter key to upload files"
                    />
                </FileDrop>
            </div>
        </div>
    );
};

export default FileDropZone;
