const copy = Object.assign({}, dataset);
delete copy.distribution;
return copy;
