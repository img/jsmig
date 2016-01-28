export default function ({types: t}) {
  return {
    visitor: {
      VariableDeclarator(path) {
        var identifier = path.node.id;
        var initializer = path.node.init;
        if (null != initializer) {
        	path.node.id.name = path.node.id.name.split('').reverse().join('');
          	var varDecl = path.parent;
          	console.log(varDecl, parent);
          	var newInitializer = t.assignmentExpression("=", identifier, initializer);
          	path.insertAfter(newInitializer);
        }
      }
    }
  };
}
