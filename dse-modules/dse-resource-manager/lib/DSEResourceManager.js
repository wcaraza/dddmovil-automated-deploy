"use strict"

const fs      = require("fs");
const dse     = require("dse-driver");
const sleep   = require("sleep");
const request = require("request");
const async   = require("async");
const cheerio = require("cheerio");//For some scrapping
const { exec } = require('child_process');
const debug   = require("debug")('dse-resource-manager:ResourceManager:debug');
const dseErr   = require("debug")('dse-resource-manager:ResourceManager:error');
const DSE_STATUS_CODES = require("./DSE_STATUS_CODES");

/**
 * DSEResourceManager represents a Centralized shell application to launch and monitor DSE spark-drivers
 * 
 * @author Marco Villarreal
 * @version 1.0.0
 * @since 06/07/2018
 * 
 */
class DSEResourceManager {
    /**
     * 
     * @constructor
     * @param {Object} args Arguments to be used to deploy the spark submit
     */
    constructor(args) {
        if( args.auth && args.auth.username && args.auth.password && args.contactPoints ) {
            this.args = args;
            
           let clientOpts = {
              contactPoints: args.contactPoints,
              keyspace: args.keyspace,
              authProvider: new dse.auth.DsePlainTextAuthProvider(args.auth.username, args.auth.password)
           };
           if( args.sslOptions ) {
              clientOpts.sslOptions = args.sslOptions
           }
           this.client = new dse.Client(clientOpts);
           this.logDir = args.logDir
        } else {
            throw new Error("Missing required initialization parameters auth[username,password] or contactPoints");
        }
    }

    /**
     * 
     * @property STATUS_CODES
     * 
     */
    static get STATUS_CODES() {
        return DSE_STATUS_CODES;
    }

    closeConnection() {
        if( this.client != null ) {
            this.client.shutdown(() => {
                debug('Connection to DSE cassandra closed')
            });
        }
    }

    get driverStatusHandlers() {
        return {
            CONNECTED:(driverId,stateInfo) => {
                sleep.sleep(3)
                this.monitorDriverProcess(driverId);
            },
        
            FAILED:(driverId,stateInfo) => {
                debug("FAILED status found error %s: ",stateInfo.exception)
                this.notifyDriverStatus("FAILED",driverId,stateInfo)
            },
            ERROR: (driverId,stateInfo) => {
                debug("ERROR status found error %s: ",stateInfo.exception)
                this.notifyDriverStatus("ERROR",driverId,stateInfo)
            },
            FINISHED:(driverId,stateInfo) => {
                this.notifyDriverStatus("FINISHED",driverId,stateInfo)
            },
            KILLED:(driverId,stateInfo) => {
                this.notifyDriverStatus("KILLED",driverId,stateInfo)
            },
            RUNNING:(driverId,stateInfo) => {
                sleep.sleep(3)
                this.monitorDriverProcess(driverId);
            },
            SUBMITTED:(driverId,stateInfo)=> {
                sleep.sleep(3)
                this.monitorDriverProcess(driverId);
            },
            UNKNOWN:(driverId,stateInfo) => {
                this.notifyDriverStatus("UNKNOWN",driverId,stateInfo)
            }
        }
    }
    /**
     * @method submitDriver
     * @param {String} submitManifestFile 
     */
    submitDriver(submitArgs,appArgs) {
        try {
            let supervisedLaunch = (appArgs.supervisedLaunch && appArgs.supervisedLaunch == "true") ? true : false;
            let finalClasspath = submitArgs.classPath;
            finalClasspath.push(submitArgs.jarURL)
            let defaultJVMArgs = submitArgs.jvmArgs.concat([
                `-Dspark.jars=${finalClasspath.join(",")}`,
                "-Dspark.master=dse://?",
                "-Dspark.submit.deployMode=cluster",
                `-Dspark.cassandra.auth.username=${appArgs.u}`,
                `-Dspark.cassandra.auth.password=${appArgs.p}`,
                "-Dspark.hadoop.com.datastax.bdp.fs.client.authentication=basic",
                `-Dspark.hadoop.com.datastax.bdp.fs.client.authentication.basic.username=${appArgs.u}`,
                `-Dspark.hadoop.com.datastax.bdp.fs.client.authentication.basic.password=${appArgs.p}`,
                "-Dspark.cassandra.auth.conf.factory=com.datastax.bdp.spark.DseAuthConfFactory",
                "-Dspark.cassandra.connection.factory=com.datastax.bdp.spark.DseCassandraConnectionFactory",
            ]);

            let jvmArgsFormatted = defaultJVMArgs.map((value) => `'${value}'`)
            let classPath        = finalClasspath.map((value) =>  `'${value}'` );

            let applicationArgs = [
                "'{{WORKER_URL}}'", 
                "'{{USER_JAR}}'", 
                `'${submitArgs.mainClass}'`
            ]

            if( submitArgs.mainArgs && Array.isArray(submitArgs.mainArgs)) {
                let formattedMainArgs = submitArgs.mainArgs.map((value) =>  `'${value}'` )
                applicationArgs = applicationArgs.concat(formattedMainArgs)
            }
 
            let submitDriverArgs = [
                `'${submitArgs.jarURL}'`, //JAR URL
                submitArgs.driverMemory, //DRIVER MEMORY
                submitArgs.driverCores,//DRIVER CORES
                submitArgs.supervise,//SUPERVISE MODE
                "'org.apache.spark.deploy.worker.DseDriverWrapper'", //MAIN CLASS always org.apache.spark.deploy.worker.DseDriverWrapper
                `[ ${applicationArgs.join(",")} ]`,//APPLICATION ARGS {{WORKER_URL}}, {{USER_JAR}}, <your main class name>, custom args…
                '{}',//map string to string: should include DSE_CLIENT_FRAMEWORK -> dse / spark-2.0
                `[ ${classPath.join(",")}]`,// list of strings, extra classpath entries - should be available from executor nodes - dsefs
                `[]`,// list of strings, extra libraries
                `[ ${jvmArgsFormatted.join(",")} ]`,//list of strings, all JVM opts to be added when starting driver, this should include mandatory Spark configuration entries, like -Dspark.xxx=yyy
                '{}'//map of string to string, currently not used, leave empty
            ]

            let command = `call DseResourceManager.submitDriver(${submitDriverArgs.join(",")});`    
            
            debug(`Executing command ${command}`)
            
            this.client.execute(command).then(submissionResult => {
                let driverInfo = submissionResult.rows[0]
                debug("Submission driver result " + JSON.stringify(driverInfo))
                if(supervisedLaunch) {
                    let driverId = driverInfo.driverId
                    debug(`Invoking monitorDriverProcess for driverId ${driverId}`)
                    this.monitorDriverProcess(driverId)
                    this.createKillMeFile(driverInfo,appArgs,supervisedLaunch);
                } else {
                    this.createKillMeFile(driverInfo,appArgs,supervisedLaunch);

                }
            }).catch( err => this.logError(err));

        } catch(e) {
            this.logError(e)
        }
    }
    
