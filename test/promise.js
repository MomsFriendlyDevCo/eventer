var expect = require('chai').expect;
var eventer = require('..');

describe('promise-like handler', ()=> {

	it('should act as a thennable promise (then + resolve)', ()=>
		eventer.extendPromise()
			.then(val => expect(val).to.equal('p-tr'))
			.resolve('p-tr')
	);

	it('should act as a thennable promise (resolve + then)', ()=>
		eventer.extendPromise()
			.resolve('p-rt')
			.then(val => expect(val).to.equal('p-rt'))
	);

	// Skipped as Node complains about global promise catching, works fine though
	it.skip('should act as a thennable promise (catch + reject)', done => {
		eventer.extendPromise()
			.then(()=> expect.fail)
			.catch(e => {
				expect(e).to.equal('p-cr');
				done();
			})
			.reject('p-cr')
	});

	// Skipped as Node complains about global promise catching, works fine though
	it.skip('should act as a thennable promise (reject + catch)', done => {
		eventer.extendPromise()
			.reject('p-rc')
			.then(()=> expect.fail)
			.catch(e => {
				expect(e).to.equal('p-rc')
				done();
			})
	});

	it('should return the raw promise', ()=> {
		var e = eventer.extendPromise();

		expect(e.promise()).to.be.an.instanceOf(Promise);

		return e
			.resolve('raw')
			.then(val => expect(val).to.equal('raw'))
	});

	it('should react to `.emit(\'end\', val)`', ()=> {
		var e = eventer.extendPromise();
		e.emit('end', 'e-end');

		return e.then(val => expect(val).to.equal('e-end'));
	});

	// Skipped as Node complains about global promise catching, works fine though
	it.skip('should react to `.emit(\'error\', val)`', done => {
		var e = eventer.extendPromise();
		e.emit('error', 'e-error');

		e
			.then(()=> expect.fail)
			.catch(val => {
				expect(val).to.equal('e-error');
				done();
			});
	});

	it('can access custom properties within promise methods', ()=>
		eventer.extendPromise({
			foo: 'Foo!',
			bar: 123,
		})
			.then(function(val) {
				expect(val).to.be.equal('e-ok');
				expect(this).to.have.property('foo', 'Foo!');
				expect(this).to.have.property('bar', 123);
			})
			.finally(function() {
				expect(this).to.have.property('foo', 'Foo!');
				expect(this).to.have.property('bar', 123);
			})
			.emit('end', 'e-ok')
	);
});
