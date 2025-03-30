chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection', 'bgColor'], (data) => {
  const flagsToHide = data.flagsToHide || [];
  const wordsToHide = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;
  const hideRightSection = data.hideRightSection !== undefined ? data.hideRightSection : false;
  let bgColor = data.bgColor || '#ffffff';

  console.log('Content script loaded with:', { bgColor });

  let styleTag = document.getElementById('irc-mode-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'irc-mode-style';
    document.head.appendChild(styleTag);
  }

  let rightSectionStyleTag = document.getElementById('right-section-style');
  if (!rightSectionStyleTag) {
    rightSectionStyleTag = document.createElement('style');
    rightSectionStyleTag.id = 'right-section-style';
    document.head.appendChild(rightSectionStyleTag);
  }

  let bgStyleTag = document.getElementById('bg-style');
  if (!bgStyleTag) {
    bgStyleTag = document.createElement('style');
    bgStyleTag.id = 'bg-style';
    document.head.appendChild(bgStyleTag);
  }

  function filterTweets() {
    document.querySelectorAll('[data-testid="tweet"]:not([data-filtered])').forEach(tweet => {
      let shouldHide = false;
      const userNameElement = tweet.querySelector('[data-testid="UserName"]');
      if (userNameElement) {
        const displayNameElement = userNameElement.querySelector('span');
        if (displayNameElement) {
          const displayName = displayNameElement.innerText.toLowerCase();
          shouldHide = flagsToHide.some(flag => displayName.includes(flag)) ||
                       wordsToHide.some(word => displayName.includes(word.toLowerCase()));
        }
      }

      if (filterAds) {
        const spans = tweet.querySelectorAll('span');
        spans.forEach(span => {
          const text = span.innerText.trim();
          if (text === 'Ad' || text === 'Promoted') {
            shouldHide = true;
          }
        });
      }

      if (shouldHide) {
        tweet.style.display = 'none';
      }
      tweet.setAttribute('data-filtered', 'true');
    });
  }

  function removeProfilePicBars(tweet) {
    const profilePicBar = tweet.querySelector('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])');
    if (profilePicBar && profilePicBar.querySelector('[data-testid="Tweet-User-Avatar"]')) {
      profilePicBar.style.display = 'none';
      const parent = profilePicBar.parentElement;
      parent.style.display = 'flex';
      parent.style.alignItems = 'flex-start';
      parent.style.gap = '8px';
      profilePicBar.setAttribute('data-irc-processed', 'true');
    }
  }

  function preserveBadges(tweet) {
    const badges = tweet.querySelectorAll('div[data-testid="User-Name"] svg[aria-label="Verified account"], div[data-testid="User-Name"] img:not([src*="profile_images"])');
    badges.forEach(badge => {
      badge.parentNode.setAttribute('data-irc-preserve', 'true');
      badge.style.cssText = 'display: inline !important; margin-left: 4px; vertical-align: middle;';
    });
  }

  function applyIRCMode() {
    let css = '';
    if (ircMode) {
      css += `
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
      `;
    }
    styleTag.textContent = css;

    if (ircMode) {
      const tweets = document.querySelectorAll('[data-testid="tweet"]:not([data-irc-processed])');
      tweets.forEach(tweet => {
        preserveBadges(tweet);
        removeProfilePicBars(tweet);
        tweet.setAttribute('data-irc-processed', 'true');
      });

      let timeout;
      const observer = new MutationObserver(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          const newTweets = document.querySelectorAll('[data-testid="tweet"]:not([data-irc-processed])');
          newTweets.forEach(tweet => {
            preserveBadges(tweet);
            removeProfilePicBars(tweet);
            tweet.setAttribute('data-irc-processed', 'true');
          });
        }, 250);
      });
      const primaryColumn = document.querySelector('[data-testid="primaryColumn"]') || document.body;
      observer.observe(primaryColumn, { childList: true, subtree: true });
    }
  }

  function applyCustomBackground() {
    let css = '';
    const useBackground = bgColor !== '#ffffff';
    if (useBackground) {
      css = `
        html, body {
          background: ${bgColor} !important;
        }
        /* Override X's default backgrounds */
        [data-testid="primaryColumn"],
        [data-testid="sidebarColumn"],
        [data-testid="tweet"],
        [data-testid="toolBar"],
        .css-175oi2r.r-1igl3o0.r-qklmqi.r-1adg3ll.r-1ny4l3l,
        .css-175oi2r.r-1adg3ll.r-1ny4l3l.r-1n0xq6e,
        .css-175oi2r.r-1adg3ll.r-1ny4l3l,
        .css-175oi2r.r-18u37iz.r-1wtj0ep,
        .css-175oi2r.r-1habvwh.r-18u37iz.r-1wtj0ep,
        .css-175oi2r.r-1w6e6rj.r-1d09ksm.r-417010,
        /* Selectors for "What's happening?" and reply sections */
        .css-175oi2r.r-1h8ys4a,
        .css-175oi2r.r-184en5c,
        .css-175oi2r.r-1iusvr4.r-16y2uox,
        .css-175oi2r.r-1d09ksm.r-18u37iz.r-1wbh5a2,
        .css-175oi2r.r-16y2uox.r-1wbh5a2,
        /* Selectors for the top header area (For you, Following tabs) */
        .css-175oi2r.r-1awozwy.r-zchlnj.r-1d09ksm,
        .css-175oi2r.r-1awozwy.r-18u37iz.r-zchlnj.r-1d09ksm.r-6gpygo,
        .css-175oi2r.r-1awozwy.r-18u37iz.r-1d09ksm.r-6gpygo,
        /* Elements with inline background-color */
        [style*="background-color: rgb(0, 0, 0)"],
        [style*="background-color: rgba(0, 0, 0, 0)"] {
          background: transparent !important;
          background-color: transparent !important;
        }
      `;
      console.log('Applying background CSS:', css);
    } else {
      css = ''; // Reset to default
      console.log('Resetting background to default');
    }
    bgStyleTag.textContent = css;

    // Additional step to handle inline styles dynamically
    if (useBackground) {
      document.querySelectorAll('[style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]').forEach(el => {
        el.style.backgroundColor = 'transparent';
      });
    }
  }

  function hideRightSectionFunc() {
    rightSectionStyleTag.textContent = hideRightSection ? `
      [data-testid="sidebarColumn"] { display: none !important; }
      [data-testid="primaryColumn"] { max-width: 100% !important; width: 100% !important; }
    ` : '';
  }

  // Initial application
  filterTweets();
  applyIRCMode();
  applyCustomBackground();
  hideRightSectionFunc();

  let lastBgCss = '';
  const globalObserver = new MutationObserver(() => {
    filterTweets();
    applyIRCMode();
    hideRightSectionFunc();
    // Only reapply background if the CSS has changed
    const currentCss = bgStyleTag.textContent;
    if (currentCss !== lastBgCss) {
      applyCustomBackground();
      lastBgCss = currentCss;
    }
  });
  globalObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for background updates from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateBackground') {
      bgColor = message.bgColor || '#ffffff';
      console.log('Received background update:', { bgColor });
      applyCustomBackground();
    }
  });
});