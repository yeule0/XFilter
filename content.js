const XFILTER_PREFIX = 'xfilter';
const DEFAULT_BG_COLOR = '#ffffff';
const DEBOUNCE_DELAY = 500;

let settings = {
    flagsToHide: [],
    wordsToHide: [],
    filterAds: true,
    ircMode: false,
    hideRightSection: false,
    bgColor: DEFAULT_BG_COLOR,
};

// Ensure style tags exist
function ensureStyleTag(id) {
    let tag = document.getElementById(id);
    if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
    }
    return tag;
}
const ircStyleTag = ensureStyleTag('irc-mode-style');
const rightSectionStyleTag = ensureStyleTag('right-section-style');
const bgStyleTag = ensureStyleTag('bg-style');

// Basic logging
function log(...args) { console.log("XFilter:", ...args); }
function warn(...args) { console.warn("XFilter:", ...args); }
function error(...args) { console.error("XFilter:", ...args); }

// Hides tweets based on current settings
function filterTweets() {
    log("Running filterTweets...");
    document.querySelectorAll(`[data-testid="tweet"]:not([data-${XFILTER_PREFIX}-filter-processed="true"])`)
        .forEach(tweet => {
            tweet.setAttribute(`data-${XFILTER_PREFIX}-filter-processed`, 'true');
            let shouldHide = false;
            let reason = '';

            if (settings.filterAds) {
                 const promotedText = tweet.querySelector('div[data-testid="promotedIndicator"]');
                 if (promotedText && (promotedText.textContent === 'Promoted' || promotedText.textContent === 'Ad')) {
                    shouldHide = true; reason = 'Ad/Promoted Indicator';
                 }
                 if (!shouldHide) {
                     const spans = tweet.querySelectorAll('span');
                     for (const span of spans) {
                         if (span.offsetParent !== null) {
                             const text = span.innerText.trim();
                             if (text === 'Ad' || text === 'Promoted') {
                                 shouldHide = true; reason = 'Ad/Promoted Text'; break;
                             }
                         }
                     }
                 }
            }

            if (!shouldHide && (settings.flagsToHide.length > 0 || settings.wordsToHide.length > 0)) {
                const userNameElement = tweet.querySelector('[data-testid="UserName"]');
                if (userNameElement) {
                    const displayNameElement = userNameElement.querySelector('span');
                    const nameToCheck = (displayNameElement?.innerText || userNameElement.textContent || '').toLowerCase();
                    if (settings.flagsToHide.some(flag => flag && nameToCheck.includes(flag))) {
                        shouldHide = true; reason = 'Flag in Name';
                    }
                    if (!shouldHide && settings.wordsToHide.some(word => word && nameToCheck.includes(word.toLowerCase()))) {
                         shouldHide = true; reason = 'Word in Name';
                    }
                }
            }

            if (shouldHide) {
                tweet.style.display = 'none';
                tweet.setAttribute(`data-${XFILTER_PREFIX}-hidden`, reason);
            } else {
                if (tweet.style.display === 'none' && tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                   tweet.style.display = '';
                }
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-hidden`);
            }
        });
}

// IRC Mode: Hide profile pic column
function removeProfilePicBars(tweet) {
    const profilePicBar = tweet.querySelector(
        '.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])'
    );
    if (profilePicBar && profilePicBar.querySelector('[data-testid="Tweet-User-Avatar"]')) {
        const parent = profilePicBar.parentElement;
        if (parent) {
            if(parent.style.display !== 'flex') {
                parent.style.display = 'flex';
                parent.style.alignItems = 'flex-start';
                parent.style.gap = '8px';
            }
        }
        profilePicBar.setAttribute('data-irc-processed', 'true');
    }
}

// IRC Mode: Keep badges visible
function preserveBadges(tweet) {
    const badges = tweet.querySelectorAll(
        'div[data-testid="User-Name"] svg[aria-label="Verified account"], ' +
        'div[data-testid="User-Name"] img:not([src*="profile_images"])'
    );
    badges.forEach(badge => {
        const parentDiv = badge.closest('div[data-testid="User-Name"]');
        if (parentDiv && !parentDiv.hasAttribute('data-irc-preserve')) {
             parentDiv.setAttribute('data-irc-preserve', 'true');
        }
       badge.style.cssText = `display: inline !important; margin-left: 4px; vertical-align: middle; height: 1em; width: auto;`;
    });
}

// Applies IRC mode CSS and helpers
function applyIRCMode() {
    let css = '';
    if (settings.ircMode) {
        css += `
            [data-testid="tweetPhoto"], [aria-label="Image"], [data-testid="testCondensedMedia"],
            [data-testid="article-cover-image"], [data-testid="card.layoutSmall.media"],
            [data-testid="card.layoutLarge.media"], a[href*="photo"] > div,
            [style*="padding-bottom: 56.25%"] { display: none !important; }
            .css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy { display: none !important; width: 0px !important; min-width: 0px !important; padding: 0 !important; margin: 0 !important; }
            div[data-testid="User-Name"][data-irc-preserve] { display: inline-flex !important; align-items: center !important; visibility: visible !important; vertical-align: text-bottom; }
            div[data-testid="User-Name"][data-irc-preserve] svg[aria-label="Verified account"],
            div[data-testid="User-Name"][data-irc-preserve] img:not([src*="profile_images"]) { display: inline !important; visibility: visible !important; opacity: 1 !important; height: 1em; width: auto; }
            div[data-testid="User-Name"] > div[dir="ltr"]:not(:has(> span)) { display: none !important; }
        `;
    }
    if (ircStyleTag.textContent !== css) { ircStyleTag.textContent = css; }

    if (settings.ircMode) {
        document.querySelectorAll('[data-testid="tweet"]:not([style*="display: none"])').forEach(tweet => {
             if (!tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                 preserveBadges(tweet); removeProfilePicBars(tweet);
             }
        });
    } else {
        document.querySelectorAll('[data-irc-preserve]').forEach(el => el.removeAttribute('data-irc-preserve'));
        document.querySelectorAll('[data-irc-processed]').forEach(el => el.removeAttribute('data-irc-processed'));
    }
}

// Applies custom background color
function applyCustomBackground() {
    let css = '';
    const useBackground = settings.bgColor && settings.bgColor.toLowerCase() !== DEFAULT_BG_COLOR;
    if (useBackground) {
        css = `
            html, body { background: ${settings.bgColor} !important; }
            [data-testid="primaryColumn"], [data-testid="sidebarColumn"], [data-testid="tweet"],
            [data-testid="toolBar"], .css-175oi2r.r-1igl3o0.r-qklmqi.r-1adg3ll.r-1ny4l3l,
            .css-175oi2r.r-1adg3ll.r-1ny4l3l.r-1n0xq6e, .css-175oi2r.r-1adg3ll.r-1ny4l3l,
            .css-175oi2r.r-18u37iz.r-1wtj0ep, .css-175oi2r.r-1habvwh.r-18u37iz.r-1wtj0ep,
            .css-175oi2r.r-1w6e6rj.r-1d09ksm.r-417010, .css-175oi2r.r-1h8ys4a,
            .css-175oi2r.r-184en5c, .css-175oi2r.r-1iusvr4.r-16y2uox,
            .css-175oi2r.r-1d09ksm.r-18u37iz.r-1wbh5a2, .css-175oi2r.r-16y2uox.r-1wbh5a2,
            .css-175oi2r.r-1awozwy.r-zchlnj.r-1d09ksm, .css-175oi2r.r-1awozwy.r-18u37iz.r-zchlnj.r-1d09ksm.r-6gpygo,
            .css-175oi2r.r-1awozwy.r-18u37iz.r-1d09ksm.r-6gpygo, .css-175oi2r.r-zchlnj.r-1d09ksm,
            .css-175oi2r.r-1awozwy.r-zchlnj, .css-175oi2r.r-1d09ksm,
            .css-175oi2r.r-aqfbo4.r-gtdqiz.r-1gn8etr.r-1g40b8q, .css-175oi2r.r-1e5uvyk.r-6026j,
            [style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]
            { background: transparent !important; background-color: transparent !important; }
        `;
    }
    if (bgStyleTag.textContent !== css) { bgStyleTag.textContent = css; }

    if (useBackground) {
        document.querySelectorAll(
            '[style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]'
        ).forEach(el => {
             if (el.style.backgroundColor === 'rgb(0, 0, 0)' || el.style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                el.style.backgroundColor = 'transparent';
             }
        });
    }
}

// Hides the right sidebar
function hideRightSectionFunc() {
    let css = '';
    if (settings.hideRightSection) {
        css = `
            [data-testid="sidebarColumn"] { display: none !important; width: 0px !important; min-width: 0px !important; }
            @media (min-width: 1000px) {
                [data-testid="primaryColumn"] { width: 100% !important; max-width: 990px !important; border-right-width: 0px !important; margin-right: 0px !important; }
                header[role="banner"] > div > div > div { max-width: 990px !important; }
            }
        `;
    }
    if (rightSectionStyleTag.textContent !== css) { rightSectionStyleTag.textContent = css; }
}

// Debounce function utility
function debounce(func, wait) {
    let timeout;
    const debouncedFunc = function executedFunction(...args) {
        const context = this;
        const later = () => { timeout = null; func.apply(context, args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    debouncedFunc._timeoutId = timeout;
    return debouncedFunc;
}

// Runs all filtering and styling
const processTimelineChanges = () => {
    log("Processing timeline changes (debounced)...");
    filterTweets();
    applyIRCMode();
    applyCustomBackground();
    hideRightSectionFunc();
};

// Debounced version for observer
const debouncedProcessTimeline = debounce(processTimelineChanges, DEBOUNCE_DELAY);

// Observer watches for new tweets
const observerCallback = (mutationsList) => {
    let relevantMutation = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('[data-testid="tweet"]') || node.querySelector?.('[data-testid="tweet"]'))) {
                    relevantMutation = true; break;
                }
            }
        }
        if (relevantMutation) break;
    }
    if (relevantMutation) { debouncedProcessTimeline(); }
};

// Handles messages from popup/background
async function handleMessages(message, sender, sendResponse) {
    let needsProcessing = false;
    let settingsChanged = false;

    if (message.action === 'settingsUpdated' && message.settings) {
        const oldSettings = { ...settings };
        settings = { ...settings, ...message.settings };
        settingsChanged = true;
        log('Settings updated via message.');

        const visualFiltersChanged = (oldSettings.filterAds !== settings.filterAds || JSON.stringify(oldSettings.flagsToHide) !== JSON.stringify(settings.flagsToHide) || JSON.stringify(oldSettings.wordsToHide) !== JSON.stringify(settings.wordsToHide));
        const appearanceChanged = (oldSettings.ircMode !== settings.ircMode || oldSettings.hideRightSection !== settings.hideRightSection || oldSettings.bgColor !== settings.bgColor);

         if (visualFiltersChanged) {
             document.querySelectorAll(`[data-testid="tweet"][data-${XFILTER_PREFIX}-filter-processed="true"]`).forEach(t => {
                 t.removeAttribute(`data-${XFILTER_PREFIX}-filter-processed`);
                 if (t.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) { t.style.display = ''; }
             });
             filterTweets(); needsProcessing = true;
         }
         if (appearanceChanged) {
             applyIRCMode(); applyCustomBackground(); hideRightSectionFunc(); needsProcessing = true;
         }
        sendResponse({ status: "Settings processing initiated" });

    } else if (message.action === 'updateBackground') {
        if (settings.bgColor !== message.bgColor) {
            settings.bgColor = message.bgColor || DEFAULT_BG_COLOR;
            applyCustomBackground(); sendResponse({ status: "Background updated" });
        } else { sendResponse({ status: "Background unchanged" }); }
    } else {
        warn("Received unknown message action:", message.action);
        sendResponse({ status: "Unknown action" });
    }

    if (needsProcessing && settingsChanged) { debouncedProcessTimeline(); }
    return false;
}

// Main initialization
async function main() {
    log("Content Script Initializing...");
    try {
        const data = await chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection', 'bgColor']);
        settings = {
            flagsToHide: data.flagsToHide || [], wordsToHide: data.wordsToHide || [],
            filterAds: data.filterAds ?? true, ircMode: data.ircMode ?? false,
            hideRightSection: data.hideRightSection ?? false, bgColor: data.bgColor || DEFAULT_BG_COLOR,
        };
        log('Initial settings loaded.');
    } catch (err) { error("Error loading initial settings:", err); }

    // Apply initial state
    applyIRCMode();
    applyCustomBackground();
    hideRightSectionFunc();
    filterTweets();

    // Start observer
    const targetNode = document.body;
    if (!targetNode) { error("Document body not found!"); return; }
    const observer = new MutationObserver(observerCallback);
    observer.observe(targetNode, { childList: true, subtree: true });
    log("Mutation observer started.");

    // Listen for messages
    chrome.runtime.onMessage.addListener(handleMessages);
    log("Message listener added.");
    log("Initialization complete.");
}

// Entry point
try {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', main); }
    else { main(); }
} catch (err) { error("Uncaught error during initialization:", err); }
