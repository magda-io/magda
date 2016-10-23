// sane way
function findIndex(array, predicate){
  let i = -1;
  while(i++< array.length){
    if(predicate(array[i])){
      return i;
    }
  }
  return -1;
}

// functinal way
const findIndex = (f=>f(f))(f=>(next => (array, predicate, i = 0) =>
  (i >= array.length) ? -1 : (predicate(array[i])) ? i : next(array, predicate, i + 1)
)((...args)=>(f(f))(...args)))
