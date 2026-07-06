const siteConfig = {
    siteNameKey: 'site.name',
    logoText: 'TB',
    title: 'Tools',
    homeUrl: 'index.html',
    toolsHubUrl: 'index.html',
    mainSiteOrigin: 'https://toolbasecamp.com',
    descriptionKey: 'site.description',
    keywordsKey: 'site.keywords',
    footerKey: 'site.footer',
    adminEmail: 'admin@toolbasecamp.com',
    devPortalUrl: 'https://dev.toolbasecamp.com',
    pdfPortalUrl: 'https://pdf.toolbasecamp.com',
    apiBase: (function () {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8001';
        }
        return `${window.location.origin}/api`;
    })(),
    nav: [
        { nameKey: 'nav.tools', url: 'index.html' },
        { nameKey: 'nav.guestbook', url: 'guestbook.html' },
        { nameKey: 'nav.about', url: 'about.html' }
    ]
};

/** Self-hosted portals (same brand, separate deploy) */
const portalsConfig = [
    {
        titleKey: 'portals.pdf.title',
        descriptionKey: 'portals.pdf.description',
        url: 'https://pdf.toolbasecamp.com',
        ctaKey: 'portals.pdf.cta',
        meta: 'pdf.toolbasecamp.com',
        theme: 'pdf'
    },
    {
        titleKey: 'portals.dev.title',
        descriptionKey: 'portals.dev.description',
        url: 'https://dev.toolbasecamp.com',
        ctaKey: 'portals.dev.cta',
        meta: 'dev.toolbasecamp.com',
        theme: 'dev'
    }
];

const toolsConfig = {
    sectionTitleKey: 'hub.basecampTools',
    groups: [
        {
            titleKey: 'tools.groups.media',
            items: [
                { titleKey: 'tools.videoToImages.title', url: 'html/media/video-to-images.html' }
            ]
        },
        {
            titleKey: 'tools.groups.document',
            items: [
                { titleKey: 'tools.pdfToWord.title', url: 'html/docs/pdf-to-word.html' },
                { titleKey: 'tools.wordToPdf.title', url: 'html/docs/word-to-pdf.html' },
                { titleKey: 'tools.imagesToPdf.title', url: 'html/docs/images-to-pdf.html' }
            ]
        },
        {
            titleKey: 'tools.groups.developer',
            items: [
                { titleKey: 'tools.jsonToJava.title', url: 'html/dev/json-to-java.html' }
            ]
        }
    ]
};

window.siteConfig = siteConfig;
window.portalsConfig = portalsConfig;
window.toolsConfig = toolsConfig;
