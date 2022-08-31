import React, { FunctionComponent, SyntheticEvent } from "react";
import Button from "rsuite/Button";
import ConfirmDialog from "./ConfirmDialog";
import { MdDeleteForever } from "react-icons/md";
import { useAsyncCallback } from "react-async-hook";
import reportError from "../../helpers/reportError";
import { deleteRecordAspect } from "api-clients/RegistryApis";

type PropsType = {
    recordId: string;
    aspectId: string;
    onDeleteComplete?: () => void;
};

const DeleteRecordAspectButton: FunctionComponent<PropsType> = (props) => {
    const { aspectId, recordId, onDeleteComplete } = props;

    const actionHandler = useAsyncCallback(async () => {
        try {
            if (!aspectId) {
                throw new Error(
                    "Failed to delete the record aspect: aspectId can't be blank."
                );
            }
            if (!recordId) {
                throw new Error(
                    "Failed to delete the record aspect: recordId can't be blank."
                );
            }
            await deleteRecordAspect(recordId, aspectId);
            if (typeof onDeleteComplete === "function") {
                onDeleteComplete();
            }
        } catch (e) {
            reportError(`Failed to delete record aspect: ${e}`);
            throw e;
        }
    });

    return (
        <Button
            onClick={(e: SyntheticEvent) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                ConfirmDialog.open({
                    confirmMsg:
                        "Please confirm the deletion of the record aspect: " +
                        aspectId,
                    loadingText: "Deleting, please wait...",
                    confirmHandler: actionHandler.execute
                });
            }}
        >
            <MdDeleteForever />
        </Button>
    );
};

export default DeleteRecordAspectButton;
