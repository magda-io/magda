import defined from './defined';

// create a array
// if current query is undefined, return an array with the new item
// if current query is defined but not array, return an array with both new and old items
// if current is defined and is array, append new item
export default function (query, currrentQuery) {
  let newQuery = [];
    // force query into array
    if (!defined(currrentQuery)){
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
