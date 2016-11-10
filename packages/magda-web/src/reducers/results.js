import findIndex from 'lodash.findindex';
import defined from '../helpers/defined';
import find from 'lodash.find';


const initialData = {
  isFetching: true,
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
  urlQuery: ''
}

const results = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_RESULTS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_RESULTS':
      let data = action.json;
      let query = data.query;
      let datasets = data.dataSets;
      let hitCount = data.hitCount;

      let publisherOptions = data.facets[0].options;
      let temporalOptions = data.facets[1].options;
      let formatOptions = data.facets[2].options;


      let activePublishers = query.publishers.map(item=> find(data.facets[0].options, o=>o.value === item));
      let activeDateFrom = query.dateFrom;
      let activeDateto = query.dateTo;
      let activeFormats = query.formats.map(item=>find(data.facets[2].options, o=>o.value === item));
      // temp
      let activeRegions = query.regions.map(item=>({regionId: '', regionType: ''}));

      return Object.assign({}, state, {
        isFetching: false,
        datasets,
        hitCount,
        publisherOptions,
        temporalOptions,
        formatOptions,

        activePublishers,
        activeRegions,
        activeDateFrom,
        activeDateto,
        activeFormats
      })

    case'SET_URL_QUERY':
      return Object.assign({}, state, {
        urlQuery: action.urlQuery
      })

    case 'ADD_PUBLISHER':
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers, action.item]
      })

    case 'REMOVE_PUBLISHER':
     let publisherIndex = findIndex(state.activePublishers, item=> item.value === action.item.value);
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers.slice(0, index), ...state.activePublishers.slice(index+1)]
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
