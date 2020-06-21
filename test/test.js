var expect = require('chai').expect;
var eventer = require('..');

describe('simple emitter tests', ()=> {

	it('should extend a base object with standard properties', ()=> {
		var emitter =  eventer.extend({});

		expect(emitter).to.have.property('emit');
		expect(emitter.emit).to.have.property('reduce');
		expect(emitter).to.have.property('eventNames');
		expect(emitter).to.have.property('listenerCount');
		expect(emitter).to.have.property('off');
		expect(emitter).to.have.property('on');
		expect(emitter).to.have.property('once');
	});

	it('should be usable as a class', ()=> {
		var emitted = {foo: 0, preFoo: 0, postFoo: 0};

		class MyClass extends eventer {
			foo() {
				this.emit('foo');
			};
		};

		var myInstance = new MyClass()
			.on('foo', ()=> emitted.foo++)
			.on('meta:preEmit', ()=> emitted.preFoo++)
			.on('meta:postEmit', ()=> emitted.postFoo++)

		expect(myInstance).to.have.property('foo');
		expect(myInstance).to.have.property('emit');

		return myInstance.emit('foo')
			.then(()=> {
				expect(emitted).to.deep.equal({foo: 1, preFoo: 1, postFoo: 1});
			})
	});

	it('should detect simple event emitters', ()=> {
		var called = [];
		var emitter =  eventer.extend({});

		emitter
			.on('foo', ()=> called.push('foo'))
			.once('bar', ()=> called.push('bar'))
			.on('baz', ()=> called.push('baz'));

		return Promise.resolve()
			.then(()=> emitter.emit('foo'))
			.then(()=> emitter.emit('bar'))
			.then(()=> emitter.emit('bar'))
			.then(()=> emitter.emit('non-existant'))
			.then(()=> expect(called).to.deep.equal(['foo', 'bar']))
	});

	it('should fire promise chains correctly', function () {
		this.timeout(10 * 1000);
		var called = [];
		var lastPromise;
		var timerRunning = false;

		var emitter =  eventer.extend({});

		emitter
			.on('foo', ()=> new Promise(resolve => setTimeout(()=> {
				expect(called).to.deep.equal([]);
				called.push('foo');
				resolve();
			}, 300)))
			.on('bar', ()=> { /* Do nothing */ })
			.on('bar', ()=> new Promise(resolve => setTimeout(()=> {
				expect(called).to.deep.equal(['foo']);
				called.push('bar');
				resolve();
			}, 200)))
			.on('baz', ()=> new Promise(resolve => setTimeout(()=> {
				expect(called).to.deep.equal(['foo', 'bar']);
				called.push('baz');
				resolve();
			}, 100)))

		return Promise.resolve()
			.then(()=> emitter.emit('foo'))
			.then(()=> emitter.emit('bar'))
			.then(()=> emitter.emit('baz'))
			.then(()=> expect(called).to.deep.equal(['foo', 'bar', 'baz']))
	});

	it('should collect subscriber results', ()=> {
		var called = [];
		var emitter =  eventer.extend({});

		emitter
			.on('foo', ()=> Promise.resolve(1))
			.on('bar', ()=> new Promise(resolve => setTimeout(()=> resolve(2), 100)))
			.on('baz', ()=> 3)

		return Promise.resolve()
			.then(()=> emitter.emit('foo'))
			.then(r => expect(r).to.be.undefined)
			.then(()=> emitter.emit('bar'))
			.then(r => expect(r).to.be.undefined)
			.then(()=> emitter.emit('baz'))
			.then(r => expect(r).to.be.undefined)
	});

	it('should handle rejected promises / throws', ()=> {
		var called = [];
		var emitter =  eventer.extend({});

		emitter
			.on('foo', ()=> Promise.reject(1))
			.on('bar', ()=> new Promise((resolve, reject) => setTimeout(()=> reject(2), 100)))
			// .on('baz', ()=> { throw new Error(3) }) // Upsets Mocha

		return Promise.resolve()
			.then(()=> emitter.emit('foo').catch(r => {
				called.push('foo');
				expect(r).to.be.deep.equal(1);
			}))
			.then(()=> emitter.emit('bar').catch(r => {
				called.push('bar');
				expect(r).to.be.deep.equal(2);
			}))
			/*
			.then(()=> emitter.emit('baz').catch(r => {
				called.push('bar');
				expect(r).to.be.deep.equal(3);
			}))
			*/
			.then(()=> expect(called).to.be.deep.equal(['foo', 'bar']))
	});

	it('should handle external errors gracefully', done => {
		eventer.extend({})
			.on('import-error', ()=> require('./data/import-error.js'))
			.emit('import-error')
			.then(()=> expect.fail())
			.catch(e => {
				expect(e.toString()).to.match(/Cannot find module 'package-does-not-exist'/)
				done();
			});
	});

	it('should fire global `meta:preEmit` + `meta:postEmit` events', ()=> {
		var called = [];
		var emitter =  eventer.extend({}, {eventer: {wrapPromise: false}});

		emitter
			.on('meta:preEmit', e => called.push(`pre:${e}`))
			.on('meta:postEmit', e => called.push(`post:${e}`))
			.on('foo', ()=> called.push('foo'))
			.once('bar', ()=> called.push('bar'))
			.on('baz', ()=> called.push('baz'));

		expect(emitter.eventNames().sort()).to.deep.equal(['bar', 'baz', 'foo', 'meta:postEmit', 'meta:preEmit']);

		return Promise.resolve()
			.then(()=> emitter.emit('foo'))
			.then(()=> emitter.emit('bar'))
			.then(()=> emitter.emit('bar'))
			.then(()=> expect(called).to.deep.equal(['pre:foo', 'foo', 'post:foo', 'pre:bar', 'bar', 'post:bar']))
	});

	it('should extend native objects correctly', ()=> {
		var original = {
			foo: ()=> 'Foo!',
			bar: ()=> emitter,
		};
		var emitter = eventer.extend(original);

		expect(emitter).to.be.equal(original);
		expect(emitter.on('baz', ()=> 'Baz!')).to.be.equal(emitter);
		expect(emitter.foo()).to.be.deep.equal('Foo!');
		expect(emitter.bar()).to.be.deep.equal(emitter);
		expect(emitter.on('baz', ()=> {})).to.be.equal(emitter);
	});

	it('should support event proxying', done => {
		var emitter1 = eventer.extend();
		var emitter2 = eventer.extend();

		eventer.proxy(emitter1, emitter2);
		emitter2
			.on('hello', payload => {
				expect(payload).to.be.equal('world');
				done();
			})
			.emit('hello', 'world')
	});


	it('should handle transform chains correctly - number reduce', done => {
		eventer.extend()
			.on('pipe', v => v+1)
			.on('pipe', v => v+1)
			.on('pipe', v => {}) // Shouldn't do anything
			.on('pipe', v => v+1)
			.on('pipe', v => {
				expect(v).to.equal(3);
				done();
			})
			.emit.reduce('pipe', 0)
	});


	it('should handle transform chains correctly - string concat', done => {
		eventer.extend()
			.on('pipe', v => v + 'a')
			.on('pipe', v => v + 'b')
			.on('pipe', v => {}) // Shouldn't do anything
			.on('pipe', v => v + 'c')
			.on('pipe', v => {
				expect(v).to.equal('!abc');
				done();
			})
			.emit.reduce('pipe', '!')
	});

});
