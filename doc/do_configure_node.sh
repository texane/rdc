#!/usr/bin/env bash

CROSS_COMPILE=/home/texane/repo/lfs/_work_rpib/host_install/armv6-rpi-linux-gnueabi/bin/armv6-rpi-linux-gnueabi-

export AR=$CROSS_COMPILE\ar
export CC=$CROSS_COMPILE\gcc
export CXX=$CROSS_COMPILE\g++
export LINK=$CROSS_COMPIL\g++

./configure --without-snapshot --dest-cpu=arm --dest-os=linux --prefix=`pwd`/arm_install_dir
