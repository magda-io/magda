import React, { FunctionComponent, useState, useRef, useCallback } from "react";
import { withRouter, match } from "react-router-dom";
import { Location, History } from "history";
import "./main.scss";
import "./OrgUnitsPage.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import AccessVerification from "./AccessVerification";
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
import { DropData } from "rsuite/esm/Tree/Tree";
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
function searchNodeByIdRecursive(
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
        const result = searchNodeByIdRecursive(
            nodeId,
            curNode?.children,
            curNode
        );
        if (result?.node) {
            return result;
        }
    }
    return {};
}

const OrgUnitsPage: FunctionComponent<PropsType> = (props) => {
    const [data, setData] = useState<ItemType[]>([]);
    const searchNodeById = useCallback(
        (nodeId) => searchNodeByIdRecursive(nodeId, data),
        [data]
    );
    const [expandItemValues, setExpandItemValues] = useState<ItemDataType[]>(
        []
    );
    const viewDetailPopUpRef = useRef<ViewOrgUnitPopUpRefType>(null);
    const orgUnitFormRef = useRef<OrgUnitFormPopUpRefType>(null);
    //change this value to force the role data to be reloaded
    // eslint-disable-next-line
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const [isDataLoading, setIsDataLoading] = useState<boolean>(false);

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
        [data, expandItemValues]
    );

    const deleteNodeHandler = useCallback(
        (nodeId: string, nodeName: string, isRoot: boolean) => {
            if (isRoot) {
                reportError("Cannot delete root node: " + nodeName);
                return;
            }
            ConfirmDialog.open({
                confirmMsg: `Please confirm the deletion of org unit "${nodeName}"?
            Only this Org Unit will be deleted and all sub trees belong to it will be moved to its parent Org Unit.`,
                confirmHandler: async () => {
                    try {
                        if (!nodeId) {
                            throw new Error("Invalid empty org unit id!");
                        }
                        const {
                            node: currentNode,
                            parentNode
                        } = searchNodeById(nodeId);
                        if (!parentNode) {
                            throw new Error(
                                "Cannot refresh in-memory data. Cannot locate parentNode of node:" +
                                    nodeName
                            );
                        }
                        if (!currentNode) {
                            throw new Error(
                                "Cannot refresh in-memory data. Cannot locate node:" +
                                    nodeName
                            );
                        }
                        let children: ItemType[];
                        if (expandItemValues.indexOf(nodeId as any) !== -1) {
                            // deleted node has already been expanded
                            // save current children now
                            children = currentNode?.children?.length
                                ? currentNode.children
                                : [];
                        } else {
                            // deleted node has not been expanded yet
                            // retrieve children now
                            // if we do it after the deletion, the server will respond [] as the node is deleted already.
                            children = await getChildrenHandler(currentNode);
                        }
                        // delete the node now
                        await deleteNode(nodeId);
                        if (!parentNode?.children?.length) {
                            parentNode.children = [];
                        }
                        parentNode.children = parentNode.children.filter(
                            (item) => item.rawData.id !== nodeId
                        );
                        if (expandItemValues.indexOf(nodeId as any) !== -1) {
                            // deleted node has already been expanded
                            // remove it from setExpandItemValues as well
                            setExpandItemValues((itemValues) =>
                                itemValues.filter(
                                    (item) => item !== (nodeId as any)
                                )
                            );
                        }
                        parentNode.children = [
                            ...parentNode.children,
                            ...children
                        ];
                        setData((data) => [...data]);
                    } catch (e) {
                        reportError(`Failed to delete the node: ${e}`);
                    }
                }
            });
        },
        // eslint-disable-next-line
        [data, expandItemValues]
    );

    const deleteSubTreeHandler = useCallback(
        (nodeId: string, nodeName: string, isRoot: boolean) => {
            if (isRoot) {
                reportError(
                    "Cannot delete sub tree that includes the root node: " +
                        nodeName
                );
                return;
            }
            ConfirmDialog.open({
                confirmMsg: `Please confirm the deletion of org unit sub tree starting with org unit "${nodeName}"?
                All org units nodes belongs to the sub tree will be deleted.`,
                confirmHandler: async () => {
                    try {
                        if (!nodeId) {
                            throw new Error("Invalid empty org unit id!");
                        }
                        const {
                            node: currentNode,
                            parentNode
                        } = searchNodeById(nodeId);
                        if (!parentNode || !currentNode) {
                            throw new Error(
                                "Cannot refresh in-memory data. Cannot locate node or parentNode of node:" +
                                    nodeName
                            );
                        }
                        await deleteSubTree(nodeId);
                        parentNode.children = parentNode?.children?.filter(
                            (item) => item.rawData.id !== nodeId
                        );
                        setData((data) => [...data]);
                        setExpandItemValues((itemValues) =>
                            itemValues.filter(
                                (item) => item !== (nodeId as any)
                            )
                        );
                    } catch (e) {
                        reportError(`Failed to delete the sub tree: ${e}`);
                    }
                }
            });
        },
        [data]
    );

    const addNodeHandler = useCallback(
        async (newNode, newNodeId, parentNodeId) => {
            // when edit, newNodeId should be undefined
            if (!parentNodeId) {
                reportError(
                    "Cannot update in memory tree data after the new node creation: parentNodeId is undefined"
                );
                return;
            }
            const { node: parentNode } = searchNodeById(parentNodeId);
            if (!parentNode) {
                reportError(
                    "Cannot update in memory tree data after the new node creation: cannot locate parent node with ID: " +
                        parentNodeId
                );
                return;
            }
            if (expandItemValues.indexOf(parentNode.rawData.id as any) !== -1) {
                // parent node has been expanded
                if (!parentNode?.children?.length) {
                    parentNode.children = [];
                }
                parentNode.children = [
                    ...(parentNode.children as ItemType[]),
                    nodeToTreeItem(newNode)
                ];
            } else {
                // parent node has been not been expanded yet
                //setIsDataLoading(true);
                const nodes = await getChildrenHandler(parentNode);
                setExpandItemValues((itemValues) =>
                    itemValues.concat([parentNode.rawData.id])
                );
                parentNode.children = nodes;
            }
            setData((data) => [...data]);
        },
        [data, expandItemValues, getChildrenHandler]
    );

    const renderTreeNode = (nodeData: ItemType) => {
        const node = nodeData.rawData;
        const isRoot = nodeData.isRootNode;
        return (
            <Dropdown
                title={<span className="node-title">{node.name}</span>}
                trigger={["click", "contextMenu"]}
                icon={isRoot ? <MdFolderSpecial /> : <MdFolder />}
            >
                <Dropdown.Item
                    icon={<MdCreateNewFolder />}
                    onClick={() => {
                        orgUnitFormRef?.current?.open(
                            undefined,
                            addNodeHandler,
                            node.id
                        );
                    }}
                >
                    <span className="node-dropdown-menu-item-text">New</span>
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
                                } = searchNodeById(newNodeId);
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
                                setData((data) => [...data]);
                            }
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
                                deleteNodeHandler(node.id, node.name, isRoot)
                            }
                        >
                            <span className="node-dropdown-menu-item-text">
                                Delete
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            icon={<MdDeleteForever />}
                            onClick={() =>
                                deleteSubTreeHandler(node.id, node.name, isRoot)
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
    };

    const nodeToTreeItem = (
        node: OrgUnit,
        isRootNode?: boolean | number
    ): ItemType => {
        const isRootNodeVal =
            typeof isRootNode === "boolean" ? isRootNode : false;
        return {
            value: node.id,
            rawData: node,
            isRootNode: isRootNodeVal,
            children: []
        } as ItemType;
    };

    const { result: userRootNode, loading: isUserRootNodeLoading } = useAsync(
        async (dataReloadToken: string) => {
            try {
                const rootNode: OrgUnit = await getRootNode(true);
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

    const onDropHandler = useCallback(
        async (dragData: DropData<ItemType>, event) => {
            try {
                setIsDataLoading(true);
                const {
                    node: dragNode,
                    parentNode: dragNodeParentNode
                } = searchNodeById(dragData.dragNode.rawData.id);
                const { node: dropNode } = searchNodeById(
                    dragData.dropNode.rawData.id
                );
                if (!dragNodeParentNode || !dragNode || !dropNode) {
                    debugger;
                    throw new Error(
                        "Cannot update in memory tree data after moving nodes. Cannot find drag node, drop node or drag node parent."
                    );
                }
                // we need to save dropNode's children before the move
                let dropNodeChildren: ItemType[];
                if (
                    expandItemValues.indexOf(dropNode?.rawData?.id as any) !==
                    -1
                ) {
                    // dropNode has already been expanded
                    dropNodeChildren = dropNode?.children?.length
                        ? dropNode.children
                        : [];
                } else {
                    // dropNode not yet expanded
                    // we manually expand it
                    dropNodeChildren = await getChildrenHandler(dropNode);
                }
                await moveSubTree(dragNode?.rawData?.id, dropNode?.rawData?.id);
                // remove dragNode from its parent
                dragNodeParentNode.children = dragNodeParentNode?.children?.filter(
                    (item) => item.rawData.id !== dragNode?.rawData?.id
                );

                dropNode.children = dropNodeChildren.concat([dragNode]);
                setData((data) => data.concat([]));
                if (
                    expandItemValues.indexOf(dropNode?.rawData?.id as any) ===
                    -1
                ) {
                    // we need add drop node to the list as we've manually expanded it already
                    setExpandItemValues((itemValues) =>
                        itemValues.concat([dropNode?.rawData?.id])
                    );
                }
                setIsDataLoading(false);
            } catch (e) {
                setIsDataLoading(false);
                reportError(`Failed to move org unit: ${e}`);
            }
        },
        [data, expandItemValues]
    );

    return (
        <div className="flex-main-container setting-page-main-container org-units-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={[{ title: "Org Units" }]} />
                <AccessVerification operationUri="authObject/orgUnit/read" />
                <OrgUnitFormPopUp ref={orgUnitFormRef} />
                <ViewOrgUnitPopUp ref={viewDetailPopUpRef} />
                {isDataLoading ? (
                    <Loader backdrop content="loading..." vertical />
                ) : null}
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
                            console.log("data: ", data);
                        }}
                        getChildren={getChildrenHandler}
                        onDrop={onDropHandler as any}
                        renderTreeNode={renderTreeNode as any}
                    />
                )}
            </div>
        </div>
    );
};

export default withRouter(OrgUnitsPage);
