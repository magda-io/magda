// @flow
type ConnectorsResult = {
  isFetching : boolean,
  connectors: Array<Object>,
  connectorConfig: ?Object,
  error: ?number,
}

const initialData = {
  isFetching: false,
  error: null,
  connectors: [],
  connectorConfig: null
}


const connectors = (state: ConnectorsResult = initialData, action: ConnectorAction) => {
  switch (action.type) {
    case 'REQUEST_CONNECTORS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null
      })
    case 'RECEIVE_CONNECTORS':
      return Object.assign({}, state, {
        isFetching: false,
        connectors: action.json && action.json,
      })
    case 'REQUEST_CONNECTORS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })

    case 'REQUEST_CONNECTOR_CONFIG':
      return Object.assign({}, state, {
        isFetching: true,
        error: null
      })
    case 'RECEIVE_CONNECTOR_CONFIG':
      return Object.assign({}, state, {
        isFetching: false,
        connectorConfig: action.json && action.json,
      })
    case 'REQUEST_CONNECTOR_CONFIG_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })

    case 'UPDATE_CONNECTOR':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'UPDATE_CONNECTOR_SUCCESS':
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
      })
    case 'UPDATE_CONNECTOR_FAILURE':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error
      })
    case 'CREATE_CONNECTOR':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'CREATE_CONNECTOR_SUCCESS':
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
      })
    case 'CREATE_CONNECTOR_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error
      })
    case 'RESET_CREATE_CONNECTOR': {
      return Object.assign({}, state, {
        isFetching: false,
        error: null
      })
    }

    default:
      return state
  }
};
export default connectors;
