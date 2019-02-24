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

});
