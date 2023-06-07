var expect = require('chai').expect;
var eventer = require('..');

describe.only('emitter sync mode', ()=> {

	it('should perform simple synchronous emitter tasks', ()=> {
		var lastVal = 0;
		var emitter =  eventer.extend({})
			.on('add', (a, b) => lastVal = a + b)

		emitter.emit('add', 1, 2, {eventer: {sync: true}});
		expect(lastVal).to.equal(3);

		emitter.emit.sync('add', 2, 3);
		expect(lastVal).to.equal(5);

		emitter.emitSync('add', 3, 4);
		expect(lastVal).to.equal(7);
	});

});
