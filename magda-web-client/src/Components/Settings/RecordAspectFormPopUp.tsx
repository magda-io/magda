import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle,
    useRef
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import SelectPicker from "rsuite/SelectPicker";
import { useAsync, useAsyncCallback } from "react-async-hook";
import "./RecordAspectFormPopUp.scss";
import {
    getAspectDefs,
    getRecordAspect,
    updateRecordAspect,
    RecordAspectRecord,
    AspectDefRecord
} from "api-clients/RegistryApis";
import Form from "rsuite/Form";
import reportError from "../../helpers/reportError";
import { ItemDataType } from "rsuite/esm/@types/common";
import "jsoneditor-react/es/editor.min.css";

interface AspectDefDropdownItemType extends ItemDataType<string> {
    rawData: AspectDefRecord;
}

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    recordId: string;
};

type SubmitCompleteHandlerType = (submittedAspectId: string) => void;

export type RefType = {
    open: (aspectId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

function compareAspectDefDropdownItem(
    a: AspectDefDropdownItemType,
    b: AspectDefDropdownItemType
) {
    const aStr = a.rawData?.name?.toLowerCase();
    const bStr = b.rawData?.name?.toLowerCase();
    if (aStr < bStr) return -1;
    else if (aStr > bStr) return 1;
    else return 0;
}

const RecordAspectFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const { recordId } = props;
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [aspectId, setAspectId] = useState<string>();
    const [aspect, setAspect] = useState<Partial<RecordAspectRecord>>();
    const isCreateForm = aspectId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [aspectReloadToken, setAspectReloadToken] = useState<string>("");
    const editorRef = useRef<any>();

    const {
        result: JsonEditor,
        loading: loadingJsonEditor
    } = useAsync(async () => {
        try {
            const [{ JsonEditor }, ace] = await Promise.all([
                import(/* webpackChunkName:'jsoneditor' */ "jsoneditor-react"),
                import(/* webpackChunkName:'jsoneditor' */ "brace"),
                import(/* webpackChunkName:'jsoneditor' */ "brace/mode/json"),
                import(/* webpackChunkName:'jsoneditor' */ "brace/theme/github")
            ]);
            return function EditorHoc(props) {
                return (
                    <div className="json-editor-container">
                        <JsonEditor
                            ref={editorRef}
                            name="jsonSchema"
                            ace={ace}
                            mode={"code"}
                            allowedModes={["code", "tree", "form"]}
                            theme="ace/theme/github"
                            {...props}
                        />
                    </div>
                );
            };
        } catch (e) {
            reportError(`Failed to load JSON editor: ${e}`);
            throw e;
        }
    }, []);

    useImperativeHandle(ref, () => ({
        open: (
            selectAspectId?: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            if (typeof selectAspectId === "string") {
                selectAspectId = selectAspectId.trim();
                if (selectAspectId) {
                    setAspectId(selectAspectId);
                }
                if (selectAspectId === aspectId) {
                    setAspectReloadToken(`${Math.random()}`);
                }
            } else {
                setAspectId(undefined);
            }
            setIsOpen(true);
        },
        close: () => setIsOpen(false)
    }));

    const { loading, error } = useAsync(
        async (
            recordId: string,
            aspectId?: string,
            recordReloadToken?: string
        ) => {
            if (!aspectId) {
                setAspect(undefined);
            } else {
                const aspectData = await getRecordAspect(
                    recordId,
                    aspectId,
                    true
                );
                setAspect({
                    id: aspectId,
                    data: aspectData
                });
            }
        },
        [recordId, aspectId, aspectReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (typeof recordId !== "string" || !recordId.trim()) {
                throw new Error("Record ID can't be blank!");
            }
            if (typeof aspect?.id !== "string" || !aspect.id.trim()) {
                throw new Error("Aspect ID can't be blank!");
            }
            const aspectData = editorRef?.current?.jsonEditor?.get();
            if (typeof aspectData !== "object") {
                throw new Error("Aspect data can't be an empty value!");
            }
            if (editorRef?.current?.err) {
                throw new Error(`${editorRef?.current?.err}`);
            }

            if (isCreateForm) {
                try {
                    await getRecordAspect(recordId, aspect.id, true);
                    throw new Error(
                        `the record already has the ${aspect.id} aspect.`
                    );
                } catch (e) {
                    if ((e as any)?.statusCode !== 404) {
                        throw e;
                    }
                }
            }

            await updateRecordAspect(
                recordId,
                aspect.id,
                aspectData,
                false,
                true
            );
            setIsOpen(false);
            if (typeof onCompleteRef.current === "function") {
                onCompleteRef.current(aspect.id);
            }
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm
                        ? "create record aspect"
                        : "update record aspect"
                }: ${e}`
            );
            throw e;
        }
    });

    const {
        result: aspectDefDropdownData,
        loading: loadingAspectDefDropdownData
    } = useAsync(async () => {
        try {
            if (!isCreateForm) {
                // not create form, not need to generate aspect def select dropdown
                return [];
            }
            const aspectDefs = await getAspectDefs(true);
            return aspectDefs.map(
                (item) =>
                    ({
                        value: item.id,
                        label: item.name,
                        rawData: item
                    } as AspectDefDropdownItemType)
            );
        } catch (e) {
            reportError(`Failed to retrieve aspect definition list: ${e}`);
            throw e;
        }
    }, []);

    return (
        <Modal
            className="record-aspect-form-popup"
            overflow={true}
            size="lg"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm
                        ? "Create Record Aspect"
                        : "Edit Record Aspect"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve record aspect: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "updating"
                                } record aspect...`}
                                vertical
                            />
                        ) : null}
                        <Form className="record-aspect-form-popup-form" fluid>
                            <Form.Group controlId="aspect-id">
                                <Form.ControlLabel>Aspect ID</Form.ControlLabel>
                                {isCreateForm ? (
                                    <SelectPicker
                                        virtualized
                                        block
                                        disabled={submitData.loading}
                                        data={
                                            aspectDefDropdownData
                                                ? aspectDefDropdownData
                                                : []
                                        }
                                        onChange={(aspectId) =>
                                            setAspect((v) => ({
                                                ...v,
                                                id: aspectId
                                                    ? aspectId
                                                    : undefined
                                            }))
                                        }
                                        sort={() =>
                                            compareAspectDefDropdownItem
                                        }
                                    />
                                ) : (
                                    <Form.Control
                                        name="id"
                                        disabled={true}
                                        value={aspect?.id ? aspect.id : ""}
                                    />
                                )}

                                {isCreateForm ? (
                                    <Form.HelpText>Required</Form.HelpText>
                                ) : null}
                            </Form.Group>
                            <Form.Group controlId="aspect-data">
                                <Form.ControlLabel>
                                    Aspect data:
                                </Form.ControlLabel>
                                {loadingJsonEditor ? (
                                    <Paragraph rows={6}>
                                        <Loader
                                            center
                                            content="loading editor..."
                                        />
                                    </Paragraph>
                                ) : JsonEditor ? (
                                    <JsonEditor
                                        value={aspect?.data ? aspect.data : {}}
                                        onError={(e) => reportError(`${e}`)}
                                        onChange={(jsonData) => {
                                            setAspect((v) => ({
                                                ...v,
                                                data: jsonData
                                            }));
                                        }}
                                    />
                                ) : (
                                    "Error: cannot load JsonEditor."
                                )}
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="primary" onClick={submitData.execute}>
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(RecordAspectFormPopUp);
