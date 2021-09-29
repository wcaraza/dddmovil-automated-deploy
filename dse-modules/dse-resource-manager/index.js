"use strict"

const applicationArgs    = require('yargs').argv;
const DSEResourceManager = require("./lib/DSEResourceManager");
const fs                 = require("fs");
const debug              = require("debug")('dse-resource-manager:app');

if ( applicationArgs.help ) {
    console.log(`
    /usr/bin/dse-resource-manager: 
    usage: dse-resource-manager [--submitFile <submitFile> --u <username> --p <password> --h <remoteHosts>]
    Available arguments:
    --submitFile Spark-submit.json file
    --u <DSE username>
    --p <DSE Password>
    --h <DSE hosts>
    --classpath Spark Application classpath
    --key <SSL Key>
    --cert <SSL certificate>
    --ca SSL <Certified Authority>
    `);
    process.exit(0);
}

if ( applicationArgs.submitFile && applicationArgs.h && applicationArgs.u && applicationArgs.p ) {
    let classPath = applicationArgs.classpath.split(",")
    let deployPath = applicationArgs.deployPath
    
    let classpath = classPath.map(entry => `${deployPath}/dependencies/${entry}`)

    //applicationArgs.extraArgs = (applicationArgs.extraArgs)? JSON.parse(applicationArgs.extraArgs) : {}
    
    let sparkSubmitFile = require(applicationArgs.submitFile)(applicationArgs);
    
    let hosts    = applicationArgs.h;
    let password = applicationArgs.p;
    let username = applicationArgs.u;

    let deployOpts = {
        contactPoints: hosts.split(","),
        auth: {
            username: username,
            password: password
        },
        logDir: (applicationArgs.logDir) ? applicationArgs.logDir : "/var/log/dse-spark-apps"
    };

    if ( applicationArgs.key && applicationArgs.cert) {
        
        deployOpts.sslOptions = {
            key: fs.readFileSync(applicationArgs.key ),
            cert: fs.readFileSync(applicationArgs.cert)
        }
    }

    const managerInstance = new DSEResourceManager(deployOpts);
    debug("Starting DSEResourceManager Driver application")
    sparkSubmitFile.jarURL = applicationArgs.jarFile
    sparkSubmitFile.classPath = classpath;
    managerInstance.submitDriver(sparkSubmitFile,applicationArgs);

} else {
    throw new Error("Unable to find run argument submitFile")
}
