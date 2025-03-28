# XFilter (Flag & Word Filter Chrome Extension)


A Chrome extension to enhance your experience on X by filtering tweets and enabling a text-only mode.

## Overview

The **X Flag & Word Filter** Chrome extension allows you to customize your X (formerly Twitter) experience by:
- **Filtering Tweets**: Hide tweets from users whose display names contain specific flags or words (e.g., emojis, keywords).
- **Text-Only Mode (IRC Mode)**: Hide all images, videos, and profile pics on X, creating a distraction-free, text-only experience.
- **Ad Filtering**: Optionally hide ads on X.

This extension is perfect for users who want to reduce visual clutter or avoid specific content on X.

## Features

- **Customizable Filtering**: Add flags (e.g., emojis) or words to hide tweets from users with matching display names.
- **IRC Mode**: Enable a text-only mode to hide all media (profile pics, images, videos) on X.
- **Ad Blocking**: Optionally hide promoted tweets (ads).
- **Lightweight and Easy to Use**: Simple popup interface to configure settings.

## Installation

### From Source (Developer Mode)

1. **Clone or Download the Repository**:
   - Clone this repository to your local machine:
     ```bash
     git clone https://github.com/yeule0/XFilter.git
     ```
   - Or download the ZIP file and extract it.

2. **Load the Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked** and select the `XFilter` folder.

3. **Verify Installation**:
   - The extension should appear in your Chrome extensions list with the name "X Flag & Word Filter."
   - You should see the extension icon in your browser toolbar.


## Usage

1. **Open the Popup**:
   - Click the extension icon in your Chrome toolbar to open the popup.

2. **Configure Settings**:
   - **Flags to Hide**: Enter flags (e.g., emojis like 🌈) to hide tweets from users with those flags in their display names.
   - **Words to Hide**: Enter words (e.g., "politics") to hide tweets from users with those words in their display names.
   - **Filter Ads**: Check this box to hide promoted tweets (ads).
   - **IRC Mode**: Check "Hide images, videos, and profile pics (text-only)" to enable a text-only mode on X.

3. **Save and Refresh**:
   - Click **Save** to apply your settings.
   - Refresh the X page (`Ctrl+R` or `Cmd+R`) to see the changes take effect.

4. **Example**:
   - Add "🌈" to Flags to Hide, save, and refresh X. Tweets from users with 🌈 in their display names will be hidden.
   - Enable IRC Mode, save, and refresh X. All images, videos, and profile pics will be hidden, leaving only text.

## Contributing

Contributions are welcome! If you’d like to improve this extension, please follow these steps:

1. Fork the repository.
2. Create a new branch 
3. Make your changes and commit them 
4. Push to your branch
5. Open a Pull Request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.


## Contact

For questions, suggestions, or issues, please open an issue on this repository or contact me on [X (Twitter)](https://twitter.com/yeule0).
