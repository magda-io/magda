import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useCallback,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import reportError from "helpers/reportError";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Modal from "rsuite/Modal";
import { fetchRecord } from "api-clients/RegistryApis";
import { addDatasetToAccessGroup } from "api-clients/AuthApis";
import AccessGroupSelectionDataGrid from "./AccessGroupSelectionDataGrid";
import "./AccessGroupAddDatasetPopUp.scss";
import reportInfo from "./reportInfo";

type PropsType = {};

type SubmitCompleteHandlerType = (datasetId: string, groupId: string) => void;

export type RefType = {
    open: (datasetId: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

const AccessGroupAddDatasetPopUp: ForwardRefRenderFunction<
    RefType,
    PropsType
> = (props, ref) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [datasetId, setDatasetId] = useState<string>();
    const [datasetName, setDatasetName] = useState<string>("");
    const datasetNameStr = datasetName ? `"${datasetName}" ` : "";
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();

    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onModalClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
        open: (id: string, onComplete?: SubmitCompleteHandlerType) => {
            onCompleteRef.current = onComplete;
            id = id?.trim();
            setDatasetId(id);
            setDataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: () => onModalClose
    }));

    useAsync(
        async (dataReloadToken?: string) => {
            try {
                if (!datasetId) {
                    setDatasetName("");
                } else {
                    const record = await fetchRecord(
                        datasetId,
                        ["dcat-dataset-strings"],
                        [],
                        false,
                        true
                    );
                    setDatasetName(
                        record?.aspects?.["dcat-dataset-strings"]?.title
                            ? record.aspects["dcat-dataset-strings"].title
                            : record?.name
                            ? record.name
                            : ""
                    );
                }
            } catch (e) {
                reportError(`Failed to load dataset data: ${e}`);
            }
        },
        [dataReloadToken]
    );

    const submitData = useAsyncCallback(
        async (groupId: string, groupName: string) => {
            try {
                if (!datasetId) {
                    throw new Error("dataset id cannot be empty!");
                }
                await addDatasetToAccessGroup(datasetId, groupId);
                reportInfo(
                    `Dataset ${datasetNameStr}has been added to access group "${groupName}" successfully!`,
                    { type: "success" }
                );
                setIsOpen(false);
            } catch (e) {
                reportError(
                    `Failed to add dataset ${datasetNameStr}to access group "${groupName}": ${e}`
                );
                throw e;
            }
        }
    );

    return (
        <Modal
            className="access-group-add-dataset-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={onModalClose}
        >
            <Modal.Header>
                <Modal.Title>
                    Add dataset {datasetNameStr}to access group
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <>
                    {submitData.loading ? (
                        <Loader
                            backdrop
                            content={`Adding dataset ${datasetNameStr}to access group...`}
                            vertical
                        />
                    ) : null}
                    <AccessGroupSelectionDataGrid
                        onGroupSeleted={submitData.execute}
                    />
                </>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={onModalClose} disabled={submitData.loading}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(AccessGroupAddDatasetPopUp);
