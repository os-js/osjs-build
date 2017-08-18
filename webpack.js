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
const HtmlWebpackPlugin = require('html-webpack-plugin');
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const qs = require('querystring');
const fs = require('fs-extra');
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
    new ExtractTextPlugin('[name].css'),
    new Webpack.DefinePlugin({
      OSJS_DEBUG: !!options.debug
    })
  ];

  if ( options.minimize ) {
    plugins.push(new Webpack.optimize.UglifyJsPlugin({
      comments: /@preserve/,
      minimize: true,
      rebase: false,
      sourceMap: options.sourcemaps === true,
      compress: {
        warnings: options.debug === true,
        drop_console: options.debug !== true
      }
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

  const defaults = {
    debug: debugMode,
    minimize: !debugMode,
    sourcemaps: true,
    exclude: /(node_modules|bower_components)/,
    outputSourceMap: '[file].map',
    outputFileName: '[name].js'
  };

  const options = Object.assign({}, defaults, env, inp);

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

  if ( !options.devtool ) {
    //options.devtool = options.debug ? 'source-map' : 'cheap-source-map';
    options.devtool = options.debug ? 'inline-source-map' : 'source-map';
  }

  return options;
}

///////////////////////////////////////////////////////////////////////////////
// ASSETS
///////////////////////////////////////////////////////////////////////////////

const fixPath = (iter) => iter.replace(/^(dev|prod|standalone):/, '');
const getAbsolute = (filename) => path.resolve(ROOT, filename);

const getTemplateFile = (cfg, tpl, filename) => {
  return outils.findFile(cfg, path.join('templates/dist', tpl, filename));
};

const getIndexIncludes = (cfg) => {
  const result = {
    scripts: cfg.build.includes.scripts,
    styles: cfg.build.includes.styles
  };

  const overlays = cfg.build.overlays || {};
  Object.keys(overlays).forEach((n) => {
    const ol = overlays[n];
    if ( ol.includes ) {
      Object.keys(ol.includes).forEach((k) => {
        result[k] = result[k].concat(ol.includes[k]);
      });
    }
  });

  return {
    scripts: result.scripts.filter(outils.getFiltered).map(fixPath),
    styles: result.styles.filter(outils.getFiltered).map(fixPath)
  };
};

const getStaticFiles = (cfg) => {
  const mapAbsolute = (i) => {
    return {
      from: getAbsolute(fixPath(i))
    };
  };

  let files = cfg.build.static.filter(outils.getFiltered).map(mapAbsolute);
  Object.keys(cfg.build.overlays).forEach((name) => {
    const ol = cfg.build.overlays[name];
    files = files.concat(ol.static.filter(outils.getFiltered).map(mapAbsolute));
  });

  return files;
};

const findThemeFolders = (cfg, base) => {
  const overlays = cfg.overlays || [];
  return ([
    path.join(ROOT, 'src', base)
  ]).concat(overlays.map((o) => {
    return path.resolve(ROOT, o, base);
  })).filter((iter) => fs.existsSync(iter));
};

const findThemeFile = (cfg, base, name, filename) => {
  return outils.findFile(cfg, path.join(base, name, filename));
};

const getStyleFile = (cfg, style) => {
  return findThemeFile(cfg, 'themes/styles', style, 'style.less');
};

const getFontFile = (cfg, font) => {
  return findThemeFile(cfg, 'themes/fonts', font, 'style.css');
};

const getThemeFiles = (cfg) => {
  let files = [];
  files = files.concat(cfg.themes.fonts.map((f) => getFontFile(cfg, f)));
  files = files.concat(cfg.themes.styles.map((f) => getStyleFile(cfg, f)));

  return files.filter((f) => !!f);
};

const resolveConfiguration = (cfg, input, webpack, useOverlays) => {
  Object.keys(input.entry).forEach((k) => {
    input.entry[k] = input.entry[k]
      .filter(outils.getFiltered)
      .map(fixPath)
      .map(getAbsolute)
      .map(outils.fixWinPath);
  });

  // Overlays
  if ( useOverlays ) {
    Object.keys(cfg.build.overlays).forEach((name) => {
      const ol = cfg.build.overlays[name];
      const wp = ol.input;
      if ( wp ) {
        if ( wp.resolve && wp.resolve.modules ) {
          input.resolve.modules = input.resolve.modules.concat(wp.resolve.modules);
        }
        if ( wp.entry ) {
          Object.keys(wp.entry).forEach((en) => {
            if ( input.entry[en] ) {
              input.entry[en] = input.entry[en].concat(wp.entry[en]);
            } else {
              input.entry[en] = wp.entry[en];
            }
          });
        }
      }
    });
  }

  // Fixes "not an absolute path" problem in Webpack
  const finalConfig = outils.mergeObject(webpack, input);
  finalConfig.output.path = path.resolve(finalConfig.output.path);
  finalConfig.resolve.modules = finalConfig.resolve.modules.map(outils.fixWinPath);

  return finalConfig;
};

///////////////////////////////////////////////////////////////////////////////
// BASE CONFIGURATION
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

  const babelOptions = Object.assign({
    presets: ['es2015'],
    cacheDirectory: true,
    plugins: []
  }, options.babelOptions || {});

  const cssLoader = {
    loader: 'css-loader',
    options: {
      sourceMap: options.sourcemaps,
      minimize: options.minimize
    }
  };

  ocfg.readConfigurationTree().then((cfg) => {
    resolve({
      settings: cfg,
      options: options,
      config: {
        plugins: getPlugins(cfg, options),
        devtool: options.devtool,

        watchOptions: {
          ignored: /\.tmp$/
        },

        resolve: {
          modules: [
            path.resolve(ROOT, 'src/client/javascript')
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
              test: /\.jsx?$/,
              exclude: options.exclude,
              use: {
                loader: 'babel-loader',
                options: babelOptions
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
                      paths: [
                        path.resolve(ROOT, 'src/client/stylesheets')
                      ],
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

///////////////////////////////////////////////////////////////////////////////
// PACKAGE CONFIGURATION
///////////////////////////////////////////////////////////////////////////////

const createPackageConfiguration = (metadataFile, options) => new Promise((resolve, reject) => {
  options = options || {};
  options.package = metadataFile;

  opkg.readMetadataFile(metadataFile).then((metadata) => {
    const dest = path.join(ROOT, 'dist/packages', metadata.path);
    const buildEntry = metadata.build || {};

    const packageRoot = path.dirname(metadataFile);

    let packageEntry = metadata.main ? metadata.main.webpack : [];
    if ( !(packageEntry instanceof Array) || !packageEntry.length ) {
      packageEntry = ['main.js', 'main.css'];
    }

    createConfiguration(options).then((result) => {
      options = result.options;

      const publicPath = result.settings.build.webpack.output.publicPath || '';
      const root = 'packages/' + metadata.path + '/';

      const wcfg = outils.mergeObject(result.config, {
        resolve: {
          modules: [
            outils.fixWinPath(path.resolve(ROOT, 'node_modules')),
            outils.fixWinPath(path.resolve(packageRoot, 'node_modules')),
            outils.fixWinPath(packageRoot)
          ]
        },

        entry: packageEntry,

        output: {
          publicPath: publicPath,
          path: outils.fixWinPath(dest),
          //sourceMapFilename: root + options.outputSourceMap,
          //filename: root + options.outputFileName
          sourceMapFilename: options.outputSourceMap,
          filename: options.outputFileName
        },

        externals: {
          'OSjs': 'OSjs'
        }
      });

      if ( options.clean ) {
        wcfg.plugins.push(new CleanWebpackPlugin([
          path.basename(packageRoot)
        ], {
          root: path.dirname(packageRoot),
          exclude: []
        }));
      }

      if ( buildEntry.copy ) {
        const cpy = buildEntry.copy instanceof Array ? buildEntry.copy.map((f) => {
          return typeof f === 'string' ? {
            from: path.resolve(packageRoot, f),
            to: f
          } : f;
        }) : [];

        wcfg.plugins.push(new CopyWebpackPlugin(cpy, buildEntry.copyCoptions || {}));
      }

      wcfg.module.loaders.push({
        test: /((\w+)\.(eot|svg|ttf|woff|woff2))$/,
        loader: 'file-loader?name=[name].[ext]'
      });

      resolve({
        destination: root,
        settings: result.settings,
        config: wcfg
      });
    }).catch(reject);
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// CORE CONFIGURATION
///////////////////////////////////////////////////////////////////////////////

const createCoreConfiguration = (options) => new Promise((resolve, reject) => {
  options = options || {};
  options.exclude = /node_modules\/(?![axios|bluebird])/;

  createConfiguration(options).then((result) => {
    let {settings, config, options} = result;

    if ( options.verbose ) {
      console.log('Build options', JSON.stringify(options));
    }

    const webpackConfig = Object.assign({}, settings.build.webpack);
    if ( options.debug ) {
      webpackConfig.entry.test = [
        getAbsolute('node_modules/mocha/mocha.js'),
        getAbsolute('node_modules/mocha/mocha.css'),
        getAbsolute('src/client/test/test.js')
      ];
    }

    const finalConfig = resolveConfiguration(result.settings, webpackConfig, config);
    const chunkOrder = ['polyfill', 'common', 'test', 'locales', 'osjs'];

    finalConfig.plugins.push(new HtmlWebpackPlugin({
      template: getTemplateFile(settings, settings.build.template, 'index.ejs'),
      osjs: getIndexIncludes(settings),
      //chunks: chunkOrder,
      chunksSortMode: (a, b) => chunkOrder.indexOf(a.names[0]) - chunkOrder.indexOf(b.names[0])
    }));

    finalConfig.plugins.push(new FaviconsWebpackPlugin(
      getTemplateFile(settings, settings.build.template, 'favicon.png')
    ));

    finalConfig.plugins.push(new CopyWebpackPlugin(getStaticFiles(settings), {
      ignore: [
        '*.less'
      ]
    }));

    finalConfig.plugins.push(new Webpack.optimize.CommonsChunkPlugin({
      name: 'common',
      chunks: ['osjs', 'locales'],
      minChunks: (m) => {
        const context = m.context;
        if ( typeof context !== 'string' ) {
          return false;
        }
        return context.indexOf('node_modules') !== -1;
      }
    }));

    if ( options.clean ) {
      finalConfig.plugins.push(new CleanWebpackPlugin([
        'dist/*.*'
      ], {
        root: ROOT,
        verbose: options.verbose,
        exclude: ['themes', 'packages', 'vendor', '.htaccess', '.gitignore']
      }));
    }

    resolve({
      settings: result.settings,
      config: finalConfig
    });
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// THEME CONFIGURATION
///////////////////////////////////////////////////////////////////////////////

const createThemeConfiguration = (options) => new Promise((resolve, reject) => {
  options = options || {};

  createConfiguration(options).then((result) => {
    let {settings, config} = result;

    let files = findThemeFolders(settings, 'themes/wallpapers').map((f) => {
      return {
        context: getAbsolute(f),
        from: '*',
        to: 'themes/wallpapers'
      };
    });

    const mapAbsolute = (i) => {
      return {
        from: getAbsolute(fixPath(i))
      };
    };

    files = files.concat(settings.build.static.filter(outils.getFiltered).map(mapAbsolute));
    Object.keys(settings.build.overlays).forEach((name) => {
      const ol = settings.build.overlays[name];
      files = files.concat(ol.static.filter(outils.getFiltered).map(mapAbsolute));
    });

    files = files.concat(settings.themes.styles.map((i) => {
      return {
        from: findThemeFile(settings, 'themes/styles', i, 'theme.js'),
        to: 'themes/styles/' + i
      };
    }));

    files = files.concat(settings.themes.icons.map((i) => {
      return {
        from: findThemeFile(settings, 'themes/icons', i, ''),
        to: 'themes/icons/' + i
      };
    }));

    files = files.concat(settings.themes.sounds.map((i) => {
      return {
        from: findThemeFile(settings, 'themes/sounds', i, ''),
        to: 'themes/sounds/' + i
      };
    }));

    const webpackConfig = Object.assign({}, settings.build.webpack);
    webpackConfig.entry = {
      themes: getThemeFiles(settings)
    };

    const finalConfig = resolveConfiguration(result.settings, webpackConfig, config);

    if ( options.clean ) {
      finalConfig.plugins.push(new CleanWebpackPlugin([
        'dist/themes'
      ], {
        root: ROOT,
        verbose: options.verbose,
        exclude: ['packages', 'vendor', '.htaccess', '.gitignore']
      }));
    }

    finalConfig.plugins.push(new CopyWebpackPlugin(files, {
      ignore: [
        '*.less'
      ]
    }));

    finalConfig.module.loaders.push({
      test: /((\w+)\.(eot|svg|ttf|woff|woff2))$/,
      loader: 'file-loader?name=themes/fonts/[name].[ext]'
    });

    resolve({
      settings: result.settings,
      config: finalConfig
    });
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  createConfiguration,
  createCoreConfiguration,
  createPackageConfiguration,
  createThemeConfiguration
};
