'use strict';

var childProcess = require('child_process');
var jetpack = require('fs-jetpack');
var utils = require('./utils');

var projectDir;
var tmpDir;
var releasesDir;
var readyAppDir;
var manifest;

var init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');

    readyAppDir = tmpDir.cwd(manifest.name);
    return Promise.resolve();
};

var copyRuntime = function () {
    // The Electron runtime is a devDependency, so it always lives in the
    // regular node_modules (release_node_modules only holds the production
    // deps that ship inside the app).
    return projectDir.copyAsync('node_modules/electron/dist', readyAppDir.path(), { overwrite: true })
        .then(function () {
            // our app in resources/app replaces Electron's default app
            return readyAppDir.removeAsync('resources/default_app.asar');
        });
};

var copyBuiltApp = function () {
    return projectDir.copyAsync('build', readyAppDir.path('resources/app'), { overwrite: true });
};

var renameExecutable = function () {
    return jetpack.renameAsync(readyAppDir.path('electron.exe'), manifest.name + '.exe');
};

var prepareOsSpecificThings = function () {
    return projectDir.copyAsync('resources/windows/icon.ico', readyAppDir.path('icon.ico'));
};

var createInstaller = function () {
    return new Promise(function (resolve) {
        var finalPackageName = manifest.name + '_' + manifest.version + '.exe';
        var installScript = projectDir.read('resources/windows/installer.nsi');
        installScript = utils.replace(installScript, {
            name: manifest.name,
            productName: manifest.productName,
            version: manifest.version,
            exec: manifest.name + '.exe',
            src: readyAppDir.path(),
            dest: releasesDir.path(finalPackageName),
            icon: readyAppDir.path('icon.ico'),
            setupIcon: projectDir.path('resources/windows/setup-icon.ico'),
            banner: projectDir.path('resources/windows/setup-banner.bmp'),
        });
        tmpDir.write('installer.nsi', installScript);

        console.log('Building installer with NSIS...');

        // Remove destination file if already exists.
        releasesDir.remove(finalPackageName);

        // Note: NSIS have to be added to PATH (environment variables).
        var nsis = childProcess.spawn('makensis', [tmpDir.path('installer.nsi')]);
        nsis.stdout.pipe(process.stdout);
        nsis.stderr.pipe(process.stderr);
        nsis.on('close', function () {
            console.log('Installer ready!', releasesDir.path(finalPackageName));
            resolve();
        });
    });
};

var cleanClutter = function () {
    return tmpDir.removeAsync('.');
};

module.exports = function (params) {
    return init(params)
    .then(copyRuntime)
    .then(copyBuiltApp)
    .then(renameExecutable)
    .then(prepareOsSpecificThings)
    .then(createInstaller)
    .then(cleanClutter);
};
