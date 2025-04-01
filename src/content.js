import { AutoTokenizer } from '@xenova/transformers';
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
// Ensure dedicated style tags exist in the <head> for dynamic CSS rules
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
        // console.log("XFilter: Skipping model init (already done or not enabled).");
        return;
    }

    try {
        console.log('XFilter: Initializing model and tokenizer...');
        // Point ONNX Runtime to the WASM files within the extension
        const wasmDir = chrome.runtime.getURL("./");
        OrtEnv.wasm.wasmPaths = wasmDir;
        // Load tokenizer and model files packaged with the extension
        const tokenizerPath = chrome.runtime.getURL("tokenizer/");
        tokenizer = await AutoTokenizer.from_pretrained(tokenizerPath);
        const modelPath = chrome.runtime.getURL('model/model.onnx');
        modelSession = await InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
        modelReady = true;
        console.log('XFilter: Model and tokenizer ready.');

        // Calculate initial interest embedding if keywords are available
        if (settings.interestKeywords.length > 0) {
            averageInterestEmbedding = await getAverageInterestEmbedding(settings.interestKeywords);
            if (averageInterestEmbedding) {
                console.log('XFilter: Initial interest embedding calculated.');
                scheduleReorder(true); // Trigger initial scoring/reordering
            } else {
                console.warn('XFilter: Could not calculate initial interest embedding.');
            }
        }
    } catch (error) {
        console.error('XFilter: CRITICAL - Failed to initialize model or tokenizer:', error);
        modelReady = false;
        settings.enableReordering = false; // Fallback: disable feature if init fails
    }
}

// --- Embeddings ---
async function computeEmbedding(text) {
    if (!modelReady || !tokenizer || !modelSession || !text || typeof text !== 'string' || text.trim().length === 0) {
        return null; // Cannot compute embedding
    }
    try {
        const encoded = tokenizer(text, {
            padding: true,
            truncation: true,
            max_length: 128, // Max sequence length for the model
            return_tensors: 'ort'
        });

        const feeds = {};
        // Prepare input tensors based on what the model expects
        if (modelSession.inputNames.includes('input_ids')) {
            feeds['input_ids'] = encoded.input_ids;
        } else { throw new Error("Model needs 'input_ids'"); }

        if (modelSession.inputNames.includes('attention_mask')) {
            feeds['attention_mask'] = encoded.attention_mask;
        } else { throw new Error("Model needs 'attention_mask'"); }

        // Some models need token_type_ids, some don't. Handle if missing.
        if (modelSession.inputNames.includes('token_type_ids')) {
            if (encoded.token_type_ids) {
                feeds['token_type_ids'] = encoded.token_type_ids;
            } else {
                // Create a zero tensor if tokenizer didn't provide it
                const [bs, sl] = encoded.input_ids.dims;
                feeds['token_type_ids'] = new Tensor('int64', BigInt64Array.from(Array(bs * sl).fill(0n)), [bs, sl]);
            }
        }

        const output = await modelSession.run(feeds);

        // Find the correct output tensor (model outputs can vary)
        let embeddingTensor = null;
        const potentialOutputNames = ['last_hidden_state', 'output_0', 'embeddings'];
        for (const name of potentialOutputNames) {
            if (output[name] && output[name] instanceof Tensor && output[name].dims.length === 3) {
                embeddingTensor = output[name];
                break;
            }
        }
        if (!embeddingTensor) {
            console.error("XFilter: Could not find embedding tensor in model output:", Object.keys(output));
            return null;
        }

        // Pool the token embeddings into a single sentence embedding
        const pooledEmbedding = meanPooling(embeddingTensor, feeds['attention_mask']);
        return pooledEmbedding;

    } catch (error) {
        console.error(`XFilter: Error computing embedding for text snippet:`, error);
        return null;
    }
}

