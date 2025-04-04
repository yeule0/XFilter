document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  const themeIcon = document.getElementById('theme-icon');
  themeIcon.classList = newTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
});

function getCurrentSettingsFromForm() {
    const flags = document.getElementById('flags').value.split(',').map(flag => flag.trim()).filter(Boolean);
    const words = document.getElementById('words').value.split(',').map(word => word.trim()).filter(Boolean);
    const filterAds = document.getElementById('filterAds').checked;
    const ircMode = document.getElementById('ircMode').checked;
    const hideRightSection = document.getElementById('hideRightSection').checked;
    const bgColor = document.getElementById('bgColor').value;
    return { flagsToHide: flags, wordsToHide: words, filterAds, ircMode, hideRightSection, bgColor };
}

function sendSettingsToContentScript(settings) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'settingsUpdated',
            settings: settings
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('XFilter Popup: Error sending message:', chrome.runtime.lastError.message);
            } else {
              console.log('XFilter Popup: Settings message sent successfully, response:', response);
            }
          }
        );
      } else {
        console.warn("XFilter Popup: Could not find active tab to send settings.");
      }
    });
}

document.getElementById('save').addEventListener('click', () => {
  const currentSettings = getCurrentSettingsFromForm();
  chrome.storage.sync.set(currentSettings, () => {
    console.log('XFilter Popup: Settings saved to storage:', currentSettings);
    sendSettingsToContentScript(currentSettings);
    alert('Settings saved');
  });
});

document.getElementById('resetBg').addEventListener('click', () => {
  const defaultBgColor = '#ffffff';
  chrome.storage.sync.set({ bgColor: defaultBgColor }, () => {
    console.log('XFilter Popup: Background reset to default in storage.');
    document.getElementById('bgColor').value = defaultBgColor;
    const currentSettings = getCurrentSettingsFromForm();
    sendSettingsToContentScript(currentSettings);
    alert('Background reset to default');
  });
});

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['flagsToHide', 'wordsToHide', 'filterAds', 'ircMode', 'hideRightSection', 'bgColor'], (data) => {
        document.getElementById('flags').value = (data.flagsToHide || []).join(', ');
        document.getElementById('words').value = (data.wordsToHide || []).join(', ');
        document.getElementById('filterAds').checked = data.filterAds !== undefined ? data.filterAds : true;
        document.getElementById('ircMode').checked = data.ircMode !== undefined ? data.ircMode : false;
        document.getElementById('hideRightSection').checked = data.hideRightSection !== undefined ? data.hideRightSection : false;
        document.getElementById('bgColor').value = data.bgColor || '#ffffff';
        console.log('XFilter Popup: Loaded settings into form.');
    });

    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    html.setAttribute('data-theme', currentTheme);
    const themeIcon = document.getElementById('theme-icon');
    themeIcon.classList = currentTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
});
