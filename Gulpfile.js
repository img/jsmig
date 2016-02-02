var plumber = require("gulp-plumber");
var through = require("through2");
var newer   = require("gulp-newer");
var babel   = require("gulp-babel");
var watch   = require("gulp-watch");
var gutil   = require("gulp-util");
var gulp    = require("gulp");
var path    = require("path");
var debug   = require("gulp-debug");

var scripts = "./packages/*/src/**/*.js";
var dest = "build";

var srcEx, libFragment;
console.log(path.win32);

if (path.win32 === path) {
    console.log("win32");
  srcEx = /(packages\\[^\\]+)\\src\\/;
  libFragment = "$1\\lib\\";
} else {
    console.log("not win32");
  srcEx = new RegExp("(packages/[^/]+)/src/");
  libFragment = "$1/lib/";
}

gulp.task("default", ["build"]);

gulp.task("build", function () {
  return gulp.src(scripts)
        .pipe(debug({title: "sources"}))
    .pipe(plumber({
      errorHandler: function (err) {
          debug("ccccc");
        gutil.log(err.stack);
      }
    }))
        .pipe(debug({title: "sources2"}))

    .pipe(through.obj(function (file, enc, callback) {
      file._path = file.path;
      file.path = file.path.replace(srcEx, libFragment);
        gutil.log("info", "'" + file.path + "'...");
      callback(null, file);
    }))
        .pipe(debug({title:"here"}))
/*    .pipe(newer(dest))
        .pipe(debug({title:"here2"}))
*/
    .pipe(through.obj(function (file, enc, callback) {
        debug({title:"here"})
        gutil.log("Compiling", "'" + file._path + "'...");
        callback(null, file);
    }))
        .pipe(debug({title:"to babel"}))

    .pipe(babel())
        .pipe(debug({title:"to dest"}, false))
    .pipe(gulp.dest(dest));
});

gulp.task("watch", ["build"], function (callback) {
  watch(scripts, function () {
    gulp.start("build");
  });
});
