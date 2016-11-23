import findIndex from 'lodash.findindex';
import defined from '../helpers/defined';
import findOptionFromList from '../helpers/findOptionFromList';

const initialData = {
  isFetching: false,
  datasets: [],
  hitCount: 0,
  progress: 0,
  activePublishers: [],
  activeFormats: [],
  activeRegion: {regionID: undefined, regionType: undefined},
  activeDateFrom: undefined,
  activeDateTo:undefined,
  publisherOptions: [],
  temporalOptions: [],
  formatOptions: [],
  apiQuery: '',
  hasError: false,
  strategy: "match-all"
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
        hasError: true
      })

    case 'RECEIVE_RESULTS':
      let data = action.json;
      let query = data.query;
      let datasets = data.dataSets;
      let hitCount = data.hitCount;

      let publisherOptions = defined(data.facets[0]) ? data.facets[0].options : []
      let temporalOptions = data.facets[1].options.sort((a, b)=>(b.lowerBound - a.lowerBound));
      let formatOptions = data.facets[2].options;


      let activePublishers = query.publishers.map(p=> findOptionFromList(p,data.facets[0].options));
      let activeDateFrom = defined(query.dateFrom) ? query.dateFrom.slice(0, 4): undefined;
      let activeDateTo = defined(query.dateTo) ? query.dateTo.slice(0, 4) : undefined;

      let activeFormats = query.formats.map(item=> findOptionFromList(item,data.facets[2].options));

      let activeRegion = {regionID: defined(query.regions[0]) ? query.regions[0].regionId.toUpperCase() : undefined,
                          regionType: defined(query.regions[0]) ? query.regions[0].regionType.toUpperCase() : undefined};

      return Object.assign({}, state, {
        isFetching: false,
        apiQuery: action.apiQuery,
        strategy: data.strategy,
        datasets,
        hitCount,
        publisherOptions,
        temporalOptions,
        formatOptions,
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
