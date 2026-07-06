const siteConfig = {
    siteName: 'Tool Basecamp',
    logoText: 'TB',
    title: 'Tools',
    keywords: 'productivity tools, PDF converter, JSON to Java, developer utilities, document tools',
    description: 'Tool Basecamp — document conversion, media utilities, and developer tools. PDF to Word, Video to Images, JSON to Java, and more.',
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
        { name: 'Tools', url: 'tool.html' },
        { name: 'Guestbook', url: 'guestbook.html' },
        { name: 'About', url: 'about.html' }
    ]
};

/** Self-hosted portals (same brand, separate deploy) */
const portalsConfig = [
    {
        title: 'PDF Toolkit',
        description: '50+ PDF tools — merge, split, compress, OCR, convert to Word, sign, and more. Self-hosted on pdf.toolbasecamp.com.',
        url: 'https://pdf.toolbasecamp.com',
        cta: 'Open PDF Toolkit',
        meta: 'pdf.toolbasecamp.com',
        theme: 'pdf'
    },
    {
        title: 'Developer Toolkit',
        description: '120+ browser-based developer tools — Base64, JWT, JSON, hash, regex, UUID, and more. Data stays in your browser.',
        url: 'https://dev.toolbasecamp.com',
        cta: 'Open Developer Toolkit',
        meta: 'dev.toolbasecamp.com',
        theme: 'dev'
    }
];

const toolsConfig = {
    sectionTitle: 'Basecamp Tools',
    groups: [
        {
            title: 'Media Tools',
            items: [
                { title: 'Video to Images', url: 'html/media/video-to-images.html' }
            ]
        },
        {
            title: 'Document Tools',
            items: [
                { title: 'PDF to Word', url: 'html/docs/pdf-to-word.html' },
                { title: 'Word to PDF', url: 'html/docs/word-to-pdf.html' },
                { title: 'Images to PDF', url: 'html/docs/images-to-pdf.html' }
            ]
        },
        {
            title: 'Developer Tools',
            items: [
                { title: 'JSON to Java', url: 'html/dev/json-to-java.html' }
            ]
        }
    ]
};

window.siteConfig = siteConfig;
window.portalsConfig = portalsConfig;
window.toolsConfig = toolsConfig;
