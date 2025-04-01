// Theme toggle logic (no changes)
document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  const themeIcon = document.getElementById('theme-icon');
  themeIcon.classList = newTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
  const flags = document.getElementById('flags').value.split(',').map(flag => flag.trim()).filter(Boolean);
  const words = document.getElementById('words').value.split(',').map(word => word.trim()).filter(Boolean);
  const filterAds = document.getElementById('filterAds').checked;
  const ircMode = document.getElementById('ircMode').checked;
  const hideRightSection = document.getElementById('hideRightSection').checked;
  const bgColor = document.getElementById('bgColor').value;
  const enableReordering = document.getElementById('enableReordering').checked;
  const interestKeywords = document.getElementById('interestKeywords').value.split(',').map(kw => kw.trim()).filter(Boolean);

  const settings = {
    flagsToHide: flags,
    wordsToHide: words,
    filterAds: filterAds,
    ircMode: ircMode,
    hideRightSection: hideRightSection,
    bgColor: bgColor,
    enableReordering: enableReordering,
    interestKeywords: interestKeywords
  };

  // Save settings to storage
  chrome.storage.sync.set(settings, () => {
    console.log('Settings saved:', settings);

    // Send settings update message to content script (optional, content script reloads on nav anyway)
     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
       if (tabs[0]?.id) {
         chrome.tabs.sendMessage(tabs[0].id, {
           action: 'settingsUpdated',
           settings: settings // Send all settings
         }).catch(error => console.log(`Could not send settings update message: ${error.message}`));
       }
     });

    alert('Settings saved');
  });
});

// Reset Background button (no changes needed here, but ensure message is handled)
document.getElementById('resetBg').addEventListener('click', () => {
    const defaultBgColor = '#ffffff';
    chrome.storage.sync.set({ bgColor: defaultBgColor }, () => {
        console.log('Background reset to default');
        document.getElementById('bgColor').value = defaultBgColor;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateBackground',
                    bgColor: defaultBgColor
                }).catch(error => console.log(`Could not send background reset message: ${error.message}`));
            }
        });
        alert('Background reset to default');
    });
});


// Load settings on popup open
chrome.storage.sync.get([
    'flagsToHide',
    'wordsToHide',
    'filterAds',
    'ircMode',
    'hideRightSection',
    'bgColor',
    'enableReordering',
    'interestKeywords'
    ], (data) => {
    document.getElementById('flags').value = (data.flagsToHide || []).join(', ');
    document.getElementById('words').value = (data.wordsToHide || []).join(', ');
    document.getElementById('filterAds').checked = data.filterAds !== undefined ? data.filterAds : true;
    document.getElementById('ircMode').checked = data.ircMode !== undefined ? data.ircMode : false;
    document.getElementById('hideRightSection').checked = data.hideRightSection !== undefined ? data.hideRightSection : false;
    document.getElementById('bgColor').value = data.bgColor || '#ffffff';
    document.getElementById('enableReordering').checked = data.enableReordering !== undefined ? data.enableReordering : false;
    document.getElementById('interestKeywords').value = (data.interestKeywords || []).join(', ');

    console.log('Loaded settings:', data);
});