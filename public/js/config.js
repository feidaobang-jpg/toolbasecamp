const siteConfig = {
    siteNameKey: 'site.name',
    logoText: 'TB',
    title: 'Tools',
    homeUrl: 'index.html',
    toolsHubUrl: 'index.html',
    lifeHubUrl: 'life.html',
    gamesHubUrl: 'games.html',
    mainSiteOrigin: 'https://toolbasecamp.com',
    descriptionKey: 'site.description',
    keywordsKey: 'site.keywords',
    footerKey: 'site.footer',
    adminEmail: 'admin@toolbasecamp.com',
    devPortalUrl: 'https://dev.toolbasecamp.com',
    pdfPortalUrl: 'https://pdf.toolbasecamp.com',
    chefPortalUrl: 'https://chef.toolbasecamp.com',
    hoppscotchPortalUrl: 'https://hoppscotch.toolbasecamp.com',
    translatePortalUrl: 'https://translate.toolbasecamp.com',
    apiBase: (function () {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://127.0.0.1:8001';
        }
        return `${window.location.origin}/api`;
    })(),
    nav: [
        { nameKey: 'nav.tools', url: 'index.html' },
        { nameKey: 'nav.life', url: 'life.html' },
        { nameKey: 'nav.games', url: 'games.html' },
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
        theme: 'pdf'
    },
    {
        titleKey: 'portals.dev.title',
        descriptionKey: 'portals.dev.description',
        url: 'https://dev.toolbasecamp.com',
        ctaKey: 'portals.dev.cta',
        theme: 'dev'
    },
    {
        titleKey: 'portals.chef.title',
        descriptionKey: 'portals.chef.description',
        url: 'https://chef.toolbasecamp.com',
        ctaKey: 'portals.chef.cta',
        theme: 'chef'
    },
    {
        titleKey: 'portals.hoppscotch.title',
        descriptionKey: 'portals.hoppscotch.description',
        url: 'https://hoppscotch.toolbasecamp.com',
        ctaKey: 'portals.hoppscotch.cta',
        theme: 'hoppscotch'
    },
    {
        titleKey: 'portals.translate.title',
        descriptionKey: 'portals.translate.description',
        url: 'https://translate.toolbasecamp.com',
        ctaKey: 'portals.translate.cta',
        theme: 'translate'
    }
];

