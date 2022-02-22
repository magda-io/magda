import React, { FunctionComponent, useState, useRef, useCallback } from "react";
import { withRouter, match } from "react-router-dom";
import { Location, History } from "history";
import "./main.scss";
import "./OrgUnitsPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
import { whoami } from "../../api-clients/AuthApis";
import {
    getRootNode,
    getImmediateChildren,
    moveSubTree,
    deleteNode,
    deleteSubTree
} from "../../api-clients/OrgUnitApis";
import { useAsync } from "react-async-hook";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Tree from "rsuite/Tree";
import Dropdown from "rsuite/Dropdown";
import { OrgUnit } from "reducers/userManagementReducer";
import { ItemDataType } from "rsuite/esm/@types/common";
import {
    MdFolder,
    MdCreateNewFolder,
    MdOutlinePageview,
    MdFolderSpecial,
    MdDeleteForever,
    MdEditNote
} from "react-icons/md";
import ViewOrgUnitPopUp, {
    RefType as ViewOrgUnitPopUpRefType
} from "./ViewOrgUnitPopUp";
import reportError from "./reportError";
import OrgUnitFormPopUp, {
    RefType as OrgUnitFormPopUpRefType
} from "./OrgUnitFormPopUp";
import ConfirmDialog from "./ConfirmDialog";

interface ItemType extends ItemDataType {
    rawData: OrgUnit;
}

type PropsType = {
    location: Location;
    history: History;
    match: match<{ userId: string }>;
};

const OrgUnitsPage: FunctionComponent<PropsType> = (props) => {
    const [data, setData] = useState<ItemType[]>([]);
    const viewDetailPopUpRef = useRef<ViewOrgUnitPopUpRefType>(null);
    const orgUnitFormRef = useRef<OrgUnitFormPopUpRefType>(null);
    //change this value to force the role data to be reloaded
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const deleteNodeHandler = useCallback(
        (nodeId: string, nodeName: string) => {
            ConfirmDialog.open({
                confirmMsg: `Please confirm the deletion of org unit "${nodeName}"?
            Only this Org Unit will be deleted and all sub trees belong to it will be moved to its parent Org Unit.`,
                confirmHandler: async () => {
                    try {
                        if (!nodeId) {
                            throw new Error("Invalid empty org unit id!");
                        }
                        await deleteNode(nodeId);
                        setDataReloadToken(`${Math.random()}`);
                    } catch (e) {
                        reportError(`Failed to delete the node: ${e}`);
                    }
                }
            });
        },
        []
    );

    const deleteSubTreeHandler = useCallback(
        (nodeId: string, nodeName: string) => {
            ConfirmDialog.open({
                confirmMsg: `Please confirm the deletion of org unit sub tree starting with org unit "${nodeName}"?
                All org units nodes belongs to the sub tree will be deleted.`,
                confirmHandler: async () => {
                    try {
                        if (!nodeId) {
                            throw new Error("Invalid empty org unit id!");
                        }
                        await deleteSubTree(nodeId);
                        setDataReloadToken(`${Math.random()}`);
                    } catch (e) {
                        reportError(`Failed to delete the sub tree: ${e}`);
                    }
                }
            });
        },
        []
    );

    function createNodeLabel(node: OrgUnit, isRoot?: boolean) {
        return (
            <Dropdown
                title={<span className="node-title">{node.name}</span>}
                icon={isRoot ? <MdFolderSpecial /> : <MdFolder />}
            >
                <Dropdown.Item
                    icon={<MdCreateNewFolder />}
                    onClick={() =>
                        orgUnitFormRef?.current?.open(
                            undefined,
                            () => setDataReloadToken(`${Math.random()}`),
                            node.id
                        )
                    }
                >
                    <span className="node-dropdown-menu-item-text">New</span>
                </Dropdown.Item>
                <Dropdown.Item
                    icon={<MdEditNote />}
                    onClick={() =>
                        orgUnitFormRef?.current?.open(node.id, () =>
                            setDataReloadToken(`${Math.random()}`)
                        )
                    }
                >
                    <span className="node-dropdown-menu-item-text">Edit</span>
                </Dropdown.Item>
                <Dropdown.Item
                    icon={<MdOutlinePageview />}
                    onClick={() => viewDetailPopUpRef?.current?.open(node.id)}
                >
                    <span className="node-dropdown-menu-item-text">
                        View Details
                    </span>
                </Dropdown.Item>
                {isRoot ? null : (
                    <>
                        <Dropdown.Item
                            icon={<MdDeleteForever />}
                            onClick={() =>
                                deleteNodeHandler(node.id, node.name)
                            }
                        >
                            <span className="node-dropdown-menu-item-text">
                                Delete
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            icon={<MdDeleteForever />}
                            onClick={() =>
                                deleteSubTreeHandler(node.id, node.name)
                            }
                        >
                            <span className="node-dropdown-menu-item-text">
                                Delete Sub Tree
                            </span>
                        </Dropdown.Item>
                    </>
                )}
            </Dropdown>
        );
    }

    const { result: userRootNode, loading: isUserRootNodeLoading } = useAsync(
        async (dataReloadToken: string) => {
            try {
                const userInfo = await whoami();
                let rootNode: OrgUnit;
                if (userInfo?.orgUnit?.id) {
                    rootNode = userInfo.orgUnit;
                } else {
                    rootNode = await getRootNode(true);
                }
                setData([
                    {
                        label: createNodeLabel(rootNode, true),
                        value: rootNode.id,
                        rawData: rootNode,
                        children: []
                    }
                ]);
                return rootNode;
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
        },
        [dataReloadToken]
    );

    return (
        <div className="flex-main-container setting-page-main-container org-units-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={[{ title: "Org Units" }]} />
                <AccessVerification operationUri="authObject/orgUnit/read" />
                <OrgUnitFormPopUp ref={orgUnitFormRef} />
                <ViewOrgUnitPopUp ref={viewDetailPopUpRef} />
                {isUserRootNodeLoading ? (
                    <Loader content="Loading..." />
                ) : !userRootNode ? (
                    <Message showIcon type="warning">
                        Cannot locate the root node.
                    </Message>
                ) : (
                    <Tree
                        draggable
                        data={data}
                        style={{ width: 280 }}
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
                                        label: createNodeLabel(node),
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
                        onDrop={async (
                            { dragNode, dropNode, createUpdateDataFunction },
                            event
                        ) => {
                            try {
                                await moveSubTree(
                                    dragNode?.rawData?.id,
                                    dropNode?.rawData?.id
                                );
                                setData(
                                    createUpdateDataFunction(data) as any[]
                                );
                            } catch (e) {
                                toaster.push(
                                    <Notification
                                        type={"error"}
                                        closable={true}
                                        header="Error"
                                    >{`Failed to move org unit: ${e}`}</Notification>,
                                    {
                                        placement: "topEnd"
                                    }
                                );
                                throw e;
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default withRouter(OrgUnitsPage);
