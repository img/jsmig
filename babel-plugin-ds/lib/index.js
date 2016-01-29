"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports["default"] = function (_ref) {
	var t = _ref.types;

	/* separate all variable initializers into declarations and
    assignments. eg
 	   var x, y=4, z=[], a={h:4};
    
    into
 	   var x, y, z, a;
    y=4;
    z=[];
    a={h:4};
 	   application is to prep js codebase for conversion to typescript
    */
	return {
		visitor: {
			VariableDeclarator: function VariableDeclarator(path) {
				var id2 = t.expressionStatement(t.identifier("path.parent.type"));
				var identifier = path.node.id;
				var initializer = path.node.init;
				if (null != initializer) {
					path.node.init = null; // remove the initializer
					var varDecl = path.parent;
					var assignment = t.assignmentExpression("=", identifier, initializer);
					var stmt = t.expressionStatement(assignment);
					path.parentPath.insertAfter(stmt);
				}
			}
		}
	};
};

module.exports = exports["default"];
