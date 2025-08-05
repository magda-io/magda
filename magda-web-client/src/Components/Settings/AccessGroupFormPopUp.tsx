import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle,
    useRef
} from "react";
import { whoami } from "../../api-clients/AuthApis";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import TreePicker from "rsuite/TreePicker";
import TagInput from "rsuite/TagInput";
import Input, { InputProps } from "rsuite/Input";
import Checkbox from "rsuite/Checkbox";
import CheckboxGroup from "rsuite/CheckboxGroup";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Form from "rsuite/Form";
import { ItemDataType } from "rsuite/esm/@types/common";
import { OperationRecord } from "@magda/typescript-common/dist/authorization-api/model";
import {
    queryResOperations,
    AccessGroup,
    getAccessGroupById,
    getResourceByUri,
    createAccessGroup,
    updateAccessGroup
} from "api-clients/AuthApis";
import reportError from "../../helpers/reportError";
import { MdInfoOutline } from "react-icons/md";
import omit from "lodash/omit";
import {
    getImmediateChildren,
    OrgUnit,
    getRootNode,
    getOrgUnitById
} from "api-clients/OrgUnitApis";
import "./AccessGroupFormPopUp.scss";

interface OperationDropDownItemType extends ItemDataType {
    rawData: OperationRecord;
}

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

type SubmitCompleteHandlerType = (submittedGroupId: string) => void;

