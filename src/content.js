import { AutoTokenizer, env } from '@huggingface/transformers';
import { InferenceSession, Tensor, env as OrtEnv } from 'onnxruntime-web';

// --- Globals ---
let settings = {
    flagsToHide: [],
    wordsToHide: [],
    filterAds: true,
    ircMode: false,
    hideRightSection: false,
    bgColor: '#ffffff',
    enableReordering: false,
    interestKeywords: []
};
let tokenizer = null;
let modelSession = null;
let averageInterestEmbedding = null;
let modelReady = false;
const XFILTER_PREFIX = 'xfilter';
const DEFAULT_BG_COLOR = '#ffffff';

// --- Style Tags ---
// Ensure style tags exist in the document head for dynamic CSS injection.
let ircStyleTag = document.getElementById('irc-mode-style');
if (!ircStyleTag) {
    ircStyleTag = document.createElement('style');
    ircStyleTag.id = 'irc-mode-style';
    document.head.appendChild(ircStyleTag);
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

// --- Model & Tokenizer ---
async function initializeModel() {
    if (!settings.enableReordering || modelReady) {
        console.log(
            `XFilter: Skipping model init (Enabled: ${settings.enableReordering}, Ready: ${modelReady})`
        );
        return;
    }

    console.log('XFilter: --- Starting Model Initialization ---');
    modelReady = false; // Reset state before attempting initialization

    try {
        // FIX: Disable Transformers.js browser cache to avoid errors with chrome-extension:// URLs
        env.useBrowserCache = false;
        // Allow loading models from local extension paths/URLs
        env.allowLocalModels = true;

        // 1. Set up ONNX Runtime WASM Paths
        console.log('XFilter: 1. Setting up ONNX Runtime WASM path...');
        const wasmDir = chrome.runtime.getURL("./"); // Should point to extension's dist/ root
        OrtEnv.wasm.wasmPaths = wasmDir;
        console.log('XFilter: OrtEnv.wasm.wasmPaths set to:', JSON.stringify(OrtEnv.wasm.wasmPaths));
        console.log('XFilter: 1. WASM path setup complete.');

        // 2. Load the ONNX Model Session
        console.log('XFilter: 2. Attempting to load ONNX Model Session...');
        const modelPath = chrome.runtime.getURL('model/model.onnx');
        console.log("XFilter: Loading model from:", modelPath);
        modelSession = await InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
        console.log(
            'XFilter: 2. ONNX Model Session loaded successfully. Input names:',
             modelSession.inputNames
        );

        // 3. Prepare Tokenizer Paths
        console.log('XFilter: 3. Preparing tokenizer paths...');
        const tokenizerDirUrl = chrome.runtime.getURL("tokenizer/"); // URL to the tokenizer directory
        console.log("XFilter: Tokenizer directory URL:", tokenizerDirUrl);

        // 4. Manual Fetch Test (Keep for diagnosis if tokenizer loading fails)
        console.log('XFilter: 4. Performing manual fetch test for tokenizer config...');
        const testUrlConfig = chrome.runtime.getURL("tokenizer/tokenizer_config.json");
        console.log("XFilter: Manually fetching config:", testUrlConfig);
        try {
            // Use no-store to bypass cache during this test
            const response = await fetch(testUrlConfig, { cache: "no-store" });
            const status = response.status;
            const responseText = await response.text();
            console.log(`XFilter: Manual fetch for ${testUrlConfig} - Status: ${status}, OK: ${response.ok}`);
            if (response.ok) {
                 try {
                    JSON.parse(responseText);
                    console.log("XFilter: Manual parse of fetched tokenizer_config.json SUCCEEDED.");
                 } catch (parseError) {
                    console.error(
                        "XFilter: Manual parse of fetched tokenizer_config.json FAILED:",
                        parseError
                    );
                 }
            } else {
                 console.error(`XFilter: Manual fetch FAILED (Status ${status}) for tokenizer_config.json!`);
            }
        } catch (fetchError) {
            console.error("XFilter: Manual fetch CRITICAL error for tokenizer_config.json:", fetchError);
        }
        console.log('XFilter: 4. Manual fetch test complete.');


        // 5. Load Tokenizer using the library
        console.log('XFilter: 5. Attempting to load tokenizer using AutoTokenizer.from_pretrained...');
        try {
            console.log("XFilter: Trying from_pretrained with directory:", tokenizerDirUrl);
            // Important: local_files_only prevents trying to download from the Hub
            tokenizer = await AutoTokenizer.from_pretrained(tokenizerDirUrl, {
                local_files_only: true
            });
            console.log("XFilter: AutoTokenizer loaded successfully using directory URL.");

        } catch (tokenizerError) {
             console.error("XFilter: Failed to load tokenizer using directory URL:", tokenizerError);
             throw tokenizerError; // Re-throw to handle in the main catch block
        }
        console.log('XFilter: 5. Tokenizer loading attempt complete.');

        // 6. Final Checks and State Setting
        console.log('XFilter: 6. Finalizing initialization...');
        if (!modelSession) throw new Error("Model session is unexpectedly null after loading.");
        if (!tokenizer) throw new Error("Tokenizer is unexpectedly null after loading.");

        modelReady = true;
        console.log('XFilter: --- Model and Tokenizer Initialization SUCCESSFUL ---');

        // Calculate initial interest embedding if keywords are provided
        if (settings.interestKeywords.length > 0) {
            averageInterestEmbedding = await getAverageInterestEmbedding(settings.interestKeywords);
            if (averageInterestEmbedding) {
                console.log('XFilter: Initial interest embedding calculated.');
                scheduleReorder(true); // Trigger initial scoring/reordering immediately
            } else {
                console.warn('XFilter: Could not calculate initial interest embedding.');
            }
        }

    } catch (error) {
        // Reset flags even on error
        env.useBrowserCache = true; // Reset to default if needed elsewhere
        env.allowLocalModels = false;

        console.error('XFilter: --- CRITICAL INITIALIZATION FAILURE ---');
        console.error('XFilter: Error Object:', error);
        if (error instanceof Error) {
             console.error('XFilter: Error Message:', error.message);
             console.error('XFilter: Error Stack:', error.stack);
        }
        console.error('XFilter: --- END CRITICAL FAILURE INFO ---');

        // Fallback: disable reordering if initialization failed
        modelReady = false;
        modelSession = null;
        tokenizer = null;
        settings.enableReordering = false;
    }
}

// --- Embeddings ---
// Compute sentence embedding for a given text using the loaded model and tokenizer.
async function computeEmbedding(text) {
    if (!modelReady || !tokenizer || !modelSession) {
        // console.warn("XFilter: computeEmbedding called but model/tokenizer not ready."); // Reduce noise
        return null;
    }
     if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return null; // Ignore empty or invalid input
    }
    try {
        // Tokenize the input text
        const encoded = tokenizer(text, {
            padding: true,
            truncation: true,
            max_length: 128, // Match model's expected max length
            return_tensors: 'ort' // Return ONNX Runtime tensors
        });

        // Prepare model inputs (feeds)
        const feeds = {};
        if (modelSession.inputNames.includes('input_ids')) {
            feeds['input_ids'] = encoded.input_ids;
        } else { throw new Error("Model expects 'input_ids'"); }

        if (modelSession.inputNames.includes('attention_mask')) {
            feeds['attention_mask'] = encoded.attention_mask;
        } else { throw new Error("Model expects 'attention_mask'"); }

        // Add token_type_ids if the model requires it (often optional, default to zeros)
        if (modelSession.inputNames.includes('token_type_ids')) {
            if (encoded.token_type_ids) {
                feeds['token_type_ids'] = encoded.token_type_ids;
            } else {
                // Create a tensor of zeros if not provided by the tokenizer
                const [bs, sl] = encoded.input_ids.dims;
                const zeroArray = BigInt64Array.from(Array(bs * sl).fill(0n));
                feeds['token_type_ids'] = new Tensor('int64', zeroArray, [bs, sl]);
            }
        }

        // Run inference
        const output = await modelSession.run(feeds);

        // Find the correct output tensor (e.g., 'last_hidden_state')
        let embeddingTensor = null;
        const potentialOutputNames = ['last_hidden_state', 'output_0', 'embeddings'];
        for (const name of potentialOutputNames) {
            if (output[name] && output[name] instanceof Tensor && output[name].dims.length === 3) {
                embeddingTensor = output[name];
                break;
            }
        }
        if (!embeddingTensor) {
            console.error(
                "XFilter: Could not find embedding tensor (shape [batch, seq, hidden]) in model output:",
                Object.keys(output)
            );
            return null;
        }

        // Apply mean pooling to get a single sentence embedding
        const pooledEmbedding = meanPooling(embeddingTensor, feeds['attention_mask']);
        return pooledEmbedding;

    } catch (error) {
        console.error(
            `XFilter: Error computing embedding for text snippet: "${text.substring(0, 50)}..."`,
             error
        );
        return null;
    }
}

