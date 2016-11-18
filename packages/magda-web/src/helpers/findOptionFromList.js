import defined from './defined';
import find from 'lodash.find';

export default function (value, list) {
  let object = find(list, o=>o.value === value);
  if(defined(object)){
    return object
  } else{
    return {
      value,
      hitCount: 'nil'
    }
  }
}
