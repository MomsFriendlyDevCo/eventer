@momsfriendlydevco/eventer
==========================
Yet-another-implementation of the Node standard `Event_Emitter` library.

This module acts like a drop-in replacement for the standard `require("events")` library but is promise compatible, pipeable and easily extendible.


Why?
----
This module differs from the standard event emitter library in several ways:

* `emit()` returns a promise which resolves with the combined `Promise.all()` result of all subscribers. It also rejects with the first subscriber throw.
* `emit()` resolves all registered events in series, waiting for each unless one throws
* `emit()` acts as a transform pipeline, where each callback can mutate the result before passing it on
* `eventer.extend(anObject)` is nicer than the rather strange prototype inheritance system that EventEmitter recommends
* Easily chainable
* Ability to hook into the event call sequence via `meta:preEmit` + `meta:postEmit`
* Debugging for the standard `event_emitter` object is terrible


Debugging
=========
This module uses the [debug NPM module](https://github.com/visionmedia/debug) for debugging. To enable set the environment variable to `DEBUG=eventer`.

For example:

```
DEBUG=eventer node myFile.js
```

If you want detailed eventer information (like what exact functions are calling queued), set `DEBUG=eventer:detail`.


API
===

emit(event, ...payload)
-----------------------
Emit an event and return a Promise which will only resolve if all the downstream subscribers resolve.
Each subscriber is called in series and in the order they subscribed. If any subscriber returns a non-undefined value, the next subscriber gets that result as the next first value.
If any subscriber throws, the promise rejection payload is the first subscriber error.
Returns final result of the last promise passed (see example below).
Note: This function will also emit `meta:preEmit` (as `(eventName, ...args)`) and `meta:postEmit` before and after each event.


```javascript
eventer.extend()
	.on('pipe', v => v++) // Given 0, returns 1
	.on('pipe', v => v++) // Given 1, returns 2
	.on('pipe', v => v++) // Given 2, returns 3
	.emit('pipe', 0) // Start the chain
	.then(v => ...) // Fnal result of 'emit' promise series, Given 3
```


on(events, function)
--------------------
Subscribe to one event (if its a string) or multiple events (if an array of strings). The callback is treated as a Promise factory.
Returns the chainable source object.


once(eventName, function)
-------------------------
Bind to one event binding exactly _once_.
This is effectively the same as subscribing via `on()` then calling `off()` to unsubscribing the same function.
Returns the chainable source object.


off(eventName, function)
------------------------
Remove an event subscription. If a specific function is specified that lone function is removed, otherwise all bindings are reset.
Returns the chainable source object.


listenerCount(eventName)
------------------------
Return the number of listeners for a given event.


eventNames()
------------
Return an array of strings representing each registered event.


extend(object, [options])
-------------------------
Glue the above methods to the supplied object without all the *faff* of extending object prototypes.
