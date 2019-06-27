@momsfriendlydevco/eventer
==========================
Yet-another-implementation of the Node standard Event_Emitter library.

This module acts like a drop-in replacement for the standard `require("events")` library but is promise compatible.

This module only really differs in that it offers a nicer way to extend objects (`extend(myObject)`) and handles event emission (`emit(eventName)`) as promises.


Why
---
This module differs from the standard event emitter library in several ways:

* `emit()` returns a promise which resolves with the combined `Promise.all()` result of all subscribers. It also rejects with the first subscriber throw.
* `eventer.extend(anObject)` is nicer than the rather strange prototype inheritance system that EventEmitter recommends
* Easily chainable
* Ability to hook into the event call sequence via `meta:preEmit` + `meta:postEmit`
* Debugging for the standard eventEmitter object is terrible


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

emit(event)
-----------
Emit an event and return a Promise which will only resolve if all the downstream subscribers resolve. The result is that of `Promise.all(subscribers)` and is thus always an array.
If any subscriber throws the rejection is the first subscriber error.
Returns the source object.
Note: This function will also emit `meta:preEmit` (as `(eventName, ...args)`) and `meta:postEmit` before and after each event.


on(events, callback)
--------------------
Subscribe to one or more events. The callback is treated as a Promise factory.
Returns the source object.


once(eventName, function)
--------------------------
Bind to one event binding exactly _once_.
This is effectively the same as subscribing via `on()` then calling `off()` to unsubscribing the same function.
Returns the source object.


off(eventName, [function])
---------------------------
Remove an event subscription. If a specific function is specified that lone function is removed, otherwise all bindings are reset.
Returns the source object.


listenerCount(eventName)
-------------------------
Return the number of listeners for a given event.


eventNames()
------------
Return an array of strings representing each registered event.


extend(object, [options])
-------------------------
Glue the above methods to the supplied object without all the *faff* of extending object prototypes.