const toolsConfig = {
    sectionTitleKey: 'hub.basecampTools',
    groups: [
        {
            titleKey: 'tools.groups.calc',
            items: [
                { titleKey: 'tools.age.title', url: 'html/calc/age.html' },
                { titleKey: 'tools.bmi.title', url: 'html/calc/bmi.html' },
                { titleKey: 'tools.loan.title', url: 'html/calc/loan.html' },
                { titleKey: 'tools.k510Reward.title', url: 'html/calc/510k-reward.html' }
            ]
        },
        {
            titleKey: 'tools.groups.convert',
            items: [
                { titleKey: 'tools.rmbUppercase.title', url: 'html/convert/rmb-uppercase.html' }
            ]
        },
        {
            titleKey: 'tools.groups.food',
            items: [
                { titleKey: 'tools.aiRecipe.title', url: 'html/life/ai-recipe.html' }
            ]
        },
        {
            titleKey: 'tools.groups.record',
            items: [
                { titleKey: 'tools.cardScore.title', url: 'html/record/card-score.html' },
                { titleKey: 'tools.k510Score.title', url: 'html/record/510k-score.html' },
                { titleKey: 'tools.importantDays.title', url: 'html/record/important-days.html', authRequired: true },
                { titleKey: 'tools.dailyClock.title', url: 'html/record/daily-clock.html', authRequired: true },
                { titleKey: 'tools.deposit.title', url: 'html/record/deposit.html', authRequired: true },
                { titleKey: 'tools.goods.title', url: 'html/record/goods.html', authRequired: true }
            ]
        },
        {
            titleKey: 'tools.groups.media',
            items: [
                { titleKey: 'tools.qrCode.title', url: 'html/media/qr-code.html' },
                { titleKey: 'tools.imageResize.title', url: 'html/media/image-resize.html' },
                { titleKey: 'tools.watermarkRemoval.title', url: 'html/media/watermark-removal.html' },
                { titleKey: 'tools.watermarkRemovalAdvanced.title', url: 'html/media/watermark-removal-advanced.html' },
                { titleKey: 'tools.iconMaker.title', url: 'html/media/icon-maker.html' },
                { titleKey: 'tools.coverMaker.title', url: 'html/media/cover-maker.html' },
                { titleKey: 'tools.imageToAnimation.title', url: 'html/media/image-to-animation.html', authRequired: true },
                { titleKey: 'tools.idCardCopy.title', url: 'html/media/id-card-copy.html' },
                { titleKey: 'tools.imageEnhance.title', url: 'html/media/image-enhance.html', authRequired: true },
                { titleKey: 'tools.portraitCutout.title', url: 'html/media/portrait-cutout.html', authRequired: true },
                { titleKey: 'tools.idPhoto.title', url: 'html/media/id-photo.html', authRequired: true },
                { titleKey: 'tools.videoToImages.title', url: 'html/media/video-to-images.html' }
            ]
        },
        {
            titleKey: 'tools.groups.document',
            items: [
                { titleKey: 'tools.pdfToWord.title', url: 'html/docs/pdf-to-word.html' },
                { titleKey: 'tools.wordToPdf.title', url: 'html/docs/word-to-pdf.html' },
                { titleKey: 'tools.imagesToPdf.title', url: 'html/docs/images-to-pdf.html' },
                { titleKey: 'tools.imagesToPdfAdvanced.title', url: 'html/media/images-to-pdf-advanced.html', authRequired: true },
                { titleKey: 'tools.ocrText.title', url: 'html/media/ocr-text.html', authRequired: true },
                { titleKey: 'tools.ocrTable.title', url: 'html/media/ocr-table.html', authRequired: true }
            ]
        },
        {
            titleKey: 'tools.groups.diagram',
            items: [
                { titleKey: 'tools.mindmap.title', url: 'html/diagram/mindmap.html' },
                { titleKey: 'tools.spreadsheet.title', url: 'html/diagram/spreadsheet.html' }
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

/** Top-level games hub (peer to tools) */
const gamesConfig = {
    sectionTitleKey: 'hub.gamesTitle',
    groups: [
        {
            titleKey: 'games.groups.casual',
            items: [
                { titleKey: 'tools.sudoku.title', url: 'html/game/sudoku.html' },
                { titleKey: 'tools.klotski.title', url: 'html/game/klotski.html' },
                { titleKey: 'tools.gomoku.title', url: 'html/game/gomoku.html' },
                { titleKey: 'tools.puzzle.title', url: 'html/game/puzzle.html' },
                { titleKey: 'tools.gemswap.title', url: 'html/game/gemswap.html' },
                { titleKey: 'tools.breakout.title', url: 'html/game/breakout.html' },
                { titleKey: 'tools.lianliankan.title', url: 'html/game/lianliankan.html' },
                { titleKey: 'tools.goldminer.title', url: 'html/game/goldminer.html' },
                { titleKey: 'tools.descent.title', url: 'html/game/descent.html' },
                { titleKey: 'tools.snake.title', url: 'html/game/snake.html' },
                { titleKey: 'tools.g2048.title', url: 'html/game/g2048.html' },
                { titleKey: 'tools.whack.title', url: 'html/game/whack.html' },
                { titleKey: 'tools.shooter.title', url: 'html/game/shooter.html' },
                { titleKey: 'tools.jumpjump.title', url: 'html/game/jumpjump.html' },
                { titleKey: 'tools.catcher.title', url: 'html/game/catcher.html' },
                { titleKey: 'tools.tetris.title', url: 'html/game/tetris.html' },
                { titleKey: 'tools.memory.title', url: 'html/game/memory.html' },
                { titleKey: 'tools.runner.title', url: 'html/game/runner.html' },
                { titleKey: 'tools.mines.title', url: 'html/game/mines.html' },
                { titleKey: 'tools.slots.title', url: 'html/game/slots.html' },
                { titleKey: 'tools.sheepstack.title', url: 'html/game/sheepstack.html' },
                { titleKey: 'tools.diverDave.title', url: 'html/game/diver-dave.html' },
                { titleKey: 'tools.parkour.title', url: 'html/game/parkour.html' },
                { titleKey: 'tools.cubeRush.title', url: 'html/game/cube-rush.html' },
                { titleKey: 'tools.arenaBrawl.title', url: 'html/game/arena-brawl.html' },
                { titleKey: 'tools.arenaStrike.title', url: 'html/game/arena-strike.html' },
                { titleKey: 'tools.gardenDefense.title', url: 'html/game/garden-defense.html' },
                { titleKey: 'tools.blitzRun3d.title', url: 'html/game/blitz-run.html?v=10' },
                { titleKey: 'tools.superMario.title', url: 'html/game/super-mario.html' }
            ]
        }
    ]
};

window.siteConfig = siteConfig;
window.portalsConfig = portalsConfig;
window.toolsConfig = toolsConfig;
window.gamesConfig = gamesConfig;
