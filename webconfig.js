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
const path = require('path');
const fs = require('fs-extra');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);

///////////////////////////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////////////////////////

/*
 * Reads given config template and replaces any required strings
 */
function resolveConfig(cfg, src, mimecb) {
  const mimes = mimecb(cfg.mime);

  let tpl = fs.readFileSync(src).toString();
  tpl = tpl.replace(/%DISTDIR%/, path.join(ROOT, 'dist'));
  tpl = tpl.replace(/%MIMES%/, mimes);
  tpl = tpl.replace(/%PORT%/, cfg.server.http.port);
  return tpl;
}

///////////////////////////////////////////////////////////////////////////////
// TASKS
///////////////////////////////////////////////////////////////////////////////

const TASKS = {
  apache: function(cli, cfg) {
    const src = path.join(ROOT, 'src', 'templates', 'webserver', 'apache_vhost.conf');

    return Promise.resolve(resolveConfig(cfg, src, (mime) => {
      return '';
    }));
  },

  htaccess: function(cli, cfg) {
    const mimes = [];
    const proxies = [];

    Object.keys(cfg.mime.mapping).forEach((i) => {
      if ( i.match(/^\./) ) {
        mimes.push('  AddType ' + cfg.mime.mapping[i] + ' ' + i);
      }
    });

    Object.keys(cfg.server.proxies).forEach((k) => {
      if ( k.substr(0, 1) !== '/' && typeof cfg.server.proxies[k] === 'string' ) {
        proxies.push('     RewriteRule ' + k + ' ' + cfg.server.proxies[k] + ' [P]');
      }
    });

    function generate_htaccess(t) {
      const src = path.join(ROOT, 'src', 'templates', t);
      const dst = path.join(ROOT, 'dist', '.htaccess');

      let tpl = fs.readFileSync(src).toString();
      tpl = tpl.replace(/%MIMES%/, mimes.join('\n'));
      tpl = tpl.replace(/%PROXIES%/, proxies.join('\n'));
      fs.writeFileSync(dst, tpl);
      console.log('Wrote', dst);
    }

    if ( cli.option('env', 'dev') === 'dev' ) {
      generate_htaccess('webserver/dev-htaccess.conf');
    } else {
      generate_htaccess('webserver/prod-htaccess.conf');
    }

    return Promise.resolve();
  },

  lighttpd: function(cli, cfg) {
    const src = path.join(ROOT, 'src', 'templates', 'webserver', 'lighttpd.conf');

    return Promise.resolve(resolveConfig(cfg, src, (mime) => {
      return Object.keys(mime.mapping).map((i) => {
        return i.match(/^\./) ? '  "' + i + '" => "' + mime.mapping[i] + '"' : null;
      }).filter((i) => {
        return !!i;
      }).join(',\n');
    }));
  },

  nginx: function(cli, cfg) {
    const src = path.join(ROOT, 'src', 'templates', 'webserver', 'nginx.conf');

    return Promise.resolve(resolveConfig(cfg, src, (mime) => {
      return Object.keys(mime.mapping).map((i) => {
        return i.match(/^\./) ? ('        ' + mime.mapping[i] + ' ' + i.replace(/^\./, '') + ';') : null;
      }).filter((i) => {
        return !!i;
      }).join('\n');
    }));
  }
};

///////////////////////////////////////////////////////////////////////////////
// API
///////////////////////////////////////////////////////////////////////////////

/**
 * Generates a webconfig
 *
 * @param {Object} cfg Configuration tree
 * @param {Object} cli CLI wrapper
 * @return {Promise}
 */
const generateWebconfig = (cfg, cli) => new Promise((resolve, reject) => {
  const type = cli.option('type');
  const o = cli.option('out');

  if ( TASKS[type] ) {
    TASKS[type](cli, cfg).then(((txt) => {
      if ( txt ) {
        if ( o ) {
          fs.writeFileSync(o, txt);
          console.log('Wrote', o);
        }
      }

      resolve(true);
    })).catch(reject);
  } else {
    reject('No such configuration type');
  }
});

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////

module.exports = {
  generateWebconfig
};