// --- Mean Pooling ---
// Pool token embeddings using the attention mask.
function meanPooling(modelOutputTensor, attentionMaskTensor) {
    const modelOutput = modelOutputTensor.data; // Float32Array or similar
    const attentionMask = attentionMaskTensor.data; // BigInt64Array or similar
    const [batchSize, sequenceLength, hiddenSize] = modelOutputTensor.dims;

    // We assume batchSize is 1 for tweet processing
    const pooledEmbedding = new Float32Array(hiddenSize).fill(0);
    let tokenCount = 0;
    const batchOffsetOutput = 0; // Index for batch 0 output
    const batchOffsetMask = 0; // Index for batch 0 mask

    for (let j = 0; j < sequenceLength; ++j) {
        // Ensure mask value is treated as BigInt for comparison
        const maskValue = typeof attentionMask[batchOffsetMask + j] === 'bigint'
            ? attentionMask[batchOffsetMask + j]
            : BigInt(attentionMask[batchOffsetMask + j]);

        // Only consider tokens where attention mask is 1
        if (maskValue === 1n) {
            tokenCount++;
            const tokenOffset = batchOffsetOutput + j * hiddenSize;
            for (let k = 0; k < hiddenSize; ++k) {
                 // Safety check for array bounds
                 if(tokenOffset + k < modelOutput.length) {
                    pooledEmbedding[k] += modelOutput[tokenOffset + k];
                 } else {
                     console.warn("XFilter: Index out of bounds in meanPooling (modelOutput access)");
                 }
            }
        }
    }

    // Calculate the mean if any tokens were considered
    if (tokenCount > 0) {
        for (let k = 0; k < hiddenSize; ++k) {
            pooledEmbedding[k] /= tokenCount;
        }
    } else {
        // console.warn("XFilter: Mean pooling found zero valid tokens (all masked?)."); // Reduce noise
    }

    // Normalize the resulting embedding (L2 normalization)
    let norm = 0;
    for (let k = 0; k < hiddenSize; k++) norm += pooledEmbedding[k] ** 2;
    norm = Math.sqrt(norm);
    if (norm > 1e-5) { // Avoid division by zero or near-zero
        for (let k = 0; k < hiddenSize; k++) pooledEmbedding[k] /= norm;
    }

    return pooledEmbedding;
}


// --- Cosine Similarity ---
// Calculate cosine similarity between two vectors (expects normalized vectors for efficiency).
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        // Return neutral similarity if inputs are invalid
        return 0;
    }
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
    }
    // Clamp result to [-1, 1] due to potential floating point inaccuracies
    return Math.max(-1, Math.min(1, dotProduct));
}

