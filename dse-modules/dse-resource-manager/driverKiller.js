"use strict"

const applicationArgs    = require('yargs').argv;
const fs                 = require("fs");
const debug              = require("debug")('dse-resource-manager:driver-killer');
const dse                = require("dse-driver");

if ( applicationArgs.help ) {
    console.log(`
    /usr/bin/dse-resource-manager/driverKiller: 
    usage: driverKiller [--u <username> --p <password> --h <remoteHosts> --driverFile <driverFile>]
    --u <DSE username>
    --p <DSE Password>
    --h <DSE hosts>
    --key <SSL Key>
    --cert <SSL certificate>
    `);
    process.exit(0);
}

if (applicationArgs.driverFile && applicationArgs.h && applicationArgs.u && applicationArgs.p ) {

    let hosts    = applicationArgs.h;
    let password = applicationArgs.p;
    let username = applicationArgs.u;
    let driverInfo = JSON.parse(fs.readFileSync(applicationArgs.driverFile))
    let clientOpts = {
        contactPoints: hosts.split(","),
        authProvider: new dse.auth.DsePlainTextAuthProvider(username,password)
    };

    if ( applicationArgs.key && applicationArgs.cert) {
        clientOpts.sslOptions = {
            key: fs.readFileSync(applicationArgs.key ),
            cert: fs.readFileSync(applicationArgs.cert)
        };
    }
    
    const client = new dse.Client(clientOpts)

    client.execute("call DseResourceManager.killDriver(?)",[driverInfo.driverId]).then((killInfo) => {
        debug("Successfully invocated killDriver command")
    }).catch((error) => {
        debug("Error invoking killDriver command")
        console.log(error)
     });
} else {
    throw new Error("Unable to find run argument submitFile")
}
