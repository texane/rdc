// globals

var os = require('os');
var hostname = os.hostname();

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


// json

var json_dir = top_dir + '/json';

function json_init()
{
    try { fs.mkdirSync(json_dir); } catch(e) {}
}

function json_read_object(name)
{
    // read an object from json file
    var path = json_dir + '/' + name;
    if (fs.existsSync(path) == false) return {};
    var s = fs.readFileSync(json_dir + '/' + name, 'utf8');
    var o = JSON.parse(s);
    return o;
}

function json_write_object(o, name)
{
    // write an object to json file
    var s = JSON.stringify(o);
    fs.writeFileSync(json_dir + '/' + name, s, 'utf8');
}


// smtp

var smtp_state;
var smtp_nodemailer;
var smtp_opts;
var smtp_trans;

function smtp_save()
{
    // save smtp_state to smtp.json
    json_write_object(smtp_state, 'smtp');
}

function smtp_load()
{
    smtp_state = json_read_object('smtp');

    if (smtp_state.hasOwnProperty('user') == false)
	smtp_state['user'] = 'remote.device.controller@gmail.com';
    if (smtp_state.hasOwnProperty('pass') == false)
	smtp_state['pass'] = 'remotedevicecontroller';
    if (smtp_state.hasOwnProperty('contact') == false)
	smtp_state['contact'] = 'fabien.lementec@gmail.com';
}

function smtp_init()
{
    smtp_load();
    smtp_nodemailer = require('nodemailer/lib/nodemailer');
    smtp_opts = {auth: { user: smtp_state['user'], pass: smtp_state['pass']}};
    smtp_trans = smtp_nodemailer.createTransport('SMTP', smtp_opts);
}

function smtp_send_email(body)
{
    var msg =
    {
	from: smtp_state['user'],
	to: smtp_state['contact'],
	subject: 'notification',
	header: { 'X-Laziness-level': 1000 },
	text: body
    };

    function on_error(e)
    {
	if (e) do_print('smtp error: ' + e.message);
    }

    try
    {
	smtp_trans.sendMail(msg, on_error);
	do_print('email sent to ' + smtp_state['contact'], true);
    }
    catch(e)
    {
	if (e) do_perror('smtp error: ' + e.message);
    }
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
	smtp_send_email(s);
    }
}


// create a new event

function do_event(event_data)
{
    fs.writeFileSync(events_dir + '/' + Math.random(), event_data);
}


// gpio routines

var gpio_sysfs_dir = '/sys/class/gpio'
var gpio_is_enabled = false;

// used when gpio_is_enabled = false
var gpio_buffer = [ 0, 0, 0, 0 ];

// map refers to the BCM2835 pins
// http://elinux.org/RPi_Low-level_peripherals
// http://elinux.org/RPi_BCM2835_Pinout
var gpio_map = [ 4, 17, 27, 22 ];
// p1_01_header_view = [ 3, 5, 6, 7 ];

function gpio_get_common_path(i)
{
    return gpio_sysfs_dir + '/gpio' + i;
}

function gpio_get_direction_path(i)
{
    return gpio_get_common_path(i) + '/direction';
}

function gpio_get_value_path(i)
{
    return gpio_get_common_path(i) + '/value';
}

function gpio_write(i, x)
{
    if (gpio_is_enabled)
    {
	var val_path = gpio_get_value_path(gpio_map[i]);
	fs.writeFileSync(val_path, x.toString(), 'utf8');
    }
    else
    {
	gpio_buffer[i] = x;
    }
}

function gpio_read(i)
{
    var x;
    if (gpio_is_enabled)
    {
	var val_path = gpio_get_value_path(gpio_map[i]);
	x = fs.readFileSync(val_path, 'utf8');
	if (x.length >= 1) x = x[0];
    }
    else
    {
	x = gpio_buffer[i];
    }
    return (x == '0') ? 0 : 1;
}

function gpio_set_output(i)
{
    var dir_path = gpio_get_direction_path(gpio_map[i]);
    fs.writeFileSync(dir_path, 'out', 'utf8');
}

