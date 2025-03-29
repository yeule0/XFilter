document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  
  // toggle the theme based on the current state
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // set the new theme
  html.setAttribute('data-theme', newTheme);
  const themeIcon = document.getElementById('theme-icon');
  
  // Update the image source based on the new theme
  if (newTheme === 'dark') {
    themeIcon.classList = 'bi bi-sun-fill';
  } else {
    themeIcon.classList = 'bi bi-moon-fill';
  }
});

document.getElementById('save').addEventListener('click', () => {
  const flags = document.getElementById('flags').value.split(',').map(flag => flag.trim());
  const words = document.getElementById('words').value.split(',').map(word => word.trim());
  const filterAds = document.getElementById('filterAds').checked;
  const ircMode = document.getElementById('ircMode').checked;
  const hideRightSection = document.getElementById('hideRightSection').checked;
  chrome.storage.sync.set({ 
    flagsToHide: flags,
    wordsToHide: words,
    filterAds: filterAds,
    ircMode: ircMode,
    hideRightSection: hideRightSection
  }, () => {
    alert('Settings saved');
  });
});

// Load existing settings into the popup when it opens
chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection'], (data) => {
  const flags = data.flagsToHide || [];
  const words = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false;
  const hideRightSection = data.hideRightSection !== undefined ? data.hideRightSection : false; // Default to false
  document.getElementById('flags').value = flags.join(', ');
  document.getElementById('words').value = words.join(', ');
  document.getElementById('filterAds').checked = filterAds;
  document.getElementById('ircMode').checked = ircMode;
  document.getElementById('hideRightSection').checked = hideRightSection;
});