    createKillMeFile(driverInfo,appArgs,supervisedLaunch) {
        const driverId = driverInfo.driverId
        const USERNAME = appArgs.u
        const PASSWORD = appArgs.p
        const DSEFS_DIR = appArgs.dsefsDirectory
        const deployPath= appArgs.deployPath
        let killMeCommand = `cqlsh --cqlshrc=/opt/cassandra/cqlshrc --ssl -u ${USERNAME} -p ${PASSWORD} -e "CALL DseResourceManager.killDriver('${driverId}');"`
        let killmeLocalFile = `${deployPath}/${appArgs.killmeFile}`
        debug("Creating kill-me local file in path "+killmeLocalFile)
        fs.writeFile(killmeLocalFile,killMeCommand,(error,data) => {
            if(error) {
                this.logError(error)
            } else {
                debug("Local kill-me file created "+data)
                debug("Indexing kill-me file into DSEFS")
                exec(`dse -u ${USERNAME} -p ${PASSWORD} fs 'cp -o file://${killmeLocalFile} ${DSEFS_DIR}/${appArgs.killmeFile}'`,(error,data) => {
                    if( error) {
                        this.logError(error);
                    } else {
                        debug("Kill me file indexed onto dsefs "+data)
                        if(!supervisedLaunch) {
                            debug("Unsupervised spark submit invoked, my job Here is done")
                            process.exit(DSEResourceManager.STATUS_CODES.FINISHED);
                        }
                    }
                })
            }
        })
    }