// Pool token embeddings using the attention mask
function meanPooling(modelOutputTensor, attentionMaskTensor) {
    const modelOutput = modelOutputTensor.data;
    const attentionMask = attentionMaskTensor.data;
    const [batchSize, sequenceLength, hiddenSize] = modelOutputTensor.dims;

    // Assuming batchSize is 1 for typical inference here
    const pooledEmbedding = new Float32Array(hiddenSize).fill(0);
    let tokenCount = 0;
    const batchOffsetOutput = 0;
    const batchOffsetMask = 0;

    for (let j = 0; j < sequenceLength; ++j) {
        const maskValue = attentionMask[batchOffsetMask + j];
        // Consider only tokens that are not padding (mask is 1)
        if (maskValue === 1n || maskValue === 1) {
            tokenCount++;
            const tokenOffset = batchOffsetOutput + j * hiddenSize;
            for (let k = 0; k < hiddenSize; ++k) {
                pooledEmbedding[k] += modelOutput[tokenOffset + k];
            }
        }
    }

    // Average the embeddings
    if (tokenCount > 0) {
        for (let k = 0; k < hiddenSize; ++k) {
            pooledEmbedding[k] /= tokenCount;
        }
    } else {
        console.warn("XFilter: Mean pooling found zero valid tokens.");
    }

    // Normalize the final embedding vector
    let norm = 0;
    for (let k = 0; k < hiddenSize; k++) norm += pooledEmbedding[k] ** 2;
    norm = Math.sqrt(norm);
    if (norm > 1e-5) { // Avoid division by zero/small numbers
        for (let k = 0; k < hiddenSize; k++) pooledEmbedding[k] /= norm;
    }

    return pooledEmbedding;
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) dotProduct += vecA[i] * vecB[i];
    // Clamp to [-1, 1] to handle potential floating point errors
    return Math.max(-1, Math.min(1, dotProduct));
}

// Compute the average embedding for a list of keywords
async function getAverageInterestEmbedding(keywords) {
    if (!modelReady) {
        console.warn("XFilter: Model not ready for interest embedding.");
        return null;
    }
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        // console.warn("XFilter: No valid keywords provided.");
        return null;
    }

    console.log("XFilter: Calculating average embedding for keywords:", keywords);
    let accumulatedEmbedding = null;
    let validKeywordsCount = 0;
    let dimension = 0;

    for (const keyword of keywords) {
        const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
        if (!trimmedKeyword) continue;

        const embedding = await computeEmbedding(trimmedKeyword);
        if (embedding && embedding.length > 0) {
            // Initialize accumulator on first successful embedding
            if (!accumulatedEmbedding) {
                dimension = embedding.length;
                accumulatedEmbedding = new Float32Array(dimension).fill(0);
            }
            // Ensure dimensions match before adding
            if (embedding.length === dimension) {
                for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] += embedding[i];
                validKeywordsCount++;
            } else {
                console.warn(`XFilter: Keyword embedding dim mismatch: "${trimmedKeyword}".`);
            }
        } else {
             console.warn(`XFilter: Failed embedding for keyword: "${trimmedKeyword}".`);
        }
    }

    if (accumulatedEmbedding && validKeywordsCount > 0) {
        // Calculate average
        for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] /= validKeywordsCount;
        // Normalize the average embedding
        let norm = 0;
        for (let i = 0; i < dimension; i++) norm += accumulatedEmbedding[i] ** 2;
        norm = Math.sqrt(norm);
        if (norm > 1e-5) {
            for (let i = 0; i < dimension; i++) accumulatedEmbedding[i] /= norm;
        } else {
            console.warn("XFilter: Average embedding norm near zero.");
        }
        console.log("XFilter: Average interest embedding calculated.");
        return accumulatedEmbedding;
    } else if (keywords.length > 0) {
        console.error("XFilter: Could not calculate average interest embedding.");
    }
    return null;
}

// --- Tweet Processing ---
// Extract text content from a tweet element, including alt text for emojis/images
function getTweetText(tweetElement) {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (textElement) {
        let text = '';
        textElement.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Capture alt/aria-label for accessibility elements, fallback to text
                text += node.alt || node.getAttribute('aria-label') || node.textContent || '';
            }
        });
        return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    }
    // Fallback if the standard text element isn't found
    console.warn("XFilter: Could not find tweet text via [data-testid='tweetText'] for:", tweetElement);
    return tweetElement.textContent.replace(/\s+/g, ' ').trim() || '';
}

