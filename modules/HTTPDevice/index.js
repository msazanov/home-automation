/*** HTTPDevice Z-Way HA module *******************************************

Version: 2.2.2
(c) Z-Wave.Me, 2020
-----------------------------------------------------------------------------
Author: Poltorak Serguei <ps@z-wave.me>, Yurkin Vitaliy <aivs@z-wave.me>
Description:
	Implements virtual device based on HTTP object
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function HTTPDevice (id, controller) {
	// Call superconstructor first (AutomationModule)
	HTTPDevice.super_.call(this, id, controller);
}

inherits(HTTPDevice, AutomationModule);

_module = HTTPDevice;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

HTTPDevice.prototype.init = function (config) {
	HTTPDevice.super_.prototype.init.call(this, config);

	var self = this,
		icon = "",
		level = "",
		scaleTitle = "",
		deviceType = this.config.deviceType;
		probeType = ""
		
	switch(deviceType) {
		case "sensorBinary":
			icon = this.config.iconSensorBinary;
			probeType = this.config.iconSensorBinary == "door" ? "door-window" : this.config.iconSensorBinary;
			level = "off";
			break;
		case "sensorMultilevel":
			icon = this.config.iconSensorMultilevel;
			probeType = this.config.iconSensorMultilevel;
			scaleTitle = this.config.scale_sensorMultilevel;
			level = 0;
			break;
		case "switchBinary":
			icon = "switch";
			level = "off";
			break;
		case "switchMultilevel":
			icon = "multilevel";
			level = 0;
			break;
		case "toggleButton":
			icon = "gesture";
			level = "on";
			break;
	}
	
	var defaults = {
		metrics: {
			title: self.getInstanceTitle()
		}
	};
 
	var overlay = {
			deviceType: deviceType,
			probeType: probeType,
			metrics: {
				icon: icon,
				level: level,
				scaleTitle: scaleTitle
			}	  
	};

	var vDev = self.controller.devices.create({
		deviceId: "HTTP_Device_" + deviceType + "_" + this.id,
		defaults: defaults,
		overlay: overlay,
		handler: function (command, args) {
			var vDevType = deviceType;

			if (command === "update" && (vDevType === "sensorBinary" || vDevType === "sensorMultilevel" || vDevType === "switchBinary" || vDevType === "switchMultilevel")) {
				self.update(this);
			}

			if (command === "on" && (vDevType === "toggleButton" || vDevType === "switchBinary")) {
				self.act(this, "On", null, (vDevType === "switchBinary" ? "on" : null));
			}


			if (command === "off" && vDevType === "switchBinary") {
				self.act(this, "Off", null, "off");
			}

			if ((command === "off" || command === "on" || command === "exact") && vDevType === "switchMultilevel") {
				var level = command === "exact" ? parseInt(args.level, 10) : (command === "on" ? 99 : 0);
				self.act(this, "Level", level, level);
			}
		},
		moduleId: this.id
	});
	self.failedAttempts = 0;
	self.originalPollInterval = this.config["getterPollInterval_" + deviceType];

	if (vDev && this.config["getter_" + deviceType]) {
		self.update(vDev);
	}
};

HTTPDevice.prototype.stop = function () {
	if (this.timer) {
		clearInterval(this.timer);
	}
	
	this.controller.devices.remove("HTTP_Device_" + this.config.deviceType + "_" + this.id);
	
	HTTPDevice.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

HTTPDevice.prototype.update = function (vDev) {
	var self = this,
		deviceType = vDev.get("deviceType"),
		url = this.config["getter_" + deviceType],
		parser = this.config["getterParser_" + deviceType];
	
	if (url) {
		var req = {
			url: url,
			async: true,
			success: function(response) {
				var data = null;
				if (parser) {
					data = (function($$) {
						return eval(parser);
					})(response.data);
				} else {
					if (typeof(response.data) === "string") {
						var _data = response.data.trim();
						if (deviceType === "switchBinary" || deviceType === "sensorBinary") {
							if (_data === "1" || _data === "on" || _data === "true") {
								data = "on";
							} else if (_data === "0" || _data === "off" || _data === "false") {
								data = "off";
							}
						}
						if (deviceType === "switchMultilevel" || deviceType === "sensorMultilevel") {
							if (parseFloat(_data) != NaN) {
								data = parseFloat(_data);
							}
						}
					}
				}
				if (data !== null && (self.config.skipEventIfSameValue !== true || data !== vDev.get("metrics:level"))) {
					vDev.set("metrics:level", data);
				}
				self.failedAttempts = 0;
				if (vDev.get("metrics:isFailed")) {
					vDev.set("metrics:isFailed", false);
					self.addNotification("info", "Device " + vDev.get("metrics:title") + " is now alive.", "module");
				}
				self.setPollInterval(vDev, self.config["getterPollInterval_" + deviceType]);
			},
			error: function(response) {
				self.log("Can not make request: " + response.statusText + " " + url);
				// Increment failed attempts on failed response
				self.failedAttempts++;
				// Check if failed attempts exceed max attempts
				if (self.failedAttempts >= self.config.maxAttempts) {
					if (!vDev.get("metrics:isFailed")) {
						vDev.set("metrics:isFailed", true);
						self.addNotification("error", "Device " + vDev.get("metrics:title") + " is now dead.", "module");
		    			}
					self.setPollInterval(vDev, self.config.pollIntervalTimeout);
				}
			} 
		};

		// With Method
		if (self.config.methodForGetValue && (deviceType === "switchMultilevel" || deviceType === "switchBinary")) { // compatibility with 2.1
			req.method = self.config.methodForGetValue;
		}
		else {
			req.method = self.config.method; // compatibility with 2.1
		}

		if (req.method === "POST") {
			// With Content type
			if (self.config.contentTypeForGetValue && (deviceType === "switchMultilevel" || deviceType === "switchBinary")) { // compatibility with 2.1
				req.headers = { "Content-Type": self.config.contentTypeForGetValue}
			}
			else if (self.config.contentType) {
				req.headers = { "Content-Type": self.config.contentType} // compatibility with 2.1
			}

			// With Data
			if (self.config.dataForGetValue && (deviceType === "switchMultilevel" || deviceType === "switchBinary")) { // compatibility with 2.1
				req.data = self.config.dataForGetValue;
			}
			else if (self.config.data) {
				req.data = self.config.data; // compatibility with 2.1
			}
		}
		
		// With Authorization
		if (self.config.login && self.config.password) {
			req.auth = {
					login: self.config.login,
					password: self.config.password
			};
		}
		http.request(req);
	}
};

HTTPDevice.prototype.setPollInterval = function (vDev, interval) {
	var self = this;
	// Stop the current timer
	if (this.timer) {
		clearInterval(this.timer);
	}
	// Set a new timer with an updated polling interval
	this.timer = setInterval(function() {
		self.update(vDev);
	}, interval * 1000);
};

HTTPDevice.prototype.act = function (vDev, action, subst, selfValue) {
	var self = this,
		deviceType = vDev.get("deviceType"),
		url = this.config["setter" + action + "_" + deviceType],
		langFile = self.loadModuleLang();
	
	if (!!url) {
		if (subst !== null) {
			url = url.replace(/\$\$/g, subst);
		}
		var req = {
			url: url,
			method: this.config.method,
			async: true,
			error: function(response) {
				self.addNotification("error", langFile.err_req + response.statusText + " (" + url + ")", "module");
			}
		};

		if (req.method === "POST") {
			// With Content type
			if (self.config.contentType) {
				req.headers = { "Content-Type": self.config.contentType }
			}

			// With Data
			if (self.config.data) {
				req.data = self.config.data.replace(/\$\$/g, subst);
			}
		}
		// With authorization
		if (self.config.login && self.config.password) {
			req.auth = {
					login: self.config.login,
					password: self.config.password
			};
		}
		http.request(req);
	}
	
	if ((!url || this.config.updateOnAction === true) && selfValue !== null) {
		vDev.set("metrics:level", selfValue);
	}
};

/* Log helper functions */
HTTPDevice.prototype.log = function(message) {
    if (undefined === message) return;
    console.log("["+this.constructor.name+"-"+this.id+"] "+message);
};
