var debug = require('debug')('eventer');
var debugDetail = require('debug')('eventer:detail');
var fspath = require('path');

function Eventer(options, context) {
	var eventer = this;

	eventer.context = context || this;

	eventer.eventerSettings = {
		debugTimeout: 1000,
	};

	eventer.eventHandlers = {};


	/**
	* Function used to bind into a framework emitter
	* @param {String|Array<String>} events The emitter to wait for, if this is an array of strings any of the matching events will trigger the callback, possibly multiple times
	* @param {String|Array} [prereqs] Optional single string or array of prerequisite services we should fire after
	* @param {Function} [cb] Optional callback to fire. Called as `(err, next)`
	* @param {Object} [options] Additional options to pass
	* @param {String} [options.alias] How to refer to the source of the function
	* @param {String} [options.order='last'] Where the event should be queued within the sequence. ENUM: 'last' (default) - Queue at current end of sequence, 'first' - queue at the start
	* @return {Object} This chainable object
	* @see app.fire()
	*/
	eventer.on = (events, prereqs, cb, options = {}) => {
		// Argument mangling {{{
		if (events && typeof prereqs == 'function' && !cb) { // Called as events, cb&
			[cb, prereqs] = [prereqs, []];
		} else if (events && typeof prereqs == 'function' && typeof cb == 'object') { // Called as events, cb&, options
			[cb, prereqs, options] = [prereqs, [], cb];
		}
		// }}}
		// Settings {{{
		var settings = {
			source: options && options.source ? options.source
				: debug.enabled || debugDetail.enabled ? eventer.getCaller() : 'UNKNOWN',
			order: 'last',
			...options,
		};
		// }}}

		eventer.utils.castArray(events).forEach(event => {
			if (debug.enabled) debug('Registered subscriber for', event, 'from', settings.source, (eventer.utils.isArray(prereqs) && prereqs.length ? ' (prereqs: ' + prereqs.join(', ') + ')' : ''));
			if (!eventer.eventHandlers[event]) eventer.eventHandlers[event] = [];
			eventer.eventHandlers[event][settings.order == 'first' ? 'unshift' : 'push']({
				prereqs, cb,
				...settings,
			});
		});

		return eventer.context;
	};


	/**
	* Remove a binding from an event emitter
	* @param {String|Array<String>} events The event(s) to remove the binding from
	* @param {Function} [cb] The specific callback to remove
	* @return {Object} This chainable object
	*/
	eventer.off = (events, cb) => {
		eventer.utils.castArray(events).forEach(event => {
			debug('Remove listener', event);
			if (cb && Object.prototype.hasOwnProperty.call(eventer.eventHandlers, event)) { // Specific function to remove
				eventer.eventHandlers[event] = eventer.eventHandlers[event].filter(c => c.cb !== cb);
			} else { // Remove all handlers
				eventer.eventHandlers[event] = [];
			}
		});

		return eventer.context;
	};


	/**
	* Bind an event to fire once
	* This is effectively a shortcut for a on() + off() call
	* @return {Object} This Chainable object
	*/
	eventer.once = (events, prereqs, cb) => {
		// Argument mangling {{{
		if (events && prereqs && !cb) { // Called as events, cb
			cb = prereqs;
			prereqs = [];
		}
		// }}}

		var factory = (...args) => {
			eventer.off(events, factory);
			return cb(...args);
		};

		return eventer.on(events, prereqs, factory);
	};


	/**
	* Fire all attached event handlers
	* NOTE: The behaviour of this function can be changed by calling `.emit.reduce()` instead
	* If the last argument passed is of the form {eventer: {...}} it is assumed to be the eventer settings for this function
	* @param {String} event The event to fire
	* @param {*} [args...] Additional arguments to pass to the callbacks
	* @param {Object} [args.eventer] Workaround method to pass custom options to this function (only applies to the last arg
	* @param {Boolean} [args.eventer.reduce=false] Whether to treat the emitter as reducable (i.e. the first arg from each promise return mutates the next), if falsy all args are immutable
	* @param {Boolean} [args.eventer.sync=false] Whether to perform the emit in sync mode
	* @param {Boolean} [args.eventer.syncThrow=true] If in sync mode and any emitted handler returns a Promise(alike) throw an error
	* @returns {Promise|Object} A promise with the combined result OR the original object if in sync mode
	*/
	eventer.emit = (event, ...args) => {
		if (typeof event != 'string') throw new Error('Eventer.emit(event, args...) - event name must be a string');
		var settings = {
			reduce: false,
			sync: false,
			syncThrow: true,
			...(typeof args[args.length-1] == 'object' && args[args.length-1].eventer ? args.pop().eventer : null),
		};

		var listenerCount = eventer.listenerCount(event);
		if (!listenerCount) {
			// No emitters / Nothing to do {{{
			if (Eventer.settings.errors.emitOnUnkown) throw new Error(`Attempt to emit on unknown event "${event}"`);
			debug('Emit', event, '(no listeners)');
			return settings.sync ? eventer.context : Eventer.settings.promise.resolve(args[0]);
			// }}}
		} else if (settings.sync == false) {
			// Emit in async mode {{{
			debug('Emit', event, 'to', listenerCount, 'subscribers');
			if (debugDetail.enabled) debugDetail('Emit', event, eventer.eventHandlers[event].map(e => e.source));

			var eventQueue = eventer.eventHandlers[event];
			if (debugDetail.enabled) { // Setup a timeout printer
				var timeoutCycles = 0;
				var promisesWaiting = Object.keys(eventer.eventHandlers[event]).reduce((o, k) => o[k] = true, {});
				eventQueue = eventQueue.map((e, i) => ({
					...e,
					finished: false,
					cb: (...args) => Promise.resolve(e.cb(...args)).finally(()=> eventQueue[i].finished = true), // Wrap callback so we know when its finished
				}));

				var timeoutTimer = setInterval(()=> {
					debugDetail('Still waiting for resolve on event', event, `after #${++timeoutCycles} from sources`, eventQueue.filter(e => !e.finished).map(e => e.source));
				}, this.eventerSettings.debugTimeout);
			}

			var funcArgs = [...args]; // Soft copy args array so we can mutate it without effecting the referenced pointer
			return Promise.resolve()
				.then(()=> eventer.listenerCount('meta:preEmit') && Eventer.settings.promise.all(eventer.eventHandlers['meta:preEmit'].map(c => c.cb(event, ...funcArgs))))
				.then(()=> eventQueue.reduce((chain, func) => // Exec all promises in series mutating the first arg each time
					chain.then(()=>
						Promise.resolve(
							func.cb.apply(eventer.context, funcArgs)
						)
							// Returned non-undefined, mutate first arg to response
							.then(res => {
								if (res !== undefined && settings.reduce) {
									debugDetail('Mutate argument via event', event, funcArgs[0], '=>', res);
									funcArgs[0] = res;
								}
							})
					)
				, Promise.resolve()))
				.then(()=> timeoutTimer && clearInterval(timeoutTimer))
				.then(()=> eventer.listenerCount('meta:postEmit') && Eventer.settings.promise.all(eventer.eventHandlers['meta:postEmit'].map(c => c.cb(event, ...funcArgs))))
				.then(()=> funcArgs[0])
			// }}}
		} else {
			// Emit in sync mode {{{
			var funcArgs = [...args]; // Soft copy args array so we can mutate it without effecting the referenced pointer
			eventer.eventHandlers[event].forEach(func => {
				var res = func.cb.apply(eventer.context, funcArgs);

				if (settings.syncThrow && (res instanceof Promise || (res && typeof res.then == 'function'))) {
					throw new Error(`Emit handler for "${event}" returned a promise(alike) in sync mode - only synchronous responses are valid`);
				}
			});
			return eventer.context;
			// }}}
		}
	};


	/**
	* Utility function to perform an emit reduce operation
	* @param {String|Array<String>} Event(s) to emit
	* @param {*} [args...] Optional emitter args
	* @returns {*} The result of the reduction
	*/
	eventer.emit.reduce = (event, ...args) =>
		eventer.emit(event, ...args, {eventer: {reduce: true}});


	/**
	* Utility function to perform an emit sync operation
	* @param {String|Array<String>} Event(s) to emit
	* @param {*} [args...] Optional emitter args
	* @returns {Object} The source object
	*/
	eventer.emitSync = eventer.emit.sync = (event, ...args) =>
		eventer.emit(event, ...args, {eventer: {sync: true}});


	/**
	* Utility function to perform an emit sync operation
	* @param {String|Array<String>} Event(s) to emit
	* @param {*} [args...] Optional emitter args
	* @returns {Object} The source object
	*/
	eventer.emit.sync = (event, ...args) =>
		eventer.emit(event, ...args, {eventer: {sync: true}});



	/**
	* Return the number of listeners for an event
	* @param {String} event The event to query
	* @returns {Number} The number of listeners
	*/
	eventer.listenerCount = event =>
		!eventer.eventHandlers[event]
			? 0
			: eventer.eventHandlers[event].length;


	/**
	* Returns an array of all registered events
	* @returns {Array<String>} An array of strings for each known event
	*/
	eventer.eventNames = ()=>
		Object.keys(eventer.eventHandlers);


	/**
	* Recieve details about a functions caller
	* This function works similar to `arguments` in that its local to its own caller function (i.e. you can only get details about the function that is calling it)
	* @return {Object} An object with the keys: name (the function name, if any), file, line, char
	*/
	eventer.getCaller = function() {
		var err = new Error()
		var stack = err.stack.split(/\n+/);
		stack.shift(); // getCaller()
		stack.shift(); // this functions caller
		stack.shift();

		var parsed = /^\s*at (?<name>.+?) \((?<file>.+?):(?<line>[0-9]+?):(?<char>[0-9]+?)\)$/.exec(stack[0]);
		if (!parsed) return {id: 'unknown'};

		return parsed.groups.file + (parsed.groups.line ? ` +${parsed.groups.line}` : '');
	};


	/**
	* Holder for internal utilities
	* @var {Object}
	*/
	eventer.utils = {
		castArray: a => eventer.utils.isArray(a) ? a : [a],
		isArray: a => Object.prototype.toString.call(a) == '[object Array]',
	};


	if (!options || options.wrapPromise !== undefined) {
		// Setup private $promise promise instance
		eventer.$promise = new Promise((resolve, reject) => {
			eventer.resolve = (...args) => {
				resolve.apply(eventer.context, args);
				return eventer;
			};
			eventer.reject = (...args) => {
				reject.apply(eventer.context, args);
				return eventer;
			};
		});

		// Make a func to return the private promise if its requested
		eventer.promise = ()=> eventer.$promise;

		// Map each promise method into this object mixin
		['then', 'catch', 'finally'].forEach(method =>
			eventer[method] = (...args) => {
				eventer.$promise[method].apply(
					eventer.$promise, // Promise context, has to be set or Promise is unhappy
					args.map(arg => // Map all funcs with this object as the context, otherwise leave alone
						typeof arg == 'function'
							? arg.bind(eventer.context)
							: arg
					)
				);
				return eventer;
			},
		);

		// Listen for 'end' / 'error' events and map into promise
		eventer.on('end', eventer.resolve);
		eventer.on('error', eventer.reject);
	}

	return eventer;
};

