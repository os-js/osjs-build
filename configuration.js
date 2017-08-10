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

const Promise = require('bluebird');
const sjc = require('simplejsonconf');
const path = require('path');
const glob = require('glob-promise');
const fs = require('fs-extra');

const opkg = require('./packages.js');
const othemes = require('./themes.js');
const outils = require('./utils.js');

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

function setConfigPath(key, value, isTree, outputFile, guess) {
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
      guess: typeof guess === 'undefined' || guess === true
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
 * Adds something to an array or object in the configuration tree
 *
 * @param {Object} config Configuration tree
 * @param {String} query Query
 * @param {String} [key] The key
 * @param {Mixed} value The value
 * @return {Object}
 */
const addConfiguration = (config, query, key, value) => new Promise((resolve, reject) => {
  let result;
  try {
    result = getConfiguration(config, query);
  } catch ( e ) {}

  if ( typeof result === 'undefined' || result === null ) {
    result = typeof key !== 'undefined' ? {} : [];
  }

  if ( typeof result !== 'object' ) {
    return reject(new Error('Invalid entry'));
  }

  if ( result instanceof Array ) {
    if ( result.indexOf(value) === -1 ) {
      result.push(value);
    } else if ( typeof key !== 'undefined' ) {
      result[key] = value;
    }
  } else {
    result[key] = value;
  }

  return resolve(setConfigPath(query, result, false, null, false));
});

/**
 * Remove something from an array or object in the configuration tree
 *
 * @param {Object} config Configuration tree
 * @param {String} query Query
 * @param {String} [key] The key
 * @param {Mixed} value The value
 * @return {Object}
 */
const removeConfiguration = (config, query, key, value) => new Promise((resolve, reject) => {
  let result;
  try {
    result = getConfiguration(config, query);
  } catch ( e ) {}

  if ( result !== null && typeof result === 'object' ) {
    if ( result instanceof Array ) {
      const idx = typeof key === 'number' ? key : result.indexOf(value);
      if ( idx  !== -1 ) {
        result.splice(idx, 1);
      }
    } else {
      if ( typeof result[key] !== 'undefined' ) {
        delete result[key];
      }
    }

    return resolve(setConfigPath(query, result, false, null, false));
  }

  return reject(new Error('Invalid entry'));
});

/**
 * Resolves variables inside the configuration tree
 * @param {Object} object The temporary configuration tree
 * @return {Object}
 */
const resolveConfigurationVariables = (object, overlay) => {
  const safeWords = [
    '%VERSION%',
    '%DIST%',
    '%DROOT%',
    '%UID%',
    '%USERNAME%'
  ];

  // Resolves all "%something%" config entries
  let tmpFile = JSON.stringify(object);
  tmpFile = tmpFile.replace(/%ROOT%/g, outils.fixWinPath(ROOT, true));
  if ( overlay ) {
    tmpFile = tmpFile.replace(/%OVERLAY%/g, outils.fixWinPath(overlay, true));
  }

  const words = (tmpFile.match(/%([A-z0-9_\-\.]+)%/g) || []).filter((() => {
    let seen = {};
    return function(element, index, array) {
      return !(element in seen) && (seen[element] = 1);
    };
  })());

  const tmpConfig = JSON.parse(tmpFile);
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

  const _read = (p, r) => {
    return new Promise((yes, no) => {
      glob(p + '/*.json').then((files) => {
        files.forEach((file) => {
          try {
            let json = fs.readJsonSync(file);
            if ( r ) {
              json = resolveConfigurationVariables(json, r);
            }
            object = outils.mergeObject(object, json);
          } catch ( e ) {
            console.warn('Failed parsing', path.basename(file), e);
          }
        });

        yes();
      }).catch(no);
    });
  };

  const basePath = path.join(ROOT, 'src', 'conf');
  _read(basePath).then(() => {
    const overlays = object.overlays || [];
    const paths = overlays.map((f) => {
      return path.resolve(ROOT, f, 'conf');
    }).filter((f) => fs.existsSync(f));

    Promise.each(paths, (iter) => {
      return _read(iter, path.dirname(iter));
    }).then(() => {
      const finalConfiguration = Object.freeze(resolveConfigurationVariables(object));
      resolve(finalConfiguration);
    }).catch(reject);
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
    settings.Connection.Connection = 'standalone';
    settings.Connection.Authenticator = 'standalone';
    settings.Connection.Storage = 'standalone';
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

    settings.overlays = cfg.overlays;
    settings.mimes = cfg.mime.mapping;
    settings.broadway = cfg.broadway;
    settings.vfs.maxuploadsize = cfg.client.VFS.MaxUploadSize;

    const dest = path.join(ROOT, 'src', 'server', 'settings.json');
    const data = JSON.stringify(settings, null, 4);
    fs.writeFile(dest, data).then(resolve).catch(reject);
  }).catch(reject);
});

/**
 * Adds a mountpoint
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const addMountpoint = (cfg, cli) => new Promise((resolve, reject) => {
  const template = {
    client: {
      VFS: {
        Mountpoints: {}
      }
    },
    server: {
      vfs: {
        mounts: {}
      }
    }
  };

  const name = cli.option('name');
  const desc = cli.option('description');
  const title = cli.option('title', name);
  const transport = cli.option('transport', 'osjs');
  const dest = cli.option('path');
  const ro = cli.option('ro') || false;

  if ( !name || !transport || !dest ) {
    return reject('Missing option(s)');
  }

  template.client.VFS.Mountpoints[name] = {
    enabled: true,
    title: title,
    description: desc,
    transport: transport,
    readOnly: ro
  };

  template.server.vfs.mounts[name] = {
    destination: dest,
    ro: ro
  };

  return resolve(setConfigPath(null, template, true));
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  readConfigurationTree,
  getConfiguration,
  setConfiguration,
  addConfiguration,
  addMountpoint,
  removeConfiguration,
  buildClientConfiguration,
  buildServerConfiguration
};