// Hide tweets based on settings (Ads, flags, words) - Uses V1 Ad Logic
function filterTweets() {
    document.querySelectorAll('[data-testid="tweet"]:not([data-filter-processed="true"])')
        .forEach(tweet => {
            tweet.setAttribute('data-filter-processed', 'true');
            let shouldHide = false;
            let reason = ''; // Reason is kept for v2 structure but may not be set by v1 ad logic

            // --- START V1 AD FILTERING LOGIC ---
            if (settings.filterAds) {
                const spans = tweet.querySelectorAll('span');
                spans.forEach(span => {
                    if (span.offsetParent !== null) { // Check if visible
                        const text = span.innerText.trim();
                        if (text === 'Ad' || text === 'Promoted') {
                            shouldHide = true;
                            reason = 'Ad/Promoted'; // Set reason for v2 compatibility
                            return; // Exit the inner forEach loop early once found
                        }
                    }
                });
            }
            // --- END V1 AD FILTERING LOGIC ---

            // Flag/Word Filtering in username/display name (v2 logic - unchanged)
            if (!shouldHide && (settings.flagsToHide.length > 0 || settings.wordsToHide.length > 0)) {
                const userNameElement = tweet.querySelector('[data-testid="UserName"]');
                if (userNameElement) {
                    const displayNameElement = userNameElement.querySelector('span'); // Usually holds display name
                    let nameToCheck = '';
                    if (displayNameElement) {
                        nameToCheck = displayNameElement.innerText.toLowerCase();
                    } else {
                        nameToCheck = userNameElement.textContent.toLowerCase(); // Fallback
                    }

                    if (settings.flagsToHide.some(flag => flag && nameToCheck.includes(flag))) {
                        shouldHide = true;
                        reason = 'Flag in Name';
                    }
                    if (!shouldHide && settings.wordsToHide.some(word => word && nameToCheck.includes(word.toLowerCase()))) {
                         shouldHide = true;
                         reason = 'Word in Name';
                    }
                }
            }

            // Apply visibility and mark reason (v2 logic - unchanged)
            if (shouldHide) {
                tweet.style.display = 'none';
                tweet.setAttribute(`data-${XFILTER_PREFIX}-hidden`, reason);
                // Clear relevance attributes if hidden
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
            } else {
                // Ensure tweet is visible if filter rules changed
                if (tweet.style.display === 'none' && tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                   tweet.style.display = '';
                }
                tweet.removeAttribute(`data-${XFILTER_PREFIX}-hidden`);
            }
        });
}


// --- IRC Mode ---
// Hides the profile picture column structure *using JS* and adjusts parent layout
function removeProfilePicBars(tweet) {
    // This JS function now primarily handles parent layout adjustments,
    // as the direct hiding should be done faster by CSS.
    const profilePicBar = tweet.querySelector(
        // Use the same selector as the new CSS rule for consistency
        '.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy:not([data-irc-processed])'
    );
    // Check if it contains an avatar, just to be safe
    if (profilePicBar && profilePicBar.querySelector('[data-testid="Tweet-User-Avatar"]')) {
        // We no longer need profilePicBar.style.display = 'none'; here, CSS handles it.
        // Apply parent layout adjustments if not already processed
        const parent = profilePicBar.parentElement;
        if (parent) {
            // Check if parent style needs setting/overriding
            if(parent.style.display !== 'flex' || parent.style.alignItems !== 'flex-start' || parent.style.gap !== '8px') {
                parent.style.display = 'flex';
                parent.style.alignItems = 'flex-start';
                parent.style.gap = '8px';
            }
        }
        // Mark as processed so parent styles aren't reapplied repeatedly
        profilePicBar.setAttribute('data-irc-processed', 'true');
    }
}

// Ensures badges (verified, etc.) remain visible in IRC mode
function preserveBadges(tweet) {
    const badges = tweet.querySelectorAll(
        'div[data-testid="User-Name"] svg[aria-label="Verified account"], div[data-testid="User-Name"] img:not([src*="profile_images"])'
    );
    badges.forEach(badge => {
        const parentDiv = badge.closest('div[data-testid="User-Name"]'); // Find the User-Name div
        if (parentDiv) {
             // Check if the preserve attribute is already on the intended parent or the badge itself
            if (!parentDiv.hasAttribute('data-irc-preserve') && !badge.parentNode.hasAttribute('data-irc-preserve')) {
                 parentDiv.setAttribute('data-irc-preserve', 'true'); // Apply to the User-Name div
            }
        }
       // Apply inline styles directly to the badge itself for high specificity
       badge.style.cssText = 'display: inline !important; margin-left: 4px; vertical-align: middle; height: 1em; width: auto;';
    });
}