// --- Average Interest Embedding ---
// Compute an average embedding from a list of keywords.
async function getAverageInterestEmbedding(keywords) {
    if (!modelReady) {
        console.warn("XFilter: Model not ready for interest embedding calculation.");
        return null;
    }
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return null; // No keywords provided
    }

    console.log("XFilter: Calculating average embedding for keywords:", keywords);
    let accumulatedEmbedding = null;
    let validKeywordsCount = 0;
    let dimension = 0; // Determined by the first successful embedding

    for (const keyword of keywords) {
        const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
        if (!trimmedKeyword) continue; // Skip empty keywords

        const embedding = await computeEmbedding(trimmedKeyword);
        if (embedding && embedding.length > 0) {
            // Initialize accumulator with the first valid embedding
            if (!accumulatedEmbedding) {
                dimension = embedding.length;
                accumulatedEmbedding = new Float32Array(dimension).fill(0);
            }
            // Ensure dimensions match before adding
            if (embedding.length === dimension) {
                for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] += embedding[i];
                validKeywordsCount++;
            } else {
                console.warn(
                    `XFilter: Keyword embedding dimension mismatch for "${trimmedKeyword}". Expected ${dimension}, got ${embedding.length}.`
                );
            }
        } else {
             console.warn(`XFilter: Failed to get embedding for keyword: "${trimmedKeyword}".`);
        }
    }

    // Average and normalize the accumulated embedding
    if (accumulatedEmbedding && validKeywordsCount > 0) {
        for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] /= validKeywordsCount;

        // L2 Normalize the final average embedding
        let norm = 0;
        for (let i = 0; i < dimension; i++) norm += accumulatedEmbedding[i] ** 2;
        norm = Math.sqrt(norm);
        if (norm > 1e-5) {
            for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] /= norm;
        } else {
            // Handle cases where the average embedding is near zero
            console.warn("XFilter: Average interest embedding norm is near zero. Returning zero vector.");
            return new Float32Array(dimension).fill(0);
        }
        console.log("XFilter: Average interest embedding calculated and normalized.");
        return accumulatedEmbedding;

    } else if (keywords.length > 0) {
        console.error(
            "XFilter: Could not calculate average interest embedding (no valid keyword embeddings found)."
        );
    }
    return null; // Return null if no valid embeddings were found
}


// --- Tweet Processing ---
// Extract text content from a tweet element, handling various node types.
function getTweetText(tweetElement) {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (textElement) {
        let text = '';
        // Iterate through child nodes to capture text and alt/aria-label text from elements (like emojis)
        textElement.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Use alt, aria-label, or textContent as fallbacks
                text += node.alt || node.getAttribute('aria-label') || node.textContent || '';
            }
        });
        return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    }
    // Fallback: Get all text content from the tweet element itself
    return tweetElement.textContent.replace(/\s+/g, ' ').trim() || '';
}

// Filter tweets based on settings (ads, flags, keywords in name).
function filterTweets() {
    // Process only tweets that haven't been processed yet
    document.querySelectorAll('[data-testid="tweet"]:not([data-filter-processed="true"])')
        .forEach(tweet => {
            tweet.setAttribute('data-filter-processed', 'true');
            let shouldHide = false;
            let reason = '';

            // 1. Ad Filtering
            if (settings.filterAds) {
                 // Check specific 'Promoted' indicator first (more reliable)
                 const promotedText = tweet.querySelector('div[data-testid="promotedIndicator"]');
                 if (promotedText && (promotedText.textContent === 'Promoted' || promotedText.textContent === 'Ad')) {
                    shouldHide = true;
                    reason = 'Ad/Promoted Indicator';
                 }
                 // Fallback: Check for visible 'Ad' or 'Promoted' text spans (less reliable)
                 if (!shouldHide) {
                     const spans = tweet.querySelectorAll('span');
                     for (const span of spans) {
                         // Check if the span is actually visible on the page
                         if (span.offsetParent !== null) {
                             const text = span.innerText.trim();
                             if (text === 'Ad' || text === 'Promoted') {
                                 shouldHide = true;
                                 reason = 'Ad/Promoted Text';
                                 break;
                             }
                         }
                     }
                 }
            }

            // 2. Flag/Word Filtering (based on display name)
            if (!shouldHide && (settings.flagsToHide.length > 0 || settings.wordsToHide.length > 0)) {
                const userNameElement = tweet.querySelector('[data-testid="UserName"]');
                if (userNameElement) {
                    // Try to get the display name (might be nested)
                    const displayNameElement = userNameElement.querySelector(
                        'div > div > span > span' // This selector might be fragile
                    );
                    // Fallback to the whole UserName element's text content
                    let nameToCheck = (
                        displayNameElement?.innerText || userNameElement.textContent || ''
                    ).toLowerCase();

                    // Check for flags
                    if (settings.flagsToHide.some(flag => flag && nameToCheck.includes(flag))) {
                        shouldHide = true;
                        reason = 'Flag in Name';
                    }
                    // Check for blocked words
                    if (!shouldHide && settings.wordsToHide.some(
                        word => word && nameToCheck.includes(word.toLowerCase())
                    )) {
                         shouldHide = true;
                         reason = 'Word in Name';
                    }
                }
            }

            // Apply visibility based on filtering results
            if (shouldHide) {
                tweet.style.display = 'none';
                tweet.setAttribute(`data-${XFILTER_PREFIX}-hidden`, reason);
                // Clean up relevance attributes if tweet is hidden
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processing`);
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
            } else {
                // If tweet was previously hidden by us but shouldn't be now, make it visible
                if (tweet.style.display === 'none' && tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                   tweet.style.display = '';
                }
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-hidden`);
                 // Mark for scoring if reordering is enabled and tweet hasn't been scored/processed yet
                 if (settings.enableReordering && modelReady && averageInterestEmbedding &&
                     !tweet.hasAttribute(`data-${XFILTER_PREFIX}-relevance-processed`) &&
                     !tweet.hasAttribute(`data-${XFILTER_PREFIX}-relevance-processing`))
                 {
                     tweet.setAttribute(`data-${XFILTER_PREFIX}-needs-scoring`, 'true');
                 }
            }
        });
}

