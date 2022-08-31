import React, { FunctionComponent } from "react";
import SelectPicker from "rsuite/SelectPicker";
import ToolTip from "Components/Dataset/Add/ToolTip";
import { useAsync } from "react-async-hook";
import { getUserById, getUsers } from "api-clients/AuthApis";
import ServerError from "@magda/typescript-common/dist/ServerError";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import { User } from "reducers/userManagementReducer";
import "./DatasetOwnerSection.scss";

type PropsType = {
    selectedUserId?: string;
    onChange: (id: string) => void;
    disabled?: boolean;
};

function userToLabel(user?: User) {
    if (!user) {
        return undefined;
    }
    if (user?.displayName && user?.email) {
        return `${user?.displayName} (${user?.email})`;
    } else {
        return user?.displayName
            ? user.displayName
            : user?.email
            ? user.email
            : "Unnamed User";
    }
}

const DatasetOwnerSection: FunctionComponent<PropsType> = (props) => {
    const { selectedUserId } = props;

    const {
        result: users,
        loading: loadingUsers,
        error: loadingUsersError
    } = useAsync(getUsers, []);

    const {
        result: selectedUserName,
        loading: loadingSelectedUserName
    } = useAsync(
        async (selectedUserId?: string) => {
            try {
                if (!selectedUserId) {
                    return undefined;
                }
                const user = await getUserById(selectedUserId);
                return userToLabel(user);
            } catch (e) {
                console.log("selectedUserId", e);
                if (e instanceof ServerError && e.statusCode === 404) {
                    return undefined;
                }
                throw e;
            }
        },
        [selectedUserId]
    );

    const placeholderText = selectedUserName
        ? selectedUserName
        : selectedUserId
        ? `Unknown User (${selectedUserId})`
        : "Please select a dataset owner...";

    const shouldDisabled: boolean = (() => {
        if (!users?.length) {
            return true;
        }
        if (users.length > 1) {
            return false;
        }
        if (!selectedUserId) {
            // not selected a user yet, still allow user to select
            return false;
        }
        if (users[0].id === selectedUserId) {
            // there is only one option and it's the currently selected user
            // should not allow user to select
            return true;
        }
        return false;
    })();

    return (
        <div className="question-dataset-owner">
            {loadingUsers || loadingSelectedUserName ? (
                <Loader content="Loading..." />
            ) : (
                <>
                    <h4 className="with-icon">
                        <span>Who is the dataset owner?</span>
                    </h4>
                    <div className="input-area">
                        <ToolTip>
                            Depends on your access, you might not be able to
                            view the owner name or select a new owner.
                        </ToolTip>
                        {loadingUsersError ? (
                            <Message showIcon type="error" header="Error">
                                Failed to retrieve available user list:{" "}
                                {`${loadingUsersError}`}
                            </Message>
                        ) : (
                            <SelectPicker
                                placeholder={placeholderText}
                                disabled={shouldDisabled}
                                onChange={props.onChange}
                                value={selectedUserId}
                                data={
                                    users?.length
                                        ? users.map((u) => ({
                                              label: userToLabel(u),
                                              value: u.id
                                          }))
                                        : []
                                }
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default DatasetOwnerSection;
