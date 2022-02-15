import React, { FunctionComponent, useState } from "react";
import { withRouter, match } from "react-router";
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
    moveSubTree
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
    MdDeleteForever
} from "react-icons/md";

interface ItemType extends ItemDataType {
    rawData: OrgUnit;
}

type PropsType = {
    location: Location;
    history: History;
    match: match<{ userId: string }>;
};

function createNodeLabel(node: OrgUnit, isRoot?: boolean) {
    return (
        <Dropdown
            title={<span className="node-title">{node.name}</span>}
            icon={isRoot ? <MdFolderSpecial /> : <MdFolder />}
        >
            <Dropdown.Item icon={<MdCreateNewFolder />}>
                <span className="node-dropdown-menu-item-text">New</span>
            </Dropdown.Item>
            <Dropdown.Item icon={<MdOutlinePageview />}>
                <span className="node-dropdown-menu-item-text">
                    View Details
                </span>
            </Dropdown.Item>
            <Dropdown.Item icon={<MdDeleteForever />}>
                <span className="node-dropdown-menu-item-text">Delete</span>
            </Dropdown.Item>
        </Dropdown>
    );
}

const OrgUnitsPage: FunctionComponent<PropsType> = (props) => {
    const [data, setData] = useState<ItemType[]>([]);
    const {
        result: userRootNode,
        loading: isUserRootNodeLoading
    } = useAsync(async () => {
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
    }, []);

    return (
        <div className="flex-main-container setting-page-main-container org-units-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb items={[{ title: "Org Units" }]} />
                <AccessVerification operationUri="authObject/orgUnit/read" />
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