function gpio_export(i)
{
    if (fs.existsSync(gpio_get_common_path(gpio_map[i])) == true)
    {
	// already exported
	return ;
    }

    var export_path = gpio_sysfs_dir + '/export';
    fs.writeFileSync(export_path, gpio_map[i].toString(), 'utf8');
}

function gpio_save_state()
{
    var state = {};
    for (var i = 0; i < 4; ++i) state[i] = gpio_read(i);
    json_write_object(state, 'gpio');
}

function gpio_load_state()
{
    var state = json_read_object('gpio');
    for (var i = 0; i < 4; ++i)
    {
	if (state.hasOwnProperty(i) == false) state[i] = 0;
	gpio_write(i, state[i]);
    }
    return state;
}

function gpio_init()
{
    var state = gpio_load_state();

    if (hostname == 'rpib_home')
    {
	try
	{
	    // export gpios and set to default values
	    for (var i = 0; i < 4; ++i)
	    {
		gpio_export(i);
		gpio_set_output(i);
	    }

	    gpio_is_enabled = true;
	}
	catch(e)
	{
	    do_perror('gpio init failed: ' + e.message);
	}
    }

    for (var i = 0; i < 4; ++i) gpio_write(i, state[i]);
    gpio_save_state();
}

function gpio_enable(i)
{
    gpio_write(i, 1);
    gpio_save_state();
}

function gpio_disable(i)
{
    gpio_write(i, 0);
    gpio_save_state();
}

function gpio_get_parsed_index(parsed)
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
	if (smtp_state['user'] != parsed.query['smtp_user'])
	{
	    smtp_state['user'] = parsed.query['smtp_user'];
	    do_reconnect = true;
	    has_changed = true;
	}
    }

    if (parsed.query.hasOwnProperty('smtp_pass'))
    {
	if (smtp_state['pass'] != parsed.query['smtp_pass'])
	{
	    smtp_state['pass'] = parsed.query['smtp_pass'];
	    do_reconnect = true;
	    has_changed = true;
	}
    }

    if (parsed.query.hasOwnProperty('smtp_contact'))
    {
	if (smtp_state['contact'] != parsed.query['smtp_contact'])
	{
	    smtp_state['contact'] = parsed.query['smtp_contact'];
	    has_changed = true;
	}
    }

    if (do_reconnect == true)
    {
	try
	{
	    smtp_trans.close();
	    var smtp_user = smtp_state['user'];
	    var smtp_pass = smtp_state['pass'];
	    smtp_opts = { auth: { user: smtp_user, pass: smtp_pass } };
	    smtp_trans = nodemailer.createTransport('SMTP', smtp_opts);
	}
	catch(e) {}
    }

    if (has_changed == true)
    {
	do_print('saving smtp changes');
	smtp_save();
    }
}


// rewrite html

function do_rewrite_html(body)
{
    // gpios section
    for (var i = 0; i < 4; ++i)
    {
	var status = 'high';
	if (gpio_read(i) == 0) status = 'low';
	body = body.replace('RDC_GPIO[' + i + ']', status); 
    }

    // smtp section
    body = body.replace('RDC_SMTP_USER', smtp_state['user']);
    body = body.replace('RDC_SMTP_PASS', smtp_state['pass']);
    body = body.replace('RDC_SMTP_CONTACT', smtp_state['contact']);

    // console section
    body = body.replace('RDC_OUTPUT', html_line);
    
    return body;
}


// http server

function do_server(from_cmdline)
{
    json_init();

    // initialize smtp
    smtp_init();

    // initialize event logic
    try { fs.mkdirSync(events_dir); } catch(e) {}
    setInterval(on_1hz_interval, 1000);

    // initialize gpios
    gpio_init();

    // create the http server
    var server;

    function on_request(req, resp)
    {
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
		    var i = gpio_get_parsed_index(parsed);
		    if (i == -1) do_perror('invalid gpio', true);
		    else gpio_enable(i);
		}
		else if (parsed.pathname == '/disable_gpio')
		{
		    var i = gpio_get_parsed_index(parsed);
		    if (i == -1) do_perror('invalid gpio', true);
		    else gpio_disable(i);
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
		    smtp_send_email('this is a test');
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
