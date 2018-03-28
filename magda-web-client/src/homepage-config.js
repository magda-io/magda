/**
 * This is only a sample file.
 * Should be hosted at either:
 * https://s3-ap-southeast-2.amazonaws.com/data-gov-au-frontpage/development/ (for development)
 * or https://s3-ap-southeast-2.amazonaws.com/data-gov-au-frontpage/production/ (for production)
 * backgroundImageUrl must contain image width as part of url /name. e.g. twenty-1440w.jpg (image width is 1440px)
 */
window.magda_client_homepage_config = {
    baseUrl:
        "https://s3-ap-southeast-2.amazonaws.com/data-gov-au-frontpage/development/",
    backgroundImageUrls: [
        "twenty-1440w.jpg",
        "twenty-720w.jpg",
        "twenty-0w.jpg",
        "twenty-1080w.jpg",
        "twenty-2160w.jpg",
        "twenty-2880w.jpg"
    ],
    tagLineTextDesktop: "An easy way to find, access and reuse public data",
    tagLineTextMobile: "Find, share, and reuse open government data",
    Lozenge: {
        icon: "camara.svg",
        text: "Explore QLD road data",
        url: "/search?q=Queensland%20road%20data"
    },
    stories: [
        "story1.md",
        "story2.md",
        "story3.md",
        "story4.md",
        "story5.md",
        "story6.md"
    ]
};
