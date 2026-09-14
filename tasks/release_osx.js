'use strict';

const jetpack = require('fs-jetpack');

let projectDir;
let releasesDir;
let tmpDir;
let finalAppDir;
let manifest;

const init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');

    finalAppDir = tmpDir.cwd(manifest.productName + '.app');
    return Promise.resolve();
};

const copyRuntime = function () {
    // The Electron runtime is a devDependency, so it always lives in the
    // regular node_modules (release_node_modules only holds the production
    // deps that ship inside the app).
    console.log('Copying Electron.app from node_modules/electron/dist...');
    return projectDir.copyAsync('node_modules/electron/dist/Electron.app', finalAppDir.path(), { overwrite: true })
        .then(function () {
            // our app in Resources/app replaces Electron's default app
            return finalAppDir.removeAsync('Contents/Resources/default_app.asar');
        });
};

const copyBuiltApp = function () {
    console.log('Copying /build contents into Contents/Resources/app...');
    return projectDir.copyAsync('build', finalAppDir.path('Contents/Resources/app'), { overwrite: true });
};

const prepareOsSpecificThings = function () {
    console.log('Doing OSX-specific things...');

    // Patch Electron's own Info.plist in place — replacing it wholesale
    // would drop keys the runtime needs.
    const plistPath = finalAppDir.path('Contents/Info.plist');
    let info = jetpack.read(plistPath);
    const plistValues = {
        CFBundleDisplayName: manifest.productName,
        CFBundleExecutable: manifest.productName,
        CFBundleName: manifest.productName,
        CFBundleIdentifier: 'to.crp.' + manifest.name,
        CFBundleShortVersionString: manifest.version,
        CFBundleVersion: manifest.version,
        CFBundleIconFile: 'icon.icns',
    };
    Object.keys(plistValues).forEach(function (key) {
        const matcher = new RegExp('(<key>' + key + '</key>\\s*<string>)[^<]*(</string>)');
        info = info.replace(matcher, '$1' + plistValues[key] + '$2');
    });
    jetpack.write(plistPath, info);

    // Icon
    projectDir.copy('resources/osx/icon.icns', finalAppDir.path('Contents/Resources/icon.icns'), { overwrite: true });

    // Rename executable to match CFBundleExecutable
    jetpack.rename(finalAppDir.path('Contents/MacOS/Electron'), manifest.productName);

    return Promise.resolve();
};

const packToDmgFile = function () {
    // hdiutil ships with macOS; it replaced the unmaintained appdmg package
    // (unfixable image-size advisories) and needs no native build.
    const childProcess = require('child_process');
    const dmgName = manifest.productName + '_' + manifest.version + '_' + process.arch + '.dmg';
    const dmgPath = releasesDir.path(dmgName);

    // Stage a folder holding the .app and an /Applications shortcut so the
    // mounted image offers the usual drag-to-install layout.
    const stageDir = tmpDir.dir('dmg-root', { empty: true });
    return stageDir.copyAsync(finalAppDir.path(), stageDir.path(manifest.productName + '.app'), { overwrite: true })
        .then(function () {
            return stageDir.symlinkAsync('/Applications', 'Applications');
        })
        .then(function () {
            releasesDir.remove(dmgName);
            console.log('Packaging to DMG file with hdiutil...');
            return new Promise(function (resolve, reject) {
                childProcess.execFile(
                    'hdiutil',
                    ['create', '-volname', manifest.productName, '-srcfolder', stageDir.path(), '-ov', '-format', 'UDZO', dmgPath],
                    function (error, stdout, stderr) {
                        if (error) {
                            console.error(stderr || stdout);
                            reject(error);
                            return;
                        }
                        console.log('DMG file ready!', dmgPath);
                        resolve();
                    }
                );
            });
        });
};

const cleanClutter = function () {
    return tmpDir.removeAsync('.');
};

module.exports = function (params) {
    return init(params)
    .then(copyRuntime)
    .then(copyBuiltApp)
    .then(prepareOsSpecificThings)
    .then(packToDmgFile)
    .then(cleanClutter);
};