// Applies CSS and runs JS modifications for IRC mode
function applyIRCMode() {
    let css = '';
    if (settings.ircMode) {
        css += `
        /* --- START IRC Mode CSS --- */

        /* Hide media elements */
        [data-testid="tweetPhoto"], [aria-label="Image"],
        [data-testid="testCondensedMedia"], [data-testid="article-cover-image"],
        [data-testid="card.layoutSmall.media"], [data-testid="card.layoutLarge.media"],
        a[href*="photo"] > div, [style*="padding-bottom: 56.25%"] {
          display: none !important;
        }

        /* === FIX FOR PROFILE PIC FLASH === */
        /* Hide the profile picture column directly via CSS for speed */
        /* NOTE: This class name might change with Twitter updates! */
        .css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy {
          display: none !important;
          /* Optionally set width to 0 as well */
          width: 0px !important;
          min-width: 0px !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        /* === END FIX === */


        /* Ensure preserved badges container is visible and styled */
        /* Target the parent div marked by preserveBadges */
        div[data-testid="User-Name"][data-irc-preserve] {
           display: inline-flex !important;
           align-items: center !important;
           visibility: visible !important;
           /* Add some vertical alignment */
           vertical-align: text-bottom;
        }

        /* Ensure the badges themselves within the container are visible */
        /* (Selector from preserveBadges JS) */
         div[data-testid="User-Name"][data-irc-preserve] svg[aria-label="Verified account"],
         div[data-testid="User-Name"][data-irc-preserve] img:not([src*="profile_images"]) {
             display: inline !important; /* Already set inline, but reinforce */
             visibility: visible !important;
             opacity: 1 !important;
             height: 1em; /* Ensure consistent height */
             width: auto;
        }

        /* Hide potential separators or elements between username and badges */
        div[data-testid="User-Name"] > div[dir="ltr"]:not(:has(> span)) { /* Divs without spans (likely separators) */
           display: none !important;
        }

        /* --- END IRC Mode CSS --- */
      `;
    }
    // Only update if CSS content changes
    if (ircStyleTag.textContent !== css) {
       ircStyleTag.textContent = css;
    }


    // Process tweets with JS functions if IRC mode is active
    // This will handle parent layout adjustments and badge marking
    if (settings.ircMode) {
        document.querySelectorAll('[data-testid="tweet"]') // Process all tweets, not just unprocessed for this part
            .forEach(tweet => {
                // Check if not hidden by other filters first
                if (tweet.style.display !== 'none' && !tweet.hasAttribute(`data-${XFILTER_PREFIX}-hidden`)) {
                     preserveBadges(tweet); // Ensure badges are marked correctly
                     removeProfilePicBars(tweet); // Ensure parent layout is adjusted
                }
            });
        // Note: The :not([data-irc-processed]) selector was removed from the JS loop querySelector
        // because we now rely on the attribute *inside* removeProfilePicBars to prevent redundant parent styling.
        // We still need preserveBadges to run potentially multiple times if attributes change.
    } else {
        // Cleanup if IRC mode is turned off
        document.querySelectorAll('[data-irc-preserve]').forEach(el => el.removeAttribute('data-irc-preserve'));
        document.querySelectorAll('[data-irc-processed]').forEach(el => el.removeAttribute('data-irc-processed'));
        // Consider resetting parent styles if needed, though often not necessary
    }
}


