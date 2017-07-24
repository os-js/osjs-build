/*!
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2017, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

const Webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');

const qs = require('querystring');
const path = require('path');
const ocfg = require('./configuration.js');
const opkg = require('./packages.js');
const outils = require('./utils.js');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

const BANNER = `
/**
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2017, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 * @preserve
 */
`;

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Gets default plugin list
 * @param {Object} cfg Configuration tree
 * @param {Object} options Options
 * @return {Array}
 */
function getPlugins(cfg, options) {
  const plugins = [
    new Webpack.BannerPlugin({
      banner: BANNER,
      raw: true
    }),
    new ExtractTextPlugin('[name].css')
  ];

  if ( options.clean ) {
    if ( options.package ) {
      const packageRoot = path.dirname(options.package);

      plugins.unshift(new CleanWebpackPlugin([
        path.basename(packageRoot)
      ], {
        root: path.dirname(packageRoot),
        exclude: []
      }));
    } else {
      plugins.unshift(new CleanWebpackPlugin([
        path.join(ROOT, 'dist', '*')
      ], {
        root: ROOT,
        exclude: ['packages', 'vendor', '.htaccess', '.gitignore']
      }));
    }
  }

  if ( options.minimize ) {
    plugins.push(new Webpack.optimize.UglifyJsPlugin({
      comments: /@preserve/,
      minimize: true,
      rebase: false,
      sourceMap: options.sourcemaps === true
    }));
  }

  return plugins;
}

/**
 * Parses options coming from OS.js build system
 * @param {Object} inp Merge with other input
 * @return {Object}
 */
function parseOptions(inp) {
  inp = inp || {};

  const env = qs.parse(process.env.OSJS_OPTIONS || '');
  const isNumeric = (n) => !isNaN(parseFloat(n)) && isFinite(n);
  const debugMode = process.env.OSJS_DEBUG === 'true';

  const options = Object.assign({
    debug: debugMode,
    minimize: !debugMode,
    sourcemaps: true,
    devtool: 'cheap-source-map',
    exclude: /(node_modules|bower_components)/,
    outputSourceMap: '[file].map',
    outputFileName: '[name].js'
  }, env, inp);

  // Our values does not come back identical :/
  Object.keys(options).forEach((k) => {
    const val = options[k];
    if ( val === 'true' ) {
      options[k] = true;
    } else if ( val === 'false' ) {
      options[k] = false;
    } else if ( isNumeric(val) ) {
      options[k] = Math.round(parseFloat(val));
    }
  });

  if ( options.debug && !inp.devtool ) {
    options.devtool = 'source-map';
  }

  return options;
}

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Creates base Webpack configuration for OS.js
 * @param {Object} options Options
 * @param {Boolean} [options.debug] Debug mode
 * @param {Boolean} [options.minimize] Minimize output
 * @param {Boolean} [options.sourcemaps] Generate source maps
 * @param {String} [options.devtool] Specify devtool
 * @return {Promise}
 */
const createConfiguration = (options) => new Promise((resolve, reject) => {
  options = parseOptions(options);

  const cssLoader = {
    loader: 'css-loader',
    options: {
      sourceMap: options.sourcemaps,
      minimize: options.minimize
    }
  };

  ocfg.readConfigurationTree().then((cfg) => {
    resolve({
      cfg: cfg,
      options: options,
      webpack: {
        plugins: getPlugins(cfg, options),
        devtool: options.devtool,

        watchOptions: {
          ignored: /\.tmp$/
        },

        resolve: {
          modules: [
            path.join(ROOT, 'src/client/javascript')
          ]
        },

        entry: {

        },

        output: {
          sourceMapFilename: options.outputSourceMap,
          filename: options.outputFileName
        },

        module: {
          loaders: [
            {
              test: /(scheme|dialogs)\.html$/,
              loader: 'osjs-scheme-loader'
            },
            {
              test: /\.(png|jpe?g|ico)$/,
              loader: 'file-loader'
            },
            {
              test: /\.html$/,
              loader: 'html-loader'
            },
            {
              test: /\.js$/,
              exclude: options.exclude,
              use: {
                loader: 'babel-loader',
                options: {
                  'presets': ['es2015'],
                  cacheDirectory: true,
                  plugins: [
                  ]
                }
              }
            },
            {
              test: /\.css$/,
              loader: ExtractTextPlugin.extract({
                fallback: 'style-loader',
                use: [cssLoader]
              })
            },
            {
              test: /\.less$/,
              loader: ExtractTextPlugin.extract({
                fallback: 'style-loader',
                use: [
                  cssLoader,
                  {
                    loader: 'less-loader',
                    options: {
                      sourceMap: options.sourcemaps
                    }
                  }
                ]
              })
            }
          ]
        }
      }
    });

  }).catch(reject);
});

/**
 * Creates base Webpack configuration for OS.js Packages
 * @param {String} metadataFile The metadata path of package
 * @param {Object} options Options
 * @param {Boolean} [options.debug] Debug mode
 * @param {Boolean} [options.minimize] Minimize output
 * @param {Boolean} [options.sourcemaps] Generate source maps
 * @param {String} [options.devtool] Specify devtool
 * @return {Promise}
 */
const createPackageConfiguration = (metadataFile, options) => new Promise((resolve, reject) => {
  options = options || {};
  options.package = metadataFile;

  opkg.readMetadataFile(metadataFile).then((metadata) => {
    const dest = path.join(ROOT, 'dist/packages', metadata.path);

    const packageRoot = path.dirname(metadataFile); // FIXME
    const packageEntry = {
      main: metadata.preload.map((preload) => outils.fixWinPath(preload.src))
    };

    createConfiguration(options).then((result) => {
      const wcfg = outils.mergeObject(result.webpack, {
        resolve: {
          modules: [
            outils.fixWinPath(packageRoot)
          ]
        },

        entry: packageEntry,

        output: {
          publicPath: './packages/' + metadata.path,
          path: outils.fixWinPath(dest)
        },

        externals: {
          'OSjs': 'OSjs'
        }
      });

      wcfg.module.loaders.push({
        test: /((\w+)\.(eot|svg|ttf|woff|woff2))$/,
        loader: 'file-loader?name=[name].[ext]'
      });

      resolve({
        cfg: result.cfg,
        webpack: wcfg
      });
    }).catch(reject);
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  createConfiguration,
  createPackageConfiguration
};
