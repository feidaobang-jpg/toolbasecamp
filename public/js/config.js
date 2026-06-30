const siteConfig = {
    siteName: 'Tool Basecamp',
    logoText: 'TB',
    title: 'Tools',
    keywords: 'productivity tools, PDF converter, JSON to Java, developer utilities, document tools',
    description: 'Tool Basecamp — fast document conversion and developer utilities. PDF to Word, Word to PDF, Images to PDF, JSON to Java entity generator.',
    adminEmail: 'admin@toolbasecamp.com',
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

const toolsConfig = {
    groups: [
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
window.toolsConfig = toolsConfig;
