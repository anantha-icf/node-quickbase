var xml = require('xml2js'),
	https = require('https'),
	utilities = require('./lib/utilities.js'),
	quickbase = (function(){
		var settings = {
			ticket: ''
		};

		var quickbase = function(options, callback){
			var defaults = {
				realm: 'www',
				domain: 'quickbase.com',
				username: '',
				password: '',
				appToken: '',
				hours: 12,

				flags: {
					useXML: true,
					msInUTC: true,
					includeRids: true,
					returnPercentage: false,
					fmt: 'structured'
				},

				status: {
					errcode: 0,
					errtext: 'No error',
					errdetail: ''
				},

				autoStart: true
			};

			settings = utilities.mergeObjects(settings, defaults, options || {});

			if(settings.autoStart){
				if(settings.ticket !== ''){
					if(typeof(callback) === 'function'){
						callback();
					}
				}else
				if(settings.username && settings.password){
					this.api('API_Authenticate', {
						username: settings.username,
						password: settings.password,
						hours: settings.hours
					}, callback);
				}
			}

			return this;
		};

		quickbase.prototype.setSettings = function(newSettings){
			settings = utilities.mergeObjects(settings, newSettings || {});

			return settings;
		};

		quickbase.prototype.getSettings = function(){
			return settings;
		};

		quickbase.prototype.api = function(action, payload, callback){
			if(callback === undefined){
				callback = function(){};
			}

			var payload = {
				action: action,
				payload: payload,
				callback: callback
			};

			if(actions.prototype[action]){
				new actions(action, payload);
			}else{
				new transmit(payload);
			}
		};

		var transmit = function(options){
			var payload = this.assemblePayload(options.payload),
				reqOpts = {
					hostname: [settings.realm, settings.domain].join('.'),
					port: 443,
					path: '/db/' + (options.payload.dbid || 'main') + '?act=' + options.action + (!settings.flags.useXML ? payload : ''),
					method: settings.flags.useXML ? 'POST' : 'GET',
					headers: {
						'Content-Type': 'application/xml',
						'QUICKBASE-ACTION': options.action
					}
				},
				request = https.request(reqOpts, function(response){
					var xmlResponse = '';

					response.on('data', function(chunk){
						xmlResponse += chunk;
					});

					response.on('end', function(){
						xml.parseString(xmlResponse, function(err, result){
							if(err || result === null){
								options.callback({
									errcode: 1001,
									errtext: 'Error Parsing XML',
									errdetail: err
								});

								return false;
							}

							result = utilities.cleanXML(result.qdbapi);

							if(result.errcode !== settings.status.errcode){
								options.callback({
									errcode: result.errcode,
									errtext: result.errtext,
									errdetail: result.errdetail
								});

								return false;
							}

							options.callback(settings.status, result);
						});
					});
				});

			request.on('error', function(err){
				options.callback({
					errcode: 1000,
					errtext: 'Error Processing Request',
					errdetail: err
				});
			});

			if(settings.flags.useXML){
				request.write(payload);
			}

			request.end();

			return this;
		};

		transmit.prototype.assemblePayload = function(payload){
			payload = new preparePayload(payload);
			payload = this.addFlags(payload);
			payload = this.constructPayload(payload);

			return payload;
		};

		transmit.prototype.constructPayload = function(payload){
			var newPayload = '',
				builder = new xml.Builder({
					rootName: 'qdbapi',
					headless: true,
					renderOpts: {
						pretty: false
					}
				});

			if(settings.flags.useXML){
				newPayload = builder.buildObject(payload);
			}else{
				var arg;

				for(arg in payload){
					newPayload += '&' + arg + '=' + payload[arg];
				}
			}

			return newPayload;
		};

		transmit.prototype.addFlags = function(payload){
			if(settings.flags.msInUTC){
				payload.msInUTC = 1;
			}

			if(settings.appToken){
				payload.apptoken = settings.appToken;
			}

			if(settings.ticket){
				payload.ticket = settings.ticket;
			}

			return payload;
		};

		var preparePayload = function(payload){
			var arg;

			for(arg in payload){
				try {
					if(arg === 'fields'){
						arg = 'field';
						payload[arg] = payload['fields'];

						delete payload['fields'];
					}

					payload[arg] = this[arg](payload[arg]);
				}catch(err){
					// Do Nothing
				}
			}

			return payload;
		};

		preparePayload.prototype.clist = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.clist_output = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.slist = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.options = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.records_csv = function(val){
			return val instanceof Array ? val.join('\n') : val;
		};

		preparePayload.prototype.field = function(val){
			for(var i = 0; i < val.length; i++){
				var newValue = {
					$: {},
					_: val[i].value
				};

				if(parseFloat(val[i].fid) !== NaN && parseFloat(val[i].fid) == val[i].fid){
					newValue.$.fid = val[i].fid;
				}else{
					newValue.$.name = val[i].fid;
				}

				val[i] = newValue;
			}

			return val;
		};

		/* Customized API Calls */
		var actions = function(action, payload){
			this[action](payload);

			return this;
		};

		actions.prototype.API_Authenticate = function(request){
			request.origCallback = request.callback;
			request.callback = function(err, results){
				if(err.errcode !== settings.status.errcode){
					request.origCallback(err);

					return false;
				}

				settings.ticket = results.ticket;

				request.origCallback(settings.status, results);
			};

			new transmit(request);
		};

		actions.prototype.API_DoQuery = function(request){
			if(settings.flags.returnPercentage){
				request.payload.returnPercentage = 1;
			}

			if(settings.flags.includeRids){
				request.payload.includeRids = 1;
			}

			if(settings.flags.fmt){
				request.payload.fmt = settings.flags.fmt;
			}

			new transmit(request);
		};

		return quickbase;
	})();

module.exports = quickbase;