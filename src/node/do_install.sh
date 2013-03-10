#!/bin/sh

# install nodejs modules
npm install nodemailer
npm install http-auth
npm install htdigest

# create htpasswd
htdigest -c htpasswd 'rdc realm' rdc_user