// --- IRC Mode ---
// Helper for IRC Mode: Adjust layout around profile picture.
function removeProfilePicBars(tweet) {
    // Selector targets the container holding the profile picture column
    // Note: This CSS selector is likely to break with Twitter UI updates.
    const profilePicBar = tweet.querySelector(
        '.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])'
    );
    if (profilePicBar && profilePicBar.querySelector('[data-testid="Tweet-User-Avatar"]')) {
        const parent = profilePicBar.parentElement;
        // Apply flex layout to parent for better alignment when pic is hidden
        if (parent) {
            if(parent.style.display !== 'flex' || parent.style.alignItems !== 'flex-start' || parent.style.gap !== '8px') {
                parent.style.display = 'flex';
                parent.style.alignItems = 'flex-start';
                parent.style.gap = '8px'; // Add some gap between hidden pic area and content
            }
        }
        // Mark as processed to avoid redundant style changes
        profilePicBar.setAttribute('data-irc-processed', 'true');
    }
}

// Helper for IRC Mode: Ensure badges (Verified, etc.) remain visible next to the username.
function preserveBadges(tweet) {
    const badges = tweet.querySelectorAll(
        // Select verified SVG and other potential badge images within the user name container
        'div[data-testid="User-Name"] svg[aria-label="Verified account"], ' +
        'div[data-testid="User-Name"] img:not([src*="profile_images"])' // Exclude profile pics if any slip through
    );
    badges.forEach(badge => {
        const parentDiv = badge.closest('div[data-testid="User-Name"]');
        if (parentDiv) {
            // Mark the parent container to apply specific display styles
            if (!parentDiv.hasAttribute('data-irc-preserve') &&
                !badge.parentNode.hasAttribute('data-irc-preserve') // Check immediate parent too
               )
            {
                 parentDiv.setAttribute('data-irc-preserve', 'true');
            }
        }
       // Force inline display and adjust size/alignment for badges
       badge.style.cssText = `
            display: inline !important;
            margin-left: 4px;
            vertical-align: middle;
            height: 1em;
            width: auto;
       `;
    });
}

// Apply or remove CSS rules and run helpers for IRC mode.
function applyIRCMode() {
    let css = '';
    if (settings.ircMode) {
        // CSS to hide images, videos, profile pics, and ensure badges are displayed inline.
        // WARNING: These selectors are highly dependent on Twitter's current class names and structure.
        css += `
            /* --- START IRC Mode CSS --- */
            /* Hide media */
            [data-testid="tweetPhoto"],
            [aria-label="Image"],
            [data-testid="testCondensedMedia"],
            [data-testid="article-cover-image"],
            [data-testid="card.layoutSmall.media"],
            [data-testid="card.layoutLarge.media"],
            a[href*="photo"] > div, /* Links wrapping photos */
            [style*="padding-bottom: 56.25%"] /* Aspect ratio boxes often used for images */
            { display: none !important; }

            /* Hide profile picture column */
            .css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy
            { display: none !important; width: 0px !important; min-width: 0px !important; padding: 0 !important; margin: 0 !important; }

            /* Preserve and style user badges (Verified, etc.) */
            div[data-testid="User-Name"][data-irc-preserve]
            { display: inline-flex !important; align-items: center !important; visibility: visible !important; vertical-align: text-bottom; }

            div[data-testid="User-Name"][data-irc-preserve] svg[aria-label="Verified account"],
            div[data-testid="User-Name"][data-irc-preserve] img:not([src*="profile_images"])
            { display: inline !important; visibility: visible !important; opacity: 1 !important; height: 1em; width: auto; }

            /* Hide potential empty containers within the username area */
            div[data-testid="User-Name"] > div[dir="ltr"]:not(:has(> span))
            { display: none !important; }
            /* --- END IRC Mode CSS --- */
        `;
    }

    // Update the style tag only if the CSS content has changed
    if (ircStyleTag.textContent !== css) {
       ircStyleTag.textContent = css;
    }

    // Apply helper functions if IRC mode is active
    if (settings.ircMode) {
        document.querySelectorAll('[data-testid="tweet"]')
            .forEach(tweet => {
                // Only process visible tweets
                if (tweet.style.display !== 'none' && !tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                     preserveBadges(tweet);
                     removeProfilePicBars(tweet);
                }
            });
    } else {
        // Clean up attributes added by IRC mode helpers if it's turned off
        document.querySelectorAll('[data-irc-preserve]')
            .forEach(el => el.removeAttribute('data-irc-preserve'));
        document.querySelectorAll('[data-irc-processed]')
            .forEach(el => el.removeAttribute('data-irc-processed'));
    }
}


