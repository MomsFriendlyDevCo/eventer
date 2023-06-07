@momsfriendlydevco/eventer
==========================
Yet-another-implementation of the Node standard `Event_Emitter` library.

This module acts like a drop-in replacement for the standard `require("events")` library but is promise compatible, pipeable and easily extendible.

Eventer instances are both simultaniously an event emitter stand-in _and_ a promisable while leaving the original context alone.


```javascript
var myEmitter = eventer.extend({foo: 123})
	.on('thing', ()=> { /*...*/ }) // React to an event
	.emit('thing', val) // Emit an event
	.on('end', ()=> { /*...*/}) // React to a closing event
	.then(()=> { /*...*/ }) // ...or use promise syntax (context is the original object so `this.foo` is available)
	.catch(()=> { /*...*/ }) // ...likewise use promise rejections
	.resolve(val) // Trigger the closing event (resolves all 'thens' and `.on('end')`)
	.reject(val) // ...or reject


// Original object is still accessible:
myEmitter.foo //= 123
```


Why?
----
This module differs from the standard event emitter library in several ways:

* `emit()` returns a promise which resolves with the combined `Promise.all()` result of all subscribers. It also rejects with the first subscriber throw.
* `emit()` resolves all registered events in series, waiting for each unless one throws
* `emit.reduce()` acts as a transform pipeline, where each callback can mutate the result before passing it on
* `eventer.extend(anObject)` is nicer than the rather strange prototype inheritance system that EventEmitter recommends
* `on()` should support prerequisite functions
* `on()` should support at least simple queue functions ("last", the default and "first")
* Easily chainable
* Eventer instances are "promise like" in that you can call `.on('end', func)` or `.then(func)` on and they will react accordingly. Likewise `.on('error', func)` and `.catch(func)`
* Can proxy events from one event emitter to another
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
Each subscriber is called in series and in the order they subscribed. Any return value from the event handler is discarded - use `emit.reduce()` if you want to work with pipelines.
If any subscriber throws, the promise rejection payload is the first subscriber error.
Note: This function will also emit `meta:preEmit` (as `(eventName, ...args)`) and `meta:postEmit` before and after each event.


```javascript
eventer.extend()
	.on('greeting', name => console.log(`Hello ${name`)) //= "Hello Matt"
	.on('greeting', name => console.log(`Hi ${name`)) //= "Hi Matt"
	.emit('greeting', 'Matt')
```


emit.reduce(event, ...payload)
------------------------------
Works the same as `emit()` except that the return value (or eventual value via a Promise) will mutate the first argument of the next function.
If any subscriber returns a non-undefined value, the next subscriber gets that result as the next first value.
Returns final result of the last promise passed (see example below).


```javascript
eventer.extend()
	.on('pipe', v => v++) // Given 0, returns 1
	.on('pipe', v => v++) // Given 1, returns 2
	.on('pipe', v => v++) // Given 2, returns 3
	.emit('pipe', 0) // Start the chain
	.then(v => ...) // Fnal result of 'emit' promise series, Given 3
```


emit.sync(event, ...payload)
----------------------------
Works the same as `emit()` except that all responses are expected to be syncronous. Any promise(like) response will instead throw.
The response will be the input object.


on(events, function, options)
-----------------------------
Subscribe to one event (if its a string) or multiple events (if an array of strings). The callback is treated as a Promise factory.
Returns the chainable source object.

Options are:

| Option  | Type     | Default         | Description                                                                                          |
|---------|----------|-----------------|------------------------------------------------------------------------------------------------------|
| `alias` | `String` | Function caller | How to refer to the queued event handler if using pre-requisites, defaults thte function caller name |
| `order` | `String` | `"last"`        | Where to add the function handler in the sequence, defaults to appending to the emitter stack        |


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


extendPromise(object, [options])
--------------------------------
Same as `extend()` but also add promise functionality.


proxy(source, destination)
--------------------------
Proxy events from a source emitter into a destination.
This in effect glues the destinations exposed methods to the source emitter.


promise()
---------
Returns the raw promise object rather than its wrapped functions (`then`, `catch` + `finally`).


then(func)
----------
Queue up a promisable action which will run on any `.resolve(val)` or `.emit('end', val)` call.
The function is executed with the original object context.


catch(func)
-----------
Queue up a promisable action which will run on any `.reject(val)` or `.emit('error', val)` call.
The function is executed with the original object context.


finally(func)
-------------
Queue up a promisable action which will run on any resolution or rejection.
The function is executed with the original object context.


resolve(val)
------------
Resolve the internal promise. This is syntactic sugar for `.emit('end', val)`.


reject(val)
------------
Reject the internal promise. This is syntactic sugar for `.emit('end', val)`.
