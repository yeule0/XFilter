chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection'], (data) => {
  const flagsToHide = data.flagsToHide || [];
  const wordsToHide = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;
  const hideRightSection = data.hideRightSection !== undefined ? data.hideRightSection : false;

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
      tweet.setAttribute('data-filtered', 'true'); // Mark as processed
    });
  }

  function removeProfilePicBars(tweet) {
    const profilePicBar = tweet.querySelector('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])');
    if (profilePicBar && profilePicBar.querySelector('[data-testid="Tweet-User-Avatar"]')) {
      // Instead of replacing with a placeholder, hide and collapse the space
      profilePicBar.style.display = 'none';
      const parent = profilePicBar.parentElement;
      parent.style.display = 'flex';
      parent.style.alignItems = 'flex-start';
      parent.style.gap = '8px'; // Adjust spacing between text and remaining elements
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
    if (ircMode) {
      styleTag.textContent = `
        /* Hide all media by default */
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
        /* Preserve badges */
        [data-irc-preserve] {
          display: inline-flex !important;
          align-items: center !important;
          visibility: visible !important;
        }
      `;

      const tweets = document.querySelectorAll('[data-testid="tweet"]:not([data-irc-processed])');
      tweets.forEach(tweet => {
        preserveBadges(tweet);
        removeProfilePicBars(tweet);
        tweet.setAttribute('data-irc-processed', 'true');
      });

      // Optimized MutationObserver for IRC mode
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
        }, 250); // Increased debounce to 250ms
      });
      const primaryColumn = document.querySelector('[data-testid="primaryColumn"]') || document.body;
      observer.observe(primaryColumn, { childList: true, subtree: true });

    } else {
      styleTag.textContent = '';
      document.querySelectorAll('[data-irc-processed]').forEach(el => el.removeAttribute('data-irc-processed'));
    }
  }

  function hideRightSectionFunc() {
    rightSectionStyleTag.textContent = hideRightSection ? `
      [data-testid="sidebarColumn"] { display: none !important; }
      [data-testid="primaryColumn"] { max-width: 100% !important; width: 100% !important; }
    ` : '';
  }

  filterTweets();
  applyIRCMode();
  hideRightSectionFunc();

  const globalObserver = new MutationObserver(() => {
    filterTweets();
    applyIRCMode();
    hideRightSectionFunc();
  });
  globalObserver.observe(document.body, { childList: true, subtree: true });
});
