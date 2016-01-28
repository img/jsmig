var esprima = require("esprima");
var fs = require("fs");

var src = "test1.js";

var ast = esprima.parse(fs.readFileSync(src, {}));

console.log(JSON.stringify(ast));
