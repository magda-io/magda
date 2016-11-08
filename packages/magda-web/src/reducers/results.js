import findIndex from 'lodash.findindex';

const initialData = {
  isFetching: true,
  datasets: [],
  hitCount: 0,
  query: '',
  activePublishers: [],
  activeFormats: [],
  activeRegions: [],
  activeDateFrom: '',
  activeDateTo:'',
  publisherOptions: [],
  temporalOptions: [],
  formatOptions: []
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

      let activePublishers = query.publishers.map(item=> find(data.facets[0].options, o=>o.value === item.value));
      let activeDateFrom = query.dateFrom;
      let activeDateto = query.dateTo;
      let activeFormats = query.formats.map(item=>find(data.facets[2].options, o=>o.value === item.value));
      // temp
      let activeRegions = query.regions.map(item=>({regionId: '', regionType: ''}));

      return Object.assign({}, state, {
        isFetching: false,
        datasets,
        hitCount,
        query,
        publisherOptions,
        temporalOptions,
        formatOptions,

        activePublishers,
        activeRegions,
        activeDateFrom,
        activeDateto,
        activeFormats
      })

    case 'ADD_PUBLISHER':
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers, action.item]
      })

    case 'REMOVE_PUBLISHER':
     let index = findIndex(state.activePublishers, item=> item.value === action.item.value);
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

    default:
      return state
  }
};
export default results;
