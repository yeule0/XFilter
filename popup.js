document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  const themeIcon = document.getElementById('theme-icon');
  themeIcon.classList = newTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
});

document.getElementById('save').addEventListener('click', () => {
  const flags = document.getElementById('flags').value.split(',').map(flag => flag.trim());
  const words = document.getElementById('words').value.split(',').map(word => word.trim());
  const filterAds = document.getElementById('filterAds').checked;
  const ircMode = document.getElementById('ircMode').checked;
  const hideRightSection = document.getElementById('hideRightSection').checked;
  const bgColor = document.getElementById('bgColor').value;

  // Save settings to storage
  chrome.storage.sync.set({
    flagsToHide: flags,
    wordsToHide: words,
    filterAds: filterAds,
    ircMode: ircMode,
    hideRightSection: hideRightSection,
    bgColor: bgColor
  }, () => {
    console.log('Settings saved:', { flags, words, filterAds, ircMode, hideRightSection, bgColor });

    // Send background settings to content script in the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateBackground',
          bgColor: bgColor
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error sending message:', chrome.runtime.lastError.message);
          } else {
            console.log('Message sent successfully:', response);
          }
        });
      }
    });

    alert('Settings saved');
  });
});

document.getElementById('resetBg').addEventListener('click', () => {
  chrome.storage.sync.set({
    bgColor: '#ffffff'
  }, () => {
    console.log('Background reset to default');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateBackground',
          bgColor: '#ffffff'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error sending message:', chrome.runtime.lastError.message);
          } else {
            console.log('Message sent successfully:', response);
          }
        });
      }
    });
    document.getElementById('bgColor').value = '#ffffff';
    alert('Background reset to default');
  });
});

chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection', 'bgColor'], (data) => {
  const flags = data.flagsToHide || [];
  const words = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;
  const hideRightSection = data.hideRightSection !== undefined ? data.hideRightSection : false;
  const bgColor = data.bgColor || '#ffffff';

  console.log('Loaded settings:', { bgColor });

  document.getElementById('flags').value = flags.join(', ');
  document.getElementById('words').value = words.join(', ');
  document.getElementById('filterAds').checked = filterAds;
  document.getElementById('ircMode').checked = ircMode;
  document.getElementById('hideRightSection').checked = hideRightSection;
  document.getElementById('bgColor').value = bgColor;
});