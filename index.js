var debug = require('debug')('eventer');
var fspath = require('path');

function Eventer(options) {
	var eventer = this;

	eventer.eventHandlers = {};


	/**
	* Function used to bind into a framework emitter
	* @param {string|array <string>} events The emitter to wait for, if this is an array of strings any of the matching events will trigger the callback, possibly multiple times
	* @param {string|array} [prereqs] Optional single string or array of prerequisite services we should fire after
	* @param {function} [cb] Optional callback to fire. Called as `(err, next)`
	* @return {Object} This chainable object
	* @see app.fire()
	*/
	eventer.on = (events, prereqs, cb) => {
		// Argument mangling {{{
		if (events && prereqs && !cb) { // Called as events, cb
			cb = prereqs;
			prereqs = [];
		}
		// }}}

		var attacher = eventer.getCaller();

		eventer.utils.castArray(events).forEach(event => {
			debug('Registered subscriber for event', event, 'from', attacher.id, (eventer.utils.isArray(prereqs) && prereqs.length ? ' (prereqs: ' + prereqs.join(', ') + ')' : ''));
			if (!eventer.eventHandlers[event]) eventer.eventHandlers[event] = [];
			eventer.eventHandlers[event].push({
				attacher, prereqs, cb,
			});
		});

		return this;
	};


	/**
	* Remove a binding from an event emitter
	* @param {string|array <string>} events The event(s) to remove the binding from
	* @param {function} [cb] The specific callback to remove
	* @return {Object} This chainable object
	*/
	eventer.off = (events, cb) => {
		eventer.utils.castArray(events).forEach(event => {
			debug('Remove event handler', event);
			if (cb) { // Specific function to remove
				eventer.eventHandlers[event] = eventer.eventHandlers[event].filter(c => c.cb == cb);
			} else { // Remove all handlers
				eventer.eventHandlers[event] = [];
			}
		});

		return this;
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
	* @param {string} event The event to fire
	* @param {*} [args...] Additional arguments to pass to the callbacks
	* @returns {Promise} A promise with the combined result
	*/
	eventer.emit = (event, ...args) => {
		if (!eventer.eventHandlers[event]) {
			debug('Emit', event, '- event is unknown or has no subscribers');
			if (Eventer.settings.errors.emitOnUnkown) throw new Error(`Attempt to emit on unknown event "${event}"`);
			return Eventer.settings.promise.resolve();
		} else {
			debug('Emit', event, 'to', eventer.eventHandlers[event].length, 'subscribers');
			return Eventer.settings.promise.all(eventer.eventHandlers[event].map(c => c.cb(...args)));
		}
	};



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

		var bits = /^\s+at (.+?) \((.+?):([0-9]+?):([0-9]+?)\)$/.exec(stack[0]);

		return {
			id: bits[2] + (bits[3] ? ` +${bits[3]}` : ''),
			name: bits[1],
			file: bits[2],
			line: bits[3],
			char: bits[4],
		};
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

	var eInstance = new Eventer(options);

	Eventer.settings.exposeMethods.forEach(prop => {
		Object.defineProperty(obj, prop, {
			enumerable: false,
			value: eInstance[prop],
		});
	});

	return obj;
};

Eventer.settings = {
	exposeMethods: ['emit', 'off', 'on', 'once'],
	errors: {
		emitOnUnknown: false,
	},
	promise: Promise,
};