"use strict"

const applicationArgs = require('yargs').argv;
const fs              = require("fs");
const CassandraDBManager = require('./db/CassandraDBManager');
const CassandraMigrationTask = require('./task/CassandraMigrationTask'); 
const AppRunner = require('./AppRunner'); 
const Constants = require("./Constants");

class AppCassandraRunner extends AppRunner{
 
   getMigrationTask(args) {
         return   new CassandraMigrationTask({
                    channel : args.channel,
                    client :  this.getDBManager(applicationArgs),
                    repositoryScripts: this.getRepository(args)   
            }) 
   }

   getDBManager(args){      
         return new CassandraDBManager( {  
                      contactPoints: args.h.split(","),
                      userName: args.u,
                      password: args.p,
                      keyspaceConfig: JSON.parse(fs.readFileSync(args.properties)),
                      key:args.key,
                      cert:args.cert
             });      
    }

    getOrderRepository(){
        return Constants.FIRST_SCRIPTS;  
    }

    getMsgRequiredArgs() {
       return `
        Missing required parameters
        usage: dse-datamodel-deploy [--env <enviroment>  --v <versionNumber> --modelsDirectory <modelsDirectory> --u <username> --p <password> --h <remoteHosts> --project <project> --properties <properties> --channel <channel>  --action <action> --key <key> --cert <cert> ]
      `;
   }

   getExtension(){
      return Constants.CASSANDRA_EXTENSION;  
   }

   validate(args){
      return true
      /* args.env && args.modelsDirectory && 
             args.u && args.p && args.h && args.project && 
             args.properties && args.channel && 
             args.key && args.action */
            // && args.v
            // && args.cert
   }

}

module.exports = AppCassandraRunner

let app = new AppCassandraRunner();
app.run();
