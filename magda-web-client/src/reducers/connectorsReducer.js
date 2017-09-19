// @flow
type ConnectorsResult = {
  isFetching : boolean,
  connectors: Array<Object>,
  connector: ?Object,
  error: ?number,
  showNotification?: boolean
}

const initialData = {
  isFetching: false,
  error: null,
  connectors: []
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
    default:
      return state
  }
};
export default connectors;
