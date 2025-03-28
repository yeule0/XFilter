chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode'], (data) => {
  const flagsToHide = data.flagsToHide || [];
  const wordsToHide = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;

  // Create or update a global style tag for IRC mode
  let styleTag = document.getElementById('irc-mode-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'irc-mode-style';
    document.head.appendChild(styleTag);
  }

  // Function to filter tweets (flags, words, ads)
  function filterTweets() {
    document.querySelectorAll('[data-testid="tweet"]').forEach(tweet => {
      let shouldHide = false;

      // Filter by flags and words
      const userNameElement = tweet.querySelector('[data-testid="UserName"]');
      if (userNameElement) {
        const displayNameElement = userNameElement.querySelector('span');
        if (displayNameElement) {
          const displayName = displayNameElement.innerText.toLowerCase();
          const hasFlag = flagsToHide.some(flag => displayName.includes(flag));
          const hasWord = wordsToHide.some(word => displayName.includes(word.toLowerCase()));
          shouldHide = hasFlag || hasWord;
        }
      }

      // Filter ads
      if (filterAds) {
        // Look for all <span> elements within the tweet
        const spans = tweet.querySelectorAll('span');
        let isAd = false;
        spans.forEach(span => {
          const text = span.innerText.trim();
          if (text === 'Ad' || text === 'Promoted') { // Handle both "Ad" and "Promoted"
            isAd = true;
          }
        });

        if (isAd) {
          shouldHide = true;
          console.log('Hiding ad tweet:', tweet.innerText.substring(0, 50) + '...');
        }
      }

      if (shouldHide) {
        tweet.style.display = 'none';
      }
    });
  }

  // Function to apply IRC mode
  function applyIRCMode() {
    if (ircMode) {
      console.log('Applying IRC Mode styles');

      // Apply global styles with updated selectors
      styleTag.textContent = `
        /* Profile pictures (background-image divs) */
        div[data-testid="Tweet-User-Avatar"] div[style*="profile_images"],
        div[class*="r-1ny4l3l"] div[style*="profile_images"] {
          background-image: none !important;
          display: none !important;
        }

        /* Profile pictures (img tags) */
        div[data-testid="Tweet-User-Avatar"] img[src*="profile_images"],
        div[class*="r-1ny4l3l"] img[src*="profile_images"],
        div[class*="r-1ny4l3l"] img.css-9pa8cd,
        img[src*="profile_images"] {
          display: none !important;
        }

        /* Tweet images (img tags) */
        div[class*="r-1wyyakw"] img[src*="media"],
        div[class*="r-1wyyakw"] img.css-9pa8cd {
          display: none !important;
        }

        /* Tweet images (background-image divs) */
        div[class*="r-1wyyakw"][style*="media"] {
          background-image: none !important;
          display: none !important;
        }

        /* Videos and thumbnails */
        video,
        div[aria-label*="media"] video,
        div[aria-label*="media"] img[src*="media"],
        div[class*="r-1wyyakw"] video,
        div[class*="r-1wyyakw"] img[src*="media"] {
          display: none !important;
        }
      `;

      // Fallback: Directly hide elements
      document.querySelectorAll('div[data-testid="Tweet-User-Avatar"] div[style*="profile_images"], div[class*="r-1ny4l3l"] div[style*="profile_images"]').forEach(div => {
        div.style.backgroundImage = 'none';
        div.style.display = 'none';
        console.log('Hiding profile pic (background-image div):', div.getAttribute('style'));
      });

      document.querySelectorAll('div[data-testid="Tweet-User-Avatar"] img[src*="profile_images"], div[class*="r-1ny4l3l"] img[src*="profile_images"], div[class*="r-1ny4l3l"] img.css-9pa8cd, img[src*="profile_images"]').forEach(img => {
        img.style.display = 'none';
        console.log('Hiding profile pic (img):', img.src);
      });

      document.querySelectorAll('div[class*="r-1wyyakw"] img[src*="media"], div[class*="r-1wyyakw"] img.css-9pa8cd').forEach(img => {
        img.style.display = 'none';
        console.log('Hiding tweet image (img):', img.src);
      });

      document.querySelectorAll('div[class*="r-1wyyakw"][style*="media"]').forEach(div => {
        div.style.backgroundImage = 'none';
        div.style.display = 'none';
        console.log('Hiding tweet image (background-image div):', div.getAttribute('style'));
      });

      document.querySelectorAll('video, div[aria-label*="media"] video, div[aria-label*="media"] img[src*="media"], div[class*="r-1wyyakw"] video, div[class*="r-1wyyakw"] img[src*="media"]').forEach(el => {
        el.style.display = 'none';
        console.log('Hiding video/thumbnail:', el.tagName, el.src || el.poster);
      });
    } else {
      console.log('Removing IRC Mode styles');
      styleTag.textContent = '';
    }
  }

  // Initial run
  filterTweets();
  applyIRCMode();

  // Observe DOM changes
  const observer = new MutationObserver(() => {
    filterTweets();
    applyIRCMode();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
