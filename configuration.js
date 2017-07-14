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

const sjc = require('simplejsonconf');
const path = require('path');
const glob = require('glob-promise');
const fs = require('fs-extra');

const opkg = require('./packages.js');
const othemes = require('./themes.js');
const outils = require('./utils.js');

const ISWIN = /^win/.test(process.platform);
const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Make a dictionary from array
 * @param {Array} list The list
 * @param {Fuction} fn A factory function
 * @return {Object}
 */
const makedict = (list, fn) => {
  let result = {};
  list.forEach((iter, idx) => {
    let data = fn(iter, idx);
    result[data[0]] = data[1];
  });
  return result;
};

/**
 * Fixes problems with windows paths
 * @param {String} str A path of sorts
 * @return {String}
 */
const fixWinPath = (str) => {
  if ( typeof str === 'string' && ISWIN ) {
    return str.replace(/(["\s'$`\\])/g, '\\$1').replace(/\\+/g, '/');
  }
  return str;
};

function setConfigPath(key, value, isTree, outputFile) {
  let cfgPath = path.join(ROOT, 'src', 'conf', '900-custom.json');
  if ( outputFile ) {
    const confDir = path.join(ROOT, 'src', 'conf');
    cfgPath = path.resolve(confDir, outputFile);
  }

  let conf = {};
  try {
    conf = fs.readJsonSync(cfgPath);
  } catch ( e ) {}

  try {
    const result = sjc.setJSON(conf, isTree ? null : key, value, {
      prune: true,
      guess: true
    });

    fs.writeFileSync(cfgPath, JSON.stringify(result, null, 2));
  } catch ( e ) {
    console.error(e.stack, e);
  }

  return value;
}

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Sets a configuration entry
 *
 * @param {String} key Query
 * @param {Mixed} value Value
 * @param {String} [importFile] Use this file instead of a value
 * @param {String} [outputFile] Use this output file instead of 900-custom.json
 * @return {Promise}
 */
const setConfiguration = (key, value, importFile, outputFile) => {
  key = key || '';

  function getNewTree(k, v) {
    let resulted = {};

    if ( k.length ) {
      const queue = k.split(/\./);
      let ns = resulted;
      queue.forEach((k, i) => {
        if ( i >= queue.length - 1 ) {
          ns[k] = v;
        } else {
          if ( typeof ns[k] === 'undefined' ) {
            ns[k] = {};
          }
          ns = ns[k];
        }
      });
    }

    return resulted;
  }

  if ( importFile ) {
    const importJson = fs.readJsonSync(importFile);
    const importTree = key.length ? getNewTree(key, importJson) : importJson;
    return Promise.resolve(setConfigPath(null, importTree, true));
  }

  if ( typeof value === 'undefined' ) {
    return Promise.reject('No value given');
  }

  return Promise.resolve(setConfigPath(key, value, false, outputFile));
};

/**
 * Gets configuration with a query
 *
 * @param {Object} config Configuration tree
 * @param {String} query Query
 * @param {Mixed} [defaultValue] Default value if undefined
 * @return {Object}
 */
const getConfiguration = (config, query, defaultValue) => sjc.getJSON(config, query, defaultValue);

/**
 * Resolves variables inside the configuration tree
 * @param {Object} object The temporary configuration tree
 * @return {Object}
 */
const resolveConfigurationVariables = (object) => {
  const safeWords = [
    '%VERSION%',
    '%DIST%',
    '%DROOT%',
    '%UID%',
    '%USERNAME%'
  ];

  // Resolves all "%something%" config entries
  let tmpFile = JSON.stringify(object).replace(/%ROOT%/g, fixWinPath(ROOT));
  const tmpConfig = JSON.parse(tmpFile);

  const words = tmpFile.match(/%([A-z0-9_\-\.]+)%/g).filter((() => {
    let seen = {};
    return function(element, index, array) {
      return !(element in seen) && (seen[element] = 1);
    };
  })());

  words.forEach((w) => {
    const p = w.replace(/%/g, '');
    const u = /^[A-Z]*$/.test(p);
    if ( safeWords.indexOf(w) === -1 ) {
      const value = (u ? process.env[p] : null) || getConfiguration(tmpConfig, p);
      const re = w.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '$1');
      tmpFile = tmpFile.replace(new RegExp(re, 'g'), String(value));
    }
  });

  return JSON.parse(tmpFile);
};

/**
 * Reads the configuration tree
 *
 * @return {Promise}
 */
const readConfigurationTree = () => new Promise((resolve, reject) => {
  let object = {};

  const basePath = path.join(ROOT, 'src', 'conf');
  glob(basePath + '/*.json').then((files) => {

    files.forEach((file) => {
      try {
        const json = fs.readJsonSync(file);
        object = outils.mergeObject(object, json);
      } catch ( e ) {
        console.warn('Failed parsing', path.basename(file), e);
      }
    });

    const finalConfiguration = Object.freeze(resolveConfigurationVariables(object));
    resolve(finalConfiguration);
  }).catch(reject);
});

/**
 * Builds our client configuration
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const buildClientConfiguration = (cfg, cli) => new Promise((resolve, reject) => {
  let settings = Object.assign({}, cfg.client);

  const preloads = Object.keys(settings.Preloads || {}).map((k) => {
    return settings.Preloads[k];
  });

  if ( !(settings.AutoStart instanceof Array) ) {
    settings.AutoStart = [];
  }

  if ( cli.option('standalone') ) {
    settings.Connection.Type = 'standalone';
  }

  settings.Debug = cli.option('debug') === true;
  settings.Broadway = cfg.broadway;

  if ( cfg.broadway.enabled ) {
    preloads.push({
      'type': 'javascript',
      'src': '/vendor/zlib.js'
    });
  }

  othemes.getMetadata(cfg, cli).then((themes) => {
    settings.Fonts.list = themes.fonts.concat(settings.Fonts.list);
    settings.Styles = themes.styles;
    settings.Sounds = makedict(themes.sounds, (iter) => {
      return [iter.name, iter.title];
    });
    settings.Icons = makedict(themes.icons, (iter) => {
      return [iter.name, iter.title];
    });

    opkg.getMetadata(cfg, cli, (pkg) => {
      return pkg && pkg.autostart === true;
    }).then((list) => {
      settings.AutoStart = settings.AutoStart.concat(Object.keys(list).map((k) => {
        return list[k].className;
      }));
      settings.MIME = cfg.mime;
      settings.Preloads = preloads;

      const src = path.join(ROOT, 'src', 'templates', 'dist', 'settings.js');
      const tpl = fs.readFileSync(src).toString();
      const dest = path.join(ROOT, 'dist', 'settings.js');
      const data = tpl.replace('%CONFIG%', JSON.stringify(settings, null, 4));

      const cont = () => fs.writeFile(dest, data).then(resolve).catch(reject);

      fs.mkdir(path.dirname(dest)).then(cont).catch(cont);
    }).catch(reject);
  }).catch(reject);
});

/**
 * Builds our server configuration
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const buildServerConfiguration = (cfg, cli) => new Promise((resolve, reject) => {
  let settings = Object.assign({}, cfg.server);

  opkg.getMetadata(cfg, cli, (pkg) => {
    return pkg && pkg.type === 'extension';
  }).then((extensions) => {
    const src = path.join(ROOT, 'src');
    Object.keys(extensions).forEach((e) => {

      if ( extensions[e].conf && extensions[e].conf instanceof Array ) {
        extensions[e].conf.forEach((c) => {
          const p = path.join(src, 'packages', extensions[e].path, c);

          try {
            const s = fs.readJsonSync(p);
            settings = outils.mergeObject(settings, s);
          } catch ( e ) {
            console.warn('Failed reading', path.basename(p), e);
          }
        });
      }
    });

    settings.mimes = cfg.mime.mapping;
    settings.broadway = cfg.broadway;
    settings.vfs.maxuploadsize = cfg.client.VFS.MaxUploadSize;

    const dest = path.join(ROOT, 'src', 'server', 'settings.json');
    const data = JSON.stringify(settings, null, 4);
    fs.writeFile(dest, data).then(resolve).catch(reject);
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  readConfigurationTree,
  getConfiguration,
  setConfiguration,
  buildClientConfiguration,
  buildServerConfiguration
};
