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
        "Dig-into-an-interactive-tax-form.md",
        "WWhat-you-need-to-know-about-using-data.md",
        "Births-past-and-future.md",
        "IIntellectual-property-in-Australia-a-visualisation.md",
        "Open-Data-Toolkit.md",
        "How-do-you-use-public-data.md"
    ]
};