// --- Custom Background --- (Reverted implementation)
// Applies custom background color, overriding common Twitter elements
function applyCustomBackground() {
    let css = '';
    const useBackground = settings.bgColor && settings.bgColor.toLowerCase() !== DEFAULT_BG_COLOR;

    if (useBackground) {
        css = `
        html, body { background: ${settings.bgColor} !important; }
        /* Override common element backgrounds */
        [data-testid="primaryColumn"], [data-testid="sidebarColumn"],
        [data-testid="tweet"], [data-testid="toolBar"],
        /* Specific CSS classes (may change with Twitter updates) */
        .css-175oi2r.r-1igl3o0.r-qklmqi.r-1adg3ll.r-1ny4l3l,
        .css-175oi2r.r-1adg3ll.r-1ny4l3l.r-1n0xq6e,
        .css-175oi2r.r-1adg3ll.r-1ny4l3l,
        .css-175oi2r.r-18u37iz.r-1wtj0ep,
        .css-175oi2r.r-1habvwh.r-18u37iz.r-1wtj0ep,
        .css-175oi2r.r-1w6e6rj.r-1d09ksm.r-417010,
        .css-175oi2r.r-1h8ys4a, .css-175oi2r.r-184en5c, /* Composer, replies */
        .css-175oi2r.r-1iusvr4.r-16y2uox,
        .css-175oi2r.r-1d09ksm.r-18u37iz.r-1wbh5a2,
        .css-175oi2r.r-16y2uox.r-1wbh5a2,
        .css-175oi2r.r-1awozwy.r-zchlnj.r-1d09ksm, /* Header tabs */
        .css-175oi2r.r-1awozwy.r-18u37iz.r-zchlnj.r-1d09ksm.r-6gpygo,
        .css-175oi2r.r-1awozwy.r-18u37iz.r-1d09ksm.r-6gpygo,
        .css-175oi2r.r-zchlnj.r-1d09ksm, /* Sticky headers */
        .css-175oi2r.r-1awozwy.r-zchlnj,
        .css-175oi2r.r-1d09ksm,
        .css-175oi2r.r-aqfbo4.r-gtdqiz.r-1gn8etr.r-1g40b8q, /* Nav parents */
        .css-175oi2r.r-1e5uvyk.r-6026j,
        /* Catch inline black/transparent backgrounds */
        [style*="background-color: rgb(0, 0, 0)"],
        [style*="background-color: rgba(0, 0, 0, 0)"] {
          background: transparent !important;
          background-color: transparent !important;
        }
      `;
    }
     // Only update if CSS content changes
    if (bgStyleTag.textContent !== css) {
        bgStyleTag.textContent = css;
    }


    // Also try to dynamically clear inline black backgrounds added by JS
    if (useBackground) {
        document.querySelectorAll(
            '[style*="background-color: rgb(0, 0, 0)"], [style*="background-color: rgba(0, 0, 0, 0)"]'
        ).forEach(el => {
             if (el.style.backgroundColor === 'rgb(0, 0, 0)' || el.style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                el.style.backgroundColor = 'transparent';
             }
        });
    }
}

// --- Hide Right Section ---
// Applies CSS to hide the sidebar and expand the main column
function hideRightSectionFunc() {
    let css = '';
    if (settings.hideRightSection) {
        css = `
          [data-testid="sidebarColumn"] { display: none !important; width: 0px !important; min-width: 0px !important; }
          /* Adjust primary column and header on wider screens */
          @media (min-width: 1000px) {
            [data-testid="primaryColumn"] {
              width: 100% !important; max-width: 990px !important;
              border-right-width: 0px !important; margin-right: 0px !important;
            }
            header[role="banner"] > div > div > div { max-width: 990px !important; }
          }
        `;
    }
    // Update CSS only if it changed
    if (rightSectionStyleTag.textContent !== css) {
        rightSectionStyleTag.textContent = css;
    }
}

