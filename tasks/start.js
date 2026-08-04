'use strict';

var nw = require('nw');
var pathUtil = require('path');
var childProcess = require('child_process');
var kill = require('tree-kill');
var utils = require('./utils');
var watch;

var gulpPath = pathUtil.resolve('./node_modules/.bin/gulp');
if (process.platform === 'win32') {
    gulpPath += '.cmd';
}

var runBuild = function () {
    return new Promise(function (resolve) {
        var build = childProcess.spawn(gulpPath, [
            'build',
            '--env=' + utils.getEnvName(),
            '--color'
        ], {
            stdio: 'inherit'
        });

        build.on('close', function (code) {
            resolve();
        });
    });
};

var runGulpWatch = function () {
    watch = childProcess.spawn(gulpPath, [
        'watch',
        '--env=' + utils.getEnvName(),
        '--color'
    ], {
        stdio: 'inherit'
    });

    watch.on('close', function (code) {
        // Gulp watch exits when error occured during build.
        // Just respawn it then.
        runGulpWatch();
    });
};

var runApp = async function () {
    var nwPath = await nw.findpath();
    var app = childProcess.spawn(nwPath, ['./build'], {
        stdio: 'inherit'
    });

    app.on('close', function (code) {
        // User closed the app. Kill the host process.
        kill(watch.pid, 'SIGKILL', function () {
            process.exit();
        });
    });
};

runBuild()
.then(function () {
    runGulpWatch();
    runApp();
});
