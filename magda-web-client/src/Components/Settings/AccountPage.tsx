import React, { FunctionComponent, useCallback, useEffect } from "react";
import {
    Switch,
    Route,
    useHistory,
    useLocation,
    Redirect
} from "react-router-dom";
import { useSelector } from "react-redux";
import "./main.scss";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import Nav from "rsuite/Nav";
import { BsPersonLinesFill, BsPeopleFill, BsKey } from "react-icons/bs";
import "./AccountPage.scss";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import MyGeneralInfo from "../Account/MyGeneralInfo";
import MyRoles from "../Account/MyRoles";
import { StateType } from "reducers/reducer";
import MyApiKeys from "../Account/MyApiKeys";
import { ANONYMOUS_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";

const AccountPage: FunctionComponent = () => {
    const history = useHistory();
    const location = useLocation();
    const shouldRedirectToLoginPage = useSelector<StateType, boolean>(
        (state) => {
            if (state?.userManagement?.isFetchingWhoAmI) {
                return false;
            }
            if (state?.userManagement?.whoAmIError) {
                console.error(state.userManagement.whoAmIError);
                return false;
            }
            // ANONYMOUS USERS should be redirected to login page
            return (
                state?.userManagement?.user?.roles?.findIndex(
                    (role) => role.id === ANONYMOUS_USERS_ROLE_ID
                ) !== -1
            );
        }
    );
    const isWhoAmILoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const whoAmILoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );
    const [active, setActive] = React.useState(location.pathname);
    const onSelectTab = useCallback((key) => {
        setActive(key);
        history.push(getUrlWithPopUpQueryString(key));
    }, []);

    useEffect(() => {
        const unregister = history.listen((loc) => setActive(loc.pathname));
        return unregister;
    });

    return shouldRedirectToLoginPage ? (
        <>
            <Loader content="redirecting..." />
            <Redirect to="/account" />
        </>
    ) : (
        <div className="flex-main-container setting-page-main-container">
            <SideNavigation />
            <div className="main-content-container my-account-page">
                <Breadcrumb items={[{ title: "My Account" }]} />
                {!isWhoAmILoading && whoAmILoadingError ? (
                    <Message
                        showIcon
                        type="error"
                        header="Error"
                        closable={true}
                        style={{ margin: "5px" }}
                    >
                        Failed to retrieve account information from API:{" "}
                        {whoAmILoadingError?.message
                            ? whoAmILoadingError?.message
                            : `${whoAmILoadingError}`}
                    </Message>
                ) : (
                    <>
                        <Nav
                            className="account-info-tab"
                            appearance="tabs"
                            activeKey={active}
                            onSelect={onSelectTab}
                        >
                            <Nav.Item
                                eventKey="/settings/account"
                                icon={<BsPersonLinesFill />}
                            >
                                General Info
                            </Nav.Item>
                            <Nav.Item
                                eventKey="/settings/account/myRoles"
                                icon={<BsPeopleFill />}
                            >
                                My Roles
                            </Nav.Item>
                            <Nav.Item
                                eventKey="/settings/account/apiKeys"
                                icon={<BsKey />}
                            >
                                My API Keys
                            </Nav.Item>
                        </Nav>
                        <Switch>
                            <Route exact path="/settings/account">
                                <MyGeneralInfo />
                            </Route>
                            <Route exact path="/settings/account/myRoles">
                                {isWhoAmILoading ? (
                                    <Placeholder.Paragraph rows={8}>
                                        <Loader center content="loading" />
                                    </Placeholder.Paragraph>
                                ) : whoAmILoadingError ? (
                                    <Message
                                        showIcon
                                        type="error"
                                        header="Error"
                                    >
                                        {"" + whoAmILoadingError}
                                    </Message>
                                ) : (
                                    <MyRoles />
                                )}
                            </Route>
                            <Route exact path="/settings/account/apiKeys">
                                <MyApiKeys />
                            </Route>
                        </Switch>
                    </>
                )}
            </div>
        </div>
    );
};

export default AccountPage;
