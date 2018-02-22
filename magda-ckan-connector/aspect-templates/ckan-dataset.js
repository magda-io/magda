const copy = Object.assign({}, dataset);
delete copy.resources;
return copy;
