package common

# unfortunately, we can't use isEmpty to handle undefined value 
isEmpty(v) {
    v == null
}

isEmpty(v) {
    v == ""
}