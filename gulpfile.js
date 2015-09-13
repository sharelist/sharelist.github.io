var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var minifyCss = require('gulp-minify-css');

gulp.task('default', function () {

    gulp.src(['js/url.min.js', 'js/sha1.js', 'js/app.js'])
        .pipe(concat('sharelist.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('js/prod/'));

    return gulp.src('css/*.css')
        .pipe(concat('sharelist.min.css'))
        .pipe(minifyCss({compatibility: 'ie8'}))
        .pipe(gulp.dest('css/prod/'));
});