    logError(error) {
        dseErr("Error found: %o ",error)
        this.closeConnection();
    }
    /**
     * @method monitorDriverProcess
     * @param {String} driverId 
     */
    monitorDriverProcess(driverId) {
        this.client.execute("call DseResourceManager.requestDriverStatus(?)",[driverId])
                   .then(driverStatusInfo => this.handleDriverStatus(driverId,driverStatusInfo))
                   .catch(this.logError);
    }
    /**
     * Perform driver status handling using internal property driverStatusHandlers, this method gets
     * invoked as soon as the call to requestDriverStatus is done, it will keep the shell running
     * or will finish it notifying status
     * 
     * @method handleDriverStatus
     * @param {String} driverId The id of the driver to be handled
     * @param {Object} driverStatusInfo The status of the driver fetched from the call DseResourceManager.requestDriverStatus
     */
    handleDriverStatus(driverId,driverStatusInfo) {
        if( driverStatusInfo.rows && driverStatusInfo.rows.length > 0 ) {
            let stateInfo = driverStatusInfo.rows[0]
            let driverStatus = stateInfo.state;
            debug(`Found state Info for driver ${driverId} with state ${JSON.stringify(stateInfo)}`)
            if ( this.driverStatusHandlers[driverStatus] && typeof this.driverStatusHandlers[driverStatus] == "function" ) {
                debug("Handling driver status handler "+driverStatus)
                this.driverStatusHandlers[driverStatus].call(this,driverId,stateInfo)
            } else {
               throw new Error("Undefined driver status "+driverStatus)
            }
        }
    }
    /**
     * Generates a http request call wrapped in a async callable fashion, it applies basic Authentication
     * with DSE username and password, this is mainly used to fetch info from spark-ui and other http
     * related spark products
     * 
     * @method _requestHTML
     * @param {String} url the URL to be fetched from the async function
     * @return {Function} the function to be invoked by **async** library
     */
    _requestHTML(url) {
        return (callback) => {
            const basicAuth =  new Buffer(`${this.args.auth.username}:${this.args.auth.password}`).toString("base64")
            let requestArgs = {
                url : url,
                headers : {
                  "Authorization" : "Basic " + basicAuth
                }
            };
            request(requestArgs,(error, response, body)=> callback(null, { error: error, body : body }));
        }
    }
    /**
     * 
     * @method notifyDriverStatus
     * @param {String} status 
     * @param {String} driverId 
     * @param {Object} stateInfo 
     */
    notifyDriverStatus(status,driverId,stateInfo) {
        const workerHostPort = stateInfo.workerHostPort
        const workerHost = workerHostPort.substring(0,workerHostPort.indexOf(":"))
        const stdoutLog = `http://${workerHost}:7081/logPage/?driverId=${driverId}&logType=stdout`
        const stdErrLog = `http://${workerHost}:7081/logPage/?driverId=${driverId}&logType=stderr`
        
        this.closeConnection();
        debug(`notifyDriver status Handling for ${stdoutLog} && ${stdErrLog}`)
    
        async.parallel([this._requestHTML(stdoutLog),this._requestHTML(stdErrLog)],(error,results) => {
            if (error != null ) {
                this.logError(error)
                process.exit(DSEResourceManager.STATUS_CODES[status]);
            } else {
                this.saveResultsToFile(error,results,status)
            }
        })
    }
    /**
     * Takes a list of results from the http requests and maps them into a text file, in the current state
     * this results are html pages fetched from the spark-ui, so cheerio comes in handy to make some basic
     * scrapping to extract title and content from the logs.
     * 
     * @method saveResultsToFile
     * @param {Error} error 
     * @param {Array} results 
     * @param {String} status 
     */
    saveResultsToFile(error,results,status) {
        if(error != null) {
            this.logError(error)
        }
        
        results.filter((args)=> args.error != null).forEach(x => this.logError(x.error))//gets errors and prints out
        /**
         * A simple scrap function to extract title and pre tags from the given html content
         * @param {String} html The html content to be scrapped
         * @return {Object} a simple object with the properties title and body
         */
        const scrapContent = (html) => {
           debug(`Preparing to scrap content`)
           const $ = cheerio.load(html);
           return {
                title: $("title").text().replace(/\s/g,"_"),
                body: $("pre").html()
           }
        }
        /**
         * Making some functional-style and one-line style mapping from the results into a async callable functions
         */
        const writeFileCallbacks = results.filter((args)=> args.error == null)//filter errors
                                          .map(args => args.body)//maps html body response
                                          .map(scrapContent)//Do some scrapping to get page title, and body
                                          .map(scrappedResult => (callback)=> {
                                            debug(`Creating callback function for writing file ${this.logDir}/${scrappedResult.title} \n\n`)
                                            debug("Log Body \n\n %O \n\n",scrappedResult.title,scrappedResult.body)
                                            return fs.writeFile(`${this.logDir}/${scrappedResult.title}`,scrappedResult.body,callback)
                                          })//create a async invocable function

        async.parallel(writeFileCallbacks,(error,results) => {
            if ( error != null ) {
                this.logError(error)
            }
            debug("Finished spark processing")
            process.exit(DSEResourceManager.STATUS_CODES[status]);
        })
    }
}

module.exports = DSEResourceManager;
