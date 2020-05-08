const Log = require('Log');
const log = new Log('json-patch-duplex');
/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * json-patch-duplex.js version: 0.5.7
 * (c) 2013 Joachim Wester
 * MIT license
 */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var OriginalError = Error;
var jsonpatch;
(function (jsonpatch) {
    var _objectKeys = function (obj) {
        if (_isArray(obj)) {
            var keys = new Array(obj.length);
            for (var k = 0; k < keys.length; k++) {
                keys[k] = "" + k;
            }
            return keys;
        }
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                keys.push(i);
            }
        }
        return keys;
    };
    function _equals(a, b) {
        switch (typeof a) {
            case 'undefined': //backward compatibility, but really I think we should return false
            case 'boolean':
            case 'string':
            case 'number':
                return a === b;
            case 'object':
                if (a === null)
                    return b === null;
                if (_isArray(a)) {
                    if (!_isArray(b) || a.length !== b.length)
                        return false;
                    for (var i = 0, l = a.length; i < l; i++)
                        if (!_equals(a[i], b[i]))
                            return false;
                    return true;
                }
                var bKeys = _objectKeys(b);
                var bLength = bKeys.length;
                if (_objectKeys(a).length !== bLength)
                    return false;
                for (var i = 0; i < bLength; i++)
                    if (!_equals(a[i], b[i]))
                        return false;
                return true;
            default:
                return false;
        }
    }
    /* We use a Javascript hash to store each
     function. Each hash entry (property) uses
     the operation identifiers specified in rfc6902.
     In this way, we can map each patch operation
     to its dedicated function in efficient way.
     */
    /* The operations applicable to an object */
    var objOps = {
        add: function (obj, key) {
            obj[key] = this.value;
            return true;
        },
        remove: function (obj, key) {
            delete obj[key];
            return true;
        },
        replace: function (obj, key) {
            obj[key] = this.value;
            return true;
        },
        move: function (obj, key, tree) {
            var temp = { op: "_get", path: this.from };
            apply(tree, [temp]);
            apply(tree, [
                { op: "remove", path: this.from }
            ]);
            apply(tree, [
                { op: "add", path: this.path, value: temp.value }
            ]);
            return true;
        },
        copy: function (obj, key, tree) {
            var temp = { op: "_get", path: this.from };
            apply(tree, [temp]);
            apply(tree, [
                { op: "add", path: this.path, value: temp.value }
            ]);
            return true;
        },
        test: function (obj, key) {
            return _equals(obj[key], this.value);
        },
        _get: function (obj, key) {
            this.value = obj[key];
        }
    };
    /* The operations applicable to an array. Many are the same as for the object */
    var arrOps = {
        add: function (arr, i) {
            arr.splice(i, 0, this.value);
            return true;
        },
        remove: function (arr, i) {
            arr.splice(i, 1);
            return true;
        },
        replace: function (arr, i) {
            arr[i] = this.value;
            return true;
        },
        move: objOps.move,
        copy: objOps.copy,
        test: objOps.test,
        _get: objOps._get
    };
    /* The operations applicable to object root. Many are the same as for the object */
    var rootOps = {
        add: function (obj) {
            rootOps.remove.call(this, obj);
            for (var key in this.value) {
                if (this.value.hasOwnProperty(key)) {
                    obj[key] = this.value[key];
                }
            }
            return true;
        },
        remove: function (obj) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    objOps.remove.call(this, obj, key);
                }
            }
            return true;
        },
        replace: function (obj) {
            apply(obj, [
                { op: "remove", path: this.path }
            ]);
            apply(obj, [
                { op: "add", path: this.path, value: this.value }
            ]);
            return true;
        },
        move: objOps.move,
        copy: objOps.copy,
        test: function (obj) {
            return (JSON.stringify(obj) === JSON.stringify(this.value));
        },
        _get: function (obj) {
            this.value = obj;
        }
    };
    var observeOps = {
        add: function (patches, path) {
            var patch = {
                op: "add",
                path: path + escapePathComponent(this.name),
                value: this.object[this.name] };
            patches.push(patch);
        },
        'delete': function (patches, path) {
            var patch = {
                op: "remove",
                path: path + escapePathComponent(this.name)
            };
            patches.push(patch);
        },
        update: function (patches, path) {
            var patch = {
                op: "replace",
                path: path + escapePathComponent(this.name),
                value: this.object[this.name]
            };
            patches.push(patch);
        }
    };
    function escapePathComponent(str) {
        if (str.indexOf('/') === -1 && str.indexOf('~') === -1)
            return str;
        return str.replace(/~/g, '~0').replace(/\//g, '~1');
    }
    function _getPathRecursive(root, obj) {
        var found;
        for (var key in root) {
            if (root.hasOwnProperty(key)) {
                if (root[key] === obj) {
                    return escapePathComponent(key) + '/';
                }
                else if (typeof root[key] === 'object') {
                    found = _getPathRecursive(root[key], obj);
                    if (found != '') {
                        return escapePathComponent(key) + '/' + found;
                    }
                }
            }
        }
        return '';
    }
    function getPath(root, obj) {
        if (root === obj) {
            return '/';
        }
        var path = _getPathRecursive(root, obj);
        if (path === '') {
            throw new OriginalError("Object not found in root");
        }
        return '/' + path;
    }
    var beforeDict = [];
    var Mirror = (function () {
        function Mirror(obj) {
            this.observers = [];
            this.obj = obj;
        }
        return Mirror;
    })();
    var ObserverInfo = (function () {
        function ObserverInfo(callback, observer) {
            this.callback = callback;
            this.observer = observer;
        }
        return ObserverInfo;
    })();
    function getMirror(obj) {
        for (var i = 0, ilen = beforeDict.length; i < ilen; i++) {
            if (beforeDict[i].obj === obj) {
                return beforeDict[i];
            }
        }
    }
    function getObserverFromMirror(mirror, callback) {
        for (var j = 0, jlen = mirror.observers.length; j < jlen; j++) {
            if (mirror.observers[j].callback === callback) {
                return mirror.observers[j].observer;
            }
        }
    }
    function removeObserverFromMirror(mirror, observer) {
        for (var j = 0, jlen = mirror.observers.length; j < jlen; j++) {
            if (mirror.observers[j].observer === observer) {
                mirror.observers.splice(j, 1);
                return;
            }
        }
    }
    function unobserve(root, observer) {
        observer.unobserve();
    }
    jsonpatch.unobserve = unobserve;
    function deepClone(obj) {
        if (typeof obj === "object") {
            return JSON.parse(JSON.stringify(obj)); //Faster than ES5 clone - http://jsperf.com/deep-cloning-of-objects/5
        }
        else {
            return obj; //no need to clone primitives
        }
    }
    function observe(obj, callback) {
        var patches = [];
        var root = obj;
        var observer;
        var mirror = getMirror(obj);
        if (!mirror) {
            mirror = new Mirror(obj);
            beforeDict.push(mirror);
        }
        else {
            observer = getObserverFromMirror(mirror, callback);
        }
        if (observer) {
            return observer;
        }
        observer = {};
        mirror.value = deepClone(obj);
        if (callback) {
            observer.callback = callback;
            observer.next = null;
            var intervals = this.intervals || [100, 1000, 10000, 60000];
            if (intervals.push === void 0) {
                throw new OriginalError("jsonpatch.intervals must be an array");
            }
            var currentInterval = 0;
            var dirtyCheck = function () {
                generate(observer);
            };
            var fastCheck = function () {
                clearTimeout(observer.next);
                observer.next = setTimeout(function () {
                    dirtyCheck();
                    currentInterval = 0;
                    observer.next = setTimeout(slowCheck, intervals[currentInterval++]);
                }, 0);
            };
            var slowCheck = function () {
                dirtyCheck();
                if (currentInterval == intervals.length)
                    currentInterval = intervals.length - 1;
                observer.next = setTimeout(slowCheck, intervals[currentInterval++]);
            };
            if (typeof window !== 'undefined') {
                if (window.addEventListener) {
                    window.addEventListener('mousedown', fastCheck);
                    window.addEventListener('mouseup', fastCheck);
                    window.addEventListener('keydown', fastCheck);
                }
                else {
                    document.documentElement.attachEvent('onmousedown', fastCheck);
                    document.documentElement.attachEvent('onmouseup', fastCheck);
                    document.documentElement.attachEvent('onkeydown', fastCheck);
                }
            }
            observer.next = setTimeout(slowCheck, intervals[currentInterval++]);
        }
        observer.patches = patches;
        observer.object = obj;
        observer.unobserve = function () {
            generate(observer);
            clearTimeout(observer.next);
            removeObserverFromMirror(mirror, observer);
            if (typeof window !== 'undefined') {
                if (window.removeEventListener) {
                    window.removeEventListener('mousedown', fastCheck);
                    window.removeEventListener('mouseup', fastCheck);
                    window.removeEventListener('keydown', fastCheck);
                }
                else {
                    document.documentElement.detachEvent('onmousedown', fastCheck);
                    document.documentElement.detachEvent('onmouseup', fastCheck);
                    document.documentElement.detachEvent('onkeydown', fastCheck);
                }
            }
        };
        mirror.observers.push(new ObserverInfo(callback, observer));
        return observer;
    }
    jsonpatch.observe = observe;
    function generate(observer) {
        var mirror;
        for (var i = 0, ilen = beforeDict.length; i < ilen; i++) {
            if (beforeDict[i].obj === observer.object) {
                mirror = beforeDict[i];
                break;
            }
        }
        _generate(mirror.value, observer.object, observer.patches, "");
        if (observer.patches.length) {
            apply(mirror.value, observer.patches);
        }
        var temp = observer.patches;
        if (temp.length > 0) {
            observer.patches = [];
            if (observer.callback) {
                observer.callback(temp);
            }
        }
        return temp;
    }
    jsonpatch.generate = generate;
    // Dirty check if obj is different from mirror, generate patches and update mirror
    function _generate(mirror, obj, patches, path) {
        var newKeys = _objectKeys(obj);
        var oldKeys = _objectKeys(mirror);
        var changed = false;
        var deleted = false;
        //if ever "move" operation is implemented here, make sure this test runs OK: "should not generate the same patch twice (move)"
        for (var t = oldKeys.length - 1; t >= 0; t--) {
            var key = oldKeys[t];
            var oldVal = mirror[key];
            if (obj.hasOwnProperty(key)) {
                var newVal = obj[key];
                if (typeof oldVal == "object" && oldVal != null && typeof newVal == "object" && newVal != null) {
                    _generate(oldVal, newVal, patches, path + "/" + escapePathComponent(key));
                }
                else {
                    if (oldVal != newVal) {
                        changed = true;
                        patches.push({ op: "replace", path: path + "/" + escapePathComponent(key), value: deepClone(newVal) });
                    }
                }
            }
            else {
                patches.push({ op: "remove", path: path + "/" + escapePathComponent(key) });
                deleted = true; // property has been deleted
            }
        }
        if (!deleted && newKeys.length == oldKeys.length) {
            return;
        }
        for (var t = 0; t < newKeys.length; t++) {
            var key = newKeys[t];
            if (!mirror.hasOwnProperty(key)) {
                patches.push({ op: "add", path: path + "/" + escapePathComponent(key), value: deepClone(obj[key]) });
            }
        }
    }
    var _isArray;
    if (Array.isArray) {
        _isArray = Array.isArray;
    }
    else {
        _isArray = function (obj) {
            return obj.push && typeof obj.length === 'number';
        };
    }
    //3x faster than cached /^\d+$/.test(str)
    function isInteger(str) {
        var i = 0;
        var len = str.length;
        var charCode;
        while (i < len) {
            charCode = str.charCodeAt(i);
            if (charCode >= 48 && charCode <= 57) {
                i++;
                continue;
            }
            return false;
        }
        return true;
    }
    /// Apply a json-patch operation on an object tree
    function apply(tree, patches, validate) {
        var result = false, p = 0, plen = patches.length, patch, key;

        const retries = {}; // resolvePath only needs to run once per patch 

        while (p < plen) {
            try {
              patch = patches[p];
              p++;
              // Find the object
              var path = patch.path || "";
              var keys = path.split('/');
              var obj = tree;
              var t = 1; //skip empty element - http://jsperf.com/to-shift-or-not-to-shift
              var len = keys.length;
              var existingPathFragment = undefined;

              // traverse to edge node
              while (true) {
                  key = keys[t];
                  if (validate) {
                      if (existingPathFragment === undefined) {
                          if (obj[key] === undefined) {
                              existingPathFragment = keys.slice(0, t).join('/');
                          }
                          else if (t == len - 1) {
                              existingPathFragment = patch.path;
                          }
                          if (existingPathFragment !== undefined) {
                              jsonpatch.mrValidator(patch, p - 1, tree, existingPathFragment); // resolves tree path as necessary
                              //this.validator(patch, p - 1, tree, existingPathFragment); commented this out in favor of mrValidator
                          }
                      }
                      validate = false; // reset 
                  }
                  t++;
                  if (key === undefined) {
                      if (t >= len) {
                          result = rootOps[patch.op].call(patch, obj, key, tree); // Apply patch
                          break;
                      }
                  }
                  if (_isArray(obj)) {
                      if (key === '-') {
                          key = obj.length;
                      }
                      else {
                          if (validate && !isInteger(key)) {
                              throw new JsonPatchError("Expected an unsigned base-10 integer value, making the new referenced value the array element with the zero-based index", "OPERATION_PATH_ILLEGAL_ARRAY_INDEX", p - 1, patch.path, patch);
                          }
                          key = parseInt(key, 10);
                      }
                      if (t >= len) {
                          if (validate && patch.op === "add" && key > obj.length) {
                              throw new JsonPatchError("The specified index MUST NOT be greater than the number of elements in the array", "OPERATION_VALUE_OUT_OF_BOUNDS", p - 1, patch.path, patch);
                          }
                          result = arrOps[patch.op].call(patch, obj, key, tree); // Apply patch
                          break;
                      }
                  }
                  else {
                      if (key && key.indexOf('~') != -1)
                          key = key.replace(/~1/g, '/').replace(/~0/g, '~'); // escape chars
                      if (t >= len) {
                          result = objOps[patch.op].call(patch, obj, key, tree); // Apply patch
                          break;
                      }
                  }
                  obj = obj[key];
              }
            } catch(e) {
                if (!retries[p-1]) { // p value needs to go back 1
                    retries[p-1] = 1; // mark patch number (p-1) as retried 
                    log.debug('retrying to apply patch:\n', patch);
                    validate = true;
                    p--;
                } else {
                    validate = false; // reset in case anything breaks during validation steps
                }
            }
        }

        return result;
    }

    jsonpatch.apply = apply;
    function compare(tree1, tree2) {
        var patches = [];
        _generate(tree1, tree2, patches, '');
        return patches;
    }
    jsonpatch.compare = compare;
    var JsonPatchError = (function (_super) {
        __extends(JsonPatchError, _super);
        function JsonPatchError(message, name, index, operation, tree) {
            _super.call(this, message);
            this.message = message;
            this.name = name;
            this.index = index;
            this.operation = operation;
            this.tree = tree;
        }
        return JsonPatchError;
    })(OriginalError);
    jsonpatch.JsonPatchError = JsonPatchError;
    jsonpatch.Error = JsonPatchError;
    /**
     * Recursively checks whether an object has any undefined values inside.
     */
    function hasUndefined(obj) {
        if (obj === undefined) {
            return true;
        }
        if (typeof obj == "array" || typeof obj == "object") {
            for (var i in obj) {
                if (hasUndefined(obj[i])) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Validates a single operation. Called from `jsonpatch.validate`. Throws `JsonPatchError` in case of an error.
     * @param {object} operation - operation object (patch)
     * @param {number} index - index of operation in the sequence
     * @param {object} [tree] - object where the operation is supposed to be applied
     * @param {string} [existingPathFragment] - comes along with `tree`
     */
    function validator(operation, index, tree, existingPathFragment) {
        if (typeof operation !== 'object' || operation === null || _isArray(operation)) {
            throw new JsonPatchError('Operation is not an object', 'OPERATION_NOT_AN_OBJECT', index, operation, tree);
        }
        else if (!objOps[operation.op]) {
            throw new JsonPatchError('Operation `op` property is not one of operations defined in RFC-6902', 'OPERATION_OP_INVALID', index, operation, tree);
        }
        else if (typeof operation.path !== 'string') {
            throw new JsonPatchError('Operation `path` property is not a string', 'OPERATION_PATH_INVALID', index, operation, tree);
        }
        else if ((operation.op === 'move' || operation.op === 'copy') && typeof operation.from !== 'string') {
            throw new JsonPatchError('Operation `from` property is not present (applicable in `move` and `copy` operations)', 'OPERATION_FROM_REQUIRED', index, operation, tree);
        }
        else if ((operation.op === 'add' || operation.op === 'replace' || operation.op === 'test') && operation.value === undefined) {
            throw new JsonPatchError('Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)', 'OPERATION_VALUE_REQUIRED', index, operation, tree);
        }
        else if ((operation.op === 'add' || operation.op === 'replace' || operation.op === 'test') && hasUndefined(operation.value)) {
            throw new JsonPatchError('Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)', 'OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED', index, operation, tree);
        }
        else if (tree) {
            if (operation.op == "add") {
                var pathLen = operation.path.split("/").length;
                var existingPathLen = existingPathFragment.split("/").length;
                if (pathLen !== existingPathLen + 1 && pathLen !== existingPathLen) {
                    throw new JsonPatchError('Cannot perform an `add` operation at the desired path', 'OPERATION_PATH_CANNOT_ADD', index, operation, tree);
                }
            }
            else if (operation.op === 'replace' || operation.op === 'remove' || operation.op === '_get') {
                if (operation.path !== existingPathFragment) {
                    throw new JsonPatchError('Cannot perform the operation at a path that does not exist', 'OPERATION_PATH_UNRESOLVABLE', index, operation, tree);
                }
            }
            else if (operation.op === 'move' || operation.op === 'copy') {
                var existingValue = { op: "_get", path: operation.from, value: undefined };
                var error = jsonpatch.validate([existingValue], tree);
                if (error && error.name === 'OPERATION_PATH_UNRESOLVABLE') {
                    throw new JsonPatchError('Cannot perform the operation from a path that does not exist', 'OPERATION_FROM_UNRESOLVABLE', index, operation, tree);
                }
            }
        }
    }
    jsonpatch.validator = validator;

    /**
     * Validates a sequence of operations. If `tree` parameter is provided, the sequence is additionally validated against the object tree.
     * If error is encountered, returns a JsonPatchError object
     * @param sequence
     * @param tree
     * @returns {JsonPatchError|undefined}
     */
    function validate(sequence, tree) {
        try {
            if (!_isArray(sequence)) {
                throw new JsonPatchError('Patch sequence must be an array', 'SEQUENCE_NOT_AN_ARRAY');
            }
            if (tree) {
                tree = JSON.parse(JSON.stringify(tree)); //clone tree so that we can safely try applying operations
                apply.call(this, tree, sequence, true);
            }
            else {
                for (var i = 0; i < sequence.length; i++) {
                    this.validator(sequence[i], i);
                }
            }
        }
        catch (e) {
            if (e instanceof JsonPatchError) {
                return e;
            }
            else {
                throw e;
            }
        }
    }
    jsonpatch.validate = validate;

    /**
     * Custom validator.
     *   Some times a patch may have an operation path that hasn't been made available on the tree yet.
     *   The default validator throws an OPERATION_PATH_UNRESOLVABLE error.
     *   This validator calls on resolvePath to ensure that the path exists before the next patch operation executes
     * @example
     * tree: {
     *    cData = {
     *     "allRecommendations":{
     *       "color_kit":[]
     *     },
     *     "bestColorMatch": null
     *   }; 
     * };
     * 
     * mrValidator({ op: "add", path: '/cData/allRecommendations/root_reboot/0/images', value: [{}, {}, {}] }, 0, tree, '/cData/allRecommendations');
     * 
     * tree => {
     *   cData = {
     *    "allRecommendations":{
     *      "color_kit":[],
     *      "root_reboot": [{
     *        images: null
     *      }]
     *    },
     *    "bestColorMatch": null
     *   }; 
     * }
     *  
     * @param {object} operation - operation object (patch)
     * @param {number} index - index of operation in the sequence
     * @param {object} [tree] - object where the operation is supposed to be applied
     * @param {string} [existingPathFragment] - comes along with `tree`
     */
    function mrValidator(operation, index, tree, existingPathFragment) {
        if (tree) {
            if (operation.path !== existingPathFragment) {
                resolvePath(operation.path, existingPathFragment, tree);
            }
        }
    }
    jsonpatch.mrValidator = mrValidator;

    /**
     * Helper function for mrValidator 
     */
    function resolvePath(path, existingPathFragment, tree) {
      // existingPathFragment is a substring of path
      let entry = tree;
      const newPathFragments = path.replace(existingPathFragment, '')
        .split('/')
        .filter((d) => d.length > 0); // filter out empty string in case of ["", ...]

      // log if new path is trying to update 2 or more edges away from original, may wish to update cdata default structure if these show up
      if (newPathFragments.length > 1) {
        log.debug(`OPERATION_PATH_UNRESOLVABLE: update requested for ${path} but only ${existingPathFragment} exists. Resolving path to allow update...`);
      }
  
      const existingPathFragments = existingPathFragment.split('/').filter((d) => d.length > 0);
      if (existingPathFragments.length === 0) {
        existingPathFragments.push(newPathFragments.splice(0, 1));
      }
  
      for(let i = 0; i < existingPathFragments.length - 1; i++) {
        entry = entry[existingPathFragments[i]];
      }
  
      const edge = existingPathFragments[existingPathFragments.length -1];
      entry[edge] = generateNode([edge, ...newPathFragments]);
    };

    /**
     * Helper function for mrValidator 
     */
    function generateNode(newPathFragments) {
      let head = null;
      let tailKey = newPathFragments.pop();
    
      while(newPathFragments.length) {
        const headKey = newPathFragments.pop(); 
        const tail = head;
        head = createNodeObject(tailKey);
        head[tailKey] = tail;
        tailKey = headKey;
      }
    
      return head; 
    };
  
    /**
     * Helper function for mrValidator 
     */
    function createNodeObject(to) {
      if (isInteger(to)) {
        return [];
      } else if (typeof to === 'string') {
        return {};
      } else {
        log.error(`Failed to create node object for type: ${typeof to}\n`, to);
        return {};
      }
    }; 
})(jsonpatch || (jsonpatch = {}));
if (typeof exports !== "undefined") {
    exports.apply = jsonpatch.apply;
    exports.observe = jsonpatch.observe;
    exports.unobserve = jsonpatch.unobserve;
    exports.generate = jsonpatch.generate;
    exports.compare = jsonpatch.compare;
    exports.validate = jsonpatch.validate;
    exports.validator = jsonpatch.validator;
    exports.JsonPatchError = jsonpatch.JsonPatchError;
    exports.Error = jsonpatch.Error;
    exports.mrValidator = jsonpatch.mrValidator;
}