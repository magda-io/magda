const datasets = (state={}, action) => {
  switch (action.type) {
    case 'SEARCH':
      return {
        hitCount: 100,
        dataset: [],
        facet: []
      }
    default:
      return {
        hitCount: 0,
        dataset: [],
        facet: []
      }
  }
};
export default datasets;
