
"use strict"
//const applicationArgs = require('yargs').argv;
const fs                     = require("fs");
const SQLAzureDBManager      = require('./db/SQLAzureDBManager'); 
const SQLAzureDBSubscription = require('./db/SQLAzureDBSubscription'); 
const SqlAzureMigrationTask  = require('./task/SqlAzureMigrationTask'); 
const AppRunner              = require('./AppRunner'); 
const Constants              = require("./Constants");

class AppSqlAzureRunner extends AppRunner {
    

   getMigrationTask(args) {
         return  new SqlAzureMigrationTask(
             {
                    channel             : args.channel,
                    client              : this.getDBManager(args),
                    clientSubscription  : this.getDBManager(args, Constants.IS_SUBSCRIPTION),
                    repositoryScripts   : this.getRepository(args)   
            }) 
   }

   getDBManager(args, isSubscription = false) {
    let sqlCredentials = this.getSqlObjectCredentials(args, isSubscription);
    if (isSubscription) {
     return new SQLAzureDBSubscription(sqlCredentials);
    }
    else { return new SQLAzureDBManager(sqlCredentials); }
  } 
    getOrderRepository(){
        return Constants.FIRST_MODEL;  
   }  

   getMsgRequiredArgs() {
       return `
        *** Missing required parameters
        usage: dse-datamodel-deploy [--env <enviroment> --v <versionNumber> --modelsDirectory <modelsDirectory> --u <username> --p <password>  --h <remoteHosts> --project <project> --properties <properties> --channel <channel> --action <action> ]
       `;
   }

   getExtension(){
      return Constants.SQL_EXTENSION;  
   } 

   validate(args){
      return  args.env && args.v && args.modelsDirectory && 
              args.u && args.p && args.h && 
              args.project && args.properties &&
              args.channel && args.action && args.userSubscription &&
              args.passwordSubscription && args.hostSubscription &&
              args.databaseSubscription && args.portSubscription &&
        	     args.port && args.db 
   } 

   getSqlObjectCredentials(args, isSubscription){
    let sqlObject = 
    {  
     userName: isSubscription ? args.userSubscription      : args.u,  
     password: isSubscription ? args.passwordSubscription  : args.p,  
     host    : isSubscription ? args.hostSubscription      : args.h, 
     //port    : isSubscription ? args.portSubscription      : 1433, 
     //database: isSubscription ? args.databaseSubscription  : JSON.parse(fs.readFileSync(args.properties)).sqldatabase
     port    : isSubscription ? args.portSubscription      : args.port, 
     database: isSubscription ? args.databaseSubscription  : args.db,
   }
   return sqlObject
  }

}
module.exports = AppSqlAzureRunner

let app = new AppSqlAzureRunner();
app.run()

