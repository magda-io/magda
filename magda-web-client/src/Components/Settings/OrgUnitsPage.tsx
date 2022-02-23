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
    isRootNode: boolean;
    children?: ItemType[];
}

type PropsType = {
    location: Location;
    history: History;
    match: match<{ userId: string }>;
};

/**
 * search in the in-memory tree data structure by node id.
 * Will return an object with refs to locate `node` & possible parent node.
 * If can't find the node, it will return an empty object.
 *
 * @param {ItemType[]} data
 * @param {string} nodeId
 * @return {*}  {{ node?: ItemType; parentNode?: ItemType }}
 */
function searchNodeById(
    nodeId: string,
    data?: ItemType[],
    parentNode?: ItemType
): { node?: ItemType; parentNode?: ItemType } {
    if (!data?.length) {
        return {};
    }
    for (let i = 0; i < data.length; i++) {
        const curNode = data[i];
        if (curNode?.rawData?.id === nodeId) {
            return {
                node: curNode,
                parentNode
            };
        }
        const result = searchNodeById(nodeId, curNode?.children, curNode);
        if (result?.node) {
            return result;
        }
    }
    return {};
}

const OrgUnitsPage: FunctionComponent<PropsType> = (props) => {
    const [data, setData] = useState<ItemType[]>([]);
    const [expandItemValues, setExpandItemValues] = useState<ItemDataType[]>(
        []
    );
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

    const createNodeLabel = useCallback(
        (node: OrgUnit, isRoot?: boolean) => {
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
                                async (newNode, newNodeId, parentNodeId) => {
                                    // when edit, newNodeId should be undefined
                                    if (!parentNodeId) {
                                        reportError(
                                            "Cannot update in memory tree data after the new node creation: parentNodeId is undefined"
                                        );
                                        return;
                                    }
                                    const { node: parentNode } = searchNodeById(
                                        parentNodeId,
                                        data
                                    );
                                    if (!parentNode) {
                                        reportError(
                                            "Cannot update in memory tree data after the new node creation: cannot locate parent node with ID: " +
                                                parentNodeId
                                        );
                                        return;
                                    }
                                    if (
                                        expandItemValues.indexOf(
                                            parentNode.rawData.id as any
                                        ) !== -1
                                    ) {
                                        // parent node has been expanded
                                        if (parentNode?.children?.length) {
                                            parentNode.children = [];
                                        }
                                        parentNode.children = [
                                            ...(parentNode.children as ItemType[]),
                                            nodeToTreeItem(newNode)
                                        ];
                                    } else {
                                        // parent node has been not been expanded yet
                                        //setIsDataLoading(true);
                                        const nodes = await getChildrenHandler(
                                            parentNode
                                        );
                                        parentNode.children = nodes;
                                    }
                                    setData((data) => [...data]);
                                },
                                node.id
                            )
                        }
                    >
                        <span className="node-dropdown-menu-item-text">
                            New
                        </span>
                    </Dropdown.Item>
                    <Dropdown.Item
                        icon={<MdEditNote />}
                        onClick={() =>
                            orgUnitFormRef?.current?.open(
                                node.id,
                                (newNode, newNodeId, parentNodeId) => {
                                    // when edit, parentNodeId should be undefined
                                    if (!newNodeId) {
                                        reportError(
                                            "Cannot update in memory tree data after the new node creation: newNodeId is undefined"
                                        );
                                        return;
                                    }
                                    const {
                                        node: nodeCurrentData
                                    } = searchNodeById(newNodeId, data);
                                    if (!nodeCurrentData) {
                                        reportError(
                                            "Cannot update in memory tree data after the new node creation: cannot locate node with ID: " +
                                                newNodeId
                                        );
                                        return;
                                    }
                                    nodeCurrentData.rawData = {
                                        ...nodeCurrentData.rawData,
                                        ...newNode
                                    };
                                    nodeCurrentData.label = createNodeLabel(
                                        nodeCurrentData.rawData,
                                        nodeCurrentData.isRootNode
                                    );
                                    setData((data) => [...data]);
                                }
                            )
                        }
                    >
                        <span className="node-dropdown-menu-item-text">
                            Edit
                        </span>
                    </Dropdown.Item>
                    <Dropdown.Item
                        icon={<MdOutlinePageview />}
                        onClick={() =>
                            viewDetailPopUpRef?.current?.open(node.id)
                        }
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
        },
        [
            data,
            deleteNodeHandler,
            deleteSubTreeHandler,
            expandItemValues,
            // eslint-disable-next-line
            nodeToTreeItem
        ]
    );

    const nodeToTreeItem = useCallback(
        (node: OrgUnit, isRootNode?: boolean | number): ItemType => {
            const isRootNodeVal =
                typeof isRootNode === "boolean" ? isRootNode : false;
            return {
                label: createNodeLabel(node, isRootNodeVal),
                value: node.id,
                rawData: node,
                isRootNode: isRootNodeVal,
                children: []
            } as ItemType;
        },
        [createNodeLabel]
    );

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
                setData([nodeToTreeItem(rootNode, true)]);
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

    console.log(data);

    const getChildrenHandler = useCallback(
        async (activeNode) => {
            try {
                const nodes = await getImmediateChildren(
                    activeNode?.rawData?.id,
                    true
                );
                if (!nodes?.length) {
                    return [] as ItemType[];
                } else {
                    return nodes.map(nodeToTreeItem) as ItemType[];
                }
            } catch (e) {
                reportError(`Failed to retrieve org unit data: ${e}`);
                return [] as ItemType[];
            }
        },
        [nodeToTreeItem]
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
                        expandItemValues={expandItemValues}
                        onExpand={(expandItemValues, activeNode, concat) => {
                            setExpandItemValues(expandItemValues);
                            console.log("expandItemValues: ", expandItemValues);
                            console.log("activeNode: ", activeNode);
                            console.log("concat: ", concat);
                        }}
                        getChildren={getChildrenHandler}
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
                                reportError(`Failed to move org unit: ${e}`);
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
