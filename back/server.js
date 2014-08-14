'use strict';
var config = require("./config");
var fs = require('fs');
var express = require('express.io');
var path = require('path');
var password = require('./password');
var metrics = require('./metrics');
var logs = require('./logs');
var publish = require('./publish');

var app = express();

var pjson = require("../package.json");
var blockedListPath = path.resolve(__dirname, '..', 'blockedList.json');

var port = config.noggerPort;

var clients = [];
var wrongAttempts = {};

app.use(express.cookieParser());

var prod = false;
if (prod) {
    app.use(express.static(path.join(__dirname, '../front-build')));
} else {
    app.use(express.static(path.join(__dirname, '../front')));
}
app.http().io();

app.io.configure(function () {
    app.io.enable('browser client minification');  // send minified client
    //app.io.set('log level', 1);                    // reduce logging
});

app.io.route('auth', function (req) {
    var ip = req.io.socket.handshake.address.address;
    console.log('auth, ip:', ip);

    var blockedList = require('../blockedList.json');
    console.log('blockedList', blockedList);
    if (blockedList.ip.indexOf(ip) !== -1) {
        req.io.respond({err: "Too many wrong attempts! You are blocked from the server. To unblock go to your terminal and type: >> nogger unblock " + ip, data: null});
        return;
    }

    password.match(req.data, function (success) {
        if (success) {
            delete wrongAttempts[ip];
            clients.push(req.io.socket.id);
            if (clients.length === 1) {
                publish.connected();
            }
            req.io.respond({err: null, data: pjson.version});
        } else {
            if (!wrongAttempts[ip]) {
                wrongAttempts[ip] = 0;
            }
            wrongAttempts[ip]++;
            if(wrongAttempts[ip] > 10){
                if (blockedList.ip.indexOf(ip) === -1) {
                    blockedList.ip.push(ip);
                    fs.writeFileSync(blockedListPath, JSON.stringify(blockedList, null, 4));
                }
            }
            req.io.respond({err: "wrong pw", data: null});
        }
    });
});

app.io.route('getMetrics', function (req) {
    if (checkAuth(req)) {
        metrics.getMetrics(function (err, data) {
            req.io.respond({err: err, data: data});
        })
    } else {
        req.io.respond({err: "not authenticated", data: null});
    }
});

app.io.route('getLogNames', function (req) {
    if (checkAuth(req)) {
        logs.getLogNames(function (err, data) {
            req.io.respond({err: err, data: data});
        })
    } else {
        req.io.respond({err: "not authenticated", data: null});
    }
});

app.io.route('getLogFile', function (req) {
    if (checkAuth(req)) {
        var offset = req.data.offset && req.data.offset !== null ? req.data.offset : 0;
        logs.getLogs(req.data.name, offset, function (err, data) {
            req.io.respond({err: err, data: data});
        })
    } else {
        req.io.respond({err: "not authenticated", data: null});
    }
});

app.io.route('ping', function (req) {
    if (checkAuth(req)) {
        var done = false;
        publish.ping(function (t, adapter) {
            if (!done) {
                done = true;
                req.io.respond({err: null, data: {t: t, adapter: adapter}});
            }
        });
        setTimeout(function () {
            if (!done) {
                done = true;
                req.io.respond({err: null, data: {t: null}});
            }
        }, 5000);
    } else {
        req.io.respond({err: "not authenticated", data: null});
    }
});

app.io.route('disconnect', function (req) {
    var index = clients.indexOf(req.io.socket.id);
    if (index !== -1) {
        clients.splice(index, 1);
    }
    if (clients.length === 0) {
        publish.disconnected();
    }
});


app.get('*', function (req, res) {
    res.sendfile(path.join(__dirname, '../front/index.html'));
});

app.listen(port);
require('dns').lookup(require('os').hostname(), function (err, add, fam) {
    console.log('server running on ' + add + ':' + port);
});

publish.onLog(function (message) {
    broadcast('newLog', message);
});

publish.onMetric(function (message) {
    broadcast('newMetric', message);
});

function checkAuth(req) {
    return clients.indexOf(req.io.socket.id) !== -1
}

function broadcast(fn, msg) {
    for (var i in clients) {
        app.io.sockets.socket(clients[i]).emit(fn, msg);
    }
}




