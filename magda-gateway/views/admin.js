const instanceURL = "/api/v0";
let timeout = null;

window.onload = function () {
    refresh();
};

const sections = {};

function addSection(label, callback) {
    sections[label] = callback;
}

async function refresh() {
    const body = d3.select("#body").text("Loading...");

    try {
        const me = await request("GET", `${instanceURL}/auth/users/whoami`);
        body.text("");

        if (!me.isAdmin) {
            body.append("P").text(
                `Hi ${me.displayName}, you are not an admin!`
            );
            return;
        }

        const header = body.append("div").attr("id", "header");

        header.append("span").text("Admin / ");
        const section = header.append("select");
        const sectionBody = body.append("div");
        for (let key of Object.keys(sections)) {
            section.append("option").text(key);
        }
        section.on("change", () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            sections[section.property("value")](sectionBody.text("Loading..."));
        });
        section.on("change")();
    } catch (e) {
        body.append("pre").text(e);

        body.append("p").html(
            `Are you logged in? Try <a href="${instanceURL.substr(
                0,
                instanceURL.indexOf("/", 9)
            )}/auth">here</a>.`
        );

        console.error(e.stack);
    }
}

function request(method, url, body = null, contentType = undefined) {
    console.log(method, url, body);
    const headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
    };
    if (contentType) {
        headers["Content-Type"] = contentType;
    }
    if (contentType === "application/json") {
        body = JSON.stringify(body);
    }
    const mode = "cors";
    const credentials = "include";
    return d3.json(url, { method, headers, body, mode, credentials });
}
