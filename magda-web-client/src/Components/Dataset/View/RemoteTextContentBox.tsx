import React, { useState } from "react";
import fetch from "isomorphic-fetch";
import { config } from "../config";
import sprinerIcon from "../../../assets/spinner.svg";

/**
 * key: user Id;
 * We have to use `key` here,
 * so that any changes to it will trigger a new component creation.
 */
interface Props {
    key: string;
    textExtractor: (any) => string;
}

const initState = {
    fetchingStarted: false,
    isLoading: true,
    isError: false,
    data: null
};

const RemoteTextContentBox = (props: Props) => {
    const [state, setState] = useState(initState);
    if (!state.fetchingStarted) {
        setState(state => ({ ...state, fetchingStarted: true }));
        fetch(props.key, config.fetchOptions)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((json: any) => {
                setState(state => ({
                    ...state,
                    isError: false,
                    isLoading: false,
                    data: json
                }));
            })
            .catch(error =>
                setState(state => ({
                    ...state,
                    isError: true,
                    isLoading: false
                }))
            );
    }
    if (state.isLoading) {
        return <img src={sprinerIcon} />;
    } else {
        if (state.isError) {
            return <div>Failed to load data!</div>;
        } else {
            return <div>{props.textExtractor(state.data)}</div>;
        }
    }
};

export default RemoteTextContentBox;