// --- Custom Background ---
// Apply custom background color if set and different from the default.
function applyCustomBackground() {
    let css = '';
    const useBackground = settings.bgColor && settings.bgColor.toLowerCase() !== DEFAULT_BG_COLOR;

    if (useBackground) {
        // Apply background to main elements and make common containers transparent.
        // WARNING: These selectors target common Twitter layout elements and may break.
        css = `
            html, body { background: ${settings.bgColor} !important; }
            /* Make key layout components transparent */
            [data-testid="primaryColumn"],
            [data-testid="sidebarColumn"],
            [data-testid="tweet"],
            [data-testid="toolBar"],
            .css-175oi2r.r-1igl3o0.r-qklmqi.r-1adg3ll.r-1ny4l3l, /* Header? */
            .css-175oi2r.r-1adg3ll.r-1ny4l3l.r-1n0xq6e, /* Search box? */
            .css-175oi2r.r-1adg3ll.r-1ny4l3l, /* Other containers */
            .css-175oi2r.r-18u37iz.r-1wtj0ep,
            .css-175oi2r.r-1habvwh.r-18u37iz.r-1wtj0ep,
            .css-175oi2r.r-1w6e6rj.r-1d09ksm.r-417010, /* Sidebar sections? */
            .css-175oi2r.r-1h8ys4a,
            .css-175oi2r.r-184en5c,
            .css-175oi2r.r-1iusvr4.r-16y2uox,
            .css-175oi2r.r-1d09ksm.r-18u37iz.r-1wbh5a2,
            .css-175oi2r.r-16y2uox.r-1wbh5a2,
            .css-175oi2r.r-1awozwy.r-zchlnj.r-1d09ksm,
            .css-175oi2r.r-1awozwy.r-18u37iz.r-zchlnj.r-1d09ksm.r-6gpygo,
            .css-175oi2r.r-1awozwy.r-18u37iz.r-1d09ksm.r-6gpygo,
            .css-175oi2r.r-zchlnj.r-1d09ksm,
            .css-175oi2r.r-1awozwy.r-zchlnj,
            .css-175oi2r.r-1d09ksm,
            .css-175oi2r.r-aqfbo4.r-gtdqiz.r-1gn8etr.r-1g40b8q,
            .css-175oi2r.r-1e5uvyk.r-6026j,
            /* Elements with explicit black/transparent backgrounds */
            [style*="background-color: rgb(0, 0, 0)"],
            [style*="background-color: rgba(0, 0, 0, 0)"]
            { background: transparent !important; background-color: transparent !important; }
        `;
    }

    // Update the style tag only if needed
    if (bgStyleTag.textContent !== css) {
        bgStyleTag.textContent = css;
    }

    // Additionally, directly remove inline black backgrounds if custom BG is active
    if (useBackground) {
        document.querySelectorAll(
            '[style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]'
        ).forEach(el => {
             if (el.style.backgroundColor === 'rgb(0, 0, 0)' ||
                 el.style.backgroundColor === 'rgba(0, 0, 0, 0)')
             {
                el.style.backgroundColor = 'transparent';
             }
        });
    }
}

// --- Hide Right Section ---
// Apply CSS to hide the right sidebar ('What's happening', etc.).
function hideRightSectionFunc() {
    let css = '';
    if (settings.hideRightSection) {
        css = `
            /* Hide the sidebar column entirely */
            [data-testid="sidebarColumn"] {
                 display: none !important;
                 width: 0px !important;
                 min-width: 0px !important;
            }
            /* Expand the primary column to fill the space on wider screens */
            @media (min-width: 1000px) {
                [data-testid="primaryColumn"] {
                    width: 100% !important;
                    max-width: 990px !important; /* Adjust max-width as desired */
                    border-right-width: 0px !important;
                    margin-right: 0px !important;
                }
                /* Adjust header width to match expanded column */
                header[role="banner"] > div > div > div {
                    max-width: 990px !important; /* Match primary column max-width */
                }
            }
        `;
    }
    // Update style tag only if needed
    if (rightSectionStyleTag.textContent !== css) {
        rightSectionStyleTag.textContent = css;
    }
}

// --- Scoring & Reordering ---
// Calculate relevance scores for tweets marked as needing scoring.
async function scoreTweets() {
    if (!settings.enableReordering) return false; // Skip if disabled
    if (!modelReady || !averageInterestEmbedding) {
        // console.warn(`XFilter: Cannot score tweets. ModelReady: ${modelReady}, AvgEmbedding: ${!!averageInterestEmbedding}`); // Reduce noise
        // Clean up flags if scoring can't proceed
        document.querySelectorAll(`[data-${XFILTER_PREFIX}-needs-scoring="true"]`)
            .forEach(t => t.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`));
        return false;
    }

    // Find tweets needing a score that are currently visible
    const tweetsToScore = document.querySelectorAll(
        `[data-testid="tweet"][data-${XFILTER_PREFIX}-needs-scoring="true"]` +
        `:not([data-${XFILTER_PREFIX}-hidden])` +
        `:not([style*="display: none"])`
    );

    if (tweetsToScore.length === 0) return false; // No tweets to score

    let scoredCount = 0;
    const scoringPromises = [];

    console.log(`XFilter: Starting scoring for ${tweetsToScore.length} tweets...`);

    tweetsToScore.forEach(tweet => {
        // Mark as processing to prevent multiple scoring attempts
        tweet.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
        tweet.setAttribute(`data-${XFILTER_PREFIX}-relevance-processing`, 'true');

        // Create an async task for each tweet
        const scoringTask = async () => {
            try {
                const text = getTweetText(tweet);
                let score = -1; // Default score if embedding fails
                if (text) {
                    const embedding = await computeEmbedding(text);
                    if (embedding) {
                        // Calculate cosine similarity against the average interest embedding
                        score = cosineSimilarity(averageInterestEmbedding, embedding);
                        scoredCount++;
                        // Optional log for detailed scores:
                        // console.log(`XFilter: Scored tweet: ${score.toFixed(3)} - "${text.substring(0, 30)}..."`);
                    }
                }
                // Store the score as a data attribute (rounded)
                tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`] = score.toFixed(5);
            } catch(e) {
                 console.error("XFilter: Error during individual tweet scoring task:", e);
                 // Set default score on error
                 tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`] = "-1.00000";
            } finally {
                 // Mark as processed regardless of success/failure
                 tweet.setAttribute(`data-${XFILTER_PREFIX}-relevance-processed`, 'true');
                 tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processing`);
            }
        };
        scoringPromises.push(scoringTask());
    });

    // Wait for all scoring tasks to complete
    await Promise.all(scoringPromises);

    if (scoredCount > 0) {
        console.log(`XFilter: Finished scoring ${scoredCount} / ${tweetsToScore.length} tweets.`);
        return true; // Indicate that new scores were generated
    } else {
        console.log(`XFilter: Finished scoring attempt, but no tweets were successfully scored.`);
        return false;
    }
}

