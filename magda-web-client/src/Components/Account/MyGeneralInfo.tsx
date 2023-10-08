import React, { FunctionComponent } from "react";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import { useAsync } from "react-async-hook";
import { getUserById } from "../../api-clients/AuthApis";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";
import Panel from "rsuite/Panel";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import Message from "rsuite/Message";
import OrgUnitNameLabel from "Components/OrgUnitNameLabel";
import MyInfoRefreshButton from "../Account/MyInfoRefreshButton";
import "./MyGeneralInfo.scss";

type PropsType = {
    userId?: string;
};

const MyGeneralInfo: FunctionComponent<PropsType> = (props) => {
    const { userId } = props;
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const isWhoAmILoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const whoAmILoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );
    const { result: fetchedUser, loading: isUserFetching } = useAsync(
        async (userId?: string) => {
            if (!userId) {
                return null;
            }
            try {
                return await getUserById(userId);
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load record data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [userId]
    );

    const userInfo = user ? user : fetchedUser;

    return (
        <Panel bordered className="my-general-info-container">
            {isWhoAmILoading || isUserFetching ? (
                <Placeholder.Paragraph rows={8}>
                    <Loader center content="loading" />
                </Placeholder.Paragraph>
            ) : whoAmILoadingError ? (
                <Message showIcon type="error" header="Error">
                    {"" + whoAmILoadingError}
                </Message>
            ) : (
                <>
                    <table>
                        <tr>
                            <td>User ID:</td>
                            <td>{userInfo?.id ? userInfo.id : "N/A"}</td>
                        </tr>
                        <tr>
                            <td>Name:</td>
                            <td>
                                {userInfo?.displayName
                                    ? userInfo.displayName
                                    : "N/A"}
                            </td>
                            <td
                                className="avatar-cell"
                                rowSpan={4}
                                valign="top"
                            >
                                {userInfo?.photoURL ? (
                                    <img
                                        src={userInfo.photoURL}
                                        alt="user avatar"
                                    />
                                ) : (
                                    <div className="rs-placeholder-paragraph-graph rs-placeholder-paragraph-graph-image">
                                        <span className="rs-placeholder-paragraph-graph-inner"></span>
                                    </div>
                                )}
                            </td>
                        </tr>
                        <tr>
                            <td>Email:</td>
                            <td>{userInfo?.email ? userInfo.email : "N/A"}</td>
                        </tr>
                        <tr>
                            <td>Organizational Unit:</td>
                            <td>
                                <OrgUnitNameLabel id={userInfo?.orgUnitId} />
                            </td>
                        </tr>
                        {userInfo?.orgUnitId ? (
                            <tr>
                                <td>Organizational Unit ID:</td>
                                <td>{userInfo.orgUnitId}</td>
                            </tr>
                        ) : null}
                        <tr>
                            <td>Identity Provider:</td>
                            <td>
                                {userInfo?.source ? userInfo.source : "N/A"}
                            </td>
                        </tr>
                        <tr>
                            <td>Identity Provider User ID:</td>
                            <td>
                                {userInfo?.sourceId ? userInfo.sourceId : "N/A"}
                            </td>
                        </tr>
                    </table>
                    <MyInfoRefreshButton />
                </>
            )}
        </Panel>
    );
};

export default MyGeneralInfo;
