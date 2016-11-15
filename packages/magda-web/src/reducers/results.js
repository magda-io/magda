import findIndex from 'lodash.findindex';
import find from 'lodash.find';
import defined from '../helpers/defined';


const initialData = {
  isFetching: false,
  datasets: [],
  hitCount: 0,
  activePublishers: [],
  activeFormats: [],
  activeRegions: [],
  activeDateFrom: undefined,
  activeDateTo:undefined,
  publisherOptions: [],
  temporalOptions: [],
  formatOptions: [],
  apiQuery: ''
}

const results = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_RESULTS':
      return Object.assign({}, state, {
        isFetching: true,
        apiQuery: action.apiQuery
      })
    case 'RECEIVE_RESULTS':
      let data = action.json;
      let query = data.query;
      let datasets = data.dataSets;
      let hitCount = data.hitCount;

      let publisherOptions = data.facets[0].options;
      let temporalOptions = data.facets[1].options.sort((a, b)=>(b.value - a.value));
      let formatOptions = data.facets[2].options;


      let activePublishers = query.publishers.map(item=> find(data.facets[0].options, o=>o.value === item));
      let activeDateFrom = defined(query.dateFrom) ? {value: query.dateFrom.slice(0, 4), hitCount: null} : undefined;
      let activeDateTo = defined(query.dateTo) ? {value: query.dateTo.slice(0, 4), hitCount: null} : undefined;

      let activeFormats = query.formats.map(item=>find(data.facets[2].options, o=>o.value === item));
      // temp
      let activeRegions = [{regionId: '302', regionType: 'SA4'}];

      return Object.assign({}, state, {
        isFetching: false,
        apiQuery: action.apiQuery,
        datasets,
        hitCount,
        publisherOptions,
        temporalOptions,
        formatOptions,

        activePublishers,
        activeRegions,
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
      return Object.assign({}, state, {
        activePublishers: []
      })


    case 'ADD_REGION':
      return Object.assign({}, state, {
        activeRegions: [action.item]
      })

    case 'RESET_REGION':
      return Object.assign({}, state, {
        activeRegions: []
      })

    case 'SET_DATE_FROM':
      return Object.assign({}, state, {
        activeDateFrom: action.item
      })

    case 'SET_DATE_TO':
      return Object.assign({}, state, {
        activeDateTo: action.item
      })

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
      return Object.assign({}, state, {
        activeFormats: []
      })

    default:
      return state
  }
};
export default results;