module.exports = Eventer;


/**
* Extend an existing objects prototype with the eventer functions
* @param {Object} obj The object to extend
* @param {Object} [options] Additional options
* @returns {Object} The input object
*/
Eventer.extend = (obj, options) => {
	if (!obj) obj = {}; // Create prototype if non given

	var eInstance = new Eventer(options, obj);

	[
		...Eventer.settings.exposeMethods,
		...(options && options.wrapPromise ? Eventer.settings.exposeMethodsPromise : []),
	].forEach(prop => {
		var boundFunc = eInstance[prop].bind(obj);
		if (prop == 'emit') { // Special case for emit.* sub-functions
			Eventer.settings.exposeSubMethods.forEach(m =>
				boundFunc[m] = eInstance.emit[m].bind(obj)
			);
		}

		Object.defineProperty(obj, prop, {
			enumerable: false,
			configurable: true,
			value: boundFunc,
		});
	});

	return obj;
};


/**
* Conveneince method to extend an object and include promise methods
* i.e. return an event emitter + promise functionality
* @param {Object} obj The object to extend
* @param {Object} [options] Additional options
* @returns {Object} The input object
*/
Eventer.extendPromise = (obj, options) => {
	var settings = {
		wrapPromise: true,
		...options,
	};
	return Eventer.extend(obj, settings);
};


