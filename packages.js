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

const colors = require('colors');
const glob = require('glob-promise');
const path = require('path');
const fs = require('fs-extra');
const promise = require('bluebird');
const outils = require('./utils.js');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads package metadata
 * @param {String} f The package metadata file
 * @param {String} [repo] The repository name
 * @return {Promise}
 */
const readMetadataFile = (f, repo) => new Promise((resolve, reject) => {
  const packageName = path.basename(path.dirname(f));
  const packageRepo = path.basename(path.dirname(path.dirname(f)));

  repo = repo || packageRepo;

  const name = [repo, packageName].join('/');
  const meta = fs.readJsonSync(f);

  meta._src = path.dirname(f.replace(ROOT + '/', ''));

  meta.type = meta.type || 'application';
  meta.path = name;
  meta.build = meta.build || {};
  meta.repo = repo;

  meta.preload = (meta.preload || []).concat(meta.sources || []).map((iter) => {
    if ( typeof iter === 'string' ) {
      let niter = {
        src: iter,
        type: null
      };

      if ( iter.match(/\.js/) ) {
        niter.type = 'javascript';
      } else if ( iter.match(/\.css/) ) {
        niter.type = 'stylesheet';
      } else if ( iter.match(/\.html/) ) {
        niter.type = 'html';
      }

      return niter;
    }

    return iter;
  });

  resolve(meta);
});

/**
 * Gets all packages from a repository
 * @param {Object} cfg Configuration tree
 * @param {String} repo The repository name
 * @return {Promise}
 */
function getRepositoryPackages(cfg, repo) {
  const result = {};
  const paths = outils.getPackagePaths(cfg, repo);
  const forceEnabled = cfg.packages.ForceEnable || [];
  const forceDisabled = cfg.packages.ForceDisable || [];

  const getAllMetadataFiles = () => new Promise((resolve, reject) => {
    let list = [];
    Promise.all(paths.map((p) => new Promise((yes, no) => {
      glob(path.join(p, '*', 'metadata.json')).then((g) => {
        list = list.concat(g);
        yes();
      }).catch(no);
    }))).then(() => resolve(list)).catch(reject);
  });

  return new Promise((resolve, reject) => {
    getAllMetadataFiles().then((files) => {
      Promise.all(files.map((f) => {
        return new Promise((yes, no) => {
          readMetadataFile(f, repo).then((metadata) => {
            metadata = Object.assign({}, metadata);

            const enabled = outils.checkEnabledState(forceEnabled, forceDisabled, metadata);
            if ( enabled ) {
              result[metadata.path] = metadata;
            }

            yes();
          }).catch(no);
        });
      })).then(() => resolve(result)).catch(reject);
    }).catch(reject);
  });
}

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Gets metadata for all the packages
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @param {Function} [filter] An optional filtering function
 * @return {Promise}
 */
const getMetadata = (cfg, cli, filter) => new Promise((resolve, reject) => {
  filter = filter || (() => true);

  const cliRepoString = cli.option('repositories', '').replace(/\s+/, '').trim();
  const cliRepos = cliRepoString ? cliRepoString.split(',') : [];

  let list = {};
  let repos = cliRepos.length ? cliRepos : cfg.repositories;

  const promises = repos.map((repo) => new Promise((yes, no) => {
    getRepositoryPackages(cfg, repo).then((packages) => {
      list = Object.assign(list, packages);
      yes();
    }).catch(no);
  }));

  Promise.all(promises).then(() => {
    const result = {};
    Object.keys(list).forEach((k) => {
      if ( filter(list[k], k) ) {
        result[k] = list[k];
      }
    });

    resolve(result);
  }).catch(reject);
});

/**
 * Gets metadata for a given package
 *
 * @param {Object} cfg Configuration tree
 * @param {String} name Package name
 * @return {Promise}
 */
