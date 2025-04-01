const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    // Mode: 'development' for readable output and source maps,
    // change to 'production' for optimized smaller builds later
    mode: 'development',

    // Entry point: Your main content script
    entry: {
        content: './src/content.js',
    },

    // Output configuration
    output: {
        // Output bundled JS to a 'dist' directory
        path: path.resolve(__dirname, 'dist'),
        // Name the output file based on the entry key ('content')
        filename: '[name].bundle.js',
        // Clean the output directory before each build
        clean: true,
    },

    // Plugins
    plugins: [
        new CopyPlugin({
            patterns: [
                // Copy necessary ONNX Runtime WASM files from node_modules
                {
                    from: 'node_modules/onnxruntime-web/dist/*.wasm',
                    to: '[name][ext]', // Copies to root of dist/ (e.g., dist/ort-wasm-simd-threaded.wasm)
                    // Important: using '[name][ext]' prevents creating nested 'dist' folder in output
                },
                // Copy your model assets
                { from: 'assets/model', to: 'model' }, // Copies assets/model/* to dist/model/*
                // Copy your tokenizer assets
                { from: 'assets/tokenizer', to: 'tokenizer' }, // Copies assets/tokenizer/* to dist/tokenizer/*
                // Copy your icons
                { from: 'assets/icons', to: 'icons' }, // Copies assets/icons/* to dist/icons/*
                // Copy popup files
                { from: 'popup.html', to: 'popup.html' }, // Copies popup.html to dist/popup.html
                { from: 'popup.js', to: 'popup.js' },     // Copies popup.js to dist/popup.js
                 // Copy the manifest (optional: could generate it dynamically)
                 { from: 'manifest.json', to: 'manifest.json' }, // Process manifest last
            ],
        }),
    ],

    // Resolve modules - Helps Webpack find libraries
    resolve: {
        // Fallback needed for some Node.js core modules polyfilled by libraries (like path, fs)
        // onnxruntime-web might require some of these
        fallback: {
             "path": require.resolve("path-browserify"),
             "fs": false, // Indicate 'fs' is not available/needed in the browser
             "crypto": false, // Indicate 'crypto' is not available/needed
             "util": false, // Indicate 'util' is not available/needed
             "stream": false, // Indicate 'stream' is not available/needed
         }
    },

    // Source maps for easier debugging (optional)
    devtool: 'cheap-module-source-map',

    // Performance hints (optional)
    performance: {
         hints: false, // Turn off warnings about large bundle size (expected for ML models)
    },

     // Watch options (optional, for development)
     // watch: true, // Automatically rebuild when files change
     watchOptions: {
         ignored: /node_modules/,
     },
};