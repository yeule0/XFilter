document.getElementById('save').addEventListener('click', () => {
  const flags = document.getElementById('flags').value.split(',').map(flag => flag.trim());
  const words = document.getElementById('words').value.split(',').map(word => word.trim());
  const filterAds = document.getElementById('filterAds').checked;
  const ircMode = document.getElementById('ircMode').checked;
  chrome.storage.sync.set({ 
    flagsToHide: flags,
    wordsToHide: words,
    filterAds: filterAds,
    ircMode: ircMode
  }, () => {
    alert('Settings saved');
  });
});

// Load existing settings into the popup when it opens
chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode'], (data) => {
  const flags = data.flagsToHide || [];
  const words = data.wordsToHide || [];
  const filterAds = data.filterAds !== undefined ? data.filterAds : true;
  const ircMode = data.ircMode !== undefined ? data.ircMode : false; // Default to false
  document.getElementById('flags').value = flags.join(', ');
  document.getElementById('words').value = words.join(', ');
  document.getElementById('filterAds').checked = filterAds;
  document.getElementById('ircMode').checked = ircMode;
});