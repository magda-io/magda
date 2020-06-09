addSection("User accounts", async function (body) {
    const users = await request("GET", "/api/v0/auth/users/all");
    body.text("");
    body.append("h2").text("Manage Users");

    const table = body.append("table");
    const head = table.append("thead").append("tr");
    head.append("th").text("name");
    head.append("th").text("email");
    head.append("th").text("source");
    head.append("th").text("admin");
    users.items.forEach((user) => {
        const row = table.append("tr");
        row.append("td").text(user.displayName);
        row.append("td").text(user.email);
        row.append("td").text(user.source);
        const admin = row.append("td");
        if (user.isAdmin) {
            admin
                .append("button")
                .text("Unmake Admin")
                .on("click", async () => {
                    await request(
                        "PUT",
                        `/api/v0/auth/users/${user.id}`,
                        {
                            isAdmin: false
                        },
                        "application/json"
                    );
                    showUsers(body);
                });
        } else {
            admin
                .append("button")
                .text("Make Admin")
                .on("click", async () => {
                    await request(
                        "PUT",
                        `/api/v0/auth/users/${user.id}`,
                        {
                            isAdmin: true
                        },
                        "application/json"
                    );
                    showUsers(body);
                });
        }
    });
});
