'use strict';

const gulp = require('gulp');
const projectDir = require('fs-jetpack');
const { os } = require('./utils');

const tmpDir = projectDir.dir('./tmp', { empty: true });
const releasesDir = projectDir.dir('./releases');
const manifest = projectDir.read('package.json', 'json');

const releaseTasks = {
    osx: require('./release_osx'),
    linux: require('./release_linux'),
    windows: require('./release_windows'),
};

gulp.task('release', gulp.series(function releaseForOs() {
    return releaseTasks[os()]({
        manifest,
        projectDir,
        releasesDir,
        tmpDir
    });
}));