// --- Scoring & Reordering ---
// Calculates relevance scores for tweets based on the average interest embedding
async function scoreTweets() {
    if (!settings.enableReordering || !modelReady || !averageInterestEmbedding) {
        // Clean up flags if reordering is disabled
        if (!settings.enableReordering) {
            document.querySelectorAll(`[data-${XFILTER_PREFIX}-needs-scoring="true"]`)
                .forEach(t => t.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`));
        }
        return false; // Cannot score
    }

    // Find visible, non-hidden tweets marked for scoring
    const tweetsToScore = document.querySelectorAll(
        `[data-testid="tweet"][data-${XFILTER_PREFIX}-needs-scoring="true"]:not([data-${XFILTER_PREFIX}-hidden]):not([style*="display: none"])`
    );
    if (tweetsToScore.length === 0) return false;

    console.log(`XFilter: Scoring ${tweetsToScore.length} tweets.`);
    let scoredCount = 0;
    const scoringPromises = [];

    for (const tweet of tweetsToScore) {
        tweet.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
        tweet.setAttribute(`data-${XFILTER_PREFIX}-relevance-processing`, 'true'); // Mark as busy

        const scoringTask = async () => {
            const text = getTweetText(tweet);
            let score = -1; // Default score if embedding fails
            if (text) {
                const embedding = await computeEmbedding(text);
                if (embedding) {
                    score = cosineSimilarity(averageInterestEmbedding, embedding);
                    scoredCount++;
                }
            }
            // Store score and mark as processed
            tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`] = score.toFixed(5);
            tweet.setAttribute(`data-${XFILTER_PREFIX}-relevance-processed`, 'true');
            tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processing`);
        };
        scoringPromises.push(scoringTask());
    }

    await Promise.all(scoringPromises); // Wait for all scoring tasks

    if (scoredCount > 0) {
        console.log(`XFilter: Finished scoring ${scoredCount} / ${tweetsToScore.length} tweets.`);
        return true; // Indicates scores were generated
    } else {
        // Ensure processing flags are removed even if scoring failed
        tweetsToScore.forEach(tweet => tweet.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processing`));
        return false;
    }
}

// Reorders tweets in the timeline based on their relevance score
function reorderTimeline() {
    if (!settings.enableReordering) return;

    // Find the main timeline container (selectors might need updates if Twitter changes layout)
    const timelineSelectors = [
        'div[aria-label*="Timeline: Your Home Timeline"]',
        'div[aria-label*="Timeline: Search results"]',
        'div[aria-label*="Timeline: List tweets"]',
        'div[aria-label*="Timeline: Profile"]',
        'div[aria-label*="Timeline"]' // Generic fallback
    ];
    let timelineContainer = null;
    for(const selector of timelineSelectors) {
        timelineContainer = document.querySelector(selector);
        if (timelineContainer) break;
    }
    if (!timelineContainer) {
        console.warn("XFilter: Could not find timeline container for reordering.");
        return;
    }

    const tweetsToSort = [];
    // Find direct children (cells) containing scored, visible tweets
    timelineContainer.querySelectorAll(`:scope > div`).forEach(cell => {
        const tweet = cell.querySelector(
          `[data-testid="tweet"][data-${XFILTER_PREFIX}-relevance-processed="true"]:not([data-${XFILTER_PREFIX}-hidden]):not([style*="display: none"])`
        );
        if (tweet?.dataset[`${XFILTER_PREFIX}RelevanceScore`]) {
            const score = parseFloat(tweet.dataset[`${XFILTER_PREFIX}RelevanceScore`]);
            if (!isNaN(score)) {
                tweetsToSort.push({ element: cell, score: score }); // Store the cell element
            }
        }
    });

    if (tweetsToSort.length < 2) return; // Not enough tweets to reorder

    console.log(`XFilter: Reordering ${tweetsToSort.length} tweets.`);
    tweetsToSort.sort((a, b) => b.score - a.score); // Sort descending by score

    // Use DocumentFragment for efficient re-insertion
    const fragment = document.createDocumentFragment();
    tweetsToSort.forEach(item => fragment.appendChild(item.element));
    timelineContainer.appendChild(fragment);
    console.log("XFilter: Timeline reordering complete.");
}

// --- Observation & Debouncing ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Main function called on timeline changes
const processTimelineChanges = async () => {
    // Apply visual filters/styles first
    filterTweets(); // Uses v1 ad logic now
    applyIRCMode(); // Applies CSS immediately, JS processing happens too
    applyCustomBackground();
    hideRightSectionFunc();

    // Mark newly visible tweets for scoring if reordering is enabled
    if (settings.enableReordering && modelReady && averageInterestEmbedding) {
        document.querySelectorAll(
            `[data-testid="tweet"]:not([data-${XFILTER_PREFIX}-hidden])` +
            `:not([data-${XFILTER_PREFIX}-relevance-processed])` +
            `:not([style*="display: none"])`
        ).forEach(tweet => {
            if (!tweet.hasAttribute(`data-${XFILTER_PREFIX}-needs-scoring`) &&
                !tweet.hasAttribute(`data-${XFILTER_PREFIX}-relevance-processing`)) {
                tweet.setAttribute(`data-${XFILTER_PREFIX}-needs-scoring`, 'true');
            }
        });
    }

    // Score tweets marked for scoring
    const scoredNewTweets = await scoreTweets();

    // Reorder timeline if new scores were calculated
    if (scoredNewTweets && settings.enableReordering) {
        reorderTimeline();
    }
};

