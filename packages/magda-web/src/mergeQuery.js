import defined from './defined';
export default function (query, currrentQuery) {
  let newQuery = [];
    // force filters into array
    if (!currrentQuery){
      newQuery = [];
    }
    // if already array
    else if(Array.isArray(currrentQuery)){
      newQuery = currrentQuery;
    }
    // if only one item, create array
    else{
      newQuery = [currrentQuery];
    }
    // add or remove from array
    if(Array.isArray(query)){
      return newQuery.concat(query);
    }
    return query
}
