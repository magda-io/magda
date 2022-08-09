import React, { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import Button from "rsuite/Button";
import { MdRefresh } from "react-icons/md";
import { requestWhoAmI } from "../../actions/userManagementActions";

const MyInfoRefreshButton: FunctionComponent = (props) => {
    const dispatch = useDispatch();

    return (
        <Button
            className="my-info-refresh-button"
            appearance="primary"
            {...props}
            onClick={() => dispatch(requestWhoAmI())}
        >
            <MdRefresh /> Refresh
        </Button>
    );
};

export default MyInfoRefreshButton;
