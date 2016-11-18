export default function (option, list) {
  let object = find(array, o=>o.value === value);
  if(defined(object)){
    return object
  }
  return {
    value,
    hitCount: 'nil'
  }
}
