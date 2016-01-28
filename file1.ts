declare var dojo, dijit, dojox, com, net, jazz, CKEDITOR;
declare var _uploadURI;  // where is this defined?

// extend window for ckeditor gorp
interface Window {
    __ckeditor_def__?: any;
    CKEDITOR_BASEPATH?: any;
    Node?: any;  // what's this?
    com?: any;
    InterimResultClient?: any;
}

declare function require(moduleId: string) : any;
//declare var require: (moduleIds: string[], (a: any=>any)) => any;
namespace require {
    export var toUrl: (u: string) => string;
}
declare var djConfig;
declare var unescape: (s: string) => string;