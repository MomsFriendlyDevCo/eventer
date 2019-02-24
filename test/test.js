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

});
