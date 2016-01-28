/*
 * Licensed Materials - Property of IBM
 * Copyright IBM Corp. 2007, 2015.  All Rights Reserved.
 *
 * US Government Users Restricted Rights - Use, duplication or disclosure
 * restricted by GSA ADP Schedule Contract with IBM Corp.
 */

(function(){
dojo.provide("com.ibm.rdm.web.server.client.RDMClient");
dojo.require("com.ibm.rdm.web.server.cache.RDMCache");
dojo.require("com.ibm.rdm.web.common.ErrorHandler");
dojo.require("com.ibm.rdm.web.common.MessageHandler");
dojo.require("com.ibm.rdm.web.common.StatusDisplay");
dojo.require("com.ibm.rdm.web.server.Headers");
dojo.require("com.ibm.rdm.web.util.domutils");
dojo.require("com.ibm.rdm.web.util.queryutils");
dojo.require("com.ibm.rdm.web.util.vvcutils");
dojo.require("com.ibm.rdm.web.server.client.utils.ConfigurationWarningHandler");


dojo.require("jazz.app.auth");
dojo.require("jazz.app.proxy");
dojo.require("jazz.client.xhr");
dojo.require("com.ibm.rdm.web.locks.LockManager");

var LockManager = com.ibm.rdm.web.locks.LockManager;
var ErrorHandler = com.ibm.rdm.web.common.ErrorHandler;
var MessageHandler = com.ibm.rdm.web.common.MessageHandler;
var RDMCache = com.ibm.rdm.web.server.cache.RDMCache;
var Headers = com.ibm.rdm.web.server.Headers;
var JazzClient = jazz.client;
var domutils = com.ibm.rdm.web.util.domutils;
var VvcUtils = com.ibm.rdm.web.util.vvcutils;
var StatusDisplay = com.ibm.rdm.web.common.StatusDisplay;
var ConfigurationWarningHandler = com.ibm.rdm.web.server.client.utils.ConfigurationWarningHandler;

// This is the default number of PUT/POST operations that will be performed
// at once in the doMultiRequest call.
var DEFAULT_MULTI_SAVE_CHUNK_SIZE = 25;

var MREQ_RDF_OPEN = "<rdf:RDF xmlns:rrm=\"http://www.ibm.com/xmlns/rrm/1.0/\" xmlns:rrmMulti=\"http://com.ibm.rdm/multi-request#\" xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n";
var MREQ_RDF_CLOSE = "</rdf:RDF>\n";
var MREQ_NAMESPACE = "http://com.ibm.rdm/multi-request#";
var RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

com.ibm.rdm.web.server.client.RDMClient = {
	///////////////////////////////////////////////////////////////////////////////////
	// PUBLIC FIELDS
	HTTP_METHOD_GET: 		"GET",
	HTTP_METHOD_POST: 		"POST",
	HTTP_METHOD_HEAD: 		"HEAD",
	HTTP_METHOD_PUT: 		"PUT",
	HTTP_METHOD_DELETE: 	"DELETE",
	
	CACHE_TYPE_UPDATECONTEXT:	"UpdateContext",	//default cache that only relies on UpdateContext value when no etag found in the response header
	CACHE_TYPE_IFNONEMATCH_ETAG:"IfNoneMatch",		//this is a desired cache is used by default if an etag was found in the response header
	
	///////////////////////////////////////////////////////////////////////////////////
	// API
	
	doGet: function(args) {
		/*args: {
			uri,			String - requested resource uri
			revision,		String - resource revision id
			projectSnapshotURI, 	String - project snapshot (fully qulified URI) (revision required)
			componentURI,		String - fully qualified projct uri or comma separated list of project uris
			xhrArgs,		dojo.__XhrArgs - additional arguments to be overriden
			parser,			Class or Function
			skipCache,		Boolean - flag to skip internal cache
			skipErrors,		Boolean - flag to skip error messages in the error section
			cacheType,		RDMClient.CACHE_TYPE,
			cancelDeferreds	Boolean - flag to cancel all deferreds in the current update context,
			getLock			Boolean - flag to get the lock as well as the resource (and get the lock first).
			lockingURI		String - the uri of the resource to lock (if not present, this is assumed to be the same as the uri)
			correlationData Object - this object will be passed back unchanged in the response. Used to correlate info from request to response.
			skipConfigWarning Boolean - indicates that whether the client should act on a configuration warning that comes from the server.
		 }*/
		var getArgs = this._overrideDefaultArgs(args);
		return this._createXhrDeferred(this.HTTP_METHOD_GET, getArgs, args.parser);
	},
	
	doPost: function(args) {
		/*args: {
			uri,			String - requested resource uri
			componentURI,		String - fully qualified projct uri or comma separated list of project uris
			postData,		String - post data
			xhrArgs,		dojo.__XhrArgs - additional arguments to be overriden
			parser,			Class or Function
			skipCache,		Boolean - flag to skip internal cache
			skipErrors		Boolean - flag to skip error messages in the error section,
			cancelDeferreds	Boolean - flag to cancel all deferreds in the current update context
			delayCallbackUntilDataIndexed	Boolean - flag to delay callback until the updated resource data is indexed on server (see com.ibm.rdm.web.server.client.IndexingValidator) 
			capQueryExecutionTime	Boolean - flag to force query to stop running after a certain timeout - 36582: Cap query execution time
			correlationData Object - this object will be passed back unchanged in the response. Used to correlate info from request to response.
		 }*/
		args.skipCache = (args.skipCache == undefined)?true:args.skipCache;
		//callbacks will be delayed until the data is indexed unless specified otherwise
		args.delayCallbackUntilDataIndexed = (args.delayCallbackUntilDataIndexed == undefined)?true:args.delayCallbackUntilDataIndexed;
		var postArgs = this._overrideDefaultArgs(args);
		return this._createXhrDeferred(this.HTTP_METHOD_POST, postArgs, args.parser);
	},
	
	doPut: function(args) {
		/*args: {
			uri,			String - requested resource uri
			componentURI,		String - fully qualified projct uri or comma separated list of project uris
			putData,		String - put data
			xhrArgs,		dojo.__XhrArgs - additional arguments to be overriden
			parser,			Class or Function
			skipCache,		Boolean - flag to skip internal cache
			skipErrors		Boolean - flag to skip error messages in the error section,
			cancelDeferreds	Boolean - flag to cancel all deferreds in the current update context
			delayCallbackUntilDataIndexed	Boolean - flag to delay callback until the updated resource data is indexed on server (see com.ibm.rdm.web.server.client.IndexingValidator)
			releaseLock		Boolean - as well as putting this resource, release the lock as well.
			lockingURI	  String - the uri of the resource to lock (if not present, this is assumed to be the same as the uri),
			batch			Boolean - true if this put is to be batched using RMBulkSave
			correlationData Object - this object will be passed back unchanged in the response. Used to correlate info from request to response.
		 }*/
		var deferred;
		if (args.batch) {
			deferred = com.ibm.rdm.web.server.client._RMBulkSave.addPutToBatch(args);
			return deferred;
		}
			
		args.skipCache = (args.skipCache == undefined)?true:args.skipCache;
		//callbacks will be delayed until the data is indexed unless specified otherwise
		args.delayCallbackUntilDataIndexed = (args.delayCallbackUntilDataIndexed == undefined)?true:args.delayCallbackUntilDataIndexed;
		if (args.releaseLock) {
			deferred = LockManager.putAndRelease(args);
			return deferred;
		} else {
			var putArgs = this._overrideDefaultArgs(args);
			return this._createXhrDeferred(this.HTTP_METHOD_PUT, putArgs, args.parser);
		}
	},
	
	doDelete: function(args) {
		/*args: {
			uri,			String - requested resource uri
			componentURI,		String - fully qualified projct uri or comma separated list of project uris
			putData,		String - put data
			xhrArgs,		dojo.__XhrArgs - additional arguments to be overriden
			parser,			Class or Function
			skipCache,		Boolean - flag to skip internal cache
			skipErrors		Boolean - flag to skip error messages in the error section,
			cancelDeferreds	Boolean - flag to cancel all deferreds in the current update context
			delayCallbackUntilDataIndexed	Boolean - flag to delay callback until the updated resource data is indexed on server (see com.ibm.rdm.web.server.client.IndexingValidator)
			correlationData Object - this object will be passed back unchanged in the response. Used to correlate info from request to response.
		 }*/
		args.skipCache = (args.skipCache == undefined)?true:args.skipCache;
		//callbacks will be delayed until the data is indexed unless specified otherwise
		args.delayCallbackUntilDataIndexed = (args.delayCallbackUntilDataIndexed == undefined)?true:args.delayCallbackUntilDataIndexed;
		var deleteArgs = this._overrideDefaultArgs(args);
		return this._createXhrDeferred(this.HTTP_METHOD_DELETE, deleteArgs, args.parser);
	},
	
	doHead: function(args) {
		/*args: {
			uri,			String - requested resource uri
			componentURI,		String - fully qualified projct uri or comma separated list of project uris
			xhrArgs,		dojo.__XhrArgs - additional arguments to be overriden
			skipCache,		Boolean - flag to skip internal cache
			skipErrors		Boolean - flag to skip error messages in the error section,
			cancelDeferreds	Boolean - flag to cancel all deferreds in the current update context
		 }*/
		args.skipCache = (args.skipCache == undefined)?true:args.skipCache;
		var headArgs = this._overrideDefaultArgs(args);
		return this._createXhrDeferred(this.HTTP_METHOD_HEAD, headArgs, args.parser);
	},
	
	doMultiGet: function(
		reqArgsArray, /*Integer?*/chunkSize, /*Boolean?*/skipCache, /*String?*/componentURI, /*optional*/xhrArgs)
	{
		//var xhrArgs = {};
		reqArgsArray = dojo.map(reqArgsArray, function(arg) {
			arg.method = this.HTTP_METHOD_GET;
			return arg;
		}, this);
		if(!chunkSize) {
			// This maintains the legacy behavior of this call.
			chunkSize = reqArgsArray.length;
		}
		return this.doMultiRequest(reqArgsArray, reqArgsArray.length, skipCache, componentURI, xhrArgs);
	},
	
	doMultiRequest: function(
		reqArgsArray, /*Integer?*/chunkSize, /*Boolean?*/skipCache, /*String?*/componentURI, /*Object?*/xhrArgs)
	{
		// summary:
		//		Route a series of requests through the Multi-Request
		//		service. The Requests are executed on the server, and
		//		the results are returned after each has returned on
		//		the server. Currently supported methods are: GET,
		//		HEAD, POST and PUT. It does not support DELETE.
		// reqArgsArray:
		//		An array of objects which take the following form:
		//		{
		//		  method,				String - the HTTP method. 
		//		  uri,					String, Required - The URL to request (uri gets mapped to url later!)
		//		  xhrArgs.headers,		Object - Header: Value pairs (pushed to xhrArgs to avoid removal by RDMClient
		//		  postData,				String - The content to send to the
		//								server for POST requests
		//		  putData				String - The content to send to the
		//								server for PUT requests
		//		}
		//		Note: postData and putData are separate to conform to 
		//		the Dojo xhrArg API.
		// chunkSize:
		//		An integer which describes the maximum number of
		//		requests to send to the service in each batch. It is
		//		generally safer to make this number larger for GET
		//		and HEAD requests, but should stay low for POST and
		//		PUT requests.
		// skipCache:
		//		If you want to miss the cache. Defaults to false (but why I don't know - these multi commands should always go through! There is no mechanism to refresh them!)
		// xhrArgs:
		//		Arguments to include in the overall POST operation.  Typically contains header field which
		//		is name-value pairs hash.

		if(chunkSize != parseInt(chunkSize)) {
			chunkSize = DEFAULT_MULTI_SAVE_CHUNK_SIZE;
		}
		
		var multiRequestDfd = new dojo.Deferred();
		var results = [], handlePage;
		
		var makeChunkRequest = dojo.hitch(this, function() {
			var chunkReqArgs = reqArgsArray.splice(0, chunkSize);
			var multiReqPostData =
				this._assembleMultiRequestFragment(chunkReqArgs);
			var postRequestDfd = this.doPost({
				skipCache: skipCache,
				uri: com.ibm.rdm.web.FRONTING_SERVICE_MULTI_REQUEST,
				delayCallbackUntilDataIndexed: false,
				postData: multiReqPostData,
					// All multi requests need to pass in a project URI - default to "the project" if none provided
				componentURI: componentURI || com.ibm.rdm.web.CURRENT_COMPONENT,
				xhrArgs: xhrArgs
			});
			
			postRequestDfd.addCallback(handlePage);
			postRequestDfd.addErrback(this, function(error) {
				console.error("RDMClient.doMultiRequest failed", error);
				multiRequestDfd.errback(error);
			});
		});

		handlePage = dojo.hitch(this, function(multiReqResponses) {
			
			var parsedResponses =
				this._parseMultiRequestResponse(multiReqResponses);

			results = results.concat(parsedResponses);

			if(reqArgsArray.length) {
				makeChunkRequest();				
			}
			else {
				// I don't like this one bit, but it prevents having to
				// rewrite a large chunk of the ProjectCache for 3.0.x
				// --Christian
				results.isMultiResponse = true;
				multiRequestDfd.callback(results);
			}
			return multiReqResponses;
		});

		// Start the chain
		makeChunkRequest();

		return multiRequestDfd;
	},
	
	paginateThroughQueryResults: function(resultPagesArray, nextPageURI, parser, deferred) {
		// summary:
		//		Paginate through paged query results. Moved from
		//		ProjectCache for 50184.
		if (!deferred) {
			deferred = new dojo.Deferred();
		}
		if (nextPageURI) {
			var _nextPageDeferred = this.doGet({
				uri: nextPageURI,
				skipCache: true
			});
			_nextPageDeferred.addCallback(this, function(response){
				var _nextPageURI = com.ibm.rdm.web.util.queryutils.getNextPageURI(response.doc);
				if (_nextPageURI) {
					_nextPageURI = com.ibm.rdm.web.util.queryutils.getFullyQualifiedUriFromAbsoluteResourceAndRelativeResource(com.ibm.rdm.web.FRONTING_SERVICE_MULTI_FETCH, _nextPageURI);
				}
				resultPagesArray.push(parser(response));
				this.paginateThroughQueryResults(resultPagesArray, _nextPageURI, parser, deferred);
			});
			_nextPageDeferred.addErrback(this, function(errorResponse){
				deferred.errback(errorResponse);
			});
		}
		else {
			if (resultPagesArray && resultPagesArray[0] && dojo.isArray(resultPagesArray[0])) {
				var mergedPagesResultsArray = [];
				for (var i=0; i<resultPagesArray.length; i++) {
					for (var j=0; j<resultPagesArray[i].length; j++) {
						mergedPagesResultsArray.push(resultPagesArray[i][j]);
					}
				}
				deferred.callback(mergedPagesResultsArray);
			}
			else if (resultPagesArray && resultPagesArray[0] && !dojo.isArray(resultPagesArray[0])) {
				var mergedPagesResultsMap = {};
				for (var i=0; i<resultPagesArray.length; i++) {
					var pageMap = resultPagesArray[i];
					for (var mapKey in pageMap) {
						mergedPagesResultsMap[mapKey] = pageMap[mapKey];
					}
				}
				deferred.callback(mergedPagesResultsMap);
			}
			else {
				deferred.callback(null);
			}
		}
		return deferred;
	},

	executeBatchBulkSave: function() {
		return com.ibm.rdm.web.server.client._RMBulkSave.executeBatch();
	},
	
	///////////////////////////////////////////////////////////////////////////////////
	// Private API
	
	_createXhrDeferred: function(requestMethod, args, parser, cacheType) {
		var requestFunction = null;
		args._requestMethod = requestMethod;
		switch (requestMethod) {
			case this.HTTP_METHOD_GET:
				requestFunction = JazzClient.xhrGet;
				break;
			case this.HTTP_METHOD_POST:
				requestFunction = JazzClient.rawXhrPost;
				break;
			case this.HTTP_METHOD_HEAD:
				requestFunction = JazzClient.xhrHead;
				break;
			case this.HTTP_METHOD_PUT:
				requestFunction = JazzClient.rawXhrPut;
				break;
			case this.HTTP_METHOD_DELETE:
				requestFunction = JazzClient.xhrDelete;
				break;
		}
		var deferred = RDMCache.createCachedDeferred(requestFunction, args, parser);
		
		deferred.addErrback( function (response) { 
			if (response.ioArgs && !response.ioArgs.args._skipErrors) {
				MessageHandler.showXhrError(response, response.ioArgs);
			} 
			return response;
		});
		
		return deferred;
	},
	
	_overrideDefaultArgs: function(args) {
// 		UPDATE: 04/23/13: With RM Server JAF adoption, the process proxy is
//		unneccessary; requests can be made directly against rm:  /rm/process/project-areas		
//		//Route process/project area requests through the ProcessProxy
//		 if (args.uri && args.uri.indexOf(com.ibm.rdm.web.FRONTING_SERVICE_JFS_PROJECT_AREAS) == 0){
//			 args.uri = com.ibm.rdm.web.FRONTING_SERVICE_PROCESS_PROXY +"?uri=" + encodeURIComponent(args.uri);
//		 }
		
		var headers, xhrArgs;

		//add revision and snapshot query parameters
		if (args.revision) {
			// Make sure there isn't already a revision parameter.
			if(args.uri.indexOf("revision=") == -1){
				var paramStart = args.uri.indexOf("?");
				if(paramStart != -1) {
					// There's already parameters in the URI
					args.uri = args.revision + "&"
						+ args.uri.substring(paramStart+1);
				}
				else {
					args.uri = args.revision;
				}

				if (args.projectSnapshotURI) {
					var rrcBaseline = com.ibm.rdm.web.util.queryutils.getLastPathSegment(args.projectSnapshotURI);
					args.uri = args.uri + "&rrc:baseline=" + rrcBaseline;
				}
			}
		} else if (args.projectSnapshotURI) {
			//Add the project snapshot URI (which might be a module snapshot) independently.
			if (args.uri.indexOf("?") === -1){
				args.uri += "?";
			}
			else{
				args.uri += "&";
			}
			args.uri += "baseline=" + encodeURIComponent(args.projectSnapshotURI);
		}
		
		if(args.forceUseDefaultConfiguration){
			// Add a header that will trigger use of default config over any provided vvc configuration
			// For performance reason, this header is only looked up for certain calls. see server logic for details
			if (!args.xhrArgs) {
				args.xhrArgs = {};
			}
			xhrArgs = args.xhrArgs;
			if (!xhrArgs.headers) {
				xhrArgs.headers = {};
			}
			headers = xhrArgs.headers;
			headers[Headers.VVC_USE_DEFAULT_CONFIGURATION] = "true";
		}

		// If it is not already there, add a field to args in this form:
		// {
		//      xhrArgs: {
		//			headers: {}
		//		}
		// }
		xhrArgs = args.xhrArgs = args.xhrArgs || {};
		headers = xhrArgs.headers = xhrArgs.headers || {};
		
		// Consider adding the current LC and GC to the request
		// but following some rules
		// 1 - If there is an existing header, don't replace it
		// 2 - If we have a GC header and LC is missing, leave it missing

		if (!headers[Headers.VVC_OSLC_CONFIGURATION] && !headers[Headers.VVC_CONFIGURATION])
		{
			var currentGlobalConfig = VvcUtils.getGlobalConfigurationUri();
			if (currentGlobalConfig) {
				if ( headers[Headers.OSLC_Core_Version]) {
					headers[Headers.VVC_CONFIGURATION_CONTEXT_HEADER_NAME] = currentGlobalConfig;
				} else {
					headers[Headers.VVC_OSLC_CONFIGURATION] = currentGlobalConfig;
				}
			}
			else
			{
				if (!headers[Headers.VVC_CONFIGURATION])
				{
					var currentConfig = VvcUtils.getCurrentConfigurationUri();
					if (currentConfig) {
						headers[Headers.VVC_CONFIGURATION] = currentConfig;
					}
				}				
			}
		}
		
		

		
		//add project uri header
		if (args.componentURI) {
			
			// AVOID PASSING MULTIPLE PROJECT URIs - 35142: Timeout when searching on web client
			if (args.componentURI.indexOf(",") > 0) {
				return;
			}
			
			if (!args.xhrArgs) {
				args.xhrArgs = {};
			}
			if (!args.xhrArgs.headers) {
				args.xhrArgs.headers = {};
			}
			args.xhrArgs.headers[Headers.OWNING_CONTEXT] = args.componentURI;
		}
		
		//going forward we should permanently switch off dojo.preventCache, but for now ignore it only for a few select services
		//40664: types and tags services should not use dojo.preventCache
		var preventCache = true;
//		if (!this.isRrcService ||
//			args.uri.indexOf(com.ibm.rdm.web.FRONTING_SERVICE_TAGS) == 0 ||
//			args.uri.indexOf(com.ibm.rdm.web.FRONTING_SERVICE_TYPES) == 0
//		) {
//			preventCache = false;
//		}
		if (args.preventCache === false) {
			preventCache = args.preventCache;
		}

//		if (window.location.search.indexOf("?debug=true") !== -1){
//			try {
//				i.dont.exist+=0; //doesn't exist- that's the point
//			} 
//			catch(e) {
//				if (e.stack) { //Firefox
//			 		var lines = e.stack.split('\n');
//					for (var i=0, len=lines.length; i<len && i < 4; i++) {
//						// if (lines[i].match(/^\s*[A-Za-z0-9\-_\$]+\(/)) {
//							var line = lines[i];
//							if (line.indexOf("com.ibm.rdm.web/") !== -1){
//								line = line.split("com.ibm.rdm.web/")[1];
//								line = line.split("?")[0] + ":" + line.split(":")[1];
//							}
//							callstack.push(line);
//						// }
//					}
//					//Remove call to printStackTrace()
//					callstack.shift();
//					isCallstackPopulated = true;
//				}
//			}
//		}

		headers = {
			"Content-Type":	"text/plain",
			"Accept": "none",
			"DoorsRP-Request-Type": "private"
		};

		xhrArgs = {
			url: args.uri,
			getLock: args.getLock,
			releaseLock: args.releaseLock,
			lockingURI: args.lockingURI,
			correlationData: args.correlationData,
			handleAs: args.handleAs || "xml",
			preventCache: preventCache,
			timeout: com.ibm.rdm.web.FRONTING_PROPERTY_WEB_REQUEST_TIMEOUT,
			headers: headers,
			load: function(response, ioArgs) {
				return {
					doc: response,
					ioArgs: ioArgs
				};
			},
			error: function(response, ioArgs) {
				if (response.dojoType && response.dojoType == "cancel") {
					ErrorHandler.warn("Deferred cancelled: " + args.uri);
					return response;
				} else if (response.dojoType && response.dojoType == "timeout") {
					MessageHandler.showError(7557);
				}
				
				if (!ioArgs.args.failOk) {
					console.error(response);
				}
				response.ioArgs = ioArgs;
				return response;
			}
		};

		for (var argName in args.xhrArgs) {
			if (argName == "headers") {
				for (var header in args.xhrArgs[argName]) {
					xhrArgs[argName][header] = args.xhrArgs[argName][header];
				}
			}
			else {
				xhrArgs[argName] = args.xhrArgs[argName];
			}
		}
		if (args.postData) {
			xhrArgs.postData = args.postData;
			xhrArgs._requestContent = args.postData;
		}
		if (args.putData) {
			xhrArgs.putData = args.putData;
			xhrArgs._requestContent = args.putData;
		}
		if (args.capQueryExecutionTime) {
			//36582: Cap query execution time
			xhrArgs.headers[Headers.X_RM_QUERY_TIMEOUT_ENABLE] = "true";
			ErrorHandler.warn("Query will be capped");
		}

		xhrArgs._skipErrors = (args.skipErrors)?true:false;
		xhrArgs._skipCache = (args.skipCache)?true:false;
		xhrArgs._cacheType = (args.cacheType)?args.cacheType:null;
		xhrArgs._cancelDeferreds = (args.cancelDeferreds)?true:false;
		xhrArgs._delayCallbackUntilDataIndexed = (args.delayCallbackUntilDataIndexed)?true:false;
		xhrArgs._capQueryExecutionTime = (args.capQueryExecutionTime)?true:false;
		xhrArgs._skipConfigWarning = (args.skipConfigWarning)?args.skipConfigWarning:false;
		 
		return xhrArgs;
	},
	
	_assembleMultiRequestFragment: function(reqArgsArray) {
		var multiRequestPostData = [];
		multiRequestPostData.push(MREQ_RDF_OPEN);

		for (var i=0; i<reqArgsArray.length; i++) {
			var reqArgs = this._overrideDefaultArgs(reqArgsArray[i]);
			var method = reqArgsArray[i].method;
			multiRequestPostData.push("<rrmMulti:MultiRequest rdf:about=\"");
			multiRequestPostData.push(reqArgs.url);
			multiRequestPostData.push("\">");
			for (var headerName in reqArgs.headers) {
				multiRequestPostData.push("<rrmMulti:httpHeader rdf:parseType=\"Resource\"><rrmMulti:httpHeaderValue>");
				multiRequestPostData.push(domutils.getXMLEncodedText(reqArgs.headers[headerName]));
				multiRequestPostData.push("</rrmMulti:httpHeaderValue><rrmMulti:httpHeaderName>");
				multiRequestPostData.push(headerName);
				multiRequestPostData.push("</rrmMulti:httpHeaderName></rrmMulti:httpHeader>");
			}
			multiRequestPostData.push("<rrmMulti:httpMethod>");
			multiRequestPostData.push(method);
			multiRequestPostData.push("</rrmMulti:httpMethod>");
			if(reqArgs._requestContent) {
				multiRequestPostData.push("<rrmMulti:requestContent rdf:parseType=\"Literal\"><![CDATA[");
				multiRequestPostData.push(reqArgs._requestContent);
				multiRequestPostData.push("]]></rrmMulti:requestContent>");
			}
			multiRequestPostData.push("</rrmMulti:MultiRequest>\n");
		}
		multiRequestPostData.push(MREQ_RDF_CLOSE);
		
		return multiRequestPostData.join("");
	},
	
	isRrcService: function(serviceURI) {
		return serviceURI.indexOf(com.ibm.rdm.web.FRONTING_SERVICE_CONTEXT_ROOT) == 0;
	},
	
	_parseMultiRequestResponse: function(multiReqResponse) {

		var multiReponseNodes = domutils.getElementsByTagNameNS(
			multiReqResponse.doc, "MultiResponse", MREQ_NAMESPACE);

		var parsedResponses = dojo.map(multiReponseNodes,
			function(multiReponseNode) {

			var response = {headers: {}};
			var statusCodeNode = domutils.getSingleElementByTagNameNS(
				multiReponseNode, "statusCode", MREQ_NAMESPACE);
			var reasonPhraseNode = domutils.getSingleElementByTagNameNS(
				multiReponseNode, "reasonPhrase", MREQ_NAMESPACE);
			var httpHeaderNodes = domutils.getElementsByTagNameNS(
				multiReponseNode, "httpHeader", MREQ_NAMESPACE);
			var responseContentNode = domutils.getSingleElementByTagNameNS(
				multiReponseNode, "responseContent", MREQ_NAMESPACE);
			
			response.url = domutils.getAttributeNS(multiReponseNode, "about",
				RDF_NAMESPACE);
			response.statusCode = 
				parseInt(dojox.xml.parser.textContent(statusCodeNode));
			response.reasonPhrase = reasonPhraseNode && dojox.xml.parser.textContent(reasonPhraseNode);
			if (responseContentNode) {
				// WI: 73650.  This needs to be fixed when there is time.  The server might now
				// returns HTML inside the responseContent node of a multi response.  The web client
				// will try and parse this irrespective of the content type.
				// On Firefox the parse fails with an exception (e.g. no closing </hr> tag)
				// On Chrome it continues with a DOM representing the parsed HTML.
				// In ResourceUtil we will look for a 403 status code and then see if there
				// is a lock.  The lockResponseParser will interpret an empty response.doc
				// as a lock (this seems like another bug).  So by forcing an empty response.doc
				// when we cannot parse the responseContent, or we know that the responseContent
				// is HTML then we cause the ResourceUtil.performMultipleDeleteOperationByUri error
				// handling to show the correct dialog.  Note that this dialog does not state exactly
				// why the delete has failed in case of a 403 - just that it could be caused by locks.
				try {
					var responseXML = dojo.trim(dojox.xml.parser.textContent(responseContentNode));
					if (responseXML.indexOf("<html") !== 0) {
						response.doc = dojox.xml.parser.parse(responseXML);
					} else {
						response.doc = "";
					}
				} catch (parseError) {
					// carry on with an empty response.doc if we hit a parse error for some
					// reason.
					response.doc = "";
				}
			} else {
				response.doc = "";
			}
			
			dojo.forEach(httpHeaderNodes, function(headerNode) {
	
				var nameNode = domutils.getSingleElementByTagNameNS(headerNode,
					"httpHeaderName", MREQ_NAMESPACE);
				var valueNode = domutils.getSingleElementByTagNameNS(headerNode,
					"httpHeaderValue", MREQ_NAMESPACE);
				
				var name = dojox.xml.parser.textContent(nameNode);
				response.headers[name] =
					dojox.xml.parser.textContent(valueNode);
			}, this);
			
			return response;
		}, this);

		return parsedResponses;
	},
	
	error403RDFParser: function(responseXML) {
	
		if (!responseXML) {
			return {status: com.ibm.rdm.web.locks.LockServer.LOCK_FAILED};
		}
	
		var parser = new com.ibm.rdm.web.parsers.xml2json(responseXML);
		parser.parse(true);
		// <rdf:RDF
		//     xmlns:dcterms="http://purl.org/dc/terms/"
		//     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
		//     xmlns:rm="http://www.ibm.com/xmlns/rdm/rdf/"
		//     xmlns:xsd="http://www.w3.org/2001/XMLSchema#">
		//   <rm:Lock rdf:about="https://ibm-kf8pokoikib:9443/rm/resources/_skHCUamZEeG6B7BxpMRR4w">
		//     <dcterms:identifier rdf:resource="https://ibm-kf8pokoikib:9443/rm/locks/_skHCUamZEeG6B7BxpMRR4w"/>
		//     <dcterms:created rdf:datatype="http://www.w3.org/2001/XMLSchema#dateTime"
		//     >2012-05-31T17:30:14.953Z</dcterms:created>
		//     <dcterms:creator rdf:resource="https://ibm-kf8pokoikib:9443/jts/users/fred"/>
		//     <rm:persistent rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean"
		//     >false</rm:persistent>
		//   </rm:Lock>
		// </rdf:RDF>
		
		var resources = parser.getObjectsByNS("Lock", com.ibm.rdm.web.util.queryutils.RM_NAMESPACE);
		
		if (!resources || resources.length === 0) {
			return null;
		}
		
		var identifierKey = "identifier:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		var createdKey = "created:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		var creatorKey = "creator:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		
		var record = resources[0];
		var lockURI = record[identifierKey].xmlAttributes.resource;
		var user = record[creatorKey].xmlAttributes.resource;
		var utcDate = record[createdKey].value;
		var resourceURI = record.xmlAttributes["about"];		
		
		//We are returning a normal object, so futher callbacks should be invoked
		return {status: com.ibm.rdm.web.locks.LockServer.LOCKED_BY_OTHER, lockURI: lockURI,
					userURI: user, utcDate: utcDate, resourceURI: resourceURI};
	},
	
	error403RDFParserIE: function(responseText) {

			// <rdf:RDF
			//     xmlns:dcterms="http://purl.org/dc/terms/"
			//     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
			//     xmlns:rm="http://www.ibm.com/xmlns/rdm/rdf/"
			//     xmlns:xsd="http://www.w3.org/2001/XMLSchema#">
			//   <rm:Lock rdf:about="https://ibm-kf8pokoikib:9443/rm/resources/_skHCUamZEeG6B7BxpMRR4w">
			//     <dcterms:identifier rdf:resource="https://ibm-kf8pokoikib:9443/rm/locks/_skHCUamZEeG6B7BxpMRR4w"/>
			//     <dcterms:created rdf:datatype="http://www.w3.org/2001/XMLSchema#dateTime"
			//     >2012-05-31T17:30:14.953Z</dcterms:created>
			//     <dcterms:creator rdf:resource="https://ibm-kf8pokoikib:9443/jts/users/fred"/>
			//     <rm:persistent rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean"
			//     >false</rm:persistent>
			//   </rm:Lock>
			// </rdf:RDF>
			
		if (!responseText) {
			return null;
		}
		
		var identifierKey = "identifier:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		var createdKey = "created:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		var creatorKey = "creator:"+com.ibm.rdm.web.util.queryutils.DCTERMS_NAMESPACE;
		
		var lockURI = this._getTextBetween(responseText, ':identifier rdf:resource="', '"/>');
		
		if (!lockURI) {
			return null;
		}
		
		var user = this._getTextBetween(responseText, ':creator rdf:resource="', '"/>');
		var utcDate = this._getTextBetweenAfter(responseText, ':datatype="http://www.w3.org/2001/XMLSchema#dateTime"', '>', '</');
		
		var resourceURI = this._getTextBetween(responseText, ':about="', '">');	
		
		//We are returning a normal object, so futher callbacks should be invoked
		return {status: com.ibm.rdm.web.locks.LockServer.LOCKED_BY_OTHER, lockURI: lockURI,
					userURI: user, utcDate: utcDate, resourceURI: resourceURI};	
	},
	
	_getTextBetween: function(mainText, begin, end) {
		//Returns the text between the first begin text and the next end text.
		var result = "";
		var startIdx = mainText.indexOf(begin);
		
		if (startIdx > -1) {
			var endIdx = mainText.indexOf(end, startIdx + begin.length);
			result = mainText.substring(startIdx + begin.length, endIdx);
		}
		return result;
	},
	
	_getTextBetweenAfter: function(mainText, after, begin, end) {
		//Returns the text between the first 'begin' text after the 'after' text, and the next 'end' text.
		var result = "";
		var afterIdx = mainText.indexOf(after);
		var startIdx = mainText.indexOf(begin, afterIdx + after.length);
		
		if (startIdx > -1) {
			var endIdx = mainText.indexOf(end, startIdx + begin.length);
			result = mainText.substring(startIdx + begin.length, endIdx);
		}
		return result;
	}
};


var batch = [];


com.ibm.rdm.web.server.client._RMBulkSave = {
	// summary:
	//		This class covers Bulk Save functionality, specifically managing
	//		'batches' of saves (specifically PUTs), allowing them to be
	//		presented in one operation to the server.

	addPutToBatch: function(args) {
		// summary:
		//		Adds this request to the current batch.  Will wait until
		//		executeBatch is called before the whole batch is sent to
		//		server.
		// args:
		//		The arguments to base the request on.
		// returns:
		//		A deferred which will get called back with the appropriate
		//		response when the actual result is returned from the server.
		
		var deferred = new dojo.Deferred();
		args.method = com.ibm.rdm.web.server.client.RDMClient.HTTP_METHOD_PUT;
		
		batch.push([args, deferred]);
		
		return deferred;
	},
	
	executeBatch: function() {
		// summary:
		//		Executes the currently defined batch in one (or a small
		//		number of) requests.
		
		var argsArray = [];
		
		//Allow lookup of the request info from the results
		var argsMap = {};
		
		dojo.forEach(batch, function(reqArray) {
			argsArray.push(reqArray[0]);
			argsMap[reqArray[0].uri] = reqArray;
		});
		batch = [];
		return com.ibm.rdm.web.server.client.RDMClient.doMultiRequest(argsArray, null, true)
		      .addCallback(dojo.hitch(this, this._processBatchResponse, argsMap))
		      .addErrback(dojo.hitch(this, this._processBatchErrorResponse, argsMap));
		
		
	},
	
	
	_processBatchResponse: function(argsMap, multiResponse) {
		// summary:
		//		Deals with the results of the multi response, calling back
		//		as appropriate.
		
		// If the batch put requests indicate releasing locks, gather these locks and
		// release them now that the multirequest process has completed.
		var locks = [];
		dojo.forEach(multiResponse, function(response) {
			var reqArray = argsMap[response.url];
			var batchItem = reqArray[0];
			if (batchItem.releaseLock) {
				locks.push(batchItem.lockingURI);
			}
		});
		LockManager.releaseLockedResources(locks).then(dojo.hitch(this, function() {
		
    		dojo.forEach(multiResponse, function(response) {
    			
    			var statusCode = response.statusCode,
    				reqArray = argsMap[response.url],
    				deferred = reqArray[1];
    				
    			if (statusCode >= 200 && statusCode <= 299) {
    				// A success status code.  Return the response to the caller
    				//Need a function to map the getResponseHeader function onto the existing headers
    				dojo.setObject("ioArgs.xhr.getResponseHeader", function(name){
    					if (name === "Etag") {
    						name = "ETag";
    					}
    					return response.headers[name];
    				}, response);
    				dojo.setObject("ioArgs.xhr.status", statusCode, response);
    				
    				deferred.callback(response);
    			} else {
    				// An error status code (not in the 200 range).  Send the original deferred into error.
    				// TODO: Probably we should put more information in the error (info about the request and
    				// other info we have available from the response).  It would be nice to at least have
    				// status in there.  However, the Error object seems to be immutable, so we cannot add
    				// fields to it.  To add fields we would have to define a sub-class of Error.
    				var error = new Error("Operation failed in bulk save.  Status:" + statusCode);
    				dojo.setObject("ioArgs.xhr.status", statusCode, error);
    				if (response.reasonPhrase) {
    					error.ioArgs.xhr.reasonPhrase = response.reasonPhrase;
    				}
    				deferred.errback(error);
    			}
    		});
		}));
		
	},
	
	_processBatchErrorResponse: function(argsMap, error) {
		// summary:
		//		Process the error when the overall multi-post fails (rather than
		//		an individual operation within it failing). Sends all the
		//		deferreds in the batch into error.
		for (var uri in argsMap) {
			var deferred = argsMap[uri][1];
			deferred.errback(error);
		}
	}
};

})();