export type RefType = {
    open: (groupId?: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

interface TextareaInputProps extends InputProps {
    rows?: number;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
    (props, ref) => <Input {...props} as="textarea" ref={ref} />
);

type AccessGroupFormData = Partial<AccessGroup>;

interface OrgDropDownItemType extends ItemDataType {
    rawData: OrgUnit;
}

const AccessGroupFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [groupId, setGroupId] = useState<string>();
    const [groupData, setGroupData] = useState<AccessGroupFormData>();
    const isCreateForm = groupId ? false : true;
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();
    const [dataReloadToken, setdataReloadToken] = useState<string>("");
    const [unitOrgData, setUnitOrgData] = useState<OrgDropDownItemType[]>([]);
    const selectedOrgUnitId = groupData?.orgUnitId;

    useImperativeHandle(ref, () => ({
        open: (
            selectedGroupId?: string,
            onComplete?: SubmitCompleteHandlerType
        ) => {
            onCompleteRef.current = onComplete;
            selectedGroupId = selectedGroupId?.trim();
            setGroupId(selectedGroupId);
            if (selectedGroupId === groupId) {
                setdataReloadToken(`${Math.random()}`);
            }
            setIsOpen(true);
        },
        close: () => {
            setGroupId(undefined);
            setIsOpen(false);
        }
    }));

    const { loading, error } = useAsync(
        async (groupId?: string, dataReloadToken?: string) => {
            if (!groupId) {
                setGroupData(undefined);
            } else {
                const record = await getAccessGroupById(groupId);
                setGroupData(record);
                if (!record.resourceUri) {
                    throw new Error(
                        "Invalid Access Group Record. Resource URI cannot be empty."
                    );
                }
            }
        },
        [groupId, dataReloadToken]
    );

    const {
        result: operationItems,
        loading: operationsLoading
    } = useAsync(async () => {
        try {
            const recordResource = await getResourceByUri("object/record");
            if (!recordResource?.id) {
                throw new Error(
                    "Failed to retrieve resource record for uri: object/record"
                );
            }
            const operations = await queryResOperations(recordResource.id, {
                noCache: true
            });
            if (!operations?.length) {
                return [];
            }
            return (
                operations
                    // a user in group should never need `object/record/create` operation
                    // as a dataset is required to be created by someone before adding to the group
                    .filter((item) => item.uri !== "object/record/create")
                    .map((item) => ({
                        label: `${item.uri} (${item.name})`,
                        value: item.uri,
                        rawData: item
                    })) as OperationDropDownItemType[]
            );
        } catch (e) {
            reportError(`Failed to load operation data: ${e}`);
            throw e;
        }
    }, []);

    // load org unit root data
    const { loading: isUserRootNodeLoading } = useAsync(
        async (dataReloadToken: string) => {
            try {
                const user = await whoami();
                let rootNode: OrgUnit | undefined = undefined;
                if (!user?.orgUnitId) {
                    rootNode = await getRootNode(true);
                } else {
                    rootNode = await getOrgUnitById(user.orgUnitId, true);
                }
                if (rootNode) {
                    setUnitOrgData([
                        {
                            label: rootNode.name,
                            value: rootNode.id,
                            rawData: rootNode,
                            children: []
                        }
                    ]);
                }
                return rootNode;
            } catch (e) {
                reportError(`Failed to retrieve user orgUnit root node: ${e}`);
                throw e;
            }
        },
        [dataReloadToken]
    );

    // load selected org unit info
    const {
        result: selectedOrgUnit,
        loading: isSelectedOrgUnitLoading
    } = useAsync(
        async (selectedOrgUnitId?: string, dataReloadToken?: string) => {
            try {
                if (!selectedOrgUnitId) {
                    return undefined;
                }
                const node = await getOrgUnitById(selectedOrgUnitId);
                if (!node) {
                    throw new Error(
                        "Cannot locate orgUnit: " + selectedOrgUnitId
                    );
                }
                return node;
            } catch (e) {
                reportError(
                    `Failed to retrieve the orgUnit node by id ${groupData?.orgUnitId}: ${e}`
                );
                throw e;
            }
        },
        [selectedOrgUnitId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            if (
                typeof groupData?.name !== "string" ||
                !groupData?.name?.trim()
            ) {
                throw new Error("access group name can't be blank!");
            }
            if (!groupData?.operationUris?.length) {
                throw new Error("You must select at least one operation!");
            }

            const submitGroupData = omit(
                { ...groupData, resourceUri: "object/record" },
                [
                    "id",
                    "createTime",
                    "createBy",
                    "editTime",
                    "editBy",
                    "roleId",
                    "permissionId",
                    "ownerId"
                ]
            );

            if (isCreateForm) {
                const newGroup = await createAccessGroup(
                    submitGroupData as any
                );
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(newGroup?.id as string);
                }
            } else {
                await updateAccessGroup(groupId as string, submitGroupData);
                setIsOpen(false);
                if (typeof onCompleteRef.current === "function") {
                    onCompleteRef.current(groupId as string);
                }
            }
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create access group" : "update access group"
                }: ${e}`
            );
            throw e;
        }
    });

    return (
        <Modal
            className="access-group-form-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm
                        ? "Create Access Group"
                        : "Update Access Group"}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve access group: {`${error}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`${
                                    isCreateForm ? "Creating" : "Updating"
                                } Access Group...`}
                                vertical
                            />
                        ) : null}
                        <Form
                            className="access-group-popup-form"
                            disabled={submitData.loading}
                            fluid
                            onChange={setGroupData as any}
                            formValue={groupData as any}
                        >
                            <Form.Group controlId="ctrl-name">
                                <Form.ControlLabel>Name:</Form.ControlLabel>
                                <Form.Control name="name" />
                            </Form.Group>
                            <Form.Group controlId="ctrl-keywords">
                                <Form.ControlLabel>
                                    Keywords (Optional):{" "}
                                    <Whisper
                                        placement="top"
                                        controlId="ctrl-keywords-tooltip-hover"
                                        trigger="hover"
                                        speaker={
                                            <Popover>
                                                <p>
                                                    You can opt to provide a
                                                    list of keywords that are
                                                    available for searching.{" "}
                                                    <br />
                                                    Please press "enter" key to
                                                    finish inputting a new tag.
                                                </p>
                                            </Popover>
                                        }
                                    >
                                        <span>
                                            <MdInfoOutline className="info-icon" />
                                        </span>
                                    </Whisper>
                                </Form.ControlLabel>
                                {/* @ts-ignore */}
                                <Form.Control
                                    name="keywords"
                                    accepter={TagInput}
                                    block
                                />
                            </Form.Group>
                            <Form.Group controlId="ctrl-org-unit-id">
                                <Form.ControlLabel>
                                    Org Unit (Optional):
                                    <Whisper
                                        placement="top"
                                        controlId="ctrl-org-unit-id-tooltip-hover"
                                        trigger="hover"
                                        speaker={
                                            <Popover>
                                                <p>
                                                    You can opt to select which
                                                    Org Unit the access group
                                                    belongs to.
                                                    <br />
                                                    If you leave blank, it will
                                                    be set to the Org Unit that
                                                    your account belongs to.
                                                </p>
                                            </Popover>
                                        }
                                    >
                                        <span>
                                            <MdInfoOutline className="info-icon" />
                                        </span>
                                    </Whisper>
                                </Form.ControlLabel>
                                {isUserRootNodeLoading ||
                                isSelectedOrgUnitLoading ? (
                                    <Loader content="Loading orgUnit data..." />
                                ) : (
                                    <TreePicker
                                        data={unitOrgData}
                                        block={true}
                                        placeholder={
                                            selectedOrgUnit
                                                ? selectedOrgUnit.name
                                                : "Select OrgUnit..."
                                        }
                                        disabled={submitData.loading}
                                        onChange={(value) => {
                                            setGroupData((groupData) => ({
                                                ...groupData,
                                                orgUnitId: value
                                                    ? (value as string)
                                                    : undefined
                                            }));
                                        }}
                                        getChildren={async (activeNode) => {
                                            try {
                                                const nodes = await getImmediateChildren(
                                                    activeNode?.rawData?.id,
                                                    true
                                                );
                                                if (!nodes?.length) {
                                                    return [] as OrgDropDownItemType[];
                                                } else {
                                                    return nodes.map(
                                                        (node) => ({
                                                            label: node.name,
                                                            value: node.id,
                                                            rawData: node,
                                                            children: []
                                                        })
                                                    );
                                                }
                                            } catch (e) {
                                                reportError(
                                                    `Failed to retrieve org unit data: ${e}`
                                                );
                                                throw e;
                                            }
                                        }}
                                    />
                                )}
                            </Form.Group>
                            <Form.Group controlId="ctrl-operationIds">
                                <Form.ControlLabel>
                                    Operations:
                                </Form.ControlLabel>
                                {operationsLoading ? (
                                    <Loader content="Loading operations data..." />
                                ) : (
                                    <Form.Control
                                        name="operationUris"
                                        accepter={CheckboxGroup}
                                    >
                                        {operationItems?.map((item, idx) => (
                                            <Checkbox
                                                value={item.value}
                                                key={idx}
                                            >
                                                {item.label}
                                            </Checkbox>
                                        ))}
                                    </Form.Control>
                                )}
                            </Form.Group>
                            <Form.Group controlId="ctrl-description">
                                <Form.ControlLabel>
                                    Description:
                                </Form.ControlLabel>
                                <Form.Control
                                    rows={5}
                                    name="description"
                                    accepter={Textarea}
                                />
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={!!error || submitData.loading}
                >
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(AccessGroupFormPopUp);