// Debounced version for the observer to avoid excessive calls
// Keeping the debounce time you preferred (assuming 250ms was chosen, otherwise adjust here)
const DEBOUNCE_DELAY = 250; // Adjust if needed (e.g., back to 750)
const debouncedProcessTimeline = debounce(processTimelineChanges, DEBOUNCE_DELAY);

// Callback function for the MutationObserver
const observerCallback = (mutationsList, observer) => {
    let relevantMutation = false;
    for (const mutation of mutationsList) {
        // Check for added nodes that look like tweets or timeline elements
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the added node *is* or *contains* a tweet or major column/timeline structure
                    if ((node.matches && (
                         node.matches('[data-testid="tweet"], div[aria-label*="Timeline"], section[role="region"], [data-testid="primaryColumn"], [data-testid="cellInnerDiv"]')
                      )) ||
                         node.querySelector('[data-testid="tweet"]'))
                    {
                        relevantMutation = true; break;
                    }
                     // Also check for inline background style changes (for custom background)
                     if(node.matches && node.matches('[style*="background-color:"]')) {
                        relevantMutation = true; break;
                    }
                     // Check specifically if the avatar column was added (relevant for IRC mode)
                     if (node.matches && node.matches('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy')) {
                         relevantMutation = true; break;
                     }
                }
            }
        }
        // Check for direct style attribute changes (mainly for background color)
         if (!relevantMutation && mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const target = mutation.target;
            // Check if the background changed or if display style changed on the avatar column
             if (target?.style?.backgroundColor || (target?.matches('.css-175oi2r.r-18kxxzh.r-1wron08.r-onrtq4.r-1awozwy') && target.style.display)) {
                relevantMutation = true;
            }
        }
        if (relevantMutation) break; // Stop checking if we found one
    }

    if (relevantMutation) {
        debouncedProcessTimeline(); // Trigger the debounced processing function
    }
};

// --- Initialization ---
async function main() {
    console.log("XFilter Content Script: Initializing...");

    // Load settings from storage
    try {
        const data = await chrome.storage.sync.get([
            'flagsToHide', 'wordsToHide', 'filterAds', 'ircMode',
            'hideRightSection', 'bgColor', 'enableReordering', 'interestKeywords'
        ]);
        // Apply defaults if settings are missing
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
    }

    // Initial application of styles and filters
    // Run applyIRCMode first to inject CSS rules immediately
    applyIRCMode();
    filterTweets();
    applyCustomBackground();
    hideRightSectionFunc();

    // Initialize the model only if reordering is enabled
    if (settings.enableReordering) {
        initializeModel().catch(e => console.error("XFilter: Async model init failed:", e));
    } else {
        console.log("XFilter: Reordering disabled on load.");
    }

    // Run initial processing after a short delay to catch content loaded after script injection
    setTimeout(() => {
        console.log("XFilter: Running initial delayed processing...");
        processTimelineChanges(); // This will re-run applyIRCMode etc.
    }, 1500);

    // Set up the Mutation Observer to watch for DOM changes
    const targetNode = document.body;
    const observer = new MutationObserver(observerCallback);
    const observerConfig = {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style'] // Observe style changes too
    };
    observer.observe(targetNode, observerConfig);
    console.log("XFilter: Mutation observer started.");

    // Listen for messages (e.g., settings updates from popup)
    chrome.runtime.onMessage.addListener(handleMessages);
    console.log("XFilter: Message listener added.");

    console.log("XFilter: Initialization complete.");
}

