// @flow
import { parsePublisher } from "../helpers/publisher";
import type { Publisher } from "../helpers/record";

const initialData = {
    isFetchingPublishers: false,
    isFetchingPublisher: false,
    publishers: [],
    publisher: parsePublisher(),
    hitCount: 0,
    keyword: "*",
    errorFetchingPublishers: undefined,
    errorFetchingPublisher: undefined
};

type PublishersResult = {
    isFetchingPublishers: boolean,
    isFetchingPublisher: boolean,
    publishers: Array<Publisher>,
    publisher: Publisher,
    hitCount: number,
    keyword: string,
    errorFetchingPublishers: any,
    errorFetchingPublisher: any
};

type recordAction = {
    json: Object,
    error: any,
    type: boolean,
    keyword: string
};

const publisher = (
    state: PublishersResult = initialData,
    action: recordAction
) => {
    switch (action.type) {
        case "REQUEST_PUBLISHERS":
            return Object.assign({}, state, {
                isFetchingPublishers: true
            });
        case "RECEIVE_PUBLISHERS":
            return Object.assign({}, state, {
                isFetchingPublishers: false,
                publishers: action.json && action.json.organisations,
                hitCount: action.json && action.json.hitCount,
                keyword: action.keyword
            });
        case "REQUEST_PUBLISHERS_ERROR":
            return Object.assign({}, state, {
                isFetchingPublishers: false,
                errorFetchingPublishers: action.error
            });
        case "REQUEST_PUBLISHER":
            return Object.assign({}, state, {
                isFetchingPublisher: true
            });
        case "RECEIVE_PUBLISHER":
            return Object.assign({}, state, {
                isFetchingPublisher: false,
                publisher: action.json && parsePublisher(action.json)
            });
        case "REQUEST_PUBLISHER_ERROR":
            return Object.assign({}, state, {
                isFetchingPublisher: false,
                errorFetchingPublisher: action.error
            });
        case "RESET_FETCH_PUBLISHER":
            return initialData;
        default:
            return state;
    }
};
export default publisher;