const getPackageMetadata = (cfg, name) => new Promise((resolve, reject) => {
  const repo = name.split('/')[0];
  const paths = outils.getPackagePaths(cfg, repo);

  const found = paths.map((p) => {
    return path.join(p, name.split('/')[1], 'metadata.json');
  }).find(fs.existsSync);

  if ( found ) {
    readMetadataFile(found, repo).then(resolve).catch(reject);
  } else {
    reject('Package not found');
  }
});

/**
 * Builds the client manifest
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const buildClientManifest = (cfg, cli) => new Promise((resolve, reject) => {
  if ( !cli.option('standalone') ) {
    resolve();
    return;
  }

  const dest = path.join(ROOT, 'dist', 'packages.js');
  getMetadata(cfg, cli).then((packages) => {
    let tpl = fs.readFileSync(path.join(ROOT, 'src/templates/dist/packages.js'));
    tpl = tpl.toString().replace('%PACKAGES%', JSON.stringify(packages, null, 4));

    fs.writeFile(dest, tpl).then(resolve).catch(reject);
  }).catch(reject);
});

/**
 * Builds the client manifest
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const buildServerManifest = (cfg, cli) => new Promise((resolve, reject) => {
  const dest = path.join(ROOT, 'src', 'server', 'packages.json');
  getMetadata(cfg, cli).then((packages) => {
    const meta = outils.mutateManifest(packages);
    fs.writeFile(dest, JSON.stringify(meta, null, 4))
      .then(resolve).catch(reject);
  }).catch(reject);
});

/**
 * Builds given package
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @param {Ojbect} ygor Task builder instance
 * @param {String} name Package name
 * @return {Promise}
 */
const buildPackage = (cfg, cli, ygor, name) => new Promise((resolve, reject) => {
  name = name || cli.option('name');

  getPackageMetadata(cfg, name).then((metadata) => {
    console.info('Building', colors.green(metadata.path));

    outils.execWebpack(cli, ygor, path.resolve(ROOT, metadata._src))
      .then(resolve).catch(reject);
  }).catch(reject);
});

/**
 * Builds all packages
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @param {Ojbect} ygor Task builder instance
 * @return {Promise}
 */
const buildPackages = (cfg, cli, ygor) => new Promise((resolve, reject) => {
  getMetadata(cfg, cli).then((manifest) => {
    promise.each(Object.keys(manifest), (name) => {
      return buildPackage(cfg, cli, ygor, name);
    }).then(resolve).catch(reject);
  }).catch(reject);
});

/**
 * Generates a package
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @param {Ojbect} ygor Task builder instance
 * @return {Promise}
 */
const generatePackage = (cfg, cli, ygor) => new Promise((resolve, reject) => {
  const type = cli.option('type') || 'application';

  let fqpn = cli.option('name') || '';
  let split = fqpn.split('/');

  if ( !fqpn || !type || split.length !== 2 ) {
    return reject('Invalid package name or type');
  }

  const repo = split[0].replace(/[^A-z0-9\._]/g, '').replace(/\s+/g, ' ');
  const name = split[1].replace(/[^A-z0-9\._]/g, '').replace(/\s+/g, ' ');
  fqpn = [repo, name].join('/');

  let dest = cli.option('dest') || path.join(ROOT, 'src', 'packages');
  dest = path.join(dest, fqpn);

  if ( fs.existsSync(dest) ) {
    return reject(new Error(dest + ' already exists'));
  }

  const src = path.join(ROOT, 'src', 'templates', 'package', type);
  if ( !fs.existsSync(src) ) {
    return reject(new Error('No such package type'));
  }

  fs.copySync(src, dest);

  return glob(path.join(dest, '*.*')).then((files) => {
    files.forEach((f) => {
      let r = fs.readFileSync(f, 'utf-8');

      r = r.replace(/EXAMPLE/g, name);

      fs.writeFileSync(f, r);
    });

    console.log('Package', dest, 'generated');
    return resolve(true);
  }).catch(reject);
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  getMetadata,
  getPackageMetadata,
  generatePackage,
  readMetadataFile,
  buildClientManifest,
  buildServerManifest,
  buildPackages,
  buildPackage
};
