const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development', 

    entry: {
        content: './src/content.js',
    },

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js',
        clean: true,
    },

    plugins: [
        new CopyPlugin({
            patterns: [
                // Copy necessary ONNX Runtime files from node_modules
                {
                    
                    from: 'node_modules/onnxruntime-web/dist/*.{wasm,mjs}',
                    to: '[name][ext]', 
                },
                
                { from: 'assets/model', to: 'model' },
                
                { from: 'assets/tokenizer', to: 'tokenizer' },
                
                { from: 'assets/icons', to: 'icons' },
                
                { from: 'popup.html', to: 'popup.html' },
                { from: 'popup.js', to: 'popup.js' },
                 
                 { from: 'manifest.json', to: 'manifest.json' },
            ],
        }),
    ],

    resolve: {
        fallback: {
             "path": require.resolve("path-browserify"),
             "fs": false,
             "crypto": false,
             "util": false,
             "stream": false,
         }
    },

    devtool: 'cheap-module-source-map',

    performance: {
         hints: false,
    },

    watchOptions: {
         ignored: /node_modules/,
     },
};