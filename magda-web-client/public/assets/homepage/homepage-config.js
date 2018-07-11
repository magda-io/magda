/**
 * This is only a sample file.
 * Should be hosted at either:
 * https://s3-ap-southeast-2.amazonaws.com/data-gov-au-frontpage/development/ (for development)
 * or https://s3-ap-southeast-2.amazonaws.com/data-gov-au-frontpage/production/ (for production)
 * backgroundImageUrl must contain image width as part of url /name. e.g. twenty-1440w.jpg (image width is 1440px)
 */
window.magda_client_homepage_config = {
    baseUrl: "/assets/homepage/",
    backgroundImageUrls: [
        "twenty-1440w.jpg",
        "twenty-720w.jpg",
        "twenty-0w.jpg",
        "twenty-1080w.jpg",
        "twenty-2160w.jpg",
        "twenty-2880w.jpg"
    ],
    tagLineTextDesktop:
        "An easy way to find, explore and reuse Australia's public data",
    tagLineTextMobile:
        "An easy way to find, explore and reuse Australia's public data",
    Lozenge: {
        icon: "camara.svg",
        text: "Explore QLD road data",
        url: "/search?q=Queensland%20road%20data"
    },
    stories: [
        "story4.md",
        "story2.md",
        "story3.md",
        "story1.md",
        "story5.md",
        "story6.md"
    ]
};

(function() {
    var backgroundImgs = [
        [
            "twenty-1440w.jpg",
            "twenty-720w.jpg",
            "twenty-0w.jpg",
            "twenty-1080w.jpg",
            "twenty-2160w.jpg",
            "twenty-2880w.jpg"
        ],
        ["pool-1440w.jpg", "pool-1080w.jpg", "pool-720w.jpg", "pool-0w.jpg"]
    ];
    var lozenges = [
        {
            icon: "camara.svg",
            text: "Explore QLD road data",
            url: "/search?q=Queensland%20road%20data"
        },
        {
            icon: "camara.svg",
            text: "Explore Sea level data",
            url: "/search?q=Sea%20level"
        }
    ];

    var idx = new Date().getDate() % 2; //--- image keep same for the day
    if (backgroundImgs[idx])
        window.magda_client_homepage_config.backgroundImageUrls =
            backgroundImgs[idx];
    if (lozenges[idx])
        window.magda_client_homepage_config.Lozenge = lozenges[idx];
})();
