package common

import rego.v1

# unfortunately, we can't use isEmpty to handle undefined value as `undefined` is not a scalar value that rego supports
# the rule will fail before enter isEmpty
# We don't want use `null` as valid "empty" value due to the difficulty of handling null
isEmpty("")