// --- Message Handling ---
// Handles messages from other parts of the extension (e.g., popup)
async function handleMessages(message, sender, sendResponse) {
    console.log("XFilter: Received message:", message.action);
    let requireProcessingTrigger = false;
    let settingsChanged = false; // Flag to check if settings relevant to processing changed

    if (message.action === 'settingsUpdated' && message.settings) {
        const oldSettings = { ...settings };
        const newSettings = message.settings;
        settings = { ...settings, ...newSettings }; // Update local settings
        console.log('XFilter: Settings updated via message.');
        settingsChanged = true; // Mark that settings were updated

        // Check specifically if settings affecting visual processing changed
        const visualSettingsChanged = oldSettings.filterAds !== newSettings.filterAds ||
                                     oldSettings.ircMode !== newSettings.ircMode ||
                                     oldSettings.hideRightSection !== newSettings.hideRightSection ||
                                     oldSettings.bgColor !== newSettings.bgColor ||
                                     JSON.stringify(oldSettings.flagsToHide) !== JSON.stringify(newSettings.flagsToHide) ||
                                     JSON.stringify(oldSettings.wordsToHide) !== JSON.stringify(newSettings.wordsToHide);

         if (visualSettingsChanged) {
              // Re-apply visual styles immediately only if they changed
              applyIRCMode(); // Update CSS rules
              filterTweets(); // Re-filter based on new rules
              applyCustomBackground();
              hideRightSectionFunc();
              requireProcessingTrigger = true; // Trigger full processing later
         }


        const reorderEnabledChanged = oldSettings.enableReordering !== newSettings.enableReordering;
        const keywordsChanged = JSON.stringify(oldSettings.interestKeywords) !== JSON.stringify(newSettings.interestKeywords);

        // Handle changes related to reordering feature
        if (newSettings.enableReordering && (reorderEnabledChanged || keywordsChanged)) {
            requireProcessingTrigger = true; // Need full processing cycle
            if (!modelReady) {
                console.log("XFilter: Enabling/updating reordering, initializing model...");
                await initializeModel(); // Ensure model is ready
            }
            if (modelReady) {
                console.log("XFilter: Recomputing average interest embedding...");
                averageInterestEmbedding = await getAverageInterestEmbedding(settings.interestKeywords);
                // Mark existing tweets for rescoring
                document.querySelectorAll(
                    `[data-testid="tweet"]:not([data-${XFILTER_PREFIX}-hidden]):not([style*="display: none"])`
                ).forEach(t => {
                    t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                    t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
                    t.setAttribute(`data-${XFILTER_PREFIX}-needs-scoring`, 'true');
                });
                console.log("XFilter: Marked tweets for rescoring.");
            }
        } else if (!newSettings.enableReordering && reorderEnabledChanged) {
             requireProcessingTrigger = true; // Need full processing cycle to clean up
            // Clean up if reordering was disabled
            console.log("XFilter: Reordering disabled.");
            averageInterestEmbedding = null;
            document.querySelectorAll(`[data-testid="tweet"]`).forEach(t => {
                t.removeAttribute(`data-${XFILTER_PREFIX}-needs-scoring`);
                t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-processed`);
                t.removeAttribute(`data-${XFILTER_PREFIX}-relevance-score`);
            });
        }
        sendResponse({ status: "Settings processed" });

    } else if (message.action === 'updateBackground') {
        // Handle specific background color updates
        if (settings.bgColor !== message.bgColor) {
            settings.bgColor = message.bgColor || DEFAULT_BG_COLOR;
            applyCustomBackground(); // Just update the background style
            sendResponse({ status: "Background updated" });
            // No need to trigger full processing just for background
        } else {
            sendResponse({ status: "Background unchanged" });
        }

    } else {
        console.log("XFilter: Received unknown message action:", message.action);
        sendResponse({ status: "Unknown action" });
    }

    // Trigger a processing cycle if needed after handling the message
    // Only trigger if settings relevant to processing actually changed
    if (requireProcessingTrigger && settingsChanged) {
        console.log("XFilter: Scheduling processing after settings update.");
        scheduleReorder(false); // Use debounced version
    }

    // Use 'return true' for async response if needed, but here we handle synchronously
    // return true; // Example if response was async
     return false; // Indicate synchronous response handling
}


// --- Helpers ---
// Helper to trigger processing, debounced by default
function scheduleReorder(forceImmediate = false) {
    if (forceImmediate) {
        console.log("XFilter: Forcing immediate timeline processing...");
        // Use setTimeout to push to end of execution queue, ensuring it runs after current stack
        setTimeout(processTimelineChanges, 0);
    } else {
        debouncedProcessTimeline();
    }
}

// --- Start ---
main().catch(error => console.error("XFilter: Uncaught error during initialization:", error));