// Reorder tweets in the timeline based on their calculated relevance score.
function reorderTimeline() {
    console.log("XFilter: Attempting to reorder timeline...");
    if (!settings.enableReordering) {
        console.log("XFilter: Reordering skipped (disabled).");
        return;
    }

    // Try different selectors to find the main timeline container
    const timelineSelectors = [
        // Preferred: Direct container of tweet cells in Home/Search/List timelines
        'div[aria-label*="Timeline: Your Home Timeline"] > div',
        'div[aria-label*="Timeline: Search results"] > div',
        'div[aria-label*="Timeline: List tweets"] > div',
        // Fallback: The timeline container itself (less ideal for sorting direct children)
        'div[aria-label*="Timeline"]'
        // More generic selectors (use with caution if others fail):
        // 'section[role="region"] > div > div',
        // 'div[data-testid="primaryColumn"] div[style*="relative"]',
    ];
    let timelineContainer = null;
    for(const selector of timelineSelectors) {
        timelineContainer = document.querySelector(selector);
        if (timelineContainer) {
             console.log(`XFilter: Found timeline container using selector: ${selector}`);
             break;
        }
    }
    if (!timelineContainer) {
        console.warn("XFilter: Could not find a suitable timeline container for reordering.");
        return;
    }

    const tweetsToSort = [];
    // Iterate direct children of the container (assuming these are the tweet cells/wrappers)
    timelineContainer.querySelectorAll(`:scope > div`).forEach(cell => {
        // Find a processed, scored, visible tweet within the cell
        const tweet = cell.querySelector(
          `[data-testid="tweet"][data-${XFILTER_PREFIX}-relevance-processed="true"]` +
          `:not([data-${XFILTER_PREFIX}-hidden])` +
          `:not([style*="display: none"])`
        );

        // Check if the tweet has a valid score attribute
        if (tweet?.dataset[`${XFILTER_PREFIX}RelevanceScore`]) {
            const score = parseFloat(tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`]);
            if (!isNaN(score)) {
                // Store the container element (cell) and its score
                tweetsToSort.push({ element: cell, score: score });
                // console.log(`XFilter: Found tweet cell to sort (Score: ${score.toFixed(3)})`); // Debug log
            } else {
                 // console.warn("XFilter: Found tweet with invalid score:", tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`], cell); // Debug log
            }
        }
    });

    console.log(`XFilter: Found ${tweetsToSort.length} scored tweet cells in the timeline to sort.`);

    if (tweetsToSort.length < 2) {
        console.log("XFilter: Not enough scored tweets found (< 2) to perform reordering.");
        return; // Need at least two items to sort
    }

    console.log(`XFilter: Reordering ${tweetsToSort.length} tweet cells...`);
    // Sort the array: highest score first (descending order)
    tweetsToSort.sort((a, b) => b.score - a.score);

    // Re-append the sorted tweet cells to the timeline container
    // append() efficiently moves existing elements to the end in the specified order.
    timelineContainer.append(...tweetsToSort.map(item => item.element));

    console.log("XFilter: Timeline reordering complete.");
}

// --- Observation & Debouncing ---
// Basic debounce function to limit how often a function is called.
function debounce(func, wait) {
    let timeout;
    const debouncedFunc = function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    // Store timeout ID for potential clearing (used in scheduleReorder)
    debouncedFunc._timeoutId = timeout;
    return debouncedFunc;
}

// Increased debounce delay to reduce processing frequency during rapid DOM changes (e.g., scrolling)
const DEBOUNCE_DELAY = 750; // ms