/**
* Proxy events from a source emitter into a destination
* This in effect glues the destinations exposed methods to the source emitter
* @param {Object} source The source object from where the exposed methods should be taken
* @param {Object} destination The final event emitter which should recieve the sources events
* @returns {Object} The mutated destination object
*/
Eventer.proxy = (source, destination) => {
	if (typeof source != 'object' || typeof destination != 'object') throw new Error('Eventer.proxy(source, destination) must both be objects');

	Eventer.settings.exposeMethods.forEach(prop => {
		var boundFunc = source[prop].bind(destination);
		if (prop == 'emit') { // Special case for emit.* sub-functions
			Eventer.settings.exposeSubMethods.forEach(m =>
				boundFunc[m] = source.emit[m].bind(destination)
			);
		}

		Object.defineProperty(destination, prop, {
			enumerable: false,
			configurable: true,
			value: boundFunc,
		});
	});

	return destination;
};


Eventer.settings = {
	exposeMethods: ['emit', 'emitSync', 'eventNames', 'listenerCount', 'off', 'on', 'once'],
	exposeSubMethods: ['reduce', 'sync'],
	exposeMethodsPromise: ['then', 'catch', 'finally', 'resolve', 'reject', 'promise'],
	errors: {
		emitOnUnknown: false,
	},
	promise: Promise,
	wrapPromise: false,
};
