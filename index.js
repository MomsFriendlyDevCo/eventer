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
	* @param {string|array <string>} events The emitter to wait for, if this is an array of strings any of the matching events will trigger the callback, possibly multiple times
	* @param {string|array} [prereqs] Optional single string or array of prerequisite services we should fire after
	* @param {function} [cb] Optional callback to fire. Called as `(err, next)`
	* @param {Object} [options] Addiotional options to pass
	* @param {string} [options.alias] How to refer to the source of the function
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
			...options,
		};
		// }}}

		eventer.utils.castArray(events).forEach(event => {
			if (debug.enabled) debug('Registered subscriber for', event, 'from', settings.source, (eventer.utils.isArray(prereqs) && prereqs.length ? ' (prereqs: ' + prereqs.join(', ') + ')' : ''));
			if (!eventer.eventHandlers[event]) eventer.eventHandlers[event] = [];
			eventer.eventHandlers[event].push({
				prereqs, cb,
				...settings,
			});
		});

		return eventer.context;
	};


	/**
	* Remove a binding from an event emitter
	* @param {string|array <string>} events The event(s) to remove the binding from
	* @param {function} [cb] The specific callback to remove
	* @return {Object} This chainable object
	*/
	eventer.off = (events, cb) => {
		eventer.utils.castArray(events).forEach(event => {
			debug('Remove listener', event);
			if (cb && Object.prototype.hasOwnProperty(eventer.eventHandlers, event)) { // Specific function to remove
				eventer.eventHandlers[event] = eventer.eventHandlers[event].filter(c => c.cb === cb);
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

		return eventer.on(events, prereqs, (...args) => {
			eventer.off(events, cb);
			return cb(...args);
		});
	};


	/**
	* Fire all attached event handlers
	* NOTE: The behaviour of this function can be changed by calling `.emit.reduce()` instead
	* If the last argument passed is of the form {eventer: {...}} it is assumed to be the eventer settings for this function
	* @param {string} event The event to fire
	* @param {*} [args...] Additional arguments to pass to the callbacks
	* @param {Object} [args.eventer] Workaround method to pass custom options to this function (only applies to the last arg
	* @param {boolean} [args.eventer.reduce=false] Whether to treat the emitter as reducable (i.e. the first arg from each promise return mutates the next), if falsy all args are immutable
	* @returns {Promise} A promise with the combined result
	*/
	eventer.emit = (event, ...args) => {
		var settings = {
			reduce: false,
			...(typeof args[args.length-1] == 'object' && args[args.length-1].eventer ? args.pop().eventer : null),
		};

		var listenerCount = eventer.listenerCount(event);
		if (!listenerCount) {
			if (Eventer.settings.errors.emitOnUnkown) throw new Error(`Attempt to emit on unknown event "${event}"`);
			debug('Emit', event, '(no listeners)');
			return Eventer.settings.promise.resolve(args[0]);
		} else {
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
							func.cb(...funcArgs)
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
		}
	};


	eventer.emit.reduce = (event, ...args) =>
		eventer.emit(event, ...args, {eventer: {reduce: true}});



	/**
	* Return the number of listeners for an event
	* @param {string} event The event to query
	* @returns {number} The number of listeners
	*/
	eventer.listenerCount = event =>
		!eventer.eventHandlers[event]
			? 0
			: eventer.eventHandlers[event].length;


	/**
	* Returns an array of all registered events
	* @returns {array <string>} An array of strings for each known event
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

	Eventer.settings.exposeMethods.forEach(prop => {
		var boundFunc = eInstance[prop].bind(obj);
		if (prop == 'emit') boundFunc.reduce = eInstance.emit.reduce.bind(obj); // Special case for emit.reduce sub-function

		Object.defineProperty(obj, prop, {
			enumerable: false,
			configurable: true,
			value: boundFunc,
		});
	});

	return obj;
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
		Object.defineProperty(destination, prop, {
			enumerable: false,
			configurable: true,
			value: source[prop].bind(destination),
		});
	});

	return destination;
};


Eventer.settings = {
	exposeMethods: ['emit', 'eventNames', 'listenerCount', 'off', 'on', 'once'],
	errors: {
		emitOnUnknown: false,
	},
	promise: Promise,
};