// Main function called after DOM changes, handles filtering, scoring, and reordering.
const processTimelineChanges = async () => {
    // console.log("XFilter: processTimelineChanges triggered"); // Debug log

    // 1. Apply visual filters and style updates (relatively cheap, run every time)
    filterTweets();
    applyIRCMode();
    applyCustomBackground();
    hideRightSectionFunc();

    let needsScoring = false;
    // 2. Check if new tweets need scoring (if reordering is enabled)
    if (settings.enableReordering && modelReady && averageInterestEmbedding) {
        // Find visible tweets that haven't been processed, scored, or marked for scoring yet
        const newlyVisibleTweets = document.querySelectorAll(
            `[data-testid="tweet"]:not([data-${XFILTER_PREFIX}-hidden])` +
            `:not([data-${XFILTER_PREFIX}-relevance-processed])` +
            `:not([data-${XFILTER_PREFIX}-relevance-processing])` +
            `:not([data-${XFILTER_PREFIX}-needs-scoring])` +
            `:not([style*="display: none"])`
        );

        if (newlyVisibleTweets.length > 0) {
            // console.log(`XFilter: Marking ${newlyVisibleTweets.length} new tweets for scoring.`); // Debug log
            newlyVisibleTweets.forEach(tweet => {
                tweet.setAttribute(`data-${XFILTER_PREFIX}-needs-scoring`, 'true');
            });
            needsScoring = true; // Indicate that scoring should run
        }
    }

     // 3. Score tweets if needed
     const hasTweetsMarkedForScoring = !!document.querySelector(
         `[data-${XFILTER_PREFIX}-needs-scoring="true"]`
     );

     if (needsScoring || hasTweetsMarkedForScoring) {
        if (modelReady && averageInterestEmbedding) {
            // console.log("XFilter: Calling scoreTweets..."); // Debug log
            const scoredNewTweets = await scoreTweets(); // Returns true if scores were generated

            // 4. Reorder the timeline *after* scoring completes, but only if new scores were generated
            if (scoredNewTweets && settings.enableReordering) {
                reorderTimeline();
            } else if (!scoredNewTweets && settings.enableReordering) {
                 console.log("XFilter: Scoring finished, but no new scores generated. Skipping reorder.");
            }
        } else {
            // console.log("XFilter: Skipping scoring phase (model not ready or reordering disabled)."); // Debug log
             // Clean up 'needs-scoring' flags if model isn't ready or reordering is off
            document.querySelectorAll(`[data-${XFILTER_PREFIX}-needs-scoring="true"]`)
               .forEach(t => t.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`));
        }
    } else {
        // console.log("XFilter: No tweets need scoring in this cycle."); // Debug log
    }
};

// Debounced version of the timeline processing function.
const debouncedProcessTimeline = debounce(processTimelineChanges, DEBOUNCE_DELAY);

// Callback function for the MutationObserver.
const observerCallback = (mutationsList, observer) => {
    let relevantMutation = false;
    // Check if any mutations likely involve adding new tweets or timeline structure
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the added node IS or CONTAINS a tweet or a typical tweet cell wrapper
                    if ( (node.matches && (
                           node.matches('[data-testid="tweet"]') ||
                           node.matches('div[aria-label*="Timeline"] > div') || // Detects direct tweet cells added
                           node.matches('div[data-testid="cellInnerDiv"]')    // Another common cell wrapper
                         )) || node.querySelector('[data-testid="tweet"]') // Check descendants too
                       )
                    {
                        relevantMutation = true; break; // Found a relevant change
                    }
                    // Other potential triggers (less critical, might be too noisy):
                    // Style changes (e.g., visibility):
                    // if(node.matches && node.matches('[style*="background-color:"]')) { relevantMutation = true; break; }
                    // IRC mode related structure changes:
                    // if (node.matches && node.matches('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy')) { relevantMutation = true; break; }
                }
            }
        }
        // Attribute changes are less likely to require immediate full processing loop
        // if (!relevantMutation && mutation.type === 'attributes' && mutation.attributeName === 'style') {
        //     // Only trigger if a critical style change happens? (e.g., display) - potentially noisy
        // }
        if (relevantMutation) break; // No need to check further mutations if one was relevant
    }

    // If a relevant mutation was detected, trigger the debounced processing function
    if (relevantMutation) {
        // console.log("XFilter: Relevant mutation detected, triggering debounced processing."); // Debug log
        debouncedProcessTimeline();
    }
};

// --- Initialization ---
// Main function to set up the extension's content script functionality.
async function main() {
    console.log("XFilter Content Script: Initializing...");

    // Load settings from storage
    try {
        const data = await chrome.storage.sync.get([
            'flagsToHide', 'wordsToHide', 'filterAds', 'ircMode',
            'hideRightSection', 'bgColor', 'enableReordering', 'interestKeywords'
        ]);
        // Apply defaults if settings are not found
        settings = {
            flagsToHide: data.flagsToHide || [],
            wordsToHide: data.wordsToHide || [],
            filterAds: data.filterAds ?? true,
            ircMode: data.ircMode ?? false,
            hideRightSection: data.hideRightSection ?? false,
            bgColor: data.bgColor || DEFAULT_BG_COLOR,
            enableReordering: data.enableReordering ?? false,
            interestKeywords: data.interestKeywords || []
        };
        console.log('XFilter: Initial settings loaded:', settings);
    } catch (error) {
        console.error("XFilter: Error loading initial settings:", error);
        // Continue with default settings
    }

    // Apply initial visual filters and styles immediately on load
    applyIRCMode();
    applyCustomBackground();
    hideRightSectionFunc();
    filterTweets(); // Initial filtering pass

    // Initialize the model and tokenizer if reordering is enabled (runs in the background)
    if (settings.enableReordering) {
        initializeModel(); // Don't await, let it initialize asynchronously
    } else {
        console.log("XFilter: Reordering disabled on initial load. Skipping model init.");
    }

    // Run an initial processing cycle after a short delay
    // This catches tweets present on initial load and allows some time for the model to potentially initialize.
    setTimeout(() => {
        console.log("XFilter: Running initial delayed processing...");
        processTimelineChanges(); // Will filter again and score/reorder if model became ready
    }, 1500); // Delay in milliseconds

    // Set up the Mutation Observer to watch for changes in the page body
    const targetNode = document.body;
    const observer = new MutationObserver(observerCallback);
    const observerConfig = {
        childList: true,  // Watch for adding/removing child nodes
        subtree: true     // Watch descendants as well (important for tweets appearing anywhere)
        // attributes: false, // Reduce noise: potentially disable attribute watching?
        // attributeFilter: ['style', `data-${XFILTER_PREFIX}-hidden`] // Or filter specific attributes
    };
    observer.observe(targetNode, observerConfig);
    console.log("XFilter: Mutation observer started.");

    // Listen for messages from the popup or background script
    chrome.runtime.onMessage.addListener(handleMessages);
    console.log("XFilter: Message listener added.");

    console.log("XFilter: Initialization sequence complete.");
}

// --- Message Handling ---
// Handle messages received from other parts of the extension (e.g., popup).
async function handleMessages(message, sender, sendResponse) {
    console.log("XFilter: Received message:", message.action, message.settings || message.bgColor || '');
    let needsProcessing = false;        // Should debouncedProcessTimeline run?
    let settingsChanged = false;      // Were settings actually updated?
    let triggerImmediateProcessing = false; // Should processing run right now?

    if (message.action === 'settingsUpdated' && message.settings) {
        const oldSettings = { ...settings };
        settings = { ...settings, ...message.settings }; // Update local settings cache
        settingsChanged = true;
        console.log('XFilter: Settings updated via message.');

        // Check specifically which settings changed to optimize updates
        const visualFiltersChanged = (
            oldSettings.filterAds !== settings.filterAds ||
            JSON.stringify(oldSettings.flagsToHide) !== JSON.stringify(settings.flagsToHide) ||
            JSON.stringify(oldSettings.wordsToHide) !== JSON.stringify(settings.wordsToHide)
        );
        const appearanceChanged = (
             oldSettings.ircMode !== settings.ircMode ||
             oldSettings.hideRightSection !== settings.hideRightSection ||
             oldSettings.bgColor !== settings.bgColor
        );
        const reorderEnabledChanged = oldSettings.enableReordering !== settings.enableReordering;
        const keywordsChanged = JSON.stringify(oldSettings.interestKeywords) !==
                                JSON.stringify(settings.interestKeywords);

        // Handle changes immediately affecting visibility/styles
         if (visualFiltersChanged) {
             console.log("XFilter: Visual filter settings changed. Re-applying filters.");
             // Mark all processed tweets for re-filtering
             document.querySelectorAll('[data-testid="tweet"][data-filter-processed="true"]')
                 .forEach(t => {
                    t.removeAttribute('data-filter-processed');
                    // Make potentially hidden tweets visible again so filterTweets can re-evaluate them
                    if (t.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                       t.style.display = '';
                    }
                 });
             filterTweets(); // Re-run filtering immediately
             needsProcessing = true; // Schedule a full cycle later just in case
         }
         if (appearanceChanged) {
             console.log("XFilter: Appearance settings changed. Re-applying styles.");
             applyIRCMode();
             applyCustomBackground();
             hideRightSectionFunc();
             needsProcessing = true; // Schedule a full cycle later
         }

        // Handle changes related to Reordering
        if (settings.enableReordering) {
            // If reordering is enabled...
            if (!modelReady) {
                 // ...but model isn't ready, try to initialize it.
                 console.log("XFilter: Reordering enabled but model not ready. Initializing model...");
                 initializeModel(); // Start async initialization
                 needsProcessing = true; // Schedule processing for when model might be ready
            } else {
                 // ...and model IS ready, check if keywords changed or reordering was just turned ON.
                 if (reorderEnabledChanged || keywordsChanged) {
                    console.log(
                        "XFilter: Reordering config changed (enabled/keywords). Recomputing embedding and marking tweets for rescore."
                    );
                    // Recalculate the interest embedding based on new keywords
                    averageInterestEmbedding = await getAverageInterestEmbedding(settings.interestKeywords);
                    // Mark ALL currently visible tweets to be rescored
                    document.querySelectorAll(
                        `[data-testid="tweet"]:not([data-${XFILTER_PREFIX}-hidden]):not([style*="display: none"])`
                    ).forEach(t => {
                        t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                        t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
                        t.setAttribute(`data-${XFILTER_PREFIX}-needs-scoring`, 'true');
                    });
                    triggerImmediateProcessing = true; // Force scoring/reordering cycle now
                 }
            }
        } else if (reorderEnabledChanged && !settings.enableReordering) {
             // If reordering was just *disabled*...
             console.log("XFilter: Reordering disabled. Cleaning up relevance attributes.");
             // No need to unload the model, user might re-enable it. Just clear state.
             averageInterestEmbedding = null; // Clear interest embedding
             // Remove all relevance-related attributes from tweets
             document.querySelectorAll(`[data-testid="tweet"]`).forEach(t => {
                 t.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
                 t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                 t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
                 t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processing`);
             });
             // Optional: force a re-render or accept the current order remains until navigation?
             needsProcessing = true; // Schedule processing to ensure filters etc., run cleanly
        }

        sendResponse({ status: "Settings processing initiated" });

    } else if (message.action === 'updateBackground') {
        // Handle direct background color update (e.g., from color picker)
        if (settings.bgColor !== message.bgColor) {
            settings.bgColor = message.bgColor || DEFAULT_BG_COLOR;
            console.log("XFilter: Background color updated directly.");
            applyCustomBackground(); // Apply change immediately
            sendResponse({ status: "Background updated" });
        } else {
            sendResponse({ status: "Background unchanged" });
        }
    } else {
        // Handle unknown message actions
        console.warn("XFilter: Received unknown message action:", message.action);
        sendResponse({ status: "Unknown action" });
    }

    // Schedule processing based on flags set above
    if (triggerImmediateProcessing) {
        console.log("XFilter: Scheduling immediate processing after settings update.");
        scheduleReorder(true); // Force run now
    } else if (needsProcessing && settingsChanged) {
        // Only schedule debounced if settings actually changed and immediate wasn't triggered
        console.log("XFilter: Scheduling debounced processing after settings update.");
        debouncedProcessTimeline();
    }

    // Return false for synchronous message handling (or true if using async sendResponse, which we aren't here)
    return false;
}


// --- Helpers ---
// Helper to schedule timeline processing, either immediately or debounced.
function scheduleReorder(forceImmediate = false) {
      if (!settings.enableReordering) return; // Don't schedule if reordering is disabled

      if (forceImmediate) {
        console.log("XFilter: Forcing immediate timeline processing...");
        // Attempt to clear any pending debounced call
        // Note: Accessing internal _timeoutId might be fragile, depends on debounce implementation
        if (debouncedProcessTimeline._timeoutId) {
            clearTimeout(debouncedProcessTimeline._timeoutId);
        }
        processTimelineChanges(); // Run immediately
    } else {
        debouncedProcessTimeline(); // Use the standard debounced version
    }
}

// --- Start ---
// Entry point: Run the main initialization function.
try {
    main().catch(error =>
        console.error("XFilter: Uncaught error during async main execution:", error)
    );
} catch (error) {
    console.error("XFilter: Uncaught synchronous error during initialization:", error);
}