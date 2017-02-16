import findIndex from 'lodash.findindex';
import defined from '../helpers/defined';
import findMatchingObjs from '../helpers/findMatchingObjs';

const initialData = {
  isFetching: false,
  datasets: [],
  hitCount: 0,
  progress: 0,
  activePublishers: [],
  activeFormats: [],
  activeRegion: {
      regionId: undefined,
      regionType: undefined,
      boundingBox: {
      west: 105,
      south: -45,
      east: 155,
      north: -5
    }
  },
  activeDateFrom: undefined,
  activeDateTo:undefined,
  freeText: '',
  publisherOptions: [],
  temporalOptions: [],
  formatOptions: [],
  apiQuery: '',
  hasError: false,
  strategy: "match-all",
  errorMessage: ''
}

const results = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_RESULTS':
      return Object.assign({}, state, {
        isFetching: true,
        hasError: false,
        apiQuery: action.apiQuery
      })

    case 'UPDATE_PROGRESS':
      return Object.assign({}, state, {
        isFetching: true,
        progress: action.progress
      })

    case 'FETCH_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        hasError: true,
        errorMessage: action.errorMessage
      })

    case 'RECEIVE_RESULTS':
      let data = action.json;
      let query = data.query;
      let datasets = data.dataSets;
      let hitCount = data.hitCount;

      let publisherOptions = defined(data.facets[0]) ? data.facets[0].options : []
      let temporalOptions = data.facets[1].options.sort((a, b)=>(b.lowerBound - a.lowerBound));
      let formatOptions = data.facets[2].options;

      let freeText = query.freeText;
      let activePublishers = findMatchingObjs(query.publishers, publisherOptions);
      let activeDateFrom = defined(query.dateFrom) ? query.dateFrom.slice(0, 4): initialData.activeDateFrom;
      let activeDateTo = defined(query.dateTo) ? query.dateTo.slice(0, 4) : initialData.activeDateTo;

      let activeFormats = findMatchingObjs(query.formats, formatOptions);;

      let activeRegion = query.regions[0] || initialData.activeRegion;

      return Object.assign({}, state, {
        isFetching: false,
        apiQuery: action.apiQuery,
        strategy: data.strategy,
        datasets,
        hitCount,
        publisherOptions,
        temporalOptions,
        formatOptions,
        freeText, 
        activePublishers,
        activeRegion,
        activeDateFrom,
        activeDateTo,
        activeFormats
      })


    case 'ADD_PUBLISHER':
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers, action.item]
      })

    case 'REMOVE_PUBLISHER':
     let publisherIndex = findIndex(state.activePublishers, item=> item.value === action.item.value);
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers.slice(0, publisherIndex), ...state.activePublishers.slice(publisherIndex+1)]
      })

    case 'RESET_PUBLISHER':
      return Object.assign({}, state,
        {activePublishers: initialData.activePublishers})


    case 'ADD_REGION':
      return Object.assign({}, state, {
        activeRegion: action.item
      })

    case 'RESET_REGION':
      return Object.assign({}, state,
        {activeRegion: initialData.activeRegion})

    case 'SET_DATE_FROM':
      return Object.assign({}, state, {
        activeDateFrom: action.item
      })

    case 'SET_DATE_TO':
      return Object.assign({}, state, {
        activeDateTo: action.item
      })

    case 'RESET_DATE_FROM':
      return Object.assign({}, state,
        {activeDateFrom: initialData.activeDateFrom})

    case 'RESET_DATE_TO':
      return Object.assign({}, state,
        {activeDateTo: initialData.activeDateTo})

    case 'ADD_FORMAT':
      return Object.assign({}, state, {
        activeFormats: [...state.activeFormats, action.item]
      })

    case 'REMOVE_FORMAT':
      let formatIndex = findIndex(state.activeFormats, item=> item.value === action.item.value);
      return Object.assign({}, state, {
        activeFormats: [...state.activeFormats.slice(0, formatIndex), ...state.activeFormats.slice(formatIndex+1)]
      })

    case 'RESET_FORMAT':
      return Object.assign({}, state,
        {activeFormats: initialData.activeFormats})

    default:
      return state
  }
};
export default results;
