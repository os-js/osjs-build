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
const ygor = require('ygor');
const promise = require('bluebird');
const path = require('path');
const fs = require('fs-extra');
const Mocha = require('mocha');
const glob = require('glob-promise');
const eslint = require('eslint');
const minimist = require('minimist');

const opkg = require('./packages.js');
const ocfg = require('./configuration.js');
const oweb = require('./webconfig.js');
const outils = require('./utils.js');

const ROOT = process.env.OSJS_ROOT || path.dirname(process.argv[1]);
const DEBUG = process.argv.indexOf('--debug') !== -1;

const getDefaultWebpackArgs = (cli) => {
  let args = [];

  if ( cli._ ) {
    args = cli._.slice(1);
  }

  if ( !args.length ) {
    args = ['--progress', '--hide-modules'];
  }

  return args.join(' ');
};

/**
 * Wrapper for CLI object
 * @param {Object} cli CLI
 * @return {Object}
 */
const cliWrapper = (cli) => {
  return {
    debug: DEBUG,
    cli: cli,
    option: (k, defaultValue) => {
      if ( typeof cli[k] === 'undefined' ) {
        return defaultValue;
      }
      return cli[k];
    }
  };
};

/**
 * Wrapper for creating new tasks
 * @param {Object} cli CLI
 * @param {Function} fn Callback function => (cfg, resolve, reject)
 * @return {Promise}
 */
const newTask = (cli, fn) => new Promise((resolve, reject) => {
  ocfg.readConfigurationTree().then((cfg) => {
    const promise = fn(cliWrapper(cli), cfg, resolve, reject);
    if ( promise instanceof Promise ) {
      promise.then(resolve).catch(reject);
    }
  }).catch(reject);
});

/*
 * All tasks
 */
