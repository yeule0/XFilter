chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection', 'bgColor'], (data) => {
  // Use object destructuring with defaults
  const {
    flagsToHide = [],
    wordsToHide = [],
    filterAds = true,
    ircMode = false,
    hideRightSection = false,
    bgColor = '#ffffff'
  } = data;

  console.log('Content script loaded with:', { bgColor });

  // Cache style elements and create only once
  const styleTags = {
    irc: getOrCreateStyle('irc-mode-style'),
    right: getOrCreateStyle('right-section-style'),
    bg: getOrCreateStyle('bg-style')
  };

  function getOrCreateStyle(id) {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    return style;
  }

  // Cache frequently used selectors
  const selectors = {
    tweets: '[data-testid="tweet"]',
    username: '[data-testid="UserName"]',
    primaryCol: '[data-testid="primaryColumn"]',
    sidebar: '[data-testid="sidebarColumn"]'
  };

  function filterTweets() {
    const tweets = document.querySelectorAll(`${selectors.tweets}:not([data-filtered])`);
    const lowerWords = wordsToHide.map(word => word.toLowerCase());

    tweets.forEach(tweet => {
      let shouldHide = false;
      const userName = tweet.querySelector(selectors.username)?.querySelector('span')?.innerText.toLowerCase();
      
      if (userName) {
        shouldHide = flagsToHide.some(flag => userName.includes(flag)) ||
                    lowerWords.some(word => userName.includes(word));
      }

      if (filterAds) {
        tweet.querySelectorAll('span').forEach(span => {
          const text = span.innerText.trim();
          if (text === 'Ad' || text === 'Promoted') shouldHide = true;
        });
      }

      if (shouldHide) tweet.style.display = 'none';
      tweet.dataset.filtered = 'true';
    });
  }

  function processTweetIRCMode(tweet) {
    // Combine badge preservation and profile pic removal
    const badgeSelector = `${selectors.username} svg[aria-label="Verified account"], ${selectors.username} img:not([src*="profile_images"])`;
    tweet.querySelectorAll(badgeSelector).forEach(badge => {
      badge.parentNode.dataset.ircPreserve = 'true';
      Object.assign(badge.style, {
        display: 'inline !important',
        marginLeft: '4px',
        verticalAlign: 'middle'
      });
    });

    const picBar = tweet.querySelector('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])');
    if (picBar?.querySelector('[data-testid="Tweet-User-Avatar"]')) {
      picBar.style.display = 'none';
      Object.assign(picBar.parentElement.style, {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px'
      });
      picBar.dataset.ircProcessed = 'true';
    }
  }

  function applyIRCMode() {
    styleTags.irc.textContent = ircMode ? `
      [data-testid="tweetPhoto"],
      [aria-label="Image"],
      [data-testid="testCondensedMedia"],
      [data-testid="article-cover-image"],
      [data-testid="card.layoutSmall.media"],
      [data-testid="card.layoutLarge.media"],
      a[href*="photo"] > div,
      [style="padding-bottom: 56.25%;"] {
        display: none !important;
      }
      [data-irc-preserve] {
        display: inline-flex !important;
        align-items: center !important;
        visibility: visible !important;
      }
    ` : '';

    if (ircMode) {
      const tweets = document.querySelectorAll(`${selectors.tweets}:not([data-irc-processed])`);
      tweets.forEach(tweet => {
        processTweetIRCMode(tweet);
        tweet.dataset.ircProcessed = 'true';
      });

      let timeout;
      const observer = new MutationObserver(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          document.querySelectorAll(`${selectors.tweets}:not([data-irc-processed])`)
            .forEach(tweet => {
              processTweetIRCMode(tweet);
              tweet.dataset.ircProcessed = 'true';
            });
        }, 250);
      });
      observer.observe(document.querySelector(selectors.primaryCol) || document.body, { 
        childList: true, 
        subtree: true 
      });
    }
  }

  function applyCustomBackground() {
    const useBackground = bgColor !== '#ffffff';
    styleTags.bg.textContent = useBackground ? `
      html, body { background: ${bgColor} !important; }
      ${selectors.primaryCol},
      ${selectors.sidebar},
      ${selectors.tweets},
      [data-testid="toolBar"],
      .css-175oi2r.r-1igl3o0.r-qklmqi.r-1adg3ll.r-1ny4l3l,
      .css-175oi2r.r-1adg3ll.r-1ny4l3l.r-1n0xq6e,
      .css-175oi2r.r-1adg3ll.r-1ny4l3l,
      .css-175oi2r.r-18u37iz.r-1wtj0ep,
      .css-175oi2r.r-1habvwh.r-18u37iz.r-1wtj0ep,
      .css-175oi2r.r-1w6e6rj.r-1d09ksm.r-417010,
      .css-175oi2r.r-1h8ys4a,
      .css-175oi2r.r-184en5c,
      .css-175oi2r.r-1iusvr4.r-16y2uox,
      .css-175oi2r.r-1d09ksm.r-18u37iz.r-1wbh5a2,
      .css-175oi2r.r-16y2uox.r-1wbh5a2,
      [data-testid="ScrollSnap-SwipeableList"],
      [data-testid="ScrollSnap-List"],
      .css-175oi2r.r-1adg3ll.r-16y2uox.r-1wbh5a2.r-1pi2tsx,
      .css-175oi2r.r-18u37iz.r-16y2uox.r-1wbh5a2.r-tzz3ar.r-1pi2tsx.r-buy8e9.r-mfh4gg.r-2eszeu.r-10m9thr.r-lltvgl,
      .css-175oi2r.r-14tvyh0.r-cpa5s6.r-16y2uox,
      .css-175oi2r.r-1awozwy.r-6koalj.r-eqz5dr.r-16y2uox.r-1h3ijdo.r-1777fci.r-s8bhmr.r-3pj75a.r-o7ynqc.r-6416eg.r-1ny4l3l.r-1loqt21,
      [style*="background-color: rgb(0, 0, 0)"],
      [style*="background-color: rgba(0, 0, 0, 0)"] {
        background: transparent !important;
        background-color: transparent !important;
      }
    ` : '';

    if (useBackground) {
      document.querySelectorAll('[style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]')
        .forEach(el => el.style.backgroundColor = 'transparent');
    }
  }

  function hideRightSectionFunc() {
    styleTags.right.textContent = hideRightSection ? `
      ${selectors.sidebar} { display: none !important; }
      ${selectors.primaryCol} { max-width: 100% !important; width: 100% !important; }
    ` : '';
  }

  // Initial application
  filterTweets();
  applyIRCMode();
  applyCustomBackground();
  hideRightSectionFunc();

  // Optimize global observer
  let lastBgCss = styleTags.bg.textContent;
  const globalObserver = new MutationObserver(() => {
    filterTweets();
    applyIRCMode();
    hideRightSectionFunc();
    const currentCss = styleTags.bg.textContent;
    if (currentCss !== lastBgCss) {
      applyCustomBackground();
      lastBgCss = currentCss;
    }
  });
  globalObserver.observe(document.body, { childList: true, subtree: true });

  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateBackground') {
      bgColor = message.bgColor || '#ffffff';
      console.log('Received background update:', { bgColor });
      applyCustomBackground();
    }
  });
});