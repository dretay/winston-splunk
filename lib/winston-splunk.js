// winston-splunk.js: Transport for outputting logs over UDP to splunk
var util = require('util'),
  winston = require('winston'),
  Syslog = require('node-syslog');

var splunk = exports.splunk = winston.transports.splunk = function (options) {
    this.name = 'splunk';
    this.level = options.level || 'info';
    this.silent     = options.silent     || false;

    this.splunkFacility = options.splunkFacility || 'nodejs';
    this.splunkSequence = 0;
    this.logFormat = options.logFormat || 'JSON';

    Syslog.init(this.splunkFacility, Syslog.LOG_PID | Syslog.LOG_ODELAY, Syslog.LOG_LOCAL0);

};

util.inherits(splunk, winston.Transport);

var getMessageLevel = function (winstonLevel) {
    switch (winstonLevel) {
        case 'silly': return Syslog.LOG_DEBUG;
        case 'debug': return Syslog.LOG_DEBUG;
        case 'verbose': return Syslog.LOG_DEBUG;
        case 'data': return Syslog.LOG_INFO;
        case 'prompt': return Syslog.LOG_INFO;
        case 'input': return Syslog.LOG_INFO;
        case 'info': return Syslog.LOG_INFO;
        case 'help': return Syslog.LOG_INFO;
        case 'notice': return Sys.log.LOG_NOTICE
        case 'warn': return Syslog.LOG_WARNING;
        case 'warning': return Syslog.LOG_WARNING;
        case 'error': return Syslog.LOG_ERR;
        case 'crit': return Syslog.LOG_CRIT;
        case 'alert': return Syslog.LOG_ALERT;
        case 'emerg': return Syslog.LOG_EMERG;
        default: return 6
    }
};

splunk.prototype.log = function (level, msg, meta, callback) {
    var self = this, message = {}, key;

    if (self.silent) {
        return callback(null, true);
    }


    Syslog.log(getMessageLevel(level), new Date()+msg);

    callback(null, true);


    // message._timestamp = +new Date();
    // message.host = self.splunkHostname;
    // message.facility = self.splunkFacility;
    // message.type = msg;
    // message.message = meta || {};
    // message.level = getMessageLevel(level);

    // var message = null;
    // if(this.logFormat === "PLAIN"){
    //     message = "level="+level+", epoch="+(+new Date())+", timestamp="+new Date()+", facility="+self.splunkFacility+", message="+msg+", meta="+(meta||{});
    // }else{
    //     message = JSON.stringify(message);
    // }
    // message = new Buffer(message);

    // this.udpClient.send(message, 0, message.length, self.splunkPort, self.splunkHost, function (err, bytes) {
    //     if (err) {
    //         callback(err, null);
    //     } else {
    //         callback(null, true);
    //     }
    // });
};
