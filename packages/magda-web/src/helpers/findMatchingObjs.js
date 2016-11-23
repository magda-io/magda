import defined from './defined';
import find from 'lodash.find';

export default function (valueList, objList) {
  let list = [];
  valueList.forEach(value=>{
    let object = find(objList, o=>o.value === value);
    // need to filter out invalid items
    if(defined(object)){
      list.push(object);
    }
  });

  return list;
}
