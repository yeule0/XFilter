chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection'], (data) => {
  const flagsToHide = data.flagsToHide || [];
  const wordsToHide = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;
  const hideRightSection = data.hideRightSection !== undefined ? data.hideRightSection : false;

  // Create or update a global style tag for IRC mode
  let styleTag = document.getElementById('irc-mode-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'irc-mode-style';
    document.head.appendChild(styleTag);
  }

  // Create or update a global style tag for hiding the right section
  let rightSectionStyleTag = document.getElementById('right-section-style');
  if (!rightSectionStyleTag) {
    rightSectionStyleTag = document.createElement('style');
    rightSectionStyleTag.id = 'right-section-style';
    document.head.appendChild(rightSectionStyleTag);
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
        const spans = tweet.querySelectorAll('span');
        let isAd = false;
        spans.forEach(span => {
          const text = span.innerText.trim();
          if (text === 'Ad' || text === 'Promoted') {
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

  function removeAvatarParentDivs() {

    const avatarElements = document.querySelectorAll('[data-testid="Tweet-User-Avatar"]');

    // Loop through all matching elements
    avatarElements.forEach(avatarElement => {
      const outerDiv = avatarElement.parentElement

      if (outerDiv) {
        outerDiv.remove();
      }
    });
  }


  // Function to apply IRC mode
  function applyIRCMode() {
    if (ircMode) {
      console.log('Applying IRC Mode styles');
      removeAvatarParentDivs();

      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');

      const imageElements = document.querySelectorAll('[aria-label="Image"]');
      const testCondensedMedias = document.querySelectorAll('[data-testid="testCondensedMedia"]')
      const articleImgs = document.querySelectorAll('[data-testid="article-cover-image"]')
      const linkImgs = document.querySelectorAll('[tabindex="0"][role="link"]')
      
      const smallMedias = document.querySelectorAll('[data-testid="card.layoutSmall.media"]')
      const largeMedias = document.querySelectorAll('[data-testid="card.layoutLarge.media"]')

      linkImgs.forEach(element => {
        element.parentElement.remove();
      });

      smallMedias.forEach(element => {
        element.remove();
      });

      largeMedias.forEach(element => {
        element.remove();
      });

      articleImgs.forEach(element => {
        element.parentElement.remove();
      });
      
      testCondensedMedias.forEach(element => {
        element.remove();
      });

      imageElements.forEach(element => {
        element.remove();
      });

      const tweetPhotos = document.querySelectorAll('[data-testid="tweetPhoto"]');

      tweetPhotos.forEach(element => {
        element.remove();
      });

      tweetElements.forEach(tweet => {

        const photoLinks = tweet.querySelectorAll('a[href*="photo"]');

        const childWithPadding = tweet.querySelector('[style="padding-bottom: 56.25%;"]');
        
        if (childWithPadding && photoLinks) {
            childWithPadding.remove();
        }

        // for img groups
        if (photoLinks.length > 1) {
          photoLinks.forEach(link => {
            const imgContainer = link.parentElement.parentElement.parentElement;
            if (imgContainer) {
              console.log(imgContainer);
              
              imgContainer.remove();  // Remove the parent element of the link
            }
          });
        } else {
          console.log("photoLinks length" + ":" + photoLinks.length);
          
          // for single img
          photoLinks.forEach(link => {
            link.remove();
          });
        }
      });

    } else {
      console.log('Removing IRC Mode styles');
      styleTag.textContent = '';
    }
  }

  // Function to hide the right section
  function hideRightSectionFunc() {
    if (hideRightSection) {
      console.log('Hiding right section');
      rightSectionStyleTag.textContent = `
        /* Hide the right sidebar */
        [data-testid="sidebarColumn"] {
          display: none !important;
        }
        /* Optionally adjust the main content width to fill the space */
        [data-testid="primaryColumn"] {
          max-width: 100% !important;
          width: 100% !important;
        }
      `;
    } else {
      console.log('Showing right section');
      rightSectionStyleTag.textContent = '';
    }
  }

  // Initial run
  filterTweets();
  applyIRCMode();
  hideRightSectionFunc();

  // Observe DOM changes
  const observer = new MutationObserver(() => {
    filterTweets();
    applyIRCMode();
    hideRightSectionFunc();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});