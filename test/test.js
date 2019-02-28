var expect = require('chai').expect;
var eventer = require('..');

describe('simple scenario tests', ()=> {

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
			.then(()=> expect(called).to.deep.equal(['foo', 'bar']))
	});

	it('should fire promise chains correctly', ()=> {
		var lastPromise;

		var emitter =  eventer.extend({});

		emitter
			.on('foo', ()=> expect(lastPromise).to.not.be.ok)
			.on('foo', ()=> lastPromise = 'foo')
			.on('foo', ()=> new Promise(resolve => setTimeout(resolve, 300)))
			.on('bar', ()=> expect(lastPromise).to.be.equal('foo'))
			.on('bar', ()=> lastPromise = 'bar')
			.on('bar', ()=> new Promise(resolve => setTimeout(resolve, 200)))
			.on('baz', ()=> expect(lastPromise).to.be.equal('bar'))
			.on('baz', ()=> lastPromise = 'bar')
			.on('baz', ()=> new Promise(resolve => setTimeout(resolve, 100)))

		return Promise.resolve()
			.then(()=> emitter.emit('foo'))
			.then(()=> emitter.emit('bar'))
			.then(()=> emitter.emit('baz'))
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
			.then(r => expect(r).to.be.deep.equal([1]))
			.then(()=> emitter.emit('bar'))
			.then(r => expect(r).to.be.deep.equal([2]))
			.then(()=> emitter.emit('baz'))
			.then(r => expect(r).to.be.deep.equal([3]))
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

	it('should fire global `meta:preEmit` + `meta:postEmit` events', ()=> {
		var called = [];
		var emitter =  eventer.extend({});

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

});
