// globals

var fs = require('fs');
var top_dir = '.';
var events_dir = top_dir + '/events';

var http = require('http');
var http_auth = require("http-auth");
var http_auth_digest = http_auth
({
    authFile: top_dir + '/htpasswd',
    authRealm : "rdc realm",
    authType : 'digest'
});


// send an email

var smtp_user = 'remote.device.controller@gmail.com';
var smtp_pass = 'remotedevicecontroller';

var nodemailer = require('nodemailer/lib/nodemailer');
var smtp_opts = { auth: { user: smtp_user, pass: smtp_pass } };
var smtp_trans = nodemailer.createTransport('SMTP', smtp_opts);

function do_email(body)
{
    var msg =
    {
	from: smtp_user,
	to: 'fabien.lementec@gmail.com',
	subject: 'notification',
	header: { 'X-Laziness-level': 1000 },
	text: body
    };

    function on_error(e)
    {
	if (e) console.log('do_email error: ' + e.message);
    }

    try { smtp_trans.sendMail(msg, on_error); } catch(e) {}
}


// gpio status command

function do_status()
{
    console.log('do_status');
}


// 1hz event periodcal callback

function on_1hz_interval()
{
    // check for notifications

    names = [];
    try { names = fs.readdirSync(events_dir); } catch(e) {}
    
    for (i in names)
    {
	path = events_dir + '/' + names[i];
	console.log('new event: ' + path);
	try { s = fs.readFileSync(path); } catch(e) {}
	try { fs.unlinkSync(path); } catch(e) {}
	do_email(s);
    }
}


// create a new event

function do_event(event_data)
{
    fs.writeFileSync(events_dir + '/' + Math.random(), event_data);
}


// http server

function do_server(from_cmdline)
{
    // initialize event logic
    try { fs.mkdirSync(events_dir); } catch(e) {}
    setInterval(on_1hz_interval, 1000);

    // create the http server
    var server;

    function on_request(req, resp)
    {
	console.log('on_request');

	function on_auth_request(username)
	{
	    // user is authenticated
	    resp.writeHead(200, {'Content-Type': 'text/html'});
	    resp.write('authenticated');
	    resp.end();
	}

	if (from_cmdline == true)
	{
	    on_auth_request('');
	    server.close();
	    return ;
	}

	// user must authenticate
	http_auth_digest.apply(req, resp, on_auth_request);
    }

    function on_listen()
    {
	// create start event
	var data = '';
	var now = new Date();
	data += 'server started at ' + now + '\n';
	var addr = server.address();
	data += 'server address: ' + addr.address + ':' + addr.port + '\n';
	do_event(data);
    }

    try
    {
	server = http.createServer(on_request);
	server.listen(8383, on_listen);
    }
    catch(e)
    {
	var now = new Date();
	var event_data = 'server failed to start at ' + now + '\n';
	do_event(event_data);
    }
}


// run from command line

function do_cmdline(av)
{
    do_server(true);

    if (av[2] == 'get')
    {
	function on_data(chunk)
	{
	    console.log('body   : ' + chunk);
	}

	function on_response(resp)
	{
	    console.log('status : ' + resp.statusCode);
	    console.log('headers: ' + JSON.stringify(resp.headers));
	    resp.setEncoding('utf8');
	    resp.on('data', on_data);
	}

	var http = require('http');
	var req = http.get(av[3], on_response);
    }
}


// main routine

function do_main(av)
{
    if (av.length > 2) do_cmdline(av);
    else do_server(false);
}

do_main(process.argv);
