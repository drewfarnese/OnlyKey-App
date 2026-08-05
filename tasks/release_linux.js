'use strict';

var childProcess = require('child_process');
var jetpack = require('fs-jetpack');
var utils = require('./utils');

var projectDir;
var releasesDir;
var packName;
var packDir;
var tmpDir;
var readyAppDir;
var manifest;

var init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');

    packName = manifest.name + '_' + manifest.version;
    packDir = tmpDir.dir(packName);
    readyAppDir = packDir.cwd('opt', manifest.name);
    return Promise.resolve();
};

var copyRuntime = function () {
    // The Electron runtime is a devDependency, so it always lives in the
    // regular node_modules (release_node_modules only holds the production
    // deps that ship inside the app). Copies into /opt/<name>.
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
    return jetpack.renameAsync(readyAppDir.path('electron'), manifest.name);
};

var prepareOsSpecificThings = function () {
    // Icon referenced by the .desktop file
    projectDir.copy('resources/onlykey_logo_128.png', readyAppDir.path('icon.png'), { overwrite: true });

    // Create .desktop file from the template
    var desktop = projectDir.read('resources/linux/app.desktop');
    desktop = utils.replace(desktop, {
        name: manifest.name,
        productName: manifest.productName,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author
    });
    packDir.write('usr/share/applications/' + manifest.name + '.desktop', desktop);

    var udevRules = projectDir.read('resources/linux/49-onlykey.rules');
    packDir.write('etc/udev/rules.d/49-onlykey.rules' , udevRules);

    var postinst = projectDir.read('resources/linux/postinst');
    postinst = utils.replace(postinst, { name: manifest.name });
    // mode >=0755 и <=0775
    packDir.write('DEBIAN/postinst' , postinst, {mode: '755'});

    return Promise.resolve();
};

var updateRuntimeFileMode = function () {
    return new Promise(function (resolve) {
        console.log('chmodding electron runtime...');

        childProcess.exec('chmod -R 755 ' + readyAppDir.path(),
            function (error, stdout, stderr) {
                if (error || stderr) {
                    console.log("ERROR while chmodding electron runtime:");
                    console.log(error);
                    console.log(stderr);
                }
                resolve();
            });
    });
};

var packToDebFile = function () {
    return new Promise(function (resolve) {
        var debFileName = packName + '_amd64.deb';
        var debPath = releasesDir.path(debFileName);

        console.log('Creating DEB package...');

        // Counting size of the app in KiB
        var appSize = Math.round(readyAppDir.inspectTree('.').size / 1024);

        // Preparing debian control file
        var control = projectDir.read('resources/linux/DEBIAN/control');
        control = utils.replace(control, {
            name: manifest.name,
            description: manifest.description,
            version: manifest.version,
            author: manifest.author,
            size: appSize
        });
        packDir.write('DEBIAN/control', control);

        // Build the package (--root-owner-group makes the contents
        // root-owned without needing fakeroot)...
        childProcess.exec('dpkg-deb --root-owner-group -Zxz --build ' + packDir.path() + ' ' + debPath,
            function (error, stdout, stderr) {
                if (error || stderr) {
                    console.log("ERROR while building DEB package:");
                    console.log(error);
                    console.log(stderr);
                } else {
                    console.log('DEB package ready!', debPath);
                }
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
    .then(updateRuntimeFileMode)
    .then(copyBuiltApp)
    .then(renameExecutable)
    .then(prepareOsSpecificThings)
    .then(packToDebFile)
    .then(cleanClutter);
};