const tasks = {

  'config:mount': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    ocfg.addMountpoint(cfg, cli).then(resolve).catch(reject);
  }),

  'config:set': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    const name = cli.option('name');
    ocfg.setConfiguration(name,
                          cli.option('value'),
                          cli.option('import'),
                          cli.option('out')
    ).then((value) => {
      console.log(name, '=', value);
      resolve();
    }).catch(reject);
  }),

  'config:add': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    const name = cli.option('name');
    ocfg.addConfiguration(cfg,
                          name,
                          cli.option('key'),
                          cli.option('value')
    ).then((value) => {
      console.log(name, '=', value);
      resolve();
    }).catch(reject);
  }),

  'config:remove': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    const name = cli.option('name');
    ocfg.removeConfiguration(cfg,
                             name,
                             cli.option('key'),
                             cli.option('value')
    ).then((value) => {
      console.log(name, '=', value);
      resolve();
    }).catch(reject);
  }),

  'config:get': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    const name = cli.option('name');
    if ( name ) {
      console.log(name, '=', ocfg.getConfiguration(cfg, name));
      resolve();
    } else {
      reject('You need to give --name');
    }
  }),

  'build:config': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    console.info('Building', colors.blue('configuration'));
    return Promise.all([
      ocfg.buildClientConfiguration(cfg, cli),
      ocfg.buildServerConfiguration(cfg, cli)
    ]);
  }),

  'build:themes': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    console.info('Building', colors.blue('themes'));

    const dir = path.resolve(ROOT, 'src/themes');
    return outils.execWebpack(cli, ygor, dir, getDefaultWebpackArgs(cli));
  }),

  'build:manifest': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    console.info('Building', colors.blue('manifest'));
    return Promise.all([
      opkg.buildClientManifest(cfg, cli),
      opkg.buildServerManifest(cfg, cli)
    ]);
  }),

  'build:packages': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    console.info('Building', colors.blue('packages'));
    opkg.buildPackages(cfg, cli, ygor).then(resolve).catch(reject);
  }),

  'build:package': (cli, ygor) => newTask(cli, (cli, cfg, resolve, reject) => {
    opkg.buildPackage(cfg, cli, ygor).then(resolve).catch(reject);
  }),

  'build:core': (cli, ygor) => {
    console.info('Building', colors.blue('core'));

    const dir = path.resolve(ROOT, 'src/client');
    return outils.execWebpack(cli, ygor, dir, getDefaultWebpackArgs(cli));
  },

  'build': (cli, ygor) => {
    const tasks = [
      'build:config',
      'build:manifest',
      'build:themes',
      'build:core',
      'build:packages'
    ];

    return promise.each(tasks, ygor.run);
  },

  'watch': (cli, ygor) => {

    const p = cli.package;
    if ( p ) {
      return newTask(cli, (cli, cfg, resolve, reject) => {
        opkg.getMetadata(cfg, cli, (pkg, n) => n === p).then((pkgs) => {
          if ( pkgs[p] ) {
            console.info('Starting', colors.blue('watch'), 'for', colors.green(p));
            return outils.execWebpack(cli, ygor, pkgs[p]._src, '--watch').then(resolve).catch(reject);
          }
          return reject('No such package');
        }).catch(reject);
      });
    }

    if ( cli.themes ) {
      console.info('Starting', colors.blue('watch'), 'for', colors.green('themes'));
      const dir = path.resolve(ROOT, 'src/themes');
      return outils.execWebpack(cli, ygor, dir, '--watch');
    }

    console.info('Starting', colors.blue('watch'));
    return outils.execWebpack(cli, ygor, path.resolve(ROOT, 'src/client'), '--watch');
  },

  'eslint': () => {
    return new Promise((resolve, reject) => {
      const files = [
        'Gruntfile.js',
        'src/*.js',
        'src/build/*.js',
        'src/server/node/*.js',
        'src/server/node/**/*.js',
        'src/client/javascript/*.js',
        'src/client/javascript/**/*.js',
        'src/packages/default/**/*.js',
        '!src/packages/default/**/locales.js'
      ];

      const formatter = eslint.CLIEngine.getFormatter();
      const engine = new eslint.CLIEngine({
        configFile: '.eslintrc'
      });

      let report;
      try {
        report = engine.executeOnFiles(files);
      } catch ( e ) {
        reject(e);
        return;
      }

      const output = formatter(report.results);
      console.log(output);
      if ( report.errorCount > 0 ) {
        reject(new Error('Errors was found'));
        process.exit(1);
      } else {
        resolve();
      }
    });
  },

  'mocha': () => {
    return new Promise((resolve, reject) => {
      const mocha = new Mocha({
        bail: true,
        reporter: 'spec',
        timeout: 2000
      });

      glob('src/server/test/node/*.js').then((files) => {
        files.forEach(mocha.addFile.bind(mocha));

        try {
          mocha.run((failureCount) => {
            let result = failureCount <= 0;
            if ( result ) {
              resolve();
            } else {
              reject(new Error('Mocha failed on ' + failureCount + ' file(s)'));
            }

            setTimeout(() => {
              process.exit(result ? 0 : 1);
            }, 500);
          });
        } catch ( e ) {
          reject(e);
        }
      }).catch(reject);
    });
  },

  'test': () => {
    return promise.each([
      'eslint',
      'mocha'
    ], ygor.run);
  },

  'run': () => {
    console.info('Starting', colors.blue('server'));

    const exe = path.resolve(ROOT, 'src/server/node/server.js');
    const args = process.argv.slice(2).join(' ');
    return ygor.shell(['node', '"' + exe + '"', args].join(' '));
  },

  'generate:package': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    return opkg.generatePackage(cfg, cli, ygor);
  }),

  'generate:config': (cli) => newTask(cli, (cli, cfg, resolve, reject) => {
    return oweb.generateWebconfig(cfg, cli, ygor);
  }),

  'help': () => {
    console.log(fs.readFileSync(path.resolve(__dirname, 'help.txt'), 'utf-8'));
    return true;
  }

};

module.exports = function() {
  // Override the Ygor minimist handling
  const cli = minimist(process.argv.slice(2), {
    string: 'value'
  });

  Object.keys(tasks).forEach((name) => ygor.task(name, function(c, y) {
    return tasks[name].call(this, cli, y);
  }));
};
