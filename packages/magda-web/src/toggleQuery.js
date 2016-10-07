export default function (option, currrentQuery, allowMultiple) {

  let newQuery = [];

  if (allowMultiple === true){
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
    if(newQuery.indexOf(option.value) > -1){
      newQuery.splice(newQuery.indexOf(option.value), 1);
    } else{
      newQuery.push(option.value)
    }

    return newQuery;

  } else{
    return option.value;
  }
}
