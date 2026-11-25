import React, { FunctionComponent, useEffect, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import { MdSearch } from "react-icons/md";
import {
    AccessProfileRole,
    attachAccessProfileRole,
    describeLlmServicesError,
    listAccessProfileRoleCandidates
} from "api-clients/LlmServicesApis";

export const addRoleConfirmText = (roleName: string) =>
    `Everyone with role "${roleName}" will be able to use this profile.`;

type PropsType = {
    open: boolean;
    profileId: string;
    profileName: string;
    onClose: () => void;
    onAdded: (role: AccessProfileRole) => void;
};

const CANDIDATE_LIMIT = 20;

/**
 * Pick an existing role to give the profile's access to (API-4, API-5). The
 * server never offers Anonymous Users, Admin Users or roles already attached.
 */
const AccessProfileAddRolePopUp: FunctionComponent<PropsType> = (props) => {
    const { open, profileId, profileName } = props;
    const [searchText, setSearchText] = useState<string>("");
    const [keyword, setKeyword] = useState<string>("");
    const [selected, setSelected] = useState<AccessProfileRole>();
    const [addError, setAddError] = useState<string>("");

    useEffect(() => {
        if (open) {
            setSearchText("");
            setKeyword("");
            setSelected(undefined);
            setAddError("");
        }
    }, [open]);

    const candidates = useAsync(
        async (open: boolean, profileId: string, keyword: string) =>
            open
                ? listAccessProfileRoleCandidates(profileId, {
                      q: keyword,
                      limit: CANDIDATE_LIMIT
                  })
                : [],
        [open, profileId, keyword]
    );

    const search = () => {
        setKeyword(searchText.trim());
        setSelected(undefined);
    };

    const add = useAsyncCallback(async () => {
        if (!selected) {
            return;
        }
        setAddError("");
        try {
            await attachAccessProfileRole(profileId, selected.id);
            props.onAdded(selected);
        } catch (e) {
            setAddError(describeLlmServicesError(e));
        }
    });

    const items = candidates.result || [];
    const titleId = "access-profile-add-role-title";

    return (
        <Modal
            className="access-profile-add-role-popup"
            open={open}
            size="md"
            overflow={true}
            backdrop="static"
            keyboard={!add.loading}
            aria-labelledby={titleId}
            onClose={() => {
                if (!add.loading) {
                    props.onClose();
                }
            }}
        >
            <Modal.Header>
                <Modal.Title id={titleId}>
                    Add a role to "{profileName}"
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <label htmlFor="access-profile-role-search">
                    Search roles by name
                </label>
                <InputGroup inside>
                    <Input
                        id="access-profile-role-search"
                        value={searchText}
                        placeholder="Role name..."
                        onChange={setSearchText}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                search();
                            }
                        }}
                    />
                    <InputGroup.Button aria-label="Search" onClick={search}>
                        <MdSearch />
                    </InputGroup.Button>
                </InputGroup>
                {candidates.loading ? (
                    <Loader content="Loading roles..." />
                ) : candidates.error ? (
                    <Message showIcon type="error" role="alert">
                        {describeLlmServicesError(candidates.error)}{" "}
                        <Button
                            appearance="link"
                            onClick={() =>
                                candidates.execute(open, profileId, keyword)
                            }
                        >
                            Retry
                        </Button>
                    </Message>
                ) : !items.length ? (
                    <p>
                        {keyword
                            ? `No roles match "${keyword}" that can be added.`
                            : "There are no other roles that can be added."}
                    </p>
                ) : (
                    <fieldset>
                        <legend className="sr-only">Roles</legend>
                        <ul className="access-profile-role-candidates">
                            {items.map((role) => (
                                <li key={role.id}>
                                    <label>
                                        <input
                                            type="radio"
                                            name="access-profile-role-candidate"
                                            value={role.id}
                                            checked={selected?.id === role.id}
                                            onChange={() => setSelected(role)}
                                        />
                                        <span className="access-profile-role-candidate-text">
                                            <span>{role.name}</span>
                                            {role.description ? (
                                                <span className="access-profile-role-description">
                                                    {role.description}
                                                </span>
                                            ) : null}
                                            <span className="access-profile-role-id">
                                                ID: {role.id}
                                            </span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        {items.length >= CANDIDATE_LIMIT ? (
                            <p className="access-profile-help">
                                Showing the first {CANDIDATE_LIMIT} roles.
                                Search to narrow the list.
                            </p>
                        ) : null}
                    </fieldset>
                )}
                {selected ? (
                    <p
                        className="access-profile-add-role-confirm"
                        aria-live="polite"
                    >
                        {addRoleConfirmText(selected.name)}
                    </p>
                ) : null}
                {addError ? (
                    <Message showIcon type="error" role="alert">
                        {addError}
                    </Message>
                ) : null}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    disabled={!selected || add.loading}
                    loading={add.loading}
                    onClick={add.execute}
                >
                    Add role
                </Button>
                <Button disabled={add.loading} onClick={props.onClose}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default AccessProfileAddRolePopUp;
