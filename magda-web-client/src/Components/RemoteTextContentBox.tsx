import React, { useState } from "react";
import fetch from "cross-fetch";
import { config } from "../config";
import spinnerIcon from "../assets/spinner.svg";

/**
 * key: we need to set user Id to key to make sure a new component to be created for a new ID;
 * url: remote content loading url
 * contentExtractor: text content extracting function to get content from response json data
 */
interface Props {
    key: string;
    url: string;
    contentExtractor?: (any) => string;
}

const defaultContentExtractor = (data) => JSON.stringify(data);

const initState = {
    fetchingStarted: false,
    isLoading: true,
    isError: false,
    data: null
};

const RemoteTextContentBox = (props: Props) => {
    const [state, setState] = useState(initState);
    if (!state.fetchingStarted) {
        if (props.url) {
            setState((state) => ({ ...state, fetchingStarted: true }));
        } else {
            console.error(
                "An url is required for RemoteTextContentBox to load data!"
            );
            setState((state) => ({
                ...state,
                fetchingStarted: true,
                isError: true,
                isLoading: false
            }));
        }
        fetch(props.url, config.commonFetchRequestOptions)
            .then((response) => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((json: any) => {
                setState((state) => ({
                    ...state,
                    isError: false,
                    isLoading: false,
                    data: json
                }));
            })
            .catch((error) =>
                setState((state) => ({
                    ...state,
                    isError: true,
                    isLoading: false
                }))
            );
    }
    if (state.isLoading) {
        return (
            <img
                style={{
                    position: "absolute"
                }}
                src={spinnerIcon}
            />
        );
    } else {
        if (state.isError) {
            return <React.Fragment>Failed to load data!</React.Fragment>;
        } else {
            return (
                <React.Fragment>
                    {props.contentExtractor
                        ? props.contentExtractor(state.data)
                        : defaultContentExtractor(state.data)}
                </React.Fragment>
            );
        }
    }
};

export default RemoteTextContentBox;
