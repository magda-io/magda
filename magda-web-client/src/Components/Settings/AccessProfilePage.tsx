import React, { FunctionComponent, useState } from "react";
import { Link, useHistory, useParams, useRouteMatch } from "react-router-dom";
import { useSelector } from "react-redux";
import { useAsync } from "react-async-hook";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Nav from "rsuite/Nav";
import Panel from "rsuite/Panel";
import { BsFillJournalBookmarkFill, BsPeopleFill } from "react-icons/bs";
import SideNavigation from "./SideNavigation";
import Breadcrumb from "./Breadcrumb";
import reportInfo from "./reportInfo";
import AccessProfileGeneralForm from "./AccessProfileGeneralForm";
import AccessProfileRolesPanel from "./AccessProfileRolesPanel";
import {
    ACCESS_PROFILES_PATH,
    accessProfilePath,
    accessProfilesBreadcrumb
} from "./AccessProfilesPage";
import {
    canManageLlmAccess,
    LLM_ACCESS_CREATE_OPERATION,
    LLM_ACCESS_DELETE_OPERATION,
    LLM_ACCESS_UPDATE_OPERATION
} from "./llmServicesAccess";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import {
    AccessProfile,
    describeLlmServicesError,
    getAccessProfile,
    LlmServicesApiError
} from "api-clients/LlmServicesApis";
import "./main.scss";
import "./AccessProfilesPage.scss";

export const NEW_PROFILE_ID = "new";

/**
 * Settings → LLM Services → Access Profiles → a profile: **General** and
 * **Roles with access** (#3838 UI doc). `/new` shows the General form to
 * create one.
 */
const AccessProfilePage: FunctionComponent = () => {
    const history = useHistory();
    const { profileId } = useParams<{ profileId: string }>();
    const isRolesTab = !!useRouteMatch(
        `${ACCESS_PROFILES_PATH}/:profileId/roles`
    );
    const isCreate = profileId === NEW_PROFILE_ID;
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const canCreate = canManageLlmAccess(LLM_ACCESS_CREATE_OPERATION, user);
    const canUpdate = canManageLlmAccess(LLM_ACCESS_UPDATE_OPERATION, user);
    const canDelete = canManageLlmAccess(LLM_ACCESS_DELETE_OPERATION, user);
    const [reloadToken, setReloadToken] = useState<string>("");
    // a profile just returned by a save, so it needn't be fetched again
    const [savedProfile, setSavedProfile] = useState<AccessProfile>();

    const { result, loading, error, execute } = useAsync(
        async (profileId: string, _reloadToken: string) =>
            profileId === NEW_PROFILE_ID
                ? undefined
                : getAccessProfile(profileId),
        [profileId, reloadToken]
    );

    const profile =
        savedProfile && savedProfile.id === profileId
            ? savedProfile.revision >= (result?.revision || 0)
                ? savedProfile
                : result
            : result;

    const reload = () => {
        setSavedProfile(undefined);
        setReloadToken(`${Math.random()}`);
    };

    const goToList = () =>
        history.push(getUrlWithPopUpQueryString(ACCESS_PROFILES_PATH));

    const title = isCreate
        ? "Create profile"
        : profile
        ? `Profile: ${profile.name}`
        : "Profile";

    const renderBody = () => {
        if (isCreate) {
            return canCreate ? (
                <Panel bordered>
                    <AccessProfileGeneralForm
                        canEdit={true}
                        canDelete={false}
                        onSaved={(saved) => {
                            setSavedProfile(saved);
                            reportInfo(
                                `Profile "${saved.name}" was created. To give people access, add roles in Roles with access, or use its org unit or the Public setting.`,
                                { type: "success", header: "Profile created" }
                            );
                            history.replace(
                                getUrlWithPopUpQueryString(
                                    accessProfilePath(saved.id)
                                )
                            );
                        }}
                        onDeleted={goToList}
                        onReload={reload}
                        onCancel={goToList}
                    />
                </Panel>
            ) : (
                <Message showIcon type="error" role="alert">
                    You don't have permission to create access profiles.
                </Message>
            );
        }
        if (loading && !profile) {
            return <Loader content="Loading the profile..." />;
        }
        if (error || !profile) {
            const notFound =
                error instanceof LlmServicesApiError && error.status === 404;
            return (
                <Message
                    showIcon
                    type="error"
                    role="alert"
                    header={
                        notFound
                            ? "Profile not found"
                            : "Unable to load the profile"
                    }
                >
                    <p>
                        {notFound
                            ? "This profile doesn't exist. It may have been deleted."
                            : describeLlmServicesError(error)}
                    </p>
                    {notFound ? null : (
                        <Button
                            appearance="link"
                            onClick={() => execute(profileId, reloadToken)}
                        >
                            Retry
                        </Button>
                    )}
                    <Link to={getUrlWithPopUpQueryString(ACCESS_PROFILES_PATH)}>
                        Back to access profiles
                    </Link>
                </Message>
            );
        }
        return (
            <>
                <Nav
                    className="access-profile-tabs"
                    appearance="tabs"
                    activeKey={isRolesTab ? "roles" : "general"}
                    onSelect={(key) =>
                        history.push(
                            getUrlWithPopUpQueryString(
                                accessProfilePath(
                                    profile.id,
                                    key === "roles" ? "roles" : undefined
                                )
                            )
                        )
                    }
                >
                    <Nav.Item
                        eventKey="general"
                        icon={<BsFillJournalBookmarkFill />}
                    >
                        General
                    </Nav.Item>
                    <Nav.Item eventKey="roles" icon={<BsPeopleFill />}>
                        Roles with access
                    </Nav.Item>
                </Nav>
                <Panel bordered>
                    {isRolesTab ? (
                        <AccessProfileRolesPanel
                            profileId={profile.id}
                            profileName={profile.name}
                            canEdit={canUpdate}
                        />
                    ) : (
                        <AccessProfileGeneralForm
                            // a new revision (saved or reloaded) resets the form
                            key={`${profile.id}-${profile.revision}`}
                            profile={profile}
                            canEdit={canUpdate}
                            canDelete={canDelete}
                            onSaved={(saved) => {
                                setSavedProfile(saved);
                                reportInfo(
                                    `Profile "${saved.name}" was saved.`,
                                    { type: "success", header: "Saved" }
                                );
                            }}
                            onDeleted={(deleted) => {
                                reportInfo(
                                    `Profile "${deleted.name}" was deleted.`,
                                    { type: "success", header: "Deleted" }
                                );
                                goToList();
                            }}
                            onReload={reload}
                        />
                    )}
                </Panel>
            </>
        );
    };

    return (
        <div className="flex-main-container setting-page-main-container access-profile-page">
            <SideNavigation />
            <div className="main-content-container">
                <Breadcrumb
                    items={[accessProfilesBreadcrumb, { title: title }]}
                />
                <h1 className="sr-only">{title}</h1>
                {renderBody()}
            </div>
        </div>
    );
};

export default AccessProfilePage;
