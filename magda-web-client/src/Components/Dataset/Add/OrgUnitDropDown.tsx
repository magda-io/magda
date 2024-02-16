import React, { FunctionComponent, useState } from "react";
import { useSelector } from "react-redux";
import { useAsync } from "react-async-hook";
import TreePicker from "rsuite/TreePicker";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import {
    getRootNode,
    OrgUnit,
    getImmediateChildren,
    getOrgUnitById
} from "api-clients/OrgUnitApis";
import { ItemDataType } from "rsuite/esm/@types/common";
import { User } from "reducers/userManagementReducer";
import ServerError from "@magda/typescript-common/dist/ServerError.js";
import { useValidation, onInputFocusOut } from "./ValidationManager";
import { MdOutlineClear } from "react-icons/md";
import "./OrgUnitDropDown.scss";

interface ItemType extends ItemDataType {
    rawData: OrgUnit;
}

const nodeToItem = (node: OrgUnit): ItemType => ({
    label: node.name,
    value: node.id,
    rawData: { ...node },
    children: []
});

interface PropsType {
    orgUnitId?: string;
    onChange: (orgUnitId?: string) => void;
    validationFieldPath?: string;
    validationFieldLabel?: string;
    cleanable?: boolean;
}

const OrgUnitDropDown: FunctionComponent<PropsType> = (props) => {
    const {
        orgUnitId,
        onChange: onChangeCallback,
        validationFieldPath,
        validationFieldLabel
    } = props;
    const cleanable =
        typeof props.cleanable === "boolean" ? props.cleanable : true;
    const [
        isValidationError,
        validationErrorMessage,
        validationCtlRef
    ] = useValidation<HTMLDivElement>(
        validationFieldPath,
        validationFieldLabel
    );
    const userData = useSelector<any, User>(
        (state) => state?.userManagement?.user
    );
    const [hasSelected, setHasSelected] = useState<boolean>(false);
    const [data, setData] = useState<ItemType[]>([]);
    const { result, loading, error, execute } = useAsync(async () => {
        try {
            const nodes: ItemType[] = [];
            const rootNode = userData?.orgUnit?.id
                ? userData.orgUnit
                : await getRootNode();

            let selectedNode: OrgUnit | undefined;
            if (orgUnitId) {
                try {
                    selectedNode = await getOrgUnitById(orgUnitId);
                } catch (e) {
                    if (!(e instanceof ServerError) || e?.statusCode !== 404) {
                        throw e;
                    }
                }
            }
            nodes.push(nodeToItem(rootNode));
            setData([...nodes]);
            return selectedNode;
        } catch (e) {
            toaster.push(
                <Notification
                    type={"error"}
                    closable={true}
                    header="Error"
                >{`Failed to retrieve user root node: ${e}`}</Notification>,
                {
                    placement: "topEnd"
                }
            );
            throw e;
        }
    }, [userData?.orgUnit?.id]);

    if (loading) {
        return <span>Loading...</span>;
    } else if (error) {
        if (error) {
            console.error(error);
        }
        return (
            <div className="au-body au-page-alerts au-page-alerts--error">
                <span style={{ verticalAlign: "-2px" }}>
                    Could not retrieve data custodians list. Please make sure
                    the organizational structure has been setup by system admin
                    and your account has been assigned to an organizational
                    unit.
                </span>
                <button
                    className="au-btn au-btn--tertiary"
                    onClick={() => execute(orgUnitId)}
                >
                    Try Again
                </button>
            </div>
        );
    } else {
        return (
            <div
                className="org-unit-drop-down-container"
                ref={validationCtlRef}
            >
                {isValidationError ? (
                    <div>
                        <span className="au-error-text">
                            {validationErrorMessage}
                        </span>
                    </div>
                ) : null}
                {hasSelected || !orgUnitId || !cleanable ? null : (
                    <div className="clear-button-container">
                        <MdOutlineClear
                            className="clear-button"
                            onClick={() => {
                                onChangeCallback(undefined);
                                onInputFocusOut(validationFieldPath);
                            }}
                        />
                    </div>
                )}
                <TreePicker
                    className={`org-unit-drop-down ${
                        isValidationError ? "has-validation-error" : ""
                    }`}
                    data={data}
                    size={"lg"}
                    block={true}
                    disabled={loading}
                    searchable={false}
                    placeholder={
                        orgUnitId
                            ? result
                                ? result.name
                                : "Unknown"
                            : "Please Select"
                    }
                    onSelect={(activeNode, value, event) => {
                        setHasSelected(true);
                        onChangeCallback(value as string);
                        onInputFocusOut(validationFieldPath);
                    }}
                    cleanable={cleanable}
                    onClean={() => {
                        onChangeCallback(undefined);
                        onInputFocusOut(validationFieldPath);
                    }}
                    getChildren={async (activeNode) => {
                        try {
                            const nodes = await getImmediateChildren(
                                activeNode?.rawData?.id,
                                true
                            );
                            if (!nodes?.length) {
                                return [] as ItemType[];
                            } else {
                                return nodes.map((node) => ({
                                    label: node.name,
                                    value: node.id,
                                    rawData: node,
                                    children: []
                                }));
                            }
                        } catch (e) {
                            toaster.push(
                                <Notification
                                    type={"error"}
                                    closable={true}
                                    header="Error"
                                >{`Failed to retrieve org unit data: ${e}`}</Notification>,
                                {
                                    placement: "topEnd"
                                }
                            );
                            throw e;
                        }
                    }}
                />
            </div>
        );
    }
};

export default OrgUnitDropDown;
