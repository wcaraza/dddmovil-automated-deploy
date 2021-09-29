
"use strict"
const applicationArgs = require('yargs').argv;
const fs                     = require("fs");
const SQLAzureDBManager      = require('./db/SQLAzureDBManager');
const SqlAzureMigrationTask  = require('./task/SqlAzureMigrationTask');
const cosmosDBManager      = require('./db/CosmosDBManager'); 
const cosmosDBSubscription = require('./db/CosmosDBSubscription'); 
const AppRunner              = require('./AppRunner'); 
const Constants              = require("./Constants");

class AppCosmosRunner extends AppRunner {
    

   getMigrationTask(args) {
         return  new SqlAzureMigrationTask(
             {
                    channel                   : args.channel,
                    client                    : this.getDBManager(args),
                    clientCosmos              : this.getCosmosDBManager(args),
                    clientCosmosSubscription  : this.getCosmosDBManager(args, Constants.IS_SUBSCRIPTION),
                    repositoryScripts         : this.getRepository(args)   
            }) 
   }

  getDBManager(args) {
    let sqlCredentials = this.getSqlObjectCredentials(args);
    return new SQLAzureDBManager(sqlCredentials);
  }
  getCosmosDBManager(args, isSubscription = false) {
    let cosmosCredentials = this.getCosmosObjectCredentials(args, isSubscription);
    if (isSubscription) {
     return new cosmosDBSubscription(cosmosCredentials);
    }
    else { return new cosmosDBManager(cosmosCredentials); }
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
              args.channel && args.action && args.endpoint &&
              args.masterKey && args.endpointSubscription &&
              args.masterKeySubscription &&
        	    args.port && args.db 
   } 

   getSqlObjectCredentials(args){
    let sqlObject = 
    {  
     userName: args.u,  
     password: args.p,  
     host    : args.h, 
     port    : args.port, 
     database: args.db,
   }
   return sqlObject
  }
  getCosmosObjectCredentials(args, isSubscription){
    let cosmosObject = 
    {  
     endPoint : isSubscription ? args.endpointSubscription  : args.endpoint,  
     masterkey: isSubscription ? args.masterKeySubscription  : args.masterKey,  
   }
   
   return cosmosObject
  }

}
module.exports = AppSqlAzureRunner

let app = new AppCosmosRunner();
app.run()

