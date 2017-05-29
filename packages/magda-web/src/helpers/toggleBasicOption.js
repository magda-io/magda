// @flow
export default function toggleBasicOption(option, activeOptions, key,  removeOption, addOption, updateQuery, dispatch) {
  updateQuery({
    page: undefined
  });

  let existingOptions = activeOptions.map(o=>o.value);
  let index = existingOptions.indexOf(option.value);
  if(index > -1){
    updateQuery({
      [key]: [...existingOptions.slice(0, index), ...existingOptions.slice(index+1)]
    })
    dispatch(removeOption(option))
  } else{
    updateQuery({
      [key]: [...existingOptions, option.value]
    })
    dispatch(addOption(option))
  }
}
