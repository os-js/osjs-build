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

const glob = require('glob-promise');
const fs = require('fs-extra');
const path = require('path');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads metadata from a globbing
 * @param {String} dir Base directory
 * @param {Array} whitelist Whitelisted entries
 * @param {Boolean} isFont Toggle font reading
 * @return {Promise}
 */
const readMetadataFrom = (dir, whitelist, isFont) => new Promise((resolve, reject) => {
  const basePath = path.join(ROOT, 'src', 'themes');
  whitelist = whitelist || [];

  if ( isFont ) {
    glob(path.join(basePath, dir, '*', 'style.css')).then((files) => {
      resolve(files.map((check) => path.basename(path.dirname(check))));
    });
    return;
  }

  glob(path.join(basePath, dir, '*', 'metadata.json')).then((files) => {
    const list = files.filter((check) => {
      const d = path.basename(path.dirname(check));
      return whitelist.indexOf(d) >= 0;
    }).map((check) => fs.readJsonSync(check));

    resolve(list);
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Gets metadata for all the themes
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const getMetadata = (cfg, cli) => new Promise((resolve, reject) => {
  const result = {
    sounds: [],
    icons: [],
    fonts: [],
    styles: []
  };

  const keys = Object.keys(result);
  const promises = keys.map((n) => new Promise((yes, no) => {
    readMetadataFrom(n, cfg.themes[n], n === 'fonts')
      .then((list) => yes(result[n] = list))
      .catch(no);
  }));

  Promise.all(promises)
    .then(() => resolve(result))
    .catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  getMetadata
};
