"use strict";

const gulp = require("gulp");
const jetpack = require("fs-jetpack");
const childProcess = require("child_process");

const { getEnvName, getNodeModulesDir } = require("./utils");

const projectDir = jetpack;
const rootDir = projectDir.cwd("./");
const destDir = projectDir.cwd("./build");

let manifest = rootDir.read("package.json", "json");

const paths = {
  filesToCopyFromRootDir: [
    "electron/**/*",
    "resources/onlykey_logo_128.png",
    "resources/ok-tray-logo.png",
    "resources/windows/icon.ico",
    "!release_node_modules/**/*",
    "!releases/**/*",
  ],
};

// -------------------------------------
// Tasks
// -------------------------------------

gulp.task("clean", function (callback) {
  return destDir.dirAsync(".", { empty: true }).then((res) => callback());
});

// Build the React UI into dist/ before assembling the package
gulp.task("ui", function (callback) {
  const child = childProcess.exec("npx vite build", (err) => callback(err));
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
});

var copyTask = function () {
  projectDir.copy("resources/onlykey_logo_128.png", destDir.path("icon.png"), {
    overwrite: true,
  });

  if (getEnvName() === "production") {
    console.log(`Copying node_modules from ${getNodeModulesDir()}...`);
    // the Electron runtime is a devDependency shipped by the release
    // tasks, never inside the app's node_modules
    rootDir.copy(`${getNodeModulesDir()}`, destDir.path("node_modules"), {
      matching: ["!nw/**/*", "!electron/**/*"],
      overwrite: true,
    });
  }

  // Mirror the repo layout (dist/ subdirectory) so electron/main.js can
  // resolve ../dist/index.html the same way it does in development
  var result = jetpack.copyAsync(projectDir.path("dist"), destDir.path("dist"), {
    overwrite: true,
  });
  result = result.then(() => {
    return jetpack.copyAsync(projectDir.path(), destDir.path(), {
      overwrite: true,
      matching: paths.filesToCopyFromRootDir,
    });
  });
  return result;
};

gulp.task("copy", copyTask);

gulp.task("finalize", function (done) {
  destDir.write("package.json", manifest);
  return done();
});

gulp.task("build", gulp.series("clean", "ui", "copy", "finalize"));
