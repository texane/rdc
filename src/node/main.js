// globals

var fs = require('fs');
var top_dir = '.';
var events_dir = top_dir + '/events';
var html_dir = top_dir + '/html';

var http = require('http');
var http_auth = require("http-auth");
var http_auth_digest = http_auth
({
    authFile: top_dir + '/htpasswd',
    authRealm : "rdc realm",
    authType : 'digest'
});

var url = require('url');


// html and console logging

var html_line = '';

function do_print_common(s, is_html, is_err)
{
    console.log(s);
    if (is_html == true)
    {
	var c = (is_err ? "red" : "green");
	html_line += '<b><font color="' + c + '">' + s + '</font></b><br/>';
    }
}

function do_print(s, is_html)
{
    is_html = ((typeof is_html == 'undefined') ? 'false' : is_html);
    do_print_common(s, is_html, false);
}

function do_perror(s, is_html)
{
    is_html = ((typeof is_html == 'undefined') ? 'false' : is_html);
    do_print_common(s, is_html, true);
}


// send an email

var smtp_user = 'remote.device.controller@gmail.com';
var smtp_pass = 'remotedevicecontroller';
var smtp_contact = 'fabien.lementec@gmail.com';

var nodemailer = require('nodemailer/lib/nodemailer');
var smtp_opts = { auth: { user: smtp_user, pass: smtp_pass } };
var smtp_trans = nodemailer.createTransport('SMTP', smtp_opts);

function do_email(body)
{
    var msg =
    {
	from: smtp_user,
	to: smtp_contact,
	subject: 'notification',
	header: { 'X-Laziness-level': 1000 },
	text: body
    };

    function on_error(e)
    {
	if (e) do_print('do_email error: ' + e.message);
    }

    try
    {
	smtp_trans.sendMail(msg, on_error);
	do_print('email sent to ' + smtp_contact, true);
    }
    catch(e)
    {
	do_perror('smtp error');
    }
}


// gpio status command

function do_status()
{
    do_print('do_status');
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
	do_print('new event: ' + path);
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


// gpio routines

var gpio_status = [ 0, 0, 0, 0 ];

function do_enable_gpio(i)
{
    do_print('enable_gpio(' + i + ')');
    gpio_status[i] = 1;
}

function do_disable_gpio(i)
{
    do_print('disable_gpio(' + i + ')');
    gpio_status[i] = 0;
}

function do_get_gpio_index(parsed)
{
    if (parsed.query.hasOwnProperty('i'))
    {
	var i = parsed.query['i'];
	if ((i >= 0) && (i <= 3)) return i;
    }
    return -1;
}


// update smtp settings

function do_update_smtp(parsed)
{
    do_print('update_smtp');

    var do_reconnect = false;
    var has_changed = false;

    if (parsed.query.hasOwnProperty('smtp_user'))
    {
	if (smtp_user != parsed.query['smtp_user'])
	{
	    smtp_user = parsed.query['smtp_user'];
	    do_reconnect = true;
	    has_changed = true;
	}
    }

    if (parsed.query.hasOwnProperty('smtp_pass'))
    {
	if (smtp_pass != parsed.query['smtp_pass'])
	{
	    smtp_pass = parsed.query['smtp_pass'];
	    do_reconnect = true;
	    has_changed = true;
	}
    }

    if (parsed.query.hasOwnProperty('smtp_contact'))
    {
	if (smtp_contact != parsed.query['smtp_contact'])
	{
	    smtp_contact = parsed.query['smtp_contact'];
	    has_changed = true;
	}
    }

    if (do_reconnect == true)
    {
	try
	{
	    smtp_trans.close();
	    smtp_opts = { auth: { user: smtp_user, pass: smtp_pass } };
	    smtp_trans = nodemailer.createTransport('SMTP', smtp_opts);
	}
	catch(e) {}
    }

    if (has_changed == true)
    {
	// TODO: write to file
	do_print('TODO, write smtp changes');
    }
}


// rewrite html

function do_rewrite_html(body)
{
    // gpios section
    for (var i = 0; i < 4; ++i)
    {
	var status = 'high';
	if (gpio_status[i] == 0) status = 'low';
	body = body.replace('RDC_GPIO[' + i + ']', status); 
    }

    // smtp section
    body = body.replace('RDC_SMTP_USER', smtp_user);
    body = body.replace('RDC_SMTP_PASS', smtp_pass);
    body = body.replace('RDC_SMTP_CONTACT', smtp_contact);

    // console section
    body = body.replace('RDC_OUTPUT', html_line);
    
    return body;
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
	do_print('on_request');

	function on_auth_request(username)
	{
	    // reset html output line
	    html_line = '';

	    // user is authenticated
	    resp.writeHead(200, {'Content-Type': 'text/html'});

	    if (req.method == 'GET')
	    {
 		parsed = url.parse(req.url, true);

		if (parsed.pathname == '/enable_gpio')
		{
		    var i = do_get_gpio_index(parsed);
		    if (i == -1) do_perror('invalid gpio', true);
		    else do_enable_gpio(i);
		}
		else if (parsed.pathname == '/disable_gpio')
		{
		    var i = do_get_gpio_index(parsed);
		    if (i == -1) do_perror('invalid gpio', true);
		    else do_disable_gpio(i);
		}
		else if (parsed.parsed == '/refresh_gpios')
		{
		    // nothing to do, refreshed by do_rewrite_html
		}
		else if (parsed.pathname == '/update_smtp')
		{
		    do_update_smtp(parsed);
		}
		else if (parsed.pathname == '/test_smtp')
		{
		    do_email('test email');
		}

		// update html line if empty
		if (html_line == '') do_print('success', true);

		// send main page
		var main_html = html_dir + '/main.html';
		var body = 'error reading ' + main_html;
		try { body = fs.readFileSync(main_html, 'utf8'); }
		catch(e) {}
		resp.write(do_rewrite_html(body));
	    }

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
	    do_print('body   : ' + chunk);
	}

	function on_response(resp)
	{
	    do_print('status : ' + resp.statusCode);
	    do_print('headers: ' + JSON.stringify(resp.headers));
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
