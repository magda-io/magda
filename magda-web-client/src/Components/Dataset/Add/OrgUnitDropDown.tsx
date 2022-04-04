import React, { useState } from "react";
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
import ServerError from "@magda/typescript-common/dist/ServerError";
import "./OrgUnitDropDown.scss";

interface ItemType extends ItemDataType {
    rawData: OrgUnit;
}

type Props = {
    orgUnitId?: string;
    onChange: (orgUnitId: string) => void;
};

const nodeToItem = (node: OrgUnit): ItemType => ({
    label: node.name,
    value: node.id,
    rawData: { ...node },
    children: []
});

export default function OrgUnitDropDown({
    orgUnitId,
    onChange: onChangeCallback
}: Props) {
    const userData = useSelector<any, User>(
        (state) => state?.userManagement?.user
    );
    const [data, setData] = useState<ItemType[]>([]);
    const { result, loading, error, execute } = useAsync(async () => {
        try {
            const nodes: ItemType[] = [];
            const rootNode = userData?.orgUnit?.id
                ? userData.orgUnit
                : await getRootNode();

            let selectedNode: OrgUnit | null = null;
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
            <TreePicker
                className="org-unit-drop-down"
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
                    onChangeCallback(value as string);
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
        );
    }
}
