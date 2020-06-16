addSection("My info", async function (body) {
    const me = await request("GET", `${instanceURL}/auth/users/whoami`);
    body.text("");
    body.append("pre").text(JSON.stringify(me, null, 2));
});
