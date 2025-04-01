const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    // Use 'development' for easier debugging, 'production' for optimized builds
    mode: 'development',

    // Main entry point for the content script
    entry: {
        content: './src/content.js',
    },

    output: {
        // Output directory
        path: path.resolve(__dirname, 'dist'),
        // Output filename pattern
        filename: '[name].bundle.js',
        // Clean dist/ before each build
        clean: true,
    },

    plugins: [
        new CopyPlugin({
            patterns: [
                // Copy ONNX Runtime WASM files needed for the browser environment
                {
                    from: 'node_modules/onnxruntime-web/dist/*.wasm',
                    // Use [name][ext] to copy files directly into dist/, preventing nested folders
                    to: '[name][ext]',
                },
                // Copy static assets
                { from: 'assets/model', to: 'model' },
                { from: 'assets/tokenizer', to: 'tokenizer' },
                { from: 'assets/icons', to: 'icons' },
                // Copy popup files
                { from: 'popup.html', to: 'popup.html' },
                { from: 'popup.js', to: 'popup.js' },
                // Copy the extension manifest
                { from: 'manifest.json', to: 'manifest.json' },
            ],
        }),
    ],

    resolve: {
        // Provide browser polyfills or stubs for Node.js core modules.
        // Some libraries, like onnxruntime-web, might rely on these.
        fallback: {
             "path": require.resolve("path-browserify"),
             "fs": false, // fs cannot be polyfilled in the browser
             "crypto": false, // crypto cannot be reliably polyfilled
             "util": false,
             "stream": false,
         }
    },

    // Generate source maps for debugging bundled code
    devtool: 'cheap-module-source-map',

    // Performance hints configuration
    performance: {
         // Disable warnings about large bundle sizes; expected with ML models/assets.
         hints: false,
    },

     // Development watch options
     // watch: true, // Uncomment to automatically rebuild on file changes
     watchOptions: {
         // Ignore node_modules to prevent unnecessary rebuilds
         ignored: /node_modules/,
     },
};