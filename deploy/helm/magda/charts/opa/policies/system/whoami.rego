package system.whoami

response [x] {
    request := {
        "url": "http://authorization-api/v0/public/users/whoami",
        "force_json_decode": true,
        "method": "get"
    }

    output := http.send(request)
    x := output.body
}