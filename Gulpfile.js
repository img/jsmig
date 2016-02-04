var plumber = require("gulp-plumber");
var through = require("through2");
var newer   = require("gulp-newer");
var babel   = require("gulp-babel");
var watch   = require("gulp-watch");
var gutil   = require("gulp-util");
var gulp    = require("gulp");
var debug   = require("gulp-debug");
var rename   = require("gulp-rename");

//var sourceRoot = "d:/dev/ng60-2/com.ibm.rdm.web/resources";
//var scripts = sourceRoot + "/artifact/AbstractResourceArtifactWidget.js";
var sourceRoot = "./src";
var scripts = sourceRoot + "/**/*.js";
//var dest = "d:/temp/ngjs/dng/TypeScriptHTMLApp1/resources";
//var scripts = "./src/**/*.js";
var dest = "./build";

var cwd = process.cwd();
gulp.task("default", ["build"]);

gulp.task("build", function () {
    return gulp.src(scripts, {base: sourceRoot})
//        .pipe(debug({title: "sources"}))
        .pipe(watch(scripts))
        .pipe(plumber({
            errorHandler: function (err) {
                gutil.log(err.stack);
            }
        }))
        .pipe(newer({dest:dest, map: function(p) {
            return p.replace(".js", ".ts");
        }}))
        .pipe(debug({title: "Compiling..."}))
        .pipe(babel({
            plugins: [
                [cwd + "/node_modules/babel-plugin-transform-typescript-prepare", {
                    literal_only:true,
                    to_ts:true }
                ]
            ],
            retainLines:true,
            compact:false}))
        .pipe(rename({extname: ".ts"}))
        .pipe(gulp.dest(dest));
});

gulp.task("watch", ["build"], function (callback) {
    watch(scripts, function () {
        gulp.start("build");
    });
});
