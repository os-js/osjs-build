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

const qs = require('querystring');
const path = require('path');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

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
 * Reads and iterates over overlay paths
 * @param {Object} cfg Configuration tree
 * @param {String} key Entry to fetch
 * @param {Function} onentry Iterative function (map function)
 * @return {Array}
 */
const readOverlayPaths = (cfg, key, onentry) => {
  onentry = onentry || ((p) => path.resolve(ROOT, p));

  const overlays = cfg.build.overlays;
  const paths = [];

  if ( overlays ) {
    Object.keys(overlays).forEach((n) => {
      const overlay = overlays[n];
      if ( overlay[key] instanceof Array ) {
        overlay[key].forEach((e, i) => {
          paths.push(onentry(e, i));
        });
      }
    });
  }

  return paths;
};

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
  return [
    path.join(ROOT, 'src/packages', repo)
  ].concat(readOverlayPaths(cfg, 'packages'));
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

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  mutateManifest,
  checkEnabledState,
  getPackagePaths,
  readOverlayPaths,
  mergeObject,
  execWebpack
};
