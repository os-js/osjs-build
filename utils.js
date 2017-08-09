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

const fs = require('fs-extra');
const qs = require('querystring');
const path = require('path');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);
const ISWIN = /^win/.test(process.platform);
const DEBUG = process.env.OSJS_DEBUG ===  'true';
const STANDALONE = process.env.OSJS_STANDALONE === 'true';

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Mutates package manifest (corrections etc)
 * @param {Object} packages Package list
 * @return {Object}
 */
function mutateManifest(packages) {
  packages = Object.assign({}, packages);

  Object.keys(packages).forEach((p) => {
    if ( packages[p].build ) {
      delete packages[p].build;
    }

    if ( typeof packages[p].enabled !== 'undefined' ) {
      delete packages[p].enabled;
    }

    if ( packages[p].type === 'service' ) {
      packages[p].singular = true;
    }
  });

  return packages;
}

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Check if given package is enabled or not
 * @param {Array} enabled All forcefully enabled packages
 * @param {Array} disabled All forcefully disabled packages
 * @param {Object} meta Package metadata
 * @return {Boolean}
 */
function checkEnabledState(enabled, disabled, meta) {
  const name = meta.path;
  const shortName = meta.path.split('/')[1];

  if ( String(meta.enabled) === 'false' ) {
    if ( enabled.indexOf(shortName) !== -1 || enabled.indexOf(name) !== -1 ) {
      return true;
    }
    return false;
  }

  if ( disabled.indexOf(shortName) !== -1 || disabled.indexOf(name) !== -1 ) {
    return false;
  }
  return true;
}

/**
 * Gets all package paths
 * @param {Object} cfg Configuration tree
 * @param {String} repo The repository name
 * @return {Array}
 */
function getPackagePaths(cfg, repo) {
  const base = [
    path.join(ROOT, 'src/packages', repo)
  ];

  return base.concat(cfg.overlays.map((f) => {
    return path.resolve(ROOT, f, 'packages', repo);
  }).filter((f) => fs.existsSync(f)));
}

/**
 * Gets filtered file
 * @param {String} i Filename
 * @return {Boolean}
 */
function getFiltered(i) {
  if ( i.match(/^dev:/) && !DEBUG ) {
    return false;
  }
  if ( i.match(/^prod:/) && DEBUG ) {
    return false;
  }
  if ( i.match(/^standalone:/) && !STANDALONE ) {
    return false;
  }
  return true;
}

/**
 * Merges two objects together (deep merge)
 * @param {Object} into Into this object
 * @param {Object} from From this object
 * @return {Object}
 */
const mergeObject = (into, from) => {
  function mergeJSON(obj1, obj2) {
    for ( let p in obj2 ) {
      if ( obj2.hasOwnProperty(p) ) {
        try {
          if ( obj2[p].constructor === Object ) {
            obj1[p] = mergeJSON(obj1[p], obj2[p]);
          } else {
            obj1[p] = obj2[p];
          }
        } catch (e) {
          obj1[p] = obj2[p];
        }
      }
    }
    return obj1;
  }
  return mergeJSON(into, from);
};

/**
 * A wrapper for executing Webpack
 * @param {Object} cli CLI
 * @param {Object} ygor Ygor
 * @param {String} cwd Working directory
 * @param {String} [params] Parameters to use
 * @return {Promise}
 */
const execWebpack = (cli, ygor, cwd, params) => {
  params = params || '';

  return ygor.shell('webpack' + (params ? ' ' + params : ''), {
    cwd: cwd,
    env: {
      OSJS_OPTIONS: qs.stringify(cli),
      OSJS_DEBUG: String(cli.debug === true),
      OSJS_STANDALONE: String(cli.standalone === true),
      OSJS_ROOT: ROOT
    }
  });
};

/**
 * Fixes problems with windows paths
 * @param {String} str A path of sorts
 * @param {Boolean} [slashes=false] Reverse slashes
 * @return {String}
 */
const fixWinPath = (str, slashes) => {
  if ( typeof str === 'string' && ISWIN ) {
    str = str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    if ( slashes ) {
      //str = str.replace(/(["\s'$`\\])/g, '\\$1').replace(/\\+/g, '/');
      str = str.replace(/\\/g, '/');
    }
  }

  return str;
};

const findFile = (cfg, filename) => {
  const overlays = cfg.overlays || [];
  const tries = ([
    path.join(ROOT, 'src', filename)
  ]).concat(overlays.map((o) => {
    return path.resolve(ROOT, o, filename);
  }));

  return tries.find((iter) => {
    return fs.existsSync(iter);
  });
};

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  fixWinPath,
  mutateManifest,
  checkEnabledState,
  getPackagePaths,
  mergeObject,
  execWebpack,
  getFiltered,
  findFile
};
