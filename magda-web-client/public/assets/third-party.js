// Google Tag Manager
(function(w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    var f = d.getElementsByTagName(s)[0],
        j = d.createElement(s),
        dl = l != "dataLayer" ? "&l=" + l : "";
    j.async = true;
    j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
    f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", "GTM-KPSGPGD");

// Google Analytics (terria)
(function(i, s, o, g, r, a, m) {
    i["GoogleAnalyticsObject"] = r;
    (i[r] =
        i[r] ||
        function() {
            (i[r].q = i[r].q || []).push(arguments);
        }),
        (i[r].l = 1 * new Date());
    (a = s.createElement(o)), (m = s.getElementsByTagName(o)[0]);
    a.async = 1;
    a.src = g;
    m.parentNode.insertBefore(a, m);
})(
    window,
    document,
    "script",
    "https://www.google-analytics.com/analytics.js",
    "ga"
);

ga("create", "UA-92539508-1", "auto");

// VWO
var _vwo_code = (function() {
    var account_id = 329812,
        settings_tolerance = 2000,
        library_tolerance = 2500,
        use_existing_jquery = false,
        /* DO NOT EDIT BELOW THIS LINE */
        f = false,
        d = document;
    return {
        use_existing_jquery: function() {
            return use_existing_jquery;
        },
        library_tolerance: function() {
            return library_tolerance;
        },
        finish: function() {
            if (!f) {
                f = true;
                var a = d.getElementById("_vis_opt_path_hides");
                if (a) a.parentNode.removeChild(a);
            }
        },
        finished: function() {
            return f;
        },
        load: function(a) {
            var b = d.createElement("script");
            b.src = a;
            b.type = "text/javascript";
            b.innerText;
            b.onerror = function() {
                _vwo_code.finish();
            };
            d.getElementsByTagName("head")[0].appendChild(b);
        },
        init: function() {
            settings_timer = setTimeout(
                "_vwo_code.finish()",
                settings_tolerance
            );
            var a = d.createElement("style"),
                b =
                    "body{opacity:0 !important;filter:alpha(opacity=0) !important;background:none !important;}",
                h = d.getElementsByTagName("head")[0];
            a.setAttribute("id", "_vis_opt_path_hides");
            a.setAttribute("type", "text/css");
            if (a.styleSheet) a.styleSheet.cssText = b;
            else a.appendChild(d.createTextNode(b));
            h.appendChild(a);
            this.load(
                "//dev.visualwebsiteoptimizer.com/j.php?a=" +
                    account_id +
                    "&u=" +
                    encodeURIComponent(d.URL) +
                    "&r=" +
                    Math.random()
            );
            return settings_timer;
        }
    };
})();
_vwo_settings_timer = _vwo_code.init();

var $buoop = { vs: { i: 10, f: -4, o: -4, s: 7, c: -4 }, api: 4 };
function $buo_f() {
    var e = document.createElement("script");
    e.src = "//browser-update.org/update.min.js";
    document.body.appendChild(e);
}
try {
    document.addEventListener("DOMContentLoaded", $buo_f, false);
} catch (e) {
    window.attachEvent("onload", $buo_f);